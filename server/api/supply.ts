import { getCachedStatusData } from './status'
import { setCacheControl } from '../utils/api'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = ((query.q as string) || '').toLowerCase().trim()
  const format = ((query.format as string) || '').toLowerCase().trim()

  try {
    setCacheControl(event, 5, 10)
    const status = await getCachedStatusData()

    if (q === 'circulating' || q === 'circulatingsupply') {
      setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
      return String(status.circulatingSupply ?? 0)
    }

    if (q === 'total' || q === 'totalcoins' || q === 'totalsupply') {
      setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
      return String(status.totalSupply ?? 0)
    }

    if (q === 'burned' || q === 'burnedsupply') {
      setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
      return String(status.burnedSupply?.total ?? 0)
    }

    if (format === 'text') {
      setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
      return String(status.circulatingSupply ?? 0)
    }

    return {
      success: true,
      symbol: 'KRISTA',
      height: status.height,
      totalSupply: status.totalSupply,
      circulatingSupply: status.circulatingSupply,
      lockedValidatorSupply: status.lockedValidatorSupply,
      burnedSupply: status.burnedSupply,
      currentSubsidy: status.currentSubsidy,
      premine: 0
    }
  } catch (err: any) {
    console.error('[API /supply] Error:', err?.message || err)
    setResponseStatus(event, 500)
    return {
      success: false,
      error: 'Failed to retrieve supply metrics'
    }
  }
})
