import { callRpc } from '../utils/rpc'
import { dbGet } from '../utils/db'
import {
  ADAM_COIN_LOCK_TRACK_QUOTA,
  ADAM_COORD_WEIGHT_COIN_LOCK,
  ADAM_COORD_WEIGHT_MASTERNODE,
  ADAM_COORD_WEIGHT_POW_LOCK,
  ADAM_MASTERNODE_TRACK_QUOTA,
  ADAM_OPEN_POW_TRACK_QUOTA,
  calculateCoordinatorWeights
} from '../../app/utils/protocol'

const VALIDATORS_CACHE_TTL_MS = 8_000
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

  const coordinatorVrf = calculateCoordinatorWeights(summary)

  let seenCoinLock = 0
  let seenPowLock = 0

  const validators = rawList.map((entry: any, idx: number) => {
    const track = String(entry?.track || 'bootstrap')
    const unlockHeight = typeof entry?.unlock_height === 'number' ? entry.unlock_height : 0

    let vrfTickets = 0
    if (track === 'masternode') {
      vrfTickets = ADAM_COORD_WEIGHT_MASTERNODE
    } else if (track === 'coin_lock') {
      if (seenCoinLock < ADAM_COIN_LOCK_TRACK_QUOTA) {
        vrfTickets = ADAM_COORD_WEIGHT_COIN_LOCK
      }
      seenCoinLock++
    } else if (track === 'pow_lock') {
      if (seenPowLock < ADAM_OPEN_POW_TRACK_QUOTA) {
        vrfTickets = ADAM_COORD_WEIGHT_POW_LOCK
      }
      seenPowLock++
    }

    const vrfSeatPct =
      coordinatorVrf.totalPoolWeight > 0
        ? Math.round((vrfTickets / coordinatorVrf.totalPoolWeight) * 10000) / 100
        : 0

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
        threshold: qRes.threshold ?? 3,
        developerFundAddress: qRes.developerFundAddress || '',
        treasuryGovernanceStartHeight: qRes.treasuryGovernanceStartHeight ?? 2880,
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

  let masternodes: any[] = []
  try {
    const mnRes = await callRpc('listmasternodes')
    if (Array.isArray(mnRes)) {
      masternodes = mnRes.map((mn: any, i: number) => ({
        rank: mn.rank ?? i + 1,
        addr: mn.addr || mn.address || '',
        status: mn.status || 'ENABLED',
        version: mn.version ?? 70983,
        txhash: mn.txhash || '',
        outidx: mn.outidx ?? 0,
        lastseen: mn.lastseen || 0,
        activetime: mn.activetime || 0
      }))
    }
  } catch (_) {
    masternodes = []
  }

  const openPowAvailable = summary.pow_lock + summary.zerocoin_pow + summary.bootstrap
  const quotas = {
    masternode: {
      used: Math.min(ADAM_MASTERNODE_TRACK_QUOTA, summary.masternode),
      available: summary.masternode,
      max: ADAM_MASTERNODE_TRACK_QUOTA,
      rewardShareNetPct: 20,
      perSeatNetPct: 2.86
    },
    coinLock: {
      used: Math.min(ADAM_COIN_LOCK_TRACK_QUOTA, summary.coin_lock),
      available: summary.coin_lock,
      max: ADAM_COIN_LOCK_TRACK_QUOTA,
      rewardShareNetPct: 8,
      perSeatNetPct: 8.0
    },
    openPow: {
      used: Math.min(ADAM_OPEN_POW_TRACK_QUOTA, openPowAvailable),
      available: openPowAvailable,
      max: ADAM_OPEN_POW_TRACK_QUOTA,
      rewardShareNetPct: 12,
      perSeatNetPct: 4.0
    }
  }

  const payload = {
    success: true,
    height: currentHeight,
    summary,
    quotas,
    coordinatorVrf,
    validators,
    quorum,
    masternodes
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
