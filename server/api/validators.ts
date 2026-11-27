import { callRpc } from '../utils/rpc'
import { dbGet } from '../utils/db'
import { BoundedTtlCache, setCacheControl } from '../utils/api'
import {
  type AdamTrackSpec,
  ADAM_COORD_WEIGHT_COIN_LOCK,
  ADAM_COORD_WEIGHT_POW_LOCK,
  MODEL_D_ACTIVATION_HEIGHT,
  calculateCoordinatorWeights,
  getAdamTrackSpec,
  maskPeerAddr
} from '../../app/utils/protocol'

const VALIDATORS_CACHE_TTL_MS = 8_000
const validatorsCache = new BoundedTtlCache<any>(VALIDATORS_CACHE_TTL_MS, 2)

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
  return validatorsCache.getOrLoad('pool', async () => {

  let currentHeight = 0
  try {
    const bc = await callRpc('getblockchaininfo')
    if (typeof bc?.blocks === 'number') currentHeight = bc.blocks
  } catch (_) {
    try {
      const row = await dbGet('SELECT MAX(height) as height FROM blocks')
      currentHeight = row?.height || 0
    } catch (_) {}
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

  for (const entry of rawList) {
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
  }

  const coordinatorVrf = calculateCoordinatorWeights(summary, currentHeight)

  const validators = rawList.map((entry: any, idx: number) => {
    const track = String(entry?.track || 'bootstrap')
    const unlockHeight = typeof entry?.unlock_height === 'number' ? entry.unlock_height : 0

    let vrfTickets = 0
    let vrfSeatPct = 0
    if (track === 'masternode') {
      vrfTickets = coordinatorVrf.effectiveMnWeightEach
      vrfSeatPct = coordinatorVrf.perMnSeatPct
    } else if (track === 'coin_lock') {
      vrfTickets = ADAM_COORD_WEIGHT_COIN_LOCK
      vrfSeatPct = coordinatorVrf.perCoinLockSeatPct
    } else if (track === 'pow_lock') {
      vrfTickets = ADAM_COORD_WEIGHT_POW_LOCK
      vrfSeatPct = coordinatorVrf.perPowLockSeatPct
    }

    return {
      index: typeof entry?.index === 'number' ? entry.index : idx,
      address: entry?.address || '',
      pubkey: entry?.pubkey || '',
      track,
      unlock_height: unlockHeight,
      blocksRemaining: unlockHeight > 0 ? Math.max(0, unlockHeight - currentHeight) : null,
      vrfTickets,
      vrfSeatPct
    }
  })

  let quorum: any = null
  try {
    const qRes = await callRpc('getactivequorum')
    if (qRes && typeof qRes === 'object') {
      quorum = {
        quorumHash: qRes.quorumHash || '',
        dkgHeight: qRes.dkgHeight ?? 0,
        seedHeight: qRes.seedHeight ?? 0,
        threshold: qRes.threshold ?? 4,
        developerFundAddress: qRes.developerFundAddress || '',
        treasuryGovernanceStartHeight: qRes.treasuryGovernanceStartHeight ?? 5000,
        members: Array.isArray(qRes.members)
          ? qRes.members.map((m: any, i: number) => ({
              rank: m.rank ?? i + 1,
              addr: m.addr || '',
              pubkey: m.pubkey || '',
              status: m.status || 'ACTIVE',
              txhash: m.txhash || '',
              outidx: m.outidx ?? 0
            }))
          : []
      }
    }
  } catch (_) {
    quorum = null
  }

  let dip3List: any[] = []
  try {
    const protxRes = await callRpc('protx', ['list', 'detailed'])
    if (Array.isArray(protxRes)) {
      dip3List = protxRes
    }
  } catch (_) {
    dip3List = []
  }

  const dip3ByProTx = new Map<string, any>()
  const dip3ByOutpoint = new Map<string, any>()
  for (const d of dip3List) {
    if (d?.proTxHash) dip3ByProTx.set(String(d.proTxHash).toLowerCase(), d)
    if (d?.collateralHash !== undefined && d?.collateralIndex !== undefined) {
      dip3ByOutpoint.set(`${String(d.collateralHash).toLowerCase()}:${d.collateralIndex}`, d)
    }
  }

  let masternodes: any[] = []
  const seenKeys = new Set<string>()
  try {
    const mnRes = await callRpc('listmasternodes')
    if (Array.isArray(mnRes)) {
      masternodes = mnRes.map((mn: any, i: number) => {
        const proTx = String(mn.proTxHash || '').toLowerCase()
        const outKey = `${String(mn.txhash || '').toLowerCase()}:${mn.outidx ?? 0}`
        const dmn = (proTx ? dip3ByProTx.get(proTx) : null) || dip3ByOutpoint.get(outKey) || null
        if (proTx) seenKeys.add(proTx)
        if (mn.txhash) seenKeys.add(outKey)

        const opRewardBps = typeof dmn?.operatorReward === 'number' ? dmn.operatorReward : 0
        const operatorPubKey = dmn?.operatorPubKey || mn.pubkey || ''
        const ownerAddress = dmn?.ownerAddress || mn.addr || mn.address || ''
        const status =
          mn.status ||
          (dmn ? (dmn.valid ? 'ENABLED' : dmn.PoSeBanHeight > 0 ? 'POSE_BANNED' : 'EXPIRED') : 'ENABLED')

        return {
          rank: mn.rank ?? i + 1,
          addr: ownerAddress,
          ownerAddress,
          payoutAddress: dmn?.payoutAddress || ownerAddress,
          votingAddress: dmn?.votingAddress || ownerAddress,
          status,
          version: mn.version ?? 70983,
          dip3: Boolean(mn.dip3 || dmn),
          proTxHash: mn.proTxHash || dmn?.proTxHash || '',
          registeredHeight: dmn?.registeredHeight ?? mn.registeredHeight ?? 0,
          lastpaid: mn.lastpaid ?? dmn?.lastPaidHeight ?? 0,
          lastPaidHeight: dmn?.lastPaidHeight ?? mn.lastpaid ?? 0,
          pubkey: operatorPubKey,
          operatorPubKey,
          operatorRewardBps: opRewardBps,
          operatorRewardPct: Math.round((opRewardBps / 100) * 100) / 100,
          serviceMasked: dmn?.service ? maskPeerAddr(dmn.service) : mn.ip ? maskPeerAddr(mn.ip) : null,
          posePenalty: dmn?.PoSePenalty ?? 0,
          poseRevivedHeight: dmn?.PoSeRevivedHeight ?? -1,
          poseBanHeight: dmn?.PoSeBanHeight ?? -1,
          revocationReason: dmn?.revocationReason ?? 0,
          valid: dmn ? Boolean(dmn.valid) : status === 'ENABLED',
          txhash: mn.txhash || dmn?.collateralHash || '',
          outidx: mn.outidx ?? dmn?.collateralIndex ?? 0,
          lastseen: mn.lastseen || 0,
          activetime: mn.activetime || 0
        }
      })
    }
  } catch (_) {
    masternodes = []
  }

  for (const dmn of dip3List) {
    const proTx = String(dmn?.proTxHash || '').toLowerCase()
    const outKey = `${String(dmn?.collateralHash || '').toLowerCase()}:${dmn?.collateralIndex ?? 0}`
    if ((proTx && seenKeys.has(proTx)) || (dmn?.collateralHash && seenKeys.has(outKey))) {
      continue
    }
    const opRewardBps = typeof dmn?.operatorReward === 'number' ? dmn.operatorReward : 0
    const status = dmn?.valid ? 'ENABLED' : dmn?.PoSeBanHeight > 0 ? 'POSE_BANNED' : 'EXPIRED'
    masternodes.push({
      rank: 0,
      addr: dmn?.ownerAddress || '',
      ownerAddress: dmn?.ownerAddress || '',
      payoutAddress: dmn?.payoutAddress || dmn?.ownerAddress || '',
      votingAddress: dmn?.votingAddress || dmn?.ownerAddress || '',
      status,
      version: 70983,
      dip3: true,
      proTxHash: dmn?.proTxHash || '',
      registeredHeight: dmn?.registeredHeight ?? 0,
      lastpaid: dmn?.lastPaidHeight ?? 0,
      lastPaidHeight: dmn?.lastPaidHeight ?? 0,
      pubkey: dmn?.operatorPubKey || '',
      operatorPubKey: dmn?.operatorPubKey || '',
      operatorRewardBps: opRewardBps,
      operatorRewardPct: Math.round((opRewardBps / 100) * 100) / 100,
      serviceMasked: dmn?.service ? maskPeerAddr(dmn.service) : null,
      posePenalty: dmn?.PoSePenalty ?? 0,
      poseRevivedHeight: dmn?.PoSeRevivedHeight ?? -1,
      poseBanHeight: dmn?.PoSeBanHeight ?? -1,
      revocationReason: dmn?.revocationReason ?? 0,
      valid: Boolean(dmn?.valid),
      txhash: dmn?.collateralHash || '',
      outidx: dmn?.collateralIndex ?? 0,
      lastseen: 0,
      activetime: 0
    })
  }

  const masternodeStats = {
    total: masternodes.length,
    enabled: masternodes.filter((m) => m.status === 'ENABLED').length,
    dip3: masternodes.filter((m) => m.dip3).length,
    poseBanned: masternodes.filter((m) => m.status === 'POSE_BANNED').length
  }

  const openPowAvailable = summary.pow_lock + summary.zerocoin_pow + summary.bootstrap
  const buildQuotaSummary = (spec: AdamTrackSpec) => {
    const sharePct = (seats: number) =>
      spec.committeeSize > 0
        ? Math.round(((seats * spec.committeePoolPct) / spec.committeeSize) * 100) / 100
        : 0
    return {
      isModelD: spec.isModelD,
      committeeSize: spec.committeeSize,
      threshold: spec.threshold,
      committeePoolPct: spec.committeePoolPct,
      masternode: {
        used: Math.min(spec.masternodeQuota, summary.masternode),
        available: summary.masternode,
        max: spec.masternodeQuota,
        rewardShareNetPct: sharePct(spec.masternodeQuota),
        perSeatNetPct: spec.perSeatNetPct
      },
      coinLock: {
        used: Math.min(spec.coinLockQuota, summary.coin_lock),
        available: summary.coin_lock,
        max: spec.coinLockQuota,
        rewardShareNetPct: sharePct(spec.coinLockQuota),
        perSeatNetPct: spec.perSeatNetPct
      },
      openPow: {
        used: Math.min(spec.openPowQuota, openPowAvailable),
        available: openPowAvailable,
        max: spec.openPowQuota,
        zeroCoinMaxSeats: spec.zeroCoinMaxSeats,
        rewardShareNetPct: sharePct(spec.openPowQuota),
        perSeatNetPct: spec.perSeatNetPct
      }
    }
  }

  const quotas = buildQuotaSummary(getAdamTrackSpec(currentHeight))
  const modelDQuotas = buildQuotaSummary(getAdamTrackSpec(MODEL_D_ACTIVATION_HEIGHT))

  return {
    success: true,
    height: currentHeight,
    summary,
    quotas,
    modelDQuotas,
    coordinatorVrf,
    validators,
    quorum,
    masternodeStats,
    masternodes
  }
  })
}

export default defineEventHandler(async (event) => {
  try {
    setCacheControl(event, 8, 10)
    return await getValidatorPoolData()
  } catch (err: any) {
    console.error('[API /validators] Error:', err?.message || err)
    setResponseStatus(event, 500)
    return {
      success: false,
      code: 'VALIDATORS_FETCH_FAILED',
      error: 'Failed to fetch validator pool'
    }
  }
})
