export interface MilestoneInfo {
  currentEra: string
  currentEraTr: string
  algorithmLabel: string
  nextHeight: number
  nextLabel: string
  nextLabelTr: string
  progressPct: number
  blocksRemaining: number
  etaSeconds: number
}

export interface CoordinatorWeightSummary {
  mnWeightEach: number
  coinLockWeightEach: number
  powLockWeightEach: number
  activeMnCount: number
  eligibleCoinLockSeats: number
  eligiblePowLockSeats: number
  totalMnWeight: number
  totalCoinLockWeight: number
  totalPowLockWeight: number
  totalPoolWeight: number
  mnSharePct: number
  coinLockSharePct: number
  powLockSharePct: number
  perMnSeatPct: number
  perCoinLockSeatPct: number
  perPowLockSeatPct: number
}

export const TARGET_BLOCK_TIME_SECONDS = 30
export const DECAY_INTERVAL_BLOCKS = 259200
export const ADAM_COORD_WEIGHT_MASTERNODE = 65
export const ADAM_COORD_WEIGHT_COIN_LOCK = 16
export const ADAM_COORD_WEIGHT_POW_LOCK = 4
export const ADAM_MASTERNODE_TRACK_QUOTA = 7
export const ADAM_COIN_LOCK_TRACK_QUOTA = 1
export const ADAM_OPEN_POW_TRACK_QUOTA = 3

export function toSatoshi(amount: number | null | undefined): number {
  return Math.round((amount || 0) * 1e8)
}

export function fromSatoshi(sats: number): number {
  return Math.round(sats) / 1e8
}

const FIXED_SCALE = 1000000000000000000n // 10^18
const DECAY_NUM = 981000000000000000n // 0.981 * 10^18

function computeDecayedSubsidySats(period: number): number {
  let factor = FIXED_SCALE
  let base = DECAY_NUM
  let exp = Math.max(0, Math.floor(period))
  while (exp > 0) {
    if ((exp & 1) === 1) {
      factor = (factor * base + FIXED_SCALE / 2n) / FIXED_SCALE
    }
    exp >>= 1
    if (exp > 0) {
      base = (base * base + FIXED_SCALE / 2n) / FIXED_SCALE
    }
  }
  const rawSubsidy = BigInt(15 * 1e8) * factor
  return Number((rawSubsidy + FIXED_SCALE / 2n) / FIXED_SCALE)
}

/**
 * Exact C++ CMasternode::GetBlockValue(nHeight) schedule in KRISTA:
 * - Block 0..1: 0 KRISTA spendable (Zero Premine)
 * - Block 2..2200: 40 KRISTA
 * - Block 2201..5000: 30 KRISTA
 * - Block 5001..9999: 20 KRISTA
 * - Block >= 10000: 15 * (0.981 ^ floor((height - 10000) / 259200)) via 128-bit fixed-point math
 */
export function calculateBlockSubsidy(height: number): number {
  if (!Number.isFinite(height) || height <= 1) return 0
  const h = Math.floor(height)
  if (h <= 2200) return 40
  if (h <= 5000) return 30
  if (h < 10000) return 20
  const period = Math.floor((h - 10000) / DECAY_INTERVAL_BLOCKS)
  return fromSatoshi(computeDecayedSubsidySats(period))
}

/**
 * Exact theoretical cumulative block emission up to `height` using satoshi integer math.
 */
export function calculateTotalSupply(height: number): number {
  if (!Number.isFinite(height) || height <= 1) return 0
  const h = Math.floor(height)
  let totalSats = 0

  // Bootstrap Phase 1: Blocks 2..2200 -> 40 KRISTA
  if (h >= 2) {
    const count = Math.min(h, 2200) - 2 + 1
    totalSats += count * 40 * 1e8
  }
  // Bootstrap Phase 2: Blocks 2201..5000 -> 30 KRISTA
  if (h >= 2201) {
    const count = Math.min(h, 5000) - 2201 + 1
    totalSats += count * 30 * 1e8
  }
  // Bootstrap Phase 3: Blocks 5001..9999 -> 20 KRISTA
  if (h >= 5001) {
    const count = Math.min(h, 9999) - 5001 + 1
    totalSats += count * 20 * 1e8
  }
  // Maturation Phase: Blocks >= 10000 -> 15 KRISTA with 1.9% quarterly geometric decay
  if (h >= 10000) {
    let cur = 10000
    while (cur <= h) {
      const period = Math.floor((cur - 10000) / DECAY_INTERVAL_BLOCKS)
      const nextHeight = 10000 + (period + 1) * DECAY_INTERVAL_BLOCKS
      const blocksInEpoch = Math.min(h - cur + 1, nextHeight - cur)
      const subsidySats = computeDecayedSubsidySats(period)
      totalSats += blocksInEpoch * subsidySats
      cur += blocksInEpoch
    }
  }

  return fromSatoshi(totalSats)
}

export function buildConsensusInfo(height: number): MilestoneInfo {
  const h = Math.max(0, Math.floor(height || 0))

  if (h < 200) {
    const rem = 200 - h
    return {
      currentEra: 'Bootstrap PoW',
      currentEraTr: 'Başlangıç PoW',
      algorithmLabel: 'Bootstrap PoW • X11KVS',
      nextHeight: 200,
      nextLabel: 'ADAM v1 Cooperative Consensus',
      nextLabelTr: 'ADAM v1 İşbirlikçi Konsensüs',
      progressPct: Math.min(100, Math.round((h / 200) * 1000) / 10),
      blocksRemaining: rem,
      etaSeconds: rem * TARGET_BLOCK_TIME_SECONDS
    }
  }

  if (h < 2000) {
    const rem = 2000 - h
    const span = 2000 - 200
    return {
      currentEra: h >= 705 ? 'ADAM v1.2 (Dual-Track)' : 'ADAM v1',
      currentEraTr: h >= 705 ? 'ADAM v1.2 (Çift Kulvar)' : 'ADAM v1',
      algorithmLabel: 'ADAM v1 • X11KVS + 18-Algo',
      nextHeight: 2000,
      nextLabel: 'UPGRADE_POMBL (v12 3-Perm & PoB)',
      nextLabelTr: 'UPGRADE_POMBL (v12 3-Perm & PoB)',
      progressPct: Math.min(100, Math.round(((h - 200) / span) * 1000) / 10),
      blocksRemaining: rem,
      etaSeconds: rem * TARGET_BLOCK_TIME_SECONDS
    }
  }

  if (h < 2200) {
    const rem = 2200 - h
    return {
      currentEra: 'ADAM v2 (PoMBL)',
      currentEraTr: 'ADAM v2 (PoMBL)',
      algorithmLabel: 'ADAM v2 (PoMBL) • X11KVS + 18-Algo 3-Perm',
      nextHeight: 2200,
      nextLabel: 'UPGRADE_MODELD (PoBLS + 3-of-5 LLMQ)',
      nextLabelTr: 'UPGRADE_MODELD (PoBLS + 3/5 LLMQ)',
      progressPct: Math.min(100, Math.round(((h - 2000) / 200) * 1000) / 10),
      blocksRemaining: rem,
      etaSeconds: rem * TARGET_BLOCK_TIME_SECONDS
    }
  }

  if (h < 10000) {
    const rem = 10000 - h
    const span = 10000 - 2200
    return {
      currentEra: 'Model D (PoBLS + LLMQ)',
      currentEraTr: 'Model D (PoBLS + LLMQ)',
      algorithmLabel: 'Model D (PoBLS + LLMQ) • 65:16:4 VRF',
      nextHeight: 10000,
      nextLabel: 'Standard Emission (15 KRISTA & -1.9%/Q)',
      nextLabelTr: 'Standart Emisyon (15 KRISTA & -%1.9/Çeyrek)',
      progressPct: Math.min(100, Math.round(((h - 2200) / span) * 1000) / 10),
      blocksRemaining: rem,
      etaSeconds: rem * TARGET_BLOCK_TIME_SECONDS
    }
  }

  const period = Math.floor((h - 10000) / DECAY_INTERVAL_BLOCKS)
  const start = 10000 + period * DECAY_INTERVAL_BLOCKS
  const nextHeight = start + DECAY_INTERVAL_BLOCKS
  const rem = nextHeight - h
  return {
    currentEra: `Model D • Epoch #${period + 1}`,
    currentEraTr: `Model D • Dönem #${period + 1}`,
    algorithmLabel: 'Model D (PoBLS + LLMQ) • 65:16:4 VRF',
    nextHeight,
    nextLabel: `Emission Decay Epoch #${period + 2} (-1.9%)`,
    nextLabelTr: `Emisyon Azaltım Dönemi #${period + 2} (-%1.9)`,
    progressPct: Math.min(100, Math.round(((h - start) / DECAY_INTERVAL_BLOCKS) * 1000) / 10),
    blocksRemaining: rem,
    etaSeconds: rem * TARGET_BLOCK_TIME_SECONDS
  }
}

export function calculateModelDSplits(height: number, customSubsidy?: number) {
  const subsidy = customSubsidy !== undefined ? customSubsidy : calculateBlockSubsidy(height)
  const totalSats = toSatoshi(subsidy)
  if (totalSats <= 0) {
    return {
      subsidy: 0,
      treasury: 0,
      netPool: 0,
      passiveMn: 0,
      producer: 0,
      llmqTotal: 0,
      llmqPerSigner: 0,
      committeeTotal: 0,
      mnSeatEach: 0,
      coinLockSeat: 0,
      openPowSeatEach: 0
    }
  }

  const treasurySats = Math.floor((totalSats * 7) / 100)
  const netPoolSats = totalSats - treasurySats

  if (height < 200) {
    return {
      subsidy: fromSatoshi(totalSats),
      treasury: fromSatoshi(treasurySats),
      netPool: fromSatoshi(netPoolSats),
      passiveMn: 0,
      producer: fromSatoshi(netPoolSats),
      llmqTotal: 0,
      llmqPerSigner: 0,
      committeeTotal: 0,
      mnSeatEach: 0,
      coinLockSeat: 0,
      openPowSeatEach: 0
    }
  }

  if (height < 2200) {
    const producerSats = Math.floor((netPoolSats * 60) / 100)
    const committeeSats = netPoolSats - producerSats
    const mnTrackSats = Math.floor((netPoolSats * 20) / 100)
    const coinLockSats = Math.floor((netPoolSats * 8) / 100)
    const openPowTrackSats = committeeSats - mnTrackSats - coinLockSats
    return {
      subsidy: fromSatoshi(totalSats),
      treasury: fromSatoshi(treasurySats),
      netPool: fromSatoshi(netPoolSats),
      passiveMn: 0,
      producer: fromSatoshi(producerSats),
      llmqTotal: 0,
      llmqPerSigner: 0,
      committeeTotal: fromSatoshi(committeeSats),
      mnSeatEach: fromSatoshi(Math.floor(mnTrackSats / ADAM_MASTERNODE_TRACK_QUOTA)),
      coinLockSeat: fromSatoshi(coinLockSats),
      openPowSeatEach: fromSatoshi(Math.floor(openPowTrackSats / ADAM_OPEN_POW_TRACK_QUOTA))
    }
  }

  const passiveMnSats = Math.floor((netPoolSats * 35) / 100)
  const committeeSats = Math.floor((netPoolSats * 40) / 100)
  const producerSats = Math.floor((netPoolSats * 15) / 100)
  const llmqSats = netPoolSats - passiveMnSats - committeeSats - producerSats

  const mnTrackSats = Math.floor((netPoolSats * 20) / 100)
  const coinLockSats = Math.floor((netPoolSats * 8) / 100)
  const openPowTrackSats = committeeSats - mnTrackSats - coinLockSats

  return {
    subsidy: fromSatoshi(totalSats),
    treasury: fromSatoshi(treasurySats),
    netPool: fromSatoshi(netPoolSats),
    passiveMn: fromSatoshi(passiveMnSats),
    producer: fromSatoshi(producerSats),
    llmqTotal: fromSatoshi(llmqSats),
    llmqPerSigner: fromSatoshi(Math.floor(llmqSats / 5)),
    committeeTotal: fromSatoshi(committeeSats),
    mnSeatEach: fromSatoshi(Math.floor(mnTrackSats / ADAM_MASTERNODE_TRACK_QUOTA)),
    coinLockSeat: fromSatoshi(coinLockSats),
    openPowSeatEach: fromSatoshi(Math.floor(openPowTrackSats / ADAM_OPEN_POW_TRACK_QUOTA))
  }
}

/**
 * Computes exact v1.5.7.0 Quadratic Stake-Weighted Coordinator VRF (`65 : 16 : 4`)
 * weights and election shares from current pool counts.
 */
export function calculateCoordinatorWeights(counts: {
  masternode?: number
  coin_lock?: number
  pow_lock?: number
}): CoordinatorWeightSummary {
  const activeMnCount = Math.max(0, Math.floor(counts.masternode || 0))
  const eligibleCoinLockSeats = Math.min(ADAM_COIN_LOCK_TRACK_QUOTA, Math.max(0, Math.floor(counts.coin_lock || 0)))
  const eligiblePowLockSeats = Math.min(ADAM_OPEN_POW_TRACK_QUOTA, Math.max(0, Math.floor(counts.pow_lock || 0)))

  const totalMnWeight = activeMnCount * ADAM_COORD_WEIGHT_MASTERNODE
  const totalCoinLockWeight = eligibleCoinLockSeats * ADAM_COORD_WEIGHT_COIN_LOCK
  const totalPowLockWeight = eligiblePowLockSeats * ADAM_COORD_WEIGHT_POW_LOCK
  const totalPoolWeight = totalMnWeight + totalCoinLockWeight + totalPowLockWeight

  const pct = (w: number) => (totalPoolWeight > 0 ? Math.round((w / totalPoolWeight) * 10000) / 100 : 0)

  return {
    mnWeightEach: ADAM_COORD_WEIGHT_MASTERNODE,
    coinLockWeightEach: ADAM_COORD_WEIGHT_COIN_LOCK,
    powLockWeightEach: ADAM_COORD_WEIGHT_POW_LOCK,
    activeMnCount,
    eligibleCoinLockSeats,
    eligiblePowLockSeats,
    totalMnWeight,
    totalCoinLockWeight,
    totalPowLockWeight,
    totalPoolWeight,
    mnSharePct: pct(totalMnWeight),
    coinLockSharePct: pct(totalCoinLockWeight),
    powLockSharePct: pct(totalPowLockWeight),
    perMnSeatPct: activeMnCount > 0 ? pct(ADAM_COORD_WEIGHT_MASTERNODE) : 0,
    perCoinLockSeatPct: eligibleCoinLockSeats > 0 ? pct(ADAM_COORD_WEIGHT_COIN_LOCK) : 0,
    perPowLockSeatPct: eligiblePowLockSeats > 0 ? pct(ADAM_COORD_WEIGHT_POW_LOCK) : 0
  }
}

export type DetectedQueryType = 'empty' | 'height' | 'hash' | 'taproot' | 'address' | 'pubkey' | 'unknown'

export function detectSearchQueryType(raw: string): DetectedQueryType {
  const q = (raw || '').trim()
  if (!q) return 'empty'
  if (/^\d{1,9}$/.test(q)) return 'height'
  if (/^[0-9a-fA-F]{64}$/.test(q)) return 'hash'
  if (/^(02|03)[0-9a-fA-F]{64}$/.test(q)) return 'pubkey'
  if (/^(kt|tk|rt)1p[ac-hj-np-z02-9]{58}$/.test(q)) return 'taproot'
  if (/^[1-9A-HJ-NP-Za-km-z]{33,36}$/.test(q)) return 'address'
  return 'unknown'
}

/**
 * Privacy-masks peer socket endpoints before exposing them in public telemetry.
 * Example: "168.119.227.178:27999" -> "168.119.xxx.xxx:27999"
 */
export function maskPeerAddr(addr: string | null | undefined): string {
  const raw = (addr || '').trim()
  if (!raw) return 'masked'

  // IPv4 with optional port
  const v4 = raw.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}(:\d+)?$/)
  if (v4) {
    return `${v4[1]}.${v4[2]}.xxx.xxx${v4[3] || ''}`
  }

  // Bracketed IPv6 with optional port
  const v6b = raw.match(/^\[([0-9a-fA-F:]+)\](:\d+)?$/)
  if (v6b && v6b[1]) {
    const segs = v6b[1].split(':').filter(Boolean)
    const head = segs.slice(0, 2).join(':') || 'ipv6'
    return `[${head}:xxxx:xxxx]${v6b[2] || ''}`
  }

  // Bare IPv6
  if (raw.includes(':')) {
    const segs = raw.split(':').filter(Boolean)
    return `${segs.slice(0, 2).join(':') || 'ipv6'}:xxxx:xxxx`
  }

  return 'peer.masked'
}
