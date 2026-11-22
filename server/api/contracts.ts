import { callRpcBatch } from '../utils/rpc'
import { dbGet, dbQuery } from '../utils/db'
import {
  apiError,
  BoundedTtlCache,
  fromSatoshi,
  parsePagination,
  setCacheControl,
  toSatoshi
} from '../utils/api'
import { decodeOpReturnAsm } from '../../app/utils/formatters'

const contractsCache = new BoundedTtlCache<any>(8000, 100)

const KIND_TO_TYPES: Record<string, string[]> = {
  all: ['mescalcontract', 'witness_v1_taproot', 'nulldata'],
  mescal: ['mescalcontract'],
  taproot: ['witness_v1_taproot'],
  op_return: ['nulldata']
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { page, limit, offset } = parsePagination(query, {
    defaultLimit: 25,
    minLimit: 1,
    maxLimit: 100
  })

  const rawKind = String(query.kind ?? 'all').toLowerCase()
  const kind = KIND_TO_TYPES[rawKind] ? rawKind : 'all'
  const unspentOnly = String(query.unspentOnly ?? 'false').toLowerCase() === 'true'
  const decompile = String(query.decompile ?? 'false').toLowerCase() === 'true'

  const cacheKey = `${kind}:${page}:${limit}:${unspentOnly ? 'u' : 'a'}:${decompile ? 'd' : 'nd'}`

  try {
    setCacheControl(event, 8, 10)

    return await contractsCache.getOrLoad(cacheKey, async () => {
      const targetTypes = KIND_TO_TYPES[kind]!
      const typePlaceholders = targetTypes.map(() => '?').join(', ')

      const whereParts: string[] = [`v.script_type IN (${typePlaceholders})`]
      const params: any[] = [...targetTypes]
      if (unspentOnly) {
        whereParts.push('v.spent_txid IS NULL')
      }
      const whereSql = `WHERE ${whereParts.join(' AND ')}`

      const summaryRows = await dbQuery(
        `SELECT script_type, COUNT(*) as cnt
         FROM vout
         WHERE script_type IN ('mescalcontract', 'witness_v1_taproot', 'nulldata')
         GROUP BY script_type`
      )

      const counts = {
        all: 0,
        mescal: 0,
        taproot: 0,
        op_return: 0
      }
      for (const r of summaryRows || []) {
        const cnt = Number(r.cnt) || 0
        counts.all += cnt
        if (r.script_type === 'mescalcontract') counts.mescal = cnt
        else if (r.script_type === 'witness_v1_taproot') counts.taproot = cnt
        else if (r.script_type === 'nulldata') counts.op_return = cnt
      }

      const countRow = await dbGet(
        `SELECT COUNT(*) as total FROM vout v ${whereSql}`,
        params
      )
      const total = countRow?.total || 0
      const totalPages = Math.max(1, Math.ceil(total / limit))

      const rows = await dbQuery(
        `SELECT
           v.txid, v.n, v.address, v.amount, v.spent_txid, v.script_type,
           v.script_asm, v.script_hex,
           t.time, t.block_hash,
           b.height as block_height
         FROM vout v
         LEFT JOIN transactions t ON v.txid = t.txid
         LEFT JOIN blocks b ON t.block_hash = b.hash
         ${whereSql}
         ORDER BY COALESCE(b.height, 0) DESC, t.time DESC, v.n ASC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      )

      const decompiledByKey = new Map<string, any>()
      if (decompile) {
        const mescalToDecompile = (rows || [])
          .filter((r: any) => r.script_type === 'mescalcontract' && r.script_hex)
          .slice(0, 25)

        if (mescalToDecompile.length > 0) {
          try {
            const results = await callRpcBatch(
              mescalToDecompile.map((r: any) => ({
                method: 'decompilemescal',
                params: [r.script_hex]
              }))
            )
            mescalToDecompile.forEach((r: any, idx: number) => {
              decompiledByKey.set(`${r.txid}:${r.n}`, results[idx] ?? null)
            })
          } catch (_) {
            // If batch decompile fails, degrade gracefully to null per contract
          }
        }
      }

      const items = (rows || []).map((r: any) => {
        const opReturnDecoded =
          r.script_type === 'nulldata' ? decodeOpReturnAsm(r.script_asm) : null
        return {
          txid: r.txid,
          n: r.n,
          address: r.address,
          amount: fromSatoshi(toSatoshi(r.amount)),
          spent: Boolean(r.spent_txid),
          spentTxid: r.spent_txid || null,
          scriptType: r.script_type,
          scriptAsm: r.script_asm || null,
          scriptHex: r.script_hex || null,
          opReturnDecoded,
          mescalDecompiled: decompiledByKey.get(`${r.txid}:${r.n}`) ?? null,
          blockHash: r.block_hash || null,
          blockHeight: r.block_height ?? null,
          time: r.time ?? null
        }
      })

      return {
        success: true,
        kind,
        unspentOnly,
        decompile,
        page,
        limit,
        total,
        totalPages,
        counts,
        items
      }
    })
  } catch (err: any) {
    console.error('[API /contracts] Error:', err?.message || err)
    return apiError(event, 500, 'Failed to query contracts', 'CONTRACTS_QUERY_FAILED')
  }
})
