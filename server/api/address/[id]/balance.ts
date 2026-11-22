import {
  dbGet,
  isBurnAddress,
  normalizeTaprootAddress,
  TREASURY_ADDRESS
} from '../../../utils/db'
import {
  apiError,
  BoundedTtlCache,
  fromSatoshi,
  isValidAddressParam,
  setCacheControl,
  toSatoshi
} from '../../../utils/api'
import { getCachedMempoolSummary } from '../../mempool'

const balanceCache = new BoundedTtlCache<any>(3000, 300)

export default defineEventHandler(async (event) => {
  const rawAddr = decodeURIComponent((event.context.params?.id || '').trim())
  const address = normalizeTaprootAddress(rawAddr)

  if (!isValidAddressParam(address)) {
    return apiError(event, 400, 'Invalid wallet address format', 'INVALID_ADDRESS')
  }

  const query = getQuery(event)
  const includeMempool = String(query.includeMempool ?? 'true').toLowerCase() !== 'false'

  try {
    setCacheControl(event, 3, 5)
    const cacheKey = `${address}:${includeMempool ? 'mp' : 'nomp'}`

    return await balanceCache.getOrLoad(cacheKey, async () => {
      const heightRow = await dbGet('SELECT MAX(height) as height FROM blocks')
      const currentHeight = heightRow?.height || 0

      const unspentRow = await dbGet(
        `SELECT
           COALESCE(SUM(amount), 0) as total,
           COUNT(*) as utxo_count,
           COALESCE(SUM(CASE
             WHEN script_type IN ('adam_coinlock', 'adam_powlock', 'cltv_timelock')
              AND (lock_height IS NULL OR lock_height > ?)
             THEN amount ELSE 0 END), 0) as locked_total,
           MAX(lock_height) as max_lock_height
         FROM vout
         WHERE address = ? AND spent_txid IS NULL AND amount > 0`,
        [currentHeight, address]
      )

      const receivedRow = await dbGet(
        'SELECT COALESCE(SUM(amount), 0) as total FROM vout WHERE address = ?',
        [address]
      )
      const sentRow = await dbGet(
        'SELECT COALESCE(SUM(amount), 0) as total FROM vin WHERE address = ?',
        [address]
      )

      const balanceSats = Math.max(0, toSatoshi(unspentRow?.total))
      const lockedSats = Math.min(balanceSats, Math.max(0, toSatoshi(unspentRow?.locked_total)))
      const spendableSats = Math.max(0, balanceSats - lockedSats)
      const receivedSats = toSatoshi(receivedRow?.total)
      const sentSats = toSatoshi(sentRow?.total)

      let unconfirmedReceivedSats = 0
      let unconfirmedSentSats = 0
      const unconfirmedTxids = new Set<string>()

      if (includeMempool) {
        try {
          const { payload, rawTxMap } = await getCachedMempoolSummary()
          if ((payload?.size || 0) > 0 && rawTxMap.size > 0) {
            for (const [txid, rawTx] of rawTxMap.entries()) {
              if (Array.isArray(rawTx?.vout)) {
                for (const out of rawTx.vout) {
                  const addrs = out?.scriptPubKey?.addresses || []
                  if (addrs.some((a: string) => normalizeTaprootAddress(a) === address)) {
                    unconfirmedReceivedSats += toSatoshi(out?.value)
                    unconfirmedTxids.add(txid)
                  }
                }
              }
              if (Array.isArray(rawTx?.vin)) {
                for (const inp of rawTx.vin) {
                  if (inp?.txid && typeof inp?.vout === 'number') {
                    const spentPrev = await dbGet(
                      'SELECT address, amount FROM vout WHERE txid = ? AND n = ?',
                      [inp.txid, inp.vout]
                    )
                    if (spentPrev && spentPrev.address === address) {
                      unconfirmedSentSats += toSatoshi(spentPrev.amount)
                      unconfirmedTxids.add(txid)
                    }
                  }
                }
              }
            }
          }
        } catch (_) {}
      }

      const unconfirmedDeltaSats = unconfirmedReceivedSats - unconfirmedSentSats

      return {
        success: true,
        address,
        currentHeight,
        isBurnAddress: isBurnAddress(address),
        isTreasuryAddress: address === TREASURY_ADDRESS,
        isTaprootAddress: /^(kt|tk|rt)1p[ac-hj-np-z02-9]{58}$/.test(address),
        balance: fromSatoshi(balanceSats),
        spendableBalance: fromSatoshi(spendableSats),
        lockedBalance: fromSatoshi(lockedSats),
        balanceSatoshis: balanceSats,
        spendableSatoshis: spendableSats,
        lockedSatoshis: lockedSats,
        maxLockHeight: unspentRow?.max_lock_height || null,
        utxoCount: unspentRow?.utxo_count || 0,
        totalReceived: fromSatoshi(receivedSats),
        totalSent: fromSatoshi(sentSats),
        unconfirmed: includeMempool
          ? {
              received: fromSatoshi(unconfirmedReceivedSats),
              sent: fromSatoshi(unconfirmedSentSats),
              delta: fromSatoshi(unconfirmedDeltaSats),
              txCount: unconfirmedTxids.size
            }
          : null
      }
    })
  } catch (err: any) {
    console.error(`[API /address/${address}/balance] Error:`, err?.message || err)
    return apiError(event, 500, 'Failed to fetch address balance', 'ADDRESS_BALANCE_FAILED')
  }
})
