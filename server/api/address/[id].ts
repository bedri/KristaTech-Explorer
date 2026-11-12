import {
  dbGet,
  dbQuery,
  FAUCET_ADDRESS,
  isBurnAddress,
  normalizeTaprootAddress,
  TREASURY_ADDRESS
} from '../../utils/db'

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
  const offset = (page - 1) * limit

  try {
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
    const totalPages = Math.max(1, Math.ceil(txCount / limit))

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
      ORDER BY time DESC
      LIMIT ? OFFSET ?
    `,
      [address, address, limit, offset]
    )

    const transactions = rawTransactions.map((tx: any) => ({
      txid: tx.txid,
      received: fromSatoshi(toSatoshi(tx.received)),
      sent: fromSatoshi(toSatoshi(tx.sent)),
      time: tx.time,
      txType: tx.tx_type || 'standard'
    }))

    return {
      success: true,
      address,
      isBurnAddress: isBurnAddress(address),
      isTreasuryAddress: address === TREASURY_ADDRESS,
      isFaucetAddress: address === FAUCET_ADDRESS,
      isTaprootAddress: /^(kt|tk|rt)1p[ac-hj-np-z02-9]{58}$/.test(address),
      balance,
      lockedBalance,
      maxLockHeight: lockedRow?.max_lock_height || null,
      totalReceived,
      totalSent,
      txCount,
      page,
      limit,
      totalPages,
      transactions
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
