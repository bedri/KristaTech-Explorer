import { dbGet, dbQuery, normalizeTaprootAddress } from '../../../utils/db'
import {
  apiError,
  fromSatoshi,
  isValidAddressParam,
  parsePagination,
  setCacheControl,
  toSatoshi
} from '../../../utils/api'

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
  const rawAddr = decodeURIComponent((event.context.params?.id || '').trim())
  const address = normalizeTaprootAddress(rawAddr)

  if (!isValidAddressParam(address)) {
    return apiError(event, 400, 'Invalid wallet address format', 'INVALID_ADDRESS')
  }

  const query = getQuery(event)
  const { page, limit, offset } = parsePagination(query, {
    defaultLimit: 25,
    minLimit: 1,
    maxLimit: 100
  })

  const rawDir = String(query.direction ?? 'all').toLowerCase()
  const direction = rawDir === 'in' || rawDir === 'out' ? rawDir : 'all'

  const rawType = String(query.type ?? 'all').toLowerCase()
  const filter = VALID_FILTERS.has(rawType) ? rawType : 'all'

  const minHeightParsed = query.minHeight !== undefined ? parseInt(String(query.minHeight), 10) : null
  const maxHeightParsed = query.maxHeight !== undefined ? parseInt(String(query.maxHeight), 10) : null
  const minHeight =
    minHeightParsed !== null && Number.isFinite(minHeightParsed) && minHeightParsed >= 0
      ? minHeightParsed
      : null
  const maxHeight =
    maxHeightParsed !== null && Number.isFinite(maxHeightParsed) && maxHeightParsed >= 0
      ? maxHeightParsed
      : null

  try {
    setCacheControl(event, 3, 5)
    const heightRow = await dbGet('SELECT MAX(height) as height FROM blocks')
    const currentHeight = heightRow?.height || 0

    const outerWhereParts: string[] = []
    const outerParams: any[] = []

    if (filter === 'rewards') {
      outerWhereParts.push("tx_type IN ('coinbase', 'coinstake')")
    } else if (filter === 'registrations') {
      outerWhereParts.push("tx_type IN ('coin_lock', 'pow_lock', 'zerocoin_pow')")
    } else if (filter !== 'all') {
      outerWhereParts.push('tx_type = ?')
      outerParams.push(filter)
    }

    if (minHeight !== null) {
      outerWhereParts.push('block_height >= ?')
      outerParams.push(minHeight)
    }
    if (maxHeight !== null) {
      outerWhereParts.push('block_height <= ?')
      outerParams.push(maxHeight)
    }

    const outerWhereSql = outerWhereParts.length > 0 ? `WHERE ${outerWhereParts.join(' AND ')}` : ''

    let havingSql = ''
    if (direction === 'in') {
      havingSql = 'HAVING SUM(received) > 0 AND SUM(sent) = 0'
    } else if (direction === 'out') {
      havingSql = 'HAVING SUM(sent) > 0'
    }

    const baseSubquery = `
      SELECT
        txid,
        SUM(received) as received,
        SUM(sent) as sent,
        MAX(time) as time,
        MAX(tx_type) as tx_type,
        MAX(fee) as fee,
        MAX(block_hash) as block_hash,
        MAX(block_height) as block_height
      FROM (
        SELECT v.txid, v.amount as received, 0 as sent, t.time, t.tx_type, t.fee, t.block_hash, b.height as block_height
        FROM vout v
        JOIN transactions t ON v.txid = t.txid
        LEFT JOIN blocks b ON t.block_hash = b.hash
        WHERE v.address = ?

        UNION ALL

        SELECT v.txid, 0 as received, v.amount as sent, t.time, t.tx_type, t.fee, t.block_hash, b.height as block_height
        FROM vin v
        JOIN transactions t ON v.txid = t.txid
        LEFT JOIN blocks b ON t.block_hash = b.hash
        WHERE v.address = ?
      )
      GROUP BY txid
      ${havingSql}
    `

    const countRow = await dbGet(
      `SELECT COUNT(*) as total FROM (${baseSubquery}) ${outerWhereSql}`,
      [address, address, ...outerParams]
    )

    const total = countRow?.total || 0
    const totalPages = Math.max(1, Math.ceil(total / limit))

    const rows = await dbQuery(
      `SELECT txid, received, sent, time, tx_type, fee, block_hash, block_height
       FROM (${baseSubquery})
       ${outerWhereSql}
       ORDER BY time DESC
       LIMIT ? OFFSET ?`,
      [address, address, ...outerParams, limit, offset]
    )

    const transactions = (rows || []).map((tx: any) => {
      const recSats = toSatoshi(tx.received)
      const sentSats = toSatoshi(tx.sent)
      const netSats = recSats - sentSats
      const bh = typeof tx.block_height === 'number' ? tx.block_height : null
      return {
        txid: tx.txid,
        blockHash: tx.block_hash || null,
        blockHeight: bh,
        confirmations: bh !== null ? Math.max(1, currentHeight - bh + 1) : 0,
        time: tx.time,
        received: fromSatoshi(recSats),
        sent: fromSatoshi(sentSats),
        net: fromSatoshi(netSats),
        fee: fromSatoshi(toSatoshi(tx.fee)),
        txType: tx.tx_type || 'standard'
      }
    })

    return {
      success: true,
      address,
      currentHeight,
      page,
      limit,
      total,
      totalPages,
      direction,
      filter,
      minHeight,
      maxHeight,
      transactions
    }
  } catch (err: any) {
    console.error(`[API /address/${address}/txs] Error:`, err?.message || err)
    return apiError(event, 500, 'Failed to fetch address transactions', 'ADDRESS_TXS_FAILED')
  }
})
