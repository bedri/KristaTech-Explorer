import { callRpc } from '../utils/rpc'
import { apiError, BoundedTtlCache, setCacheControl } from '../utils/api'
import { computeFeeEstimates } from '../utils/fees'
import { getCachedMempoolSummary } from './mempool'

const feeCache = new BoundedTtlCache<any>(5000, 2)

export default defineEventHandler(async (event) => {
  try {
    setCacheControl(event, 5, 10)

    return await feeCache.getOrLoad('fees', async () => {
      const [info, smartFast, smartStandard, smartEconomy, feeInfo20, mempoolSnapshot] =
        await Promise.all([
          callRpc('getinfo').catch(() => null),
          callRpc('estimatesmartfee', [1]).catch(() => null),
          callRpc('estimatesmartfee', [3]).catch(() => null),
          callRpc('estimatesmartfee', [6]).catch(() => null),
          callRpc('getfeeinfo', [20]).catch(() => null),
          getCachedMempoolSummary().catch(() => null)
        ])

      const mempoolRates: number[] = []
      const mempoolTxs = mempoolSnapshot?.payload?.transactions || []
      for (const tx of mempoolTxs) {
        if (typeof tx?.feeRateSatByte === 'number' && tx.feeRateSatByte > 0) {
          mempoolRates.push(tx.feeRateSatByte)
        }
      }

      const estimated = computeFeeEstimates({
        smartFeeFast: smartFast,
        smartFeeStandard: smartStandard,
        smartFeeEconomy: smartEconomy,
        relayFeeKristaPerKb: info?.relayfee,
        mempoolFeeRatesSatByte: mempoolRates,
        feeInfo20
      })

      return {
        success: true,
        height: info?.blocks ?? null,
        mempoolSize: mempoolSnapshot?.payload?.size ?? 0,
        ...estimated
      }
    })
  } catch (err: any) {
    console.error('[API /fees] Error:', err?.message || err)
    return apiError(event, 500, 'Failed to estimate fees', 'FEE_ESTIMATION_FAILED')
  }
})
