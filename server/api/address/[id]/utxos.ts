import { dbGet, dbQuery, normalizeTaprootAddress } from '../../../utils/db'
import {
  apiError,
  fromSatoshi,
  isValidAddressParam,
  parsePagination,
  setCacheControl,
  toSatoshi
} from '../../../utils/api'

const SORT_OPTIONS: Record<string, string> = {
  amount_desc: 'v.amount DESC, t.time DESC, v.txid ASC, v.n ASC',
  amount_asc: 'v.amount ASC, t.time DESC, v.txid ASC, v.n ASC',
  oldest: 'COALESCE(b.height, 0) ASC, t.time ASC, v.n ASC',
  newest: 'COALESCE(b.height, 0) DESC, t.time DESC, v.n ASC'
}

export default defineEventHandler(async (event) => {
  const rawAddr = decodeURIComponent((event.context.params?.id || '').trim())
  const address = normalizeTaprootAddress(rawAddr)

  if (!isValidAddressParam(address)) {
    return apiError(event, 400, 'Invalid wallet address format', 'INVALID_ADDRESS')
  }

  const query = getQuery(event)
  const { page, limit, offset } = parsePagination(query, {
    defaultLimit: 50,
    minLimit: 1,
    maxLimit: 200
  })
  const minConfirmations = Math.max(0, parseInt(String(query.minConfirmations ?? '0'), 10) || 0)
  const spendableOnly = String(query.spendableOnly ?? 'false').toLowerCase() === 'true'
  const rawSort = String(query.sort ?? 'amount_desc').toLowerCase()
  const sort = SORT_OPTIONS[rawSort] ? rawSort : 'amount_desc'
  const orderSql = SORT_OPTIONS[sort]!

  try {
    setCacheControl(event, 3, 5)
    const heightRow = await dbGet('SELECT MAX(height) as height FROM blocks')
    const currentHeight = heightRow?.height || 0

    const whereParts: string[] = [
      'v.address = ?',
      'v.spent_txid IS NULL',
      'v.amount > 0'
    ]
    const params: any[] = [address]

    if (minConfirmations > 0) {
      const maxBlockHeight = currentHeight - minConfirmations + 1
      whereParts.push('b.height IS NOT NULL AND b.height <= ?')
      params.push(maxBlockHeight)
    }

    if (spendableOnly) {
      whereParts.push(
        "(v.script_type NOT IN ('adam_coinlock', 'adam_powlock', 'cltv_timelock') OR (v.lock_height IS NOT NULL AND v.lock_height <= ?))"
      )
      params.push(currentHeight)
    }

    const whereSql = `WHERE ${whereParts.join(' AND ')}`

    const summaryRow = await dbGet(
      `SELECT COUNT(*) as total_utxos, COALESCE(SUM(v.amount), 0) as total_amount
       FROM vout v
       LEFT JOIN transactions t ON v.txid = t.txid
       LEFT JOIN blocks b ON t.block_hash = b.hash
       ${whereSql}`,
      params
    )

    const totalUtxos = summaryRow?.total_utxos || 0
    const totalSatoshis = toSatoshi(summaryRow?.total_amount)
    const totalAmount = fromSatoshi(totalSatoshis)
    const totalPages = Math.max(1, Math.ceil(totalUtxos / limit))

    const rows = await dbQuery(
      `SELECT
         v.txid, v.n, v.amount, v.script_type, v.lock_height, v.script_asm, v.script_hex,
         t.time, t.is_coinbase, t.is_coinstake,
         b.height as block_height
       FROM vout v
       LEFT JOIN transactions t ON v.txid = t.txid
       LEFT JOIN blocks b ON t.block_hash = b.hash
       ${whereSql}
       ORDER BY ${orderSql}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )

    const utxos = (rows || []).map((u: any) => {
      const sats = toSatoshi(u.amount)
      const isTimelockScript =
        u.script_type === 'adam_coinlock' ||
        u.script_type === 'adam_powlock' ||
        u.script_type === 'cltv_timelock'
      const lockHeight = typeof u.lock_height === 'number' ? u.lock_height : null
      const unlockBlocksRemaining = lockHeight ? Math.max(0, lockHeight - currentHeight) : 0
      const isLocked = Boolean(
        isTimelockScript && (lockHeight === null || lockHeight > currentHeight)
      )
      const confirmations =
        typeof u.block_height === 'number' ? Math.max(1, currentHeight - u.block_height + 1) : 0

      return {
        txid: u.txid,
        vout: u.n,
        n: u.n,
        amount: fromSatoshi(sats),
        satoshis: sats,
        scriptType: u.script_type || 'pubkeyhash',
        scriptHex: u.script_hex || null,
        scriptAsm: u.script_asm || null,
        lockHeight,
        isLocked,
        unlockBlocksRemaining,
        blockHeight: u.block_height ?? null,
        time: u.time || null,
        confirmations,
        isCoinbase: Boolean(u.is_coinbase),
        isCoinstake: Boolean(u.is_coinstake)
      }
    })

    return {
      success: true,
      address,
      currentHeight,
      totalUtxos,
      totalAmount,
      totalSatoshis,
      page,
      limit,
      totalPages,
      spendableOnly,
      minConfirmations,
      sort,
      utxos
    }
  } catch (err: any) {
    console.error(`[API /address/${address}/utxos] Error:`, err?.message || err)
    return apiError(event, 500, 'Failed to fetch address UTXOs', 'ADDRESS_UTXOS_FAILED')
  }
})
