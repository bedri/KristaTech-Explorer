import { callRpc } from '../utils/rpc'
import { dbGet, dbQuery } from '../utils/db'

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
  
  return supply
}

export default defineEventHandler(async () => {
  try {
    const blockchainInfo = await callRpc('getblockchaininfo')
    const connectionCount = await callRpc('getconnectioncount')
    
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

    const indexedRow = await dbGet('SELECT MAX(height) as height FROM blocks')
    const indexedHeight = indexedRow && indexedRow.height !== null ? indexedRow.height : 0

    // Fetch latest 10 blocks
    const latestBlocks = await dbQuery(
      'SELECT height, hash, difficulty, time, tx_count, size, is_pos, is_pow FROM blocks ORDER BY height DESC LIMIT 10'
    )

    // Fetch latest 10 transactions
    const latestTransactions = await dbQuery(
      'SELECT txid, block_hash, time, value, fee FROM transactions ORDER BY time DESC LIMIT 10'
    )

    const totalSupply = info?.moneysupply !== undefined && info?.moneysupply !== null 
      ? info.moneysupply 
      : calculateTotalSupply(blockchainInfo.blocks)

    return {
      success: true,
      chain: blockchainInfo.chain,
      height: blockchainInfo.blocks,
      difficulty: blockchainInfo.difficulty,
      connections: connectionCount,
      masternodes: masternodeCount,
      totalSupply,
      indexedHeight,
      latestBlocks,
      latestTransactions
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to fetch status'
    }
  }
})
