import { dbGet, dbQuery } from '../utils/db'
import { setCacheControl } from '../utils/api'

function normalizeAmount(val: number | null | undefined): number {
  return Math.round((val || 0) * 1e8) / 1e8
}

const VALID_FILTERS = new Set([
  'all',
  'standard',
  'rewards',
  'registrations',
  'coinbase',
  'coinstake',
  'coin_lock',
  'pow_lock',
  'zerocoin_pow',
  'burn',
  'contract'
])

export default defineEventHandler(async (event) => {
  setCacheControl(event, 5, 5)
  const query = getQuery(event)
  const page = Math.max(1, parseInt((query.page as string) || '1', 10) || 1)
  const limit = Math.min(100, Math.max(10, parseInt((query.limit as string) || '25', 10) || 25))
  const rawType = ((query.type as string) || 'all').toLowerCase()
  const filter = VALID_FILTERS.has(rawType) ? rawType : 'all'
  const offset = (page - 1) * limit

  let whereSql = ''
  const params: any[] = []

  if (filter === 'rewards') {
    whereSql = "WHERE t.tx_type IN ('coinbase', 'coinstake')"
  } else if (filter === 'registrations') {
    whereSql = "WHERE t.tx_type IN ('coin_lock', 'pow_lock', 'zerocoin_pow')"
  } else if (filter !== 'all') {
    whereSql = 'WHERE t.tx_type = ?'
    params.push(filter)
  }

  try {
    const groupRows = await dbQuery(
      'SELECT tx_type, COUNT(*) as cnt FROM transactions GROUP BY tx_type'
    )
    const countsByType: Record<string, number> = {
      all: 0,
      standard: 0,
      rewards: 0,
      registrations: 0,
      coinbase: 0,
      coinstake: 0,
      coin_lock: 0,
      pow_lock: 0,
      zerocoin_pow: 0,
      burn: 0,
      contract: 0
    }
    for (const r of groupRows || []) {
      const k = r.tx_type || 'standard'
      const c = r.cnt || 0
      countsByType.all += c
      countsByType[k] = (countsByType[k] || 0) + c
    }
    countsByType.rewards = (countsByType.coinbase || 0) + (countsByType.coinstake || 0)
    countsByType.registrations =
      (countsByType.coin_lock || 0) + (countsByType.pow_lock || 0) + (countsByType.zerocoin_pow || 0)

    const countRow =
      filter === 'all'
        ? { cnt: countsByType.all }
        : await dbGet(`SELECT COUNT(*) as cnt FROM transactions t ${whereSql}`, params)

    const total = countRow?.cnt || 0
    const totalPages = Math.max(1, Math.ceil(total / limit))

    const rows = await dbQuery(
      `SELECT
         t.txid, t.block_hash, b.height as block_height, t.time,
         t.value, t.fee, t.is_coinbase, t.is_coinstake, t.tx_type
       FROM transactions t
       LEFT JOIN blocks b ON t.block_hash = b.hash
       ${whereSql}
       ORDER BY t.time DESC, t.rowid DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )

    const transactions = (rows || []).map((tx: any) => ({
      txid: tx.txid,
      block_hash: tx.block_hash,
      block_height: tx.block_height ?? null,
      time: tx.time,
      value: normalizeAmount(tx.value),
      fee: normalizeAmount(tx.fee),
      isCoinbase: Boolean(tx.is_coinbase),
      isCoinstake: Boolean(tx.is_coinstake),
      txType: tx.tx_type || 'standard'
    }))

    return {
      success: true,
      page,
      limit,
      filter,
      total,
      totalPages,
      countsByType,
      transactions
    }
  } catch (err: any) {
    console.error('[API /transactions] Error:', err?.message || err)
    setResponseStatus(event, 500)
    return {
      success: false,
      error: 'Failed to query transactions'
    }
  }
})
