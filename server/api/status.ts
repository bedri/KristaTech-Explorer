import { callRpc } from '../utils/rpc'
import { dbGet, dbQuery } from '../utils/db'

const STATUS_CACHE_TTL_MS = 3000
let cachedStatus: any = null
let cachedStatusTime = 0
let inflightStatusPromise: Promise<any> | null = null

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

async function fetchStatusData(): Promise<any> {
  const indexedRow = await dbGet('SELECT MAX(height) as height FROM blocks')
  const indexedHeight = indexedRow && indexedRow.height !== null ? indexedRow.height : 0

  // Fetch latest 10 blocks
  const latestBlocks = await dbQuery(
    'SELECT height, hash, difficulty, time, tx_count, size, is_pos, is_pow FROM blocks ORDER BY height DESC LIMIT 10'
  )

  // Fetch latest 10 non-empty transactions (fallback to all if none with value > 0)
  let rawTransactions = await dbQuery(
    'SELECT txid, block_hash, time, value, fee FROM transactions WHERE value > 0 ORDER BY time DESC, rowid DESC LIMIT 10'
  )
  if (!rawTransactions || rawTransactions.length === 0) {
    rawTransactions = await dbQuery(
      'SELECT txid, block_hash, time, value, fee FROM transactions ORDER BY time DESC, rowid DESC LIMIT 10'
    )
  }

  const latestTransactions = (rawTransactions || []).map((tx: any) => ({
    ...tx,
    value: normalizeAmount(tx.value),
    fee: normalizeAmount(tx.fee)
  }))

  let blockchainInfo: any = null
  try {
    blockchainInfo = await callRpc('getblockchaininfo')
  } catch (_) {
    // Fallback to latest indexed block if RPC is temporarily busy
  }

  let connectionCount = 0
  try {
    connectionCount = await callRpc('getconnectioncount')
  } catch (_) {}
  
  let info: any = null
  try {
    info = await callRpc('getinfo')
  } catch (_) {
    // getinfo might fail, fallback gracefully
  }
  
  let masternodeCount = { total: 0, enabled: 0 }
  try {
    const mnCount = await callRpc('getmasternodecount')
    if (mnCount && typeof mnCount === 'object') {
      masternodeCount = {
        total: mnCount.total || 0,
        enabled: mnCount.enabled || 0
      }
    }
  } catch (_) {
    // Masternode count RPC might fail if syncing or not ready, fallback gracefully
  }

  const currentHeight = blockchainInfo?.blocks ?? indexedHeight
  const currentDifficulty = blockchainInfo?.difficulty ?? (latestBlocks[0]?.difficulty || 0)
  const currentChain = blockchainInfo?.chain ?? 'main'

  const totalSupply = info?.moneysupply !== undefined && info?.moneysupply !== null 
    ? normalizeAmount(info.moneysupply)
    : calculateTotalSupply(currentHeight)

  return {
    success: true,
    chain: currentChain,
    height: currentHeight,
    difficulty: currentDifficulty,
    connections: connectionCount,
    masternodes: masternodeCount,
    totalSupply,
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
