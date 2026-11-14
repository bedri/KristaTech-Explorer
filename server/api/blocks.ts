import { dbGet, dbQuery } from '../utils/db'
import { calculateBlockSubsidy } from '../../app/utils/protocol'

function normalizeAmount(val: number | null | undefined): number {
  return Math.round((val || 0) * 1e8) / 1e8
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Math.max(1, parseInt((query.page as string) || '1', 10) || 1)
  const limit = Math.min(100, Math.max(10, parseInt((query.limit as string) || '25', 10) || 25))
  const type = ((query.type as string) || 'all').toLowerCase()
  const offset = (page - 1) * limit

  let whereClause = ''
  if (type === 'pos') {
    whereClause = 'WHERE b.is_pos = 1'
  } else if (type === 'pow') {
    whereClause = 'WHERE b.is_pos = 0'
  }

  try {
    const countsRow = await dbGet(
      `SELECT
         COUNT(*) as total,
         COALESCE(SUM(CASE WHEN is_pos = 1 THEN 1 ELSE 0 END), 0) as pos_count,
         COALESCE(SUM(CASE WHEN is_pos = 0 THEN 1 ELSE 0 END), 0) as pow_count
       FROM blocks`
    )

    const totalAll = countsRow?.total || 0
    const posCount = countsRow?.pos_count || 0
    const powCount = countsRow?.pow_count || 0
    const filteredTotal = type === 'pos' ? posCount : type === 'pow' ? powCount : totalAll
    const totalPages = Math.max(1, Math.ceil(filteredTotal / limit))

    const rows = await dbQuery(
      `SELECT
         b.height, b.hash, b.difficulty, b.time, b.tx_count, b.size,
         b.is_pos, b.is_pow, b.adam_coordinator, b.producer_address,
         b.reward, b.solved_seats, b.version,
         p.time as prev_time
       FROM blocks b
       LEFT JOIN blocks p ON p.height = b.height - 1
       ${whereClause}
       ORDER BY b.height DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    )

    const blocks = (rows || []).map((b: any) => ({
      height: b.height,
      hash: b.hash,
      difficulty: b.difficulty,
      time: b.time,
      deltaTime:
        b.height > 0 && b.prev_time !== null && b.prev_time !== undefined
          ? Math.max(0, (b.time || 0) - b.prev_time)
          : null,
      tx_count: b.tx_count,
      size: b.size,
      is_pos: Boolean(b.is_pos),
      is_pow: Boolean(b.is_pow),
      adam_coordinator: b.adam_coordinator || null,
      producer_address: b.producer_address || b.adam_coordinator || (b.height === 0 ? 'Genesis' : 'Miner'),
      reward: normalizeAmount(b.reward || calculateBlockSubsidy(b.height)),
      solved_seats: b.solved_seats || 0,
      version: b.version || 1
    }))

    return {
      success: true,
      page,
      limit,
      type,
      total: filteredTotal,
      totalPages,
      counts: {
        all: totalAll,
        pow: powCount,
        pos: posCount
      },
      blocks
    }
  } catch (err: any) {
    console.error('[API /blocks] Error:', err?.message || err)
    setResponseStatus(event, 500)
    return {
      success: false,
      error: 'Failed to query blocks'
    }
  }
})
