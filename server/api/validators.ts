import { callRpc } from '../utils/rpc'

const VALIDATORS_CACHE_TTL_MS = 10_000
let cachedValidatorsResponse: any = null
let cachedValidatorsTime = 0

export interface ValidatorPoolSummary {
  total: number
  funded: number
  masternode: number
  coin_lock: number
  pow_lock: number
  zerocoin_pow: number
  bootstrap: number
}

export async function getValidatorPoolData() {
  const now = Date.now()
  if (cachedValidatorsResponse && now - cachedValidatorsTime < VALIDATORS_CACHE_TTL_MS) {
    return cachedValidatorsResponse
  }

  let rawList: any[] = []
  try {
    const res = await callRpc('getadamminers')
    if (Array.isArray(res)) {
      rawList = res
    }
  } catch (_) {
    rawList = []
  }

  const summary: ValidatorPoolSummary = {
    total: rawList.length,
    funded: 0,
    masternode: 0,
    coin_lock: 0,
    pow_lock: 0,
    zerocoin_pow: 0,
    bootstrap: 0
  }

  const validators = rawList.map((entry: any, idx: number) => {
    const track = String(entry?.track || 'bootstrap')
    if (track === 'masternode') {
      summary.masternode++
      summary.funded++
    } else if (track === 'coin_lock') {
      summary.coin_lock++
      summary.funded++
    } else if (track === 'pow_lock') {
      summary.pow_lock++
      summary.funded++
    } else if (track === 'zerocoin_pow') {
      summary.zerocoin_pow++
    } else {
      summary.bootstrap++
    }

    return {
      index: typeof entry?.index === 'number' ? entry.index : idx,
      address: entry?.address || '',
      pubkey: entry?.pubkey || '',
      track,
      unlock_height: typeof entry?.unlock_height === 'number' ? entry.unlock_height : 0
    }
  })

  const payload = {
    success: true,
    summary,
    validators
  }

  cachedValidatorsResponse = payload
  cachedValidatorsTime = now
  return payload
}

export default defineEventHandler(async () => {
  try {
    return await getValidatorPoolData()
  } catch (err: any) {
    console.error('[API /validators] Error:', err?.message || err)
    return {
      success: false,
      error: 'Failed to fetch validator pool'
    }
  }
})
