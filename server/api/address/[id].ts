import {
  dbGet,
  dbQuery,
  isBurnAddress,
  normalizeTaprootAddress,
  TREASURY_ADDRESS
} from '../../utils/db'
import { getValidatorPoolData } from '../validators'
import { calculateBlockSubsidy } from '../../../app/utils/protocol'

const SPECIAL_ADDRESS_LABELS = new Set([
  'Genesis',
  'Coinbase',
  'Nonstandard',
  'Pubkey-output',
  'Zero-Coin PoW',
  'OP_RETURN',
  'Coinstake-Marker',
  'MESCAL-Contract'
])

function isValidAddressParam(addr: string): boolean {
  if (SPECIAL_ADDRESS_LABELS.has(addr)) return true
  if (/^(kt|tk|rt)1p[ac-hj-np-z02-9]{58}$/.test(addr)) return true
  return /^[1-9A-HJ-NP-Za-km-z]{33,36}$/.test(addr)
}

function toSatoshi(amount: number | null | undefined): number {
  return Math.round((amount || 0) * 1e8)
}

function fromSatoshi(sats: number): number {
  return Math.round(sats) / 1e8
}

export default defineEventHandler(async (event) => {
  const rawAddr = decodeURIComponent((event.context.params?.id || '').trim())
  const address = normalizeTaprootAddress(rawAddr)

  if (!isValidAddressParam(address)) {
    setResponseStatus(event, 400)
    return {
      success: false,
      error: 'Invalid wallet address format'
    }
  }

  const query = getQuery(event)
  const page = Math.max(1, parseInt((query.page as string) || '1', 10) || 1)
  const limit = Math.min(100, Math.max(10, parseInt((query.limit as string) || '50', 10) || 50))
  const direction = ((query.direction as string) || 'all').toLowerCase()
  const offset = (page - 1) * limit

  try {
    const heightRow = await dbGet('SELECT MAX(height) as height FROM blocks')
    const currentHeight = heightRow?.height || 0

    // 1. Calculate received, sent, and net balance using satoshi integer arithmetic
    const receivedRow = await dbGet('SELECT SUM(amount) as total FROM vout WHERE address = ?', [address])
    const sentRow = await dbGet('SELECT SUM(amount) as total FROM vin WHERE address = ?', [address])
    const lockedRow = await dbGet(
      "SELECT SUM(amount) as total, MAX(lock_height) as max_lock_height FROM vout WHERE address = ? AND spent_txid IS NULL AND script_type IN ('adam_coinlock', 'adam_powlock')",
      [address]
    )

    const receivedSats = toSatoshi(receivedRow?.total)
    const sentSats = toSatoshi(sentRow?.total)
    const balanceSats = Math.max(0, receivedSats - sentSats)
    const lockedBalanceSats = toSatoshi(lockedRow?.total)

    const totalReceived = fromSatoshi(receivedSats)
    const totalSent = fromSatoshi(sentSats)
    const balance = fromSatoshi(balanceSats)
    const lockedBalance = fromSatoshi(lockedBalanceSats)

    // 2. Get true total distinct transaction count for this address
    const countRow = await dbGet(
      `
      SELECT COUNT(*) as count FROM (
        SELECT txid FROM vout WHERE address = ?
        UNION
        SELECT txid FROM vin WHERE address = ?
      )
    `,
      [address, address]
    )
    const txCount = countRow?.count || 0

    let havingSql = ''
    if (direction === 'in') {
      havingSql = 'HAVING SUM(received) > 0 AND SUM(sent) = 0'
    } else if (direction === 'out') {
      havingSql = 'HAVING SUM(sent) > 0'
    }

    // 3. Fetch paginated transactions involving this address
    const rawTransactions = await dbQuery(
      `
      SELECT txid, SUM(received) as received, SUM(sent) as sent, MAX(time) as time, MAX(tx_type) as tx_type FROM (
        SELECT v.txid, v.amount as received, 0 as sent, t.time, t.tx_type
        FROM vout v
        JOIN transactions t ON v.txid = t.txid
        WHERE v.address = ?

        UNION ALL

        SELECT v.txid, 0 as received, v.amount as sent, t.time, t.tx_type
        FROM vin v
        JOIN transactions t ON v.txid = t.txid
        WHERE v.address = ?
      )
      GROUP BY txid
      ${havingSql}
      ORDER BY time DESC
      LIMIT ? OFFSET ?
    `,
      [address, address, limit, offset]
    )

    let filteredCount = txCount
    if (direction === 'in' || direction === 'out') {
      const dirCountRow = await dbGet(
        `SELECT COUNT(*) as count FROM (
           SELECT txid, SUM(received) as received, SUM(sent) as sent FROM (
             SELECT v.txid, v.amount as received, 0 as sent FROM vout v WHERE v.address = ?
             UNION ALL
             SELECT v.txid, 0 as received, v.amount as sent FROM vin v WHERE v.address = ?
           )
           GROUP BY txid
           ${havingSql}
         )`,
        [address, address]
      )
      filteredCount = dirCountRow?.count || 0
    }

    const totalPages = Math.max(1, Math.ceil(filteredCount / limit))

    const transactions = rawTransactions.map((tx: any) => ({
      txid: tx.txid,
      received: fromSatoshi(toSatoshi(tx.received)),
      sent: fromSatoshi(toSatoshi(tx.sent)),
      time: tx.time,
      txType: tx.tx_type || 'standard'
    }))

    // 4. Fetch Unspent Outputs (UTXOs) for this address (exclude burn pseudo-ledger if needed, or show top 100)
    const utxoRows = await dbQuery(
      `SELECT
         v.txid, v.n, v.amount, v.script_type, v.lock_height,
         t.time, b.height as block_height
       FROM vout v
       LEFT JOIN transactions t ON v.txid = t.txid
       LEFT JOIN blocks b ON t.block_hash = b.hash
       WHERE v.address = ? AND v.spent_txid IS NULL AND v.amount > 0
       ORDER BY v.amount DESC, t.time DESC
       LIMIT 100`,
      [address]
    )

    const utxos = (utxoRows || []).map((u: any) => ({
      txid: u.txid,
      n: u.n,
      amount: fromSatoshi(toSatoshi(u.amount)),
      scriptType: u.script_type || 'pubkeyhash',
      lockHeight: u.lock_height || null,
      unlockBlocksRemaining: u.lock_height ? Math.max(0, u.lock_height - currentHeight) : 0,
      time: u.time || null,
      blockHeight: u.block_height ?? null,
      confirmations:
        typeof u.block_height === 'number' ? Math.max(1, currentHeight - u.block_height + 1) : 0
    }))

    // 5. Validator & Quorum membership + produced/coordinated blocks
    let validatorEntries: any[] = []
    let quorumMember: any = null
    try {
      const pool = await getValidatorPoolData()
      validatorEntries = (pool.validators || []).filter((v: any) => v.address === address)
      quorumMember = (pool.quorum?.members || []).find((m: any) => m.addr === address) || null
    } catch (_) {}

    const producedRows = await dbQuery(
      `SELECT height, hash, time, is_pos, reward, solved_seats, adam_coordinator
       FROM blocks
       WHERE producer_address = ? OR adam_coordinator = ?
       ORDER BY height DESC
       LIMIT 25`,
      [address, address]
    )

    const producedBlocks = (producedRows || []).map((b: any) => ({
      height: b.height,
      hash: b.hash,
      time: b.time,
      isPos: Boolean(b.is_pos),
      reward: fromSatoshi(toSatoshi(b.reward || calculateBlockSubsidy(b.height))),
      solvedSeats: b.solved_seats || 0,
      isCoordinator: b.adam_coordinator === address
    }))

    return {
      success: true,
      address,
      currentHeight,
      isBurnAddress: isBurnAddress(address),
      isTreasuryAddress: address === TREASURY_ADDRESS,
      isTaprootAddress: /^(kt|tk|rt)1p[ac-hj-np-z02-9]{58}$/.test(address),
      balance,
      lockedBalance,
      maxLockHeight: lockedRow?.max_lock_height || null,
      totalReceived,
      totalSent,
      txCount,
      page,
      limit,
      direction,
      totalPages,
      transactions,
      utxos,
      validatorEntries,
      quorumMember,
      producedBlocks
    }
  } catch (err: any) {
    console.error(`[API /address/${address}] Error:`, err.message || err)
    setResponseStatus(event, 500)
    return {
      success: false,
      error: 'Failed to fetch address details'
    }
  }
})
