export interface FeeTierEstimate {
  targetBlocks: number
  satPerByte: number
  kristaPerKb: number
  estimated250ByteTxKrista: number
}

export interface FeeEstimatesInput {
  smartFeeFast?: any
  smartFeeStandard?: any
  smartFeeEconomy?: any
  relayFeeKristaPerKb?: number | null
  mempoolFeeRatesSatByte?: number[]
  feeInfo20?: any
}

export interface FeeEstimatesOutput {
  source: 'estimatesmartfee' | 'mempool' | 'relayfee_fallback'
  typicalTxBytes: number
  minRelay: {
    satPerByte: number
    kristaPerKb: number
  }
  tiers: {
    fast: FeeTierEstimate
    standard: FeeTierEstimate
    economy: FeeTierEstimate
  }
  recent20Blocks: {
    startingBlock: number | null
    endingBlock: number | null
    txCount: number
    txCountAll: number
    txBytes: number
    totalFees: number
    avgFeePerKb: number
  } | null
}

const DEFAULT_RELAY_FEE_KRISTA_PER_KB = 0.0001
const TYPICAL_TX_BYTES = 250

function round8(val: number): number {
  return Math.round(val * 1e8) / 1e8
}

function round2(val: number): number {
  return Math.round(val * 100) / 100
}

function kristaPerKbToSatPerByte(kristaPerKb: number): number {
  // 1 KRISTA/kB = 10^8 sat / 1000 B = 10^5 sat/B
  return Math.max(1, round2(kristaPerKb * 1e5))
}

function satPerByteToKristaPerKb(satPerByte: number): number {
  return round8((satPerByte * 1000) / 1e8)
}

function extractPositiveSmartFeeSatByte(res: any): number | null {
  if (!res || typeof res !== 'object') return null
  const feerate = Number(res.feerate)
  if (!Number.isFinite(feerate) || feerate <= 0) return null
  return kristaPerKbToSatPerByte(feerate)
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor((sortedAsc.length - 1) * p)))
  return sortedAsc[idx] ?? 0
}

function buildTier(targetBlocks: number, satPerByte: number): FeeTierEstimate {
  const cleanSat = Math.max(1, round2(satPerByte))
  const kristaPerKb = satPerByteToKristaPerKb(cleanSat)
  const estimated250ByteTxKrista = round8((cleanSat * TYPICAL_TX_BYTES) / 1e8)
  return {
    targetBlocks,
    satPerByte: cleanSat,
    kristaPerKb,
    estimated250ByteTxKrista
  }
}

export function computeFeeEstimates(input: FeeEstimatesInput): FeeEstimatesOutput {
  const rawRelay = Number(input?.relayFeeKristaPerKb)
  const relayKristaPerKb =
    Number.isFinite(rawRelay) && rawRelay > 0 ? round8(rawRelay) : DEFAULT_RELAY_FEE_KRISTA_PER_KB
  const minRelaySatByte = Math.max(1, kristaPerKbToSatPerByte(relayKristaPerKb))

  const smartFast = extractPositiveSmartFeeSatByte(input?.smartFeeFast)
  const smartStd = extractPositiveSmartFeeSatByte(input?.smartFeeStandard)
  const smartEco = extractPositiveSmartFeeSatByte(input?.smartFeeEconomy)

  const mempoolRates = (input?.mempoolFeeRatesSatByte || [])
    .filter((r) => typeof r === 'number' && Number.isFinite(r) && r > 0)
    .slice()
    .sort((a, b) => a - b)

  let source: 'estimatesmartfee' | 'mempool' | 'relayfee_fallback' = 'relayfee_fallback'
  let economySat = minRelaySatByte
  let standardSat = Math.max(minRelaySatByte, round2(minRelaySatByte * 1.25))
  let fastSat = Math.max(standardSat, round2(minRelaySatByte * 2))

  if (smartFast !== null || smartStd !== null || smartEco !== null) {
    source = 'estimatesmartfee'
    const baseEco = smartEco ?? smartStd ?? smartFast ?? minRelaySatByte
    const baseStd = smartStd ?? smartFast ?? baseEco
    const baseFast = smartFast ?? baseStd
    economySat = Math.max(minRelaySatByte, baseEco)
    standardSat = Math.max(economySat, baseStd)
    fastSat = Math.max(standardSat, baseFast)
  } else if (mempoolRates.length > 0) {
    source = 'mempool'
    const p20 = percentile(mempoolRates, 0.2)
    const p50 = percentile(mempoolRates, 0.5)
    const p90 = percentile(mempoolRates, 0.9)
    economySat = Math.max(minRelaySatByte, round2(p20))
    standardSat = Math.max(economySat, round2(p50))
    fastSat = Math.max(standardSat, round2(p90))
  }

  let recent20Blocks: FeeEstimatesOutput['recent20Blocks'] = null
  if (input?.feeInfo20 && typeof input.feeInfo20 === 'object') {
    const fi = input.feeInfo20
    const startBlk = Number(fi['Starting block'])
    const endBlk = Number(fi['Ending block'])
    recent20Blocks = {
      startingBlock: Number.isFinite(startBlk) ? startBlk : null,
      endingBlock: Number.isFinite(endBlk) ? endBlk : null,
      txCount: Number(fi.txcount) || 0,
      txCountAll: Number(fi.txcount_all) || 0,
      txBytes: Number(fi.txbytes) || 0,
      totalFees: round8(Number(fi.ttlfee) || 0),
      avgFeePerKb: round8(Number(fi.feeperkb) || 0)
    }
  }

  return {
    source,
    typicalTxBytes: TYPICAL_TX_BYTES,
    minRelay: {
      satPerByte: minRelaySatByte,
      kristaPerKb: relayKristaPerKb
    },
    tiers: {
      fast: buildTier(1, fastSat),
      standard: buildTier(3, standardSat),
      economy: buildTier(6, economySat)
    },
    recent20Blocks
  }
}
