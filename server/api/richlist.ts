import { BURN_ADDRESSES, dbGet, dbQuery, TREASURY_ADDRESS } from '../utils/db'
import { getCachedStatusData } from './status'
import { getValidatorPoolData } from './validators'

const RICHLIST_CACHE_TTL_MS = 10_000
let cachedRichList: any = null
let cachedRichListTime = 0

const PSEUDO_LABELS = [
  'Genesis',
  'Coinbase',
  'Nonstandard',
  'Pubkey-output',
  'Zero-Coin PoW',
  'OP_RETURN',
  'Coinstake-Marker',
  'MESCAL-Contract'
]

function normalizeAmount(val: number | null | undefined): number {
  return Math.round((val || 0) * 1e8) / 1e8
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const limit = Math.min(100, Math.max(10, parseInt((query.limit as string) || '100', 10) || 100))
  const now = Date.now()

  if (cachedRichList && cachedRichList.limit === limit && now - cachedRichListTime < RICHLIST_CACHE_TTL_MS) {
    return cachedRichList
  }

  try {
    const status = await getCachedStatusData()
    const validatorData = await getValidatorPoolData()

    const validatorMap = new Map<string, string>()
    for (const v of validatorData.validators || []) {
      if (v.address && !validatorMap.has(v.address)) {
        validatorMap.set(v.address, v.track)
      }
    }

    const excluded = [...PSEUDO_LABELS, BURN_ADDRESSES[0], BURN_ADDRESSES[1]]
    const placeholders = excluded.map(() => '?').join(', ')

    const holderCountRow = await dbGet(
      `SELECT COUNT(DISTINCT address) as cnt
       FROM vout
       WHERE spent_txid IS NULL AND amount > 0 AND address NOT IN (${placeholders})`,
      excluded
    )

    const topRows = await dbQuery(
      `SELECT
         address,
         SUM(amount) as balance,
         COUNT(*) as utxo_count,
         COALESCE(SUM(CASE WHEN script_type IN ('adam_coinlock', 'adam_powlock') THEN amount ELSE 0 END), 0) as locked_balance
       FROM vout
       WHERE spent_txid IS NULL AND amount > 0 AND address NOT IN (${placeholders})
       GROUP BY address
       ORDER BY balance DESC
       LIMIT ?`,
      [...excluded, limit]
    )

    const treasuryRow = await dbGet(
      `SELECT
         COALESCE(SUM(amount), 0) as balance,
         COUNT(*) as utxo_count
       FROM vout
       WHERE spent_txid IS NULL AND amount > 0 AND address = ?`,
      [TREASURY_ADDRESS]
    )

    const burnRows = await dbQuery(
      `SELECT address, COALESCE(SUM(amount), 0) as burned, COUNT(*) as outputs
       FROM vout
       WHERE amount > 0 AND address IN (?, ?)
       GROUP BY address`,
      [BURN_ADDRESSES[0], BURN_ADDRESSES[1]]
    )

    const circulating = status.circulatingSupply > 0 ? status.circulatingSupply : 1

    const holders = (topRows || []).map((row: any, idx: number) => {
      const bal = normalizeAmount(row.balance)
      const locked = normalizeAmount(row.locked_balance)
      const sharePct = Math.min(100, Math.round((bal / circulating) * 10000) / 100)
      return {
        rank: idx + 1,
        address: row.address,
        balance: bal,
        lockedBalance: locked,
        utxoCount: row.utxo_count || 0,
        sharePct,
        isTreasury: row.address === TREASURY_ADDRESS,
        isTaproot: /^(kt|tk|rt)1p[ac-hj-np-z02-9]{58}$/.test(row.address || ''),
        validatorTrack: validatorMap.get(row.address) || null
      }
    })

    const sumTop = (n: number) =>
      holders.slice(0, n).reduce((acc: number, h: any) => acc + h.balance, 0)

    const top10Pct =
      status.circulatingSupply > 0
        ? Math.min(100, Math.round((sumTop(10) / status.circulatingSupply) * 10000) / 100)
        : 0
    const top50Pct =
      status.circulatingSupply > 0
        ? Math.min(100, Math.round((sumTop(50) / status.circulatingSupply) * 10000) / 100)
        : 0

    const payload = {
      success: true,
      limit,
      height: status.height,
      totalSupply: status.totalSupply,
      circulatingSupply: status.circulatingSupply,
      lockedValidatorSupply: status.lockedValidatorSupply,
      burnedSupply: status.burnedSupply,
      holderCount: holderCountRow?.cnt || 0,
      top10Pct,
      top50Pct,
      treasury: {
        address: TREASURY_ADDRESS,
        balance: normalizeAmount(treasuryRow?.balance || 0),
        utxoCount: treasuryRow?.utxo_count || 0
      },
      burnAddresses: BURN_ADDRESSES.map((addr) => {
        const found = (burnRows || []).find((r: any) => r.address === addr)
        return {
          address: addr,
          burned: normalizeAmount(found?.burned || 0),
          outputs: found?.outputs || 0
        }
      }),
      holders
    }

    cachedRichList = payload
    cachedRichListTime = now
    return payload
  } catch (err: any) {
    console.error('[API /richlist] Error:', err?.message || err)
    setResponseStatus(event, 500)
    return {
      success: false,
      error: 'Failed to build rich list'
    }
  }
})
