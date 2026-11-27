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
  isModelD: boolean
  vrfVersion: 'ADAM_FAIR_COORD_V5' | 'ADAM_FAIR_COORD_V4'
  mnFloorPct: number
  mnFloorCondition: string
  vrfKeyMaturityBlocks: number
  mnWeightEach: number
  effectiveMnWeightEach: number
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
  mnFloorApplied: boolean
}

export interface AdamTrackSpec {
  isModelD: boolean
  isBootstrapPow: boolean
  committeeActive: boolean
  committeeSize: number
  masternodeQuota: number
  coinLockQuota: number
  openPowQuota: number
  zeroCoinMaxSeats: number
  threshold: number
  committeePoolPct: number
  perSeatNetPct: number
}

export const TARGET_BLOCK_TIME_SECONDS = 30
export const DECAY_INTERVAL_BLOCKS = 259200
export const MODEL_D_ACTIVATION_HEIGHT = 5000
export const ADAM_COORD_WEIGHT_MASTERNODE = 4200
export const ADAM_COORD_WEIGHT_COIN_LOCK = 250
export const ADAM_COORD_WEIGHT_POW_LOCK = 10
export const ADAM_MASTERNODE_TRACK_QUOTA = 7
export const ADAM_COIN_LOCK_TRACK_QUOTA = 1
export const ADAM_OPEN_POW_TRACK_QUOTA = 3
export const ADAM_COMMITTEE_SIZE = 11
export const ADAM_MODELD_MASTERNODE_TRACK_QUOTA = 8
export const ADAM_MODELD_COIN_LOCK_TRACK_QUOTA = 2
export const ADAM_MODELD_OPEN_POW_TRACK_QUOTA = 5
export const ADAM_MODELD_ZERO_COIN_OPEN_SEATS = 2
export const ADAM_MODELD_COMMITTEE_SIZE = 15
export const ADAM_VRF_KEY_MATURITY_BLOCKS = 100
export const ADAM_PUZZLE_ALGO_COUNT = 17
export const ADAM_V12_PERMUTATION_COUNT = 4080

/**
 * Returns Pre-Model D (11+1) or Balanced Model D (15+1) track quotas and thresholds.
 */
export function getAdamTrackSpec(height: number): AdamTrackSpec {
  const h = Math.max(0, Math.floor(Number(height) || 0))
  if (h >= MODEL_D_ACTIVATION_HEIGHT) {
    return {
      isModelD: true,
      isBootstrapPow: false,
      committeeActive: true,
      committeeSize: ADAM_MODELD_COMMITTEE_SIZE,
      masternodeQuota: ADAM_MODELD_MASTERNODE_TRACK_QUOTA,
      coinLockQuota: ADAM_MODELD_COIN_LOCK_TRACK_QUOTA,
      openPowQuota: ADAM_MODELD_OPEN_POW_TRACK_QUOTA,
      zeroCoinMaxSeats: ADAM_MODELD_ZERO_COIN_OPEN_SEATS,
      threshold: 8,
      committeePoolPct: 60,
      perSeatNetPct: 4
    }
  }
  return {
    isModelD: false,
    isBootstrapPow: h < 200,
    committeeActive: h >= 200,
    committeeSize: ADAM_COMMITTEE_SIZE,
    masternodeQuota: ADAM_MASTERNODE_TRACK_QUOTA,
    coinLockQuota: ADAM_COIN_LOCK_TRACK_QUOTA,
    openPowQuota: ADAM_OPEN_POW_TRACK_QUOTA,
    zeroCoinMaxSeats: 1,
    threshold: 7,
    committeePoolPct: 75,
    perSeatNetPct: 6.82
  }
}

/**
 * Avoids walking back to Genesis block 0 when the chain height is within the default 120-block
 * hashrate lookup window, preventing Genesis timestamp gaps from collapsing reported hashrate.
 */
export function getSafeHashrateLookupWindow(height: number, defaultLookup = 120): number {
  const h = Math.max(0, Math.floor(Number(height) || 0))
  const windowSize = Math.max(1, Math.floor(Number(defaultLookup) || 120))
  if (h >= 2 && h <= windowSize) {
    return h - 1
  }
  return windowSize
}

/**
 * Dynamic BFT LLMQ quorum sizing matching src/llmq.cpp:GetTargetQuorumSize & GetQuorumThreshold.
 * Hardening v4 (height >= 1) enforces 2/3 BFT supermajority: floor(2N/3) + 1.
 */
export function getDynamicLlmqSpec(
  activeMnCount: number,
  hardeningV4 = true
): { size: number; threshold: number } {
  const count = Math.max(0, Math.floor(Number(activeMnCount) || 0))
  let size = 5
  if (count >= 100) size = 15
  else if (count >= 50) size = 11
  else if (count >= 25) size = 9

  const rawThreshold = hardeningV4 ? Math.floor((2 * size) / 3) + 1 : Math.floor(size / 2) + 1
  const threshold = Math.min(size, Math.max(2, rawThreshold))
  return { size, threshold }
}

export function toSatoshi(amount: number | null | undefined): number {
  return Math.round((amount || 0) * 1e8)
}

export function fromSatoshi(sats: number): number {
  return Math.round(sats) / 1e8
}

const FIXED_SCALE = 1000000000000000000n // 10^18
const DECAY_NUM = 978500000000000000n // 0.9785 * 10^18

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
  const rawSubsidy = BigInt(17 * 1e8) * factor
  return Number((rawSubsidy + FIXED_SCALE / 2n) / FIXED_SCALE)
}

/**
 * Exact C++ CMasternode::GetBlockValue(nHeight) schedule in KRISTA:
 * - Block 0..1: 0 KRISTA spendable (Zero Premine)
 * - Block >= 2: 17 * (0.9785 ^ floor((height - 2) / 259200)) via 128-bit fixed-point math
 */
export function calculateBlockSubsidy(height: number): number {
  if (!Number.isFinite(height) || height <= 1) return 0
  const h = Math.floor(height)
  const period = Math.floor((h - 2) / DECAY_INTERVAL_BLOCKS)
  return fromSatoshi(computeDecayedSubsidySats(period))
}

/**
 * Exact theoretical cumulative block emission up to `height` using satoshi integer math.
 */
export function calculateTotalSupply(height: number): number {
  if (!Number.isFinite(height) || height <= 1) return 0
  const h = Math.floor(height)
  let totalSats = 0

  let cur = 2
  while (cur <= h) {
    const period = Math.floor((cur - 2) / DECAY_INTERVAL_BLOCKS)
    const nextHeight = 2 + (period + 1) * DECAY_INTERVAL_BLOCKS
    const blocksInEpoch = Math.min(h - cur + 1, nextHeight - cur)
    const subsidySats = computeDecayedSubsidySats(period)
    totalSats += blocksInEpoch * subsidySats
    cur += blocksInEpoch
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

  if (h < 2500) {
    const rem = 2500 - h
    const span = 2500 - 200
    return {
      currentEra: 'ADAM Dual-Track (Pre-Model D)',
      currentEraTr: 'ADAM Çift Kulvar (Model D Öncesi)',
      algorithmLabel: 'ADAM Dual-Track • 17-Algo VRF',
      nextHeight: 2500,
      nextLabel: 'Permanent 0-KRISTA Open-Entry Seat',
      nextLabelTr: 'Kalıcı 0-KRISTA Açık Katılım Koltuğu',
      progressPct: Math.min(100, Math.round(((h - 200) / span) * 1000) / 10),
      blocksRemaining: rem,
      etaSeconds: rem * TARGET_BLOCK_TIME_SECONDS
    }
  }

  if (h < 4800) {
    const rem = 4800 - h
    const span = 4800 - 2500
    return {
      currentEra: 'ADAM Dual-Track • Open-Entry Active',
      currentEraTr: 'ADAM Çift Kulvar • Açık Katılım Aktif',
      algorithmLabel: 'ADAM Dual-Track • 17-Algo VRF',
      nextHeight: 4800,
      nextLabel: 'UPGRADE_POMBL (v12 17-Algo 3-Perm)',
      nextLabelTr: 'UPGRADE_POMBL (v12 17-Algo 3-Perm)',
      progressPct: Math.min(100, Math.round(((h - 2500) / span) * 1000) / 10),
      blocksRemaining: rem,
      etaSeconds: rem * TARGET_BLOCK_TIME_SECONDS
    }
  }

  if (h < 5000) {
    const rem = 5000 - h
    return {
      currentEra: 'PoMBL (Block v12)',
      currentEraTr: 'PoMBL (Blok v12)',
      algorithmLabel: 'PoMBL v12 • 17-Algo 3-Perm (4,080)',
      nextHeight: 5000,
      nextLabel: 'Balanced Model D / ADAM v2 (15+1 • 5/10/60/25)',
      nextLabelTr: 'Dengeli Model D / ADAM v2 (15+1 • 5/10/60/25)',
      progressPct: Math.min(100, Math.round(((h - 4800) / 200) * 1000) / 10),
      blocksRemaining: rem,
      etaSeconds: rem * TARGET_BLOCK_TIME_SECONDS
    }
  }

  const period = Math.floor((h - 2) / DECAY_INTERVAL_BLOCKS)
  const start = 2 + period * DECAY_INTERVAL_BLOCKS
  const nextHeight = start + DECAY_INTERVAL_BLOCKS
  const rem = nextHeight - h
  return {
    currentEra: period === 0 ? 'Balanced Model D (PoBLS + 2/3 BFT LLMQ)' : `Balanced Model D • Epoch #${period + 1}`,
    currentEraTr: period === 0 ? 'Dengeli Model D (PoBLS + 2/3 BFT LLMQ)' : `Dengeli Model D • Dönem #${period + 1}`,
    algorithmLabel: 'Model D • 15+1 & 4,200:250:10 VRF (≥55% MN)',
    nextHeight,
    nextLabel: `Emission Decay Epoch #${period + 2} (-2.15%)`,
    nextLabelTr: `Emisyon Azaltım Dönemi #${period + 2} (-%2.15)`,
    progressPct: Math.min(100, Math.round(((h - start) / DECAY_INTERVAL_BLOCKS) * 1000) / 10),
    blocksRemaining: rem,
    etaSeconds: rem * TARGET_BLOCK_TIME_SECONDS
  }
}

export function calculateModelDSplits(height: number, customSubsidy?: number, activeMnCount = 0) {
  const subsidy = customSubsidy !== undefined ? customSubsidy : calculateBlockSubsidy(height)
  const totalSats = toSatoshi(subsidy)
  if (totalSats <= 0) {
    return {
      subsidy: 0,
      treasury: 0,
      netPool: 0,
      passiveMn: 0,
      producer: 0,
      posStaker: 0,
      posCoordinator: 0,
      llmqTotal: 0,
      llmqPerSigner: 0,
      llmqQuorumSize: 0,
      committeeSeats: 0,
      committeeTotal: 0,
      committeeSeatEach: 0,
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
      posStaker: fromSatoshi(netPoolSats),
      posCoordinator: 0,
      llmqTotal: 0,
      llmqPerSigner: 0,
      llmqQuorumSize: 0,
      committeeSeats: 0,
      committeeTotal: 0,
      committeeSeatEach: 0,
      mnSeatEach: 0,
      coinLockSeat: 0,
      openPowSeatEach: 0
    }
  }

  if (height < 5000) {
    // UPGRADE_FAIRNESS Pre-Model D: 25% Producer (PoS: 20% Staker + 5% Coord) / 75% Equal-Pay Validators (11 seats)
    const committeeSats = Math.floor((netPoolSats * 75) / 100)
    const producerSats = netPoolSats - committeeSats
    const posCoordinatorSats = Math.floor((netPoolSats * 5) / 100)
    const posStakerSats = producerSats - posCoordinatorSats
    const committeeSeatEach = fromSatoshi(Math.floor(committeeSats / ADAM_COMMITTEE_SIZE))
    return {
      subsidy: fromSatoshi(totalSats),
      treasury: fromSatoshi(treasurySats),
      netPool: fromSatoshi(netPoolSats),
      passiveMn: 0,
      producer: fromSatoshi(producerSats),
      posStaker: fromSatoshi(posStakerSats),
      posCoordinator: fromSatoshi(posCoordinatorSats),
      llmqTotal: 0,
      llmqPerSigner: 0,
      llmqQuorumSize: 0,
      committeeSeats: ADAM_COMMITTEE_SIZE,
      committeeTotal: fromSatoshi(committeeSats),
      committeeSeatEach,
      mnSeatEach: committeeSeatEach,
      coinLockSeat: committeeSeatEach,
      openPowSeatEach: committeeSeatEach
    }
  }

  // UPGRADE_FAIRNESS Balanced Model D: 5% Passive MN, 10% Signer-Only LLMQ, 60% Equal-Pay Committee (15 seats), 25% Producer (PoS 22%+3%)
  const passiveMnSats = Math.floor((netPoolSats * 5) / 100)
  const committeeSats = Math.floor((netPoolSats * 60) / 100)
  const llmqSats = Math.floor((netPoolSats * 10) / 100)
  const producerSats = netPoolSats - passiveMnSats - committeeSats - llmqSats
  const posCoordinatorSats = Math.floor((netPoolSats * 3) / 100)
  const posStakerSats = producerSats - posCoordinatorSats

  const llmqSpec = getDynamicLlmqSpec(activeMnCount)
  const committeeSeatEach = fromSatoshi(Math.floor(committeeSats / ADAM_MODELD_COMMITTEE_SIZE))

  return {
    subsidy: fromSatoshi(totalSats),
    treasury: fromSatoshi(treasurySats),
    netPool: fromSatoshi(netPoolSats),
    passiveMn: fromSatoshi(passiveMnSats),
    producer: fromSatoshi(producerSats),
    posStaker: fromSatoshi(posStakerSats),
    posCoordinator: fromSatoshi(posCoordinatorSats),
    llmqTotal: fromSatoshi(llmqSats),
    llmqPerSigner: fromSatoshi(Math.floor(llmqSats / llmqSpec.size)),
    llmqQuorumSize: llmqSpec.size,
    committeeSeats: ADAM_MODELD_COMMITTEE_SIZE,
    committeeTotal: fromSatoshi(committeeSats),
    committeeSeatEach,
    mnSeatEach: committeeSeatEach,
    coinLockSeat: committeeSeatEach,
    openPowSeatEach: committeeSeatEach
  }
}

/**
 * Computes exact UPGRADE_FAIRNESS Coordinator VRF weights (`4,200 : 250 : 10`, src/adam.cpp:2563-2594):
 * - Pre-Model D (< 5,000, ADAM_FAIR_COORD_V4): >= 75% Active MN floor when 3 * sumNonMN > sumMN
 * - Balanced Model D (>= 5,000, ADAM_FAIR_COORD_V5): >= 55% Active MN floor when 11 * sumNonMN > 9 * sumMN
 * - Zero per-track caps; Hardening v4 enforces 100-block key maturity for VRF eligibility.
 */
export function calculateCoordinatorWeights(
  counts: {
    masternode?: number
    coin_lock?: number
    pow_lock?: number
  },
  height = MODEL_D_ACTIVATION_HEIGHT
): CoordinatorWeightSummary {
  const h = Math.max(0, Math.floor(Number(height) || 0))
  const isModelD = h >= MODEL_D_ACTIVATION_HEIGHT
  const activeMnCount = Math.max(0, Math.floor(counts.masternode || 0))
  const eligibleCoinLockSeats = Math.max(0, Math.floor(counts.coin_lock || 0))
  const eligiblePowLockSeats = Math.max(0, Math.floor(counts.pow_lock || 0))

  const sumMn = BigInt(activeMnCount) * BigInt(ADAM_COORD_WEIGHT_MASTERNODE)
  const sumCl = BigInt(eligibleCoinLockSeats) * BigInt(ADAM_COORD_WEIGHT_COIN_LOCK)
  const sumPl = BigInt(eligiblePowLockSeats) * BigInt(ADAM_COORD_WEIGHT_POW_LOCK)
  const sumNonMn = sumCl + sumPl

  const mnFloorApplied = isModelD
    ? sumMn > 0n && sumNonMn > 0n && 11n * sumNonMn > 9n * sumMn
    : sumMn > 0n && sumNonMn > 0n && 3n * sumNonMn > sumMn

  let totalMnScaled = sumMn
  let totalClScaled = sumCl
  let totalPlScaled = sumPl
  let effectiveMnWeightEach = activeMnCount > 0 ? ADAM_COORD_WEIGHT_MASTERNODE : 0

  if (mnFloorApplied) {
    if (isModelD) {
      totalMnScaled = sumMn * 11n * sumNonMn
      totalClScaled = sumCl * 9n * sumMn
      totalPlScaled = sumPl * 9n * sumMn
      effectiveMnWeightEach = Math.round((((11 / 9) * Number(sumNonMn)) / activeMnCount) * 100) / 100
    } else {
      totalMnScaled = sumMn * 3n * sumNonMn
      totalClScaled = sumCl * sumMn
      totalPlScaled = sumPl * sumMn
      effectiveMnWeightEach = Math.round(((3 * Number(sumNonMn)) / activeMnCount) * 100) / 100
    }
  }

  const totalScaled = totalMnScaled + totalClScaled + totalPlScaled
  const pctScaled = (part: bigint) => {
    if (totalScaled <= 0n) return 0
    const basisPoints = (part * 10000n + totalScaled / 2n) / totalScaled
    return Number(basisPoints) / 100
  }

  const perSeatPct = (count: number, trackScaled: bigint) => {
    if (count <= 0 || totalScaled <= 0n) return 0
    const eachScaled = trackScaled / BigInt(count)
    const basisPoints = (eachScaled * 10000n + totalScaled / 2n) / totalScaled
    return Number(basisPoints) / 100
  }

  const totalMnWeight = activeMnCount * effectiveMnWeightEach
  const totalCoinLockWeight = Number(sumCl)
  const totalPowLockWeight = Number(sumPl)

  return {
    isModelD,
    vrfVersion: isModelD ? 'ADAM_FAIR_COORD_V5' : 'ADAM_FAIR_COORD_V4',
    mnFloorPct: isModelD ? 55 : 75,
    mnFloorCondition: isModelD ? '11×Non-MN > 9×MN' : '3×Non-MN > MN',
    vrfKeyMaturityBlocks: ADAM_VRF_KEY_MATURITY_BLOCKS,
    mnWeightEach: ADAM_COORD_WEIGHT_MASTERNODE,
    effectiveMnWeightEach,
    coinLockWeightEach: ADAM_COORD_WEIGHT_COIN_LOCK,
    powLockWeightEach: ADAM_COORD_WEIGHT_POW_LOCK,
    activeMnCount,
    eligibleCoinLockSeats,
    eligiblePowLockSeats,
    totalMnWeight: Math.round(totalMnWeight * 100) / 100,
    totalCoinLockWeight,
    totalPowLockWeight,
    totalPoolWeight: Math.round((totalMnWeight + totalCoinLockWeight + totalPowLockWeight) * 100) / 100,
    mnSharePct: pctScaled(totalMnScaled),
    coinLockSharePct: pctScaled(totalClScaled),
    powLockSharePct: pctScaled(totalPlScaled),
    perMnSeatPct: perSeatPct(activeMnCount, totalMnScaled),
    perCoinLockSeatPct: perSeatPct(eligibleCoinLockSeats, totalClScaled),
    perPowLockSeatPct: perSeatPct(eligiblePowLockSeats, totalPlScaled),
    mnFloorApplied
  }
}

export type DetectedQueryType =
  | 'empty'
  | 'height'
  | 'hash'
  | 'taproot'
  | 'address'
  | 'pubkey'
  | 'bls_pubkey'
  | 'unknown'

export const NODE_P2P_V2_SERVICE_BIT = 0x800n // 1 << 11 (BIP324 v2 encrypted transport)

export function hasBip324ServiceFlag(services: string | number | null | undefined): boolean {
  if (services === null || services === undefined) return false
  try {
    let bits = 0n
    if (typeof services === 'number') {
      if (!Number.isFinite(services) || services < 0) return false
      bits = BigInt(Math.floor(services))
    } else {
      const cleaned = String(services).trim().replace(/^0x/i, '')
      if (!/^[0-9a-fA-F]+$/.test(cleaned)) return false
      bits = BigInt(`0x${cleaned}`)
    }
    return (bits & NODE_P2P_V2_SERVICE_BIT) !== 0n
  } catch (_) {
    return false
  }
}

export function detectSearchQueryType(raw: string): DetectedQueryType {
  const q = (raw || '').trim()
  if (!q) return 'empty'
  if (/^\d{1,9}$/.test(q)) return 'height'
  if (/^[0-9a-fA-F]{64}$/.test(q)) return 'hash'
  if (/^(02|03)[0-9a-fA-F]{64}$/.test(q)) return 'pubkey'
  if (/^[0-9a-fA-F]{96}$/.test(q)) return 'bls_pubkey'
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

export interface RewardOutputClassificationInput {
  n: number
  address: string
  amount: number
}

export interface RewardOutputClassificationContext {
  height: number
  isProofOfStake: boolean
  adamCoordinator?: string | null
  solvedCommitteeAddrs?: Set<string>
  solvedSeatCount?: number
  prevLlmqSignerAddrs?: Set<string>
  activeMnCount?: number
  treasuryAddress: string
  isBurnAddress: (addr: string) => boolean
}

/**
 * Classifies coinbase/coinstake vout entries according to C++ FillBlockPayee order and UPGRADE_FAIRNESS splits.
 */
export function classifyBlockRewardOutputs(
  outputs: RewardOutputClassificationInput[],
  ctx: RewardOutputClassificationContext
): Array<RewardOutputClassificationInput & { role: string }> {
  const positive = (outputs || []).filter((o) => (o.amount || 0) > 0)
  if (positive.length === 0) return []

  const splits = calculateModelDSplits(ctx.height, undefined, ctx.activeMnCount ?? 0)
  const passiveMnSats = toSatoshi(splits.passiveMn)
  const llmqSignerSats = toSatoshi(splits.llmqPerSigner)
  const committeeSeatSats = toSatoshi(splits.committeeSeatEach)
  const posCoordSats = toSatoshi(splits.posCoordinator)

  const near = (sats: number, target: number, tol = 25) =>
    target > 0 && Math.abs(sats - target) <= tol

  // Count how many non-treasury, non-burn payouts exist after producer/staker in Model D vs Pre-Model D
  const solvedCountHint = ctx.solvedSeatCount ?? (ctx.solvedCommitteeAddrs?.size || 0)
  let remainingCommitteeSlots = solvedCountHint
  let assignedPassiveMn = false
  let assignedPosCoord = false

  // Find last consensus payee index (before trailing Treasury & Protocol Burn outputs)
  let lastConsensusIdx = -1
  for (let i = positive.length - 1; i >= 0; i--) {
    const addr = positive[i]!.address || ''
    if (addr !== ctx.treasuryAddress && !ctx.isBurnAddress(addr)) {
      lastConsensusIdx = i
      break
    }
  }

  return positive.map((out, idx) => {
    const addr = out.address || ''
    const sats = toSatoshi(out.amount)
    let role = 'miner_reward'

    if (ctx.isBurnAddress(addr)) {
      return { ...out, role: 'protocol_burn' }
    }
    if (addr === ctx.treasuryAddress) {
      return { ...out, role: 'treasury' }
    }

    if (ctx.height >= 5000) {
      if (!ctx.isProofOfStake && out.n === 0) {
        return { ...out, role: 'producer' }
      }
      if (ctx.isProofOfStake && out.n === 1) {
        return { ...out, role: 'staker' }
      }
      if (
        ctx.isProofOfStake &&
        !assignedPosCoord &&
        idx === lastConsensusIdx &&
        (near(sats, posCoordSats, 5) || (Boolean(ctx.adamCoordinator) && addr === ctx.adamCoordinator))
      ) {
        assignedPosCoord = true
        return { ...out, role: 'coordinator' }
      }
      if (!assignedPassiveMn && near(sats, passiveMnSats, 50)) {
        assignedPassiveMn = true
        return { ...out, role: 'masternode' }
      }
      if (
        (ctx.prevLlmqSignerAddrs?.has(addr) && near(sats, llmqSignerSats, 50)) ||
        (remainingCommitteeSlots === 0 && near(sats, llmqSignerSats, 50))
      ) {
        return { ...out, role: 'llmq' }
      }
      if (remainingCommitteeSlots > 0 && (near(sats, committeeSeatSats, 50) || ctx.solvedCommitteeAddrs?.has(addr))) {
        remainingCommitteeSlots = Math.max(0, remainingCommitteeSlots - 1)
        return { ...out, role: 'committee' }
      }
      if (ctx.prevLlmqSignerAddrs?.has(addr)) {
        return { ...out, role: 'llmq' }
      }
      if (ctx.solvedCommitteeAddrs?.has(addr)) {
        return { ...out, role: 'committee' }
      }
      if (ctx.isProofOfStake && !assignedPosCoord && near(sats, posCoordSats, 5)) {
        assignedPosCoord = true
        return { ...out, role: 'coordinator' }
      }
      role = !assignedPassiveMn ? 'masternode' : 'committee'
      if (!assignedPassiveMn) assignedPassiveMn = true
      return { ...out, role }
    }

    if (ctx.height >= 200) {
      if (!ctx.isProofOfStake && out.n === 0) {
        return { ...out, role: 'producer' }
      }
      if (ctx.isProofOfStake && out.n === 1) {
        return { ...out, role: 'staker' }
      }
      if (
        ctx.isProofOfStake &&
        !assignedPosCoord &&
        idx === lastConsensusIdx &&
        (near(sats, posCoordSats, 5) || (Boolean(ctx.adamCoordinator) && addr === ctx.adamCoordinator))
      ) {
        assignedPosCoord = true
        return { ...out, role: 'coordinator' }
      }
      if (ctx.solvedCommitteeAddrs?.has(addr) || near(sats, committeeSeatSats, 50)) {
        return { ...out, role: 'committee' }
      }
      if (ctx.isProofOfStake && !assignedPosCoord && near(sats, posCoordSats, 5)) {
        assignedPosCoord = true
        return { ...out, role: 'coordinator' }
      }
      return { ...out, role: ctx.isProofOfStake ? 'staker' : 'producer' }
    }

    return { ...out, role }
  })
}
