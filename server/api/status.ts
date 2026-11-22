import { callRpc } from '../utils/rpc'
import { BURN_ADDRESSES, dbGet, dbQuery } from '../utils/db'
import { setCacheControl } from '../utils/api'
import { getValidatorPoolData } from './validators'
import {
  buildConsensusInfo,
  calculateBlockSubsidy,
  calculateTotalSupply,
  TARGET_BLOCK_TIME_SECONDS
} from '../../app/utils/protocol'

const STATUS_CACHE_TTL_MS = 3000
let cachedStatus: any = null
let cachedStatusTime = 0
let inflightStatusPromise: Promise<any> | null = null

let cachedBurnHeight = -1
let cachedBurnStats = {
  total: 0,
  protocolBurn: 0,
  voluntaryBurn: 0,
  ktBurnOutputs: 0
}

function normalizeAmount(val: number | null | undefined): number {
  return Math.round((val || 0) * 1e8) / 1e8
}

export async function getBurnStats(indexedHeight: number) {
  if (indexedHeight === cachedBurnHeight) {
    return cachedBurnStats
  }

  try {
    const burnOutputsRow = await dbGet(
      `
      SELECT
        COALESCE(SUM(CASE WHEN t.is_coinbase = 1 OR t.is_coinstake = 1 THEN v.amount ELSE 0 END), 0) AS protocol_out_burn,
        COALESCE(SUM(CASE WHEN t.is_coinbase = 0 AND t.is_coinstake = 0 THEN v.amount ELSE 0 END), 0) AS voluntary_out_burn
      FROM vout v
      JOIN transactions t ON v.txid = t.txid
      WHERE v.address IN (?, ?)
    `,
      [BURN_ADDRESSES[0], BURN_ADDRESSES[1]]
    )

    const protocolOutSats = Math.round((burnOutputsRow?.protocol_out_burn || 0) * 1e8)
    const voluntarySats = Math.round((burnOutputsRow?.voluntary_out_burn || 0) * 1e8)
    // UPGRADE_FAIRNESS (Block 1): 100% of PoS tx fees are paid symmetrically to the Staker (not burned).
    const protocolSats = protocolOutSats
    const totalSats = protocolSats + voluntarySats
    const ktBurnOutSats = protocolOutSats + voluntarySats

    cachedBurnStats = {
      total: Math.round(totalSats) / 1e8,
      protocolBurn: Math.round(protocolSats) / 1e8,
      voluntaryBurn: Math.round(voluntarySats) / 1e8,
      ktBurnOutputs: Math.round(ktBurnOutSats) / 1e8
    }
    cachedBurnHeight = indexedHeight
  } catch (err) {
    console.error('[API /status] Burn stats query error:', err)
  }

  return cachedBurnStats
}

export async function getCachedStatusData(): Promise<any> {
  const now = Date.now()
  if (cachedStatus && now - cachedStatusTime < STATUS_CACHE_TTL_MS) {
    return cachedStatus
  }

  if (inflightStatusPromise) {
    return inflightStatusPromise
  }

  inflightStatusPromise = fetchStatusData()
    .then((result) => {
      cachedStatus = result
      cachedStatusTime = Date.now()
      return result
    })
    .finally(() => {
      inflightStatusPromise = null
    })

  return inflightStatusPromise
}

async function fetchStatusData(): Promise<any> {
  const indexedRow = await dbGet('SELECT MAX(height) as height FROM blocks')
  const indexedHeight = indexedRow && indexedRow.height !== null ? indexedRow.height : 0

  // Fetch latest 21 blocks to compute 20-block average interval + 10-block dashboard feed with deltaTime
  const recentBlockRows = await dbQuery(
    `SELECT height, hash, difficulty, time, tx_count, size, is_pos, is_pow,
            adam_coordinator, producer_address, reward, solved_seats, version
     FROM blocks
     ORDER BY height DESC
     LIMIT 21`
  )

  let intervalSum = 0
  let intervalCount = 0
  let posBlocksRecent = 0
  let powBlocksRecent = 0

  for (let i = 0; i < recentBlockRows.length; i++) {
    const cur = recentBlockRows[i]
    if (i < 20 && cur.height > 0) {
      if (cur.is_pos) posBlocksRecent++
      else powBlocksRecent++
    }
    const prev = recentBlockRows[i + 1]
    if (prev && cur.height === prev.height + 1 && prev.height > 0) {
      const dt = Math.max(0, (cur.time || 0) - (prev.time || 0))
      if (dt > 0 && dt < 3600) {
        intervalSum += dt
        intervalCount++
      }
    }
  }

  const avgBlockTime =
    intervalCount > 0
      ? Math.round((intervalSum / intervalCount) * 10) / 10
      : TARGET_BLOCK_TIME_SECONDS

  const latestBlocks = recentBlockRows.slice(0, 10).map((b: any, idx: number) => {
    const prev = recentBlockRows[idx + 1]
    const deltaTime =
      prev && b.height === prev.height + 1 && b.height > 0
        ? Math.max(0, (b.time || 0) - (prev.time || 0))
        : null
    return {
      height: b.height,
      hash: b.hash,
      difficulty: b.difficulty,
      time: b.time,
      deltaTime,
      tx_count: b.tx_count,
      size: b.size,
      is_pos: b.is_pos,
      is_pow: b.is_pow,
      adam_coordinator: b.adam_coordinator,
      producer_address: b.producer_address || b.adam_coordinator || 'Miner',
      reward: normalizeAmount(b.reward || calculateBlockSubsidy(b.height)),
      solved_seats: b.solved_seats || 0,
      version: b.version || 1
    }
  })

  // Fetch latest 12 non-empty transactions joined with block height
  let rawTransactions = await dbQuery(
    `SELECT t.txid, t.block_hash, b.height as block_height, t.time, t.value, t.fee,
            t.is_coinbase, t.is_coinstake, t.tx_type
     FROM transactions t
     LEFT JOIN blocks b ON t.block_hash = b.hash
     WHERE t.value > 0 OR t.tx_type = 'zerocoin_pow'
     ORDER BY t.time DESC, t.rowid DESC
     LIMIT 12`
  )
  if (!rawTransactions || rawTransactions.length === 0) {
    rawTransactions = await dbQuery(
      `SELECT t.txid, t.block_hash, b.height as block_height, t.time, t.value, t.fee,
              t.is_coinbase, t.is_coinstake, t.tx_type
       FROM transactions t
       LEFT JOIN blocks b ON t.block_hash = b.hash
       ORDER BY t.time DESC, t.rowid DESC
       LIMIT 12`
    )
  }

  const latestTransactions = (rawTransactions || []).map((tx: any) => ({
    ...tx,
    value: normalizeAmount(tx.value),
    fee: normalizeAmount(tx.fee),
    txType: tx.tx_type || 'standard'
  }))

  let blockchainInfo: any = null
  try {
    blockchainInfo = await callRpc('getblockchaininfo')
  } catch (_) {}

  let connectionCount = 0
  try {
    connectionCount = await callRpc('getconnectioncount')
  } catch (_) {}

  let info: any = null
  try {
    info = await callRpc('getinfo')
  } catch (_) {}

  let hashrate = 0
  try {
    const hps = await callRpc('getnetworkhashps')
    if (typeof hps === 'number' && Number.isFinite(hps) && hps >= 0) {
      hashrate = hps
    }
  } catch (_) {}

  let mempool = { size: 0, bytes: 0, usage: 0 }
  try {
    const mp = await callRpc('getmempoolinfo')
    if (mp && typeof mp === 'object') {
      mempool = {
        size: mp.size || 0,
        bytes: mp.bytes || 0,
        usage: mp.usage || 0
      }
    }
  } catch (_) {}

  let masternodeCount = { total: 0, enabled: 0 }
  try {
    const mnCount = await callRpc('getmasternodecount')
    if (mnCount && typeof mnCount === 'object') {
      masternodeCount = {
        total: mnCount.total || 0,
        enabled: mnCount.enabled || 0
      }
    }
  } catch (_) {}

  const lockedUtxoRow = await dbGet(
    "SELECT COALESCE(SUM(amount), 0) as total FROM vout WHERE spent_txid IS NULL AND script_type IN ('adam_coinlock', 'adam_powlock')"
  )
  const lockedTimelockCoins = normalizeAmount(lockedUtxoRow?.total || 0)

  const validatorPoolData = await getValidatorPoolData()
  const burnedSupply = await getBurnStats(indexedHeight)

  const currentHeight = blockchainInfo?.blocks ?? indexedHeight
  const currentDifficulty = blockchainInfo?.difficulty ?? (latestBlocks[0]?.difficulty || 0)
  const currentChain = blockchainInfo?.chain ?? 'main'
  const milestone = buildConsensusInfo(currentHeight)
  const consensusInfo = {
    phase: milestone.currentEra,
    phaseTr: milestone.currentEraTr,
    ...milestone
  }

  const rawSupply =
    info?.moneysupply !== undefined && info?.moneysupply !== null && info.moneysupply > 0
      ? normalizeAmount(info.moneysupply)
      : calculateTotalSupply(currentHeight)

  const circulatingSupply = normalizeAmount(Math.max(0, rawSupply - burnedSupply.ktBurnOutputs))
  const lockedValidatorSupply = normalizeAmount(lockedTimelockCoins + masternodeCount.enabled * 4200)
  const currentSubsidy = calculateBlockSubsidy(currentHeight)

  return {
    success: true,
    chain: currentChain,
    height: currentHeight,
    difficulty: currentDifficulty,
    hashrate,
    avgBlockTime,
    posBlocksRecent,
    powBlocksRecent,
    connections: connectionCount,
    masternodes: masternodeCount,
    mempool,
    currentSubsidy,
    totalSupply: rawSupply,
    circulatingSupply,
    lockedValidatorSupply,
    burnedSupply,
    validatorPool: validatorPoolData.summary,
    coordinatorVrf: validatorPoolData.coordinatorVrf,
    consensusInfo,
    indexedHeight,
    latestBlocks,
    latestTransactions
  }
}

export default defineEventHandler(async (event) => {
  try {
    setCacheControl(event, 3, 5)
    return await getCachedStatusData()
  } catch (err) {
    console.error('[API /status] Error:', err)
    setResponseStatus(event, 500)
    return {
      success: false,
      code: 'STATUS_FETCH_FAILED',
      error: 'Failed to fetch network status'
    }
  }
})
