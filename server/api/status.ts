import { callRpc } from '../utils/rpc'
import { BURN_ADDRESSES, dbGet, dbQuery } from '../utils/db'
import { getValidatorPoolData } from './validators'

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

function calculateTotalSupply(height: number): number {
  if (height <= 0) return 0
  let supply = 0

  if (height < 10000) {
    if (height >= 2) {
      supply += (height - 1) * 100
    }
    return supply
  }

  supply += 9998 * 100 // Blocks 2 to 9999

  const decayInterval = 259200
  let currentHeight = 10000

  while (currentHeight <= height) {
    const period = Math.floor((currentHeight - 10000) / decayInterval)
    const subsidy = 15.0 * Math.pow(0.981, period)
    const nextDecayHeight = 10000 + (period + 1) * decayInterval
    const blocksInThisPeriod = Math.min(height - currentHeight + 1, nextDecayHeight - currentHeight)

    supply += blocksInThisPeriod * (Math.floor(subsidy * 1e8 + 0.5) / 1e8)
    currentHeight += blocksInThisPeriod
  }

  return normalizeAmount(supply)
}

function buildConsensusInfo(height: number) {
  if (height < 200) {
    return {
      phase: 'Bootstrap PoW',
      algorithmLabel: 'Bootstrap PoW • X11KVS'
    }
  }
  if (height < 2000) {
    return {
      phase: height >= 705 ? 'ADAM v1.2' : 'ADAM v1',
      algorithmLabel: 'ADAM v1 • X11KVS + 18-Algo'
    }
  }
  if (height < 2200) {
    return {
      phase: 'ADAM v2 (PoMBL)',
      algorithmLabel: 'ADAM v2 (PoMBL) • X11KVS + 18-Algo 3-Perm'
    }
  }
  return {
    phase: 'Model D (PoBLS + LLMQ)',
    algorithmLabel: 'Model D (PoBLS + LLMQ) • X11KVS + 18-Algo 3-Perm'
  }
}

async function getBurnStats(indexedHeight: number) {
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

    const posFeeRow = await dbGet(
      `
      SELECT COALESCE(SUM(t.fee), 0) AS pos_fee_burn
      FROM transactions t
      JOIN blocks b ON t.block_hash = b.hash
      WHERE b.is_pos = 1 AND t.is_coinbase = 0 AND t.is_coinstake = 0 AND t.fee > 0
    `
    )

    const protocolOutSats = Math.round((burnOutputsRow?.protocol_out_burn || 0) * 1e8)
    const voluntarySats = Math.round((burnOutputsRow?.voluntary_out_burn || 0) * 1e8)
    const posFeeSats = Math.round((posFeeRow?.pos_fee_burn || 0) * 1e8)
    const protocolSats = protocolOutSats + posFeeSats
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

async function fetchStatusData(): Promise<any> {
  const indexedRow = await dbGet('SELECT MAX(height) as height FROM blocks')
  const indexedHeight = indexedRow && indexedRow.height !== null ? indexedRow.height : 0

  // Fetch latest 10 blocks
  const latestBlocks = await dbQuery(
    'SELECT height, hash, difficulty, time, tx_count, size, is_pos, is_pow, adam_coordinator FROM blocks ORDER BY height DESC LIMIT 10'
  )

  // Fetch latest 10 non-empty transactions (fallback to all if none with value > 0)
  let rawTransactions = await dbQuery(
    "SELECT txid, block_hash, time, value, fee, is_coinbase, is_coinstake, tx_type FROM transactions WHERE value > 0 OR tx_type = 'zerocoin_pow' ORDER BY time DESC, rowid DESC LIMIT 10"
  )
  if (!rawTransactions || rawTransactions.length === 0) {
    rawTransactions = await dbQuery(
      'SELECT txid, block_hash, time, value, fee, is_coinbase, is_coinstake, tx_type FROM transactions ORDER BY time DESC, rowid DESC LIMIT 10'
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

  const validatorPoolData = await getValidatorPoolData()
  const burnedSupply = await getBurnStats(indexedHeight)

  const currentHeight = blockchainInfo?.blocks ?? indexedHeight
  const currentDifficulty = blockchainInfo?.difficulty ?? (latestBlocks[0]?.difficulty || 0)
  const currentChain = blockchainInfo?.chain ?? 'main'
  const consensusInfo = buildConsensusInfo(currentHeight)

  const rawSupply =
    info?.moneysupply !== undefined && info?.moneysupply !== null
      ? normalizeAmount(info.moneysupply)
      : calculateTotalSupply(currentHeight)

  // Subtract coins locked permanently in protocol/PoB KTburn addresses (PoS fee burn is already excluded from moneysupply)
  const circulatingSupply = normalizeAmount(Math.max(0, rawSupply - burnedSupply.ktBurnOutputs))

  return {
    success: true,
    chain: currentChain,
    height: currentHeight,
    difficulty: currentDifficulty,
    connections: connectionCount,
    masternodes: masternodeCount,
    totalSupply: rawSupply,
    circulatingSupply,
    burnedSupply,
    validatorPool: validatorPoolData.summary,
    consensusInfo,
    indexedHeight,
    latestBlocks,
    latestTransactions
  }
}

export default defineEventHandler(async () => {
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
    .catch((err) => {
      console.error('[API /status] Error:', err)
      return {
        success: false,
        error: 'Failed to fetch network status'
      }
    })
    .finally(() => {
      inflightStatusPromise = null
    })

  return inflightStatusPromise
})
