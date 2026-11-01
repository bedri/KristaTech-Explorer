import { dbGet } from '../utils/db'
import { callRpc } from '../utils/rpc'

export default defineEventHandler(async (event) => {
  const query = ((getQuery(event).q as string) || '').trim()

  if (!query) {
    return { success: false, error: 'Query is empty' }
  }

  // 1. Check for Block Height (digits only)
  if (/^\d+$/.test(query)) {
    const height = parseInt(query, 10)
    const blockRow = await dbGet('SELECT height FROM blocks WHERE height = ?', [height])
    if (blockRow) {
      return { success: true, type: 'block', target: `/block/${height}` }
    }
    try {
      await callRpc('getblockhash', [height])
      return { success: true, type: 'block', target: `/block/${height}` }
    } catch (_) {
      return { success: false, error: 'Block height not found' }
    }
  }

  // 2. Check for Hash (64 hex characters)
  if (/^[0-9a-fA-F]{64}$/.test(query)) {
    const lowerHash = query.toLowerCase()

    // Check blocks table
    const blockRow = await dbGet('SELECT hash FROM blocks WHERE hash = ?', [lowerHash])
    if (blockRow) {
      return { success: true, type: 'block', target: `/block/${lowerHash}` }
    }

    // Check transactions table
    const txRow = await dbGet('SELECT txid FROM transactions WHERE txid = ?', [lowerHash])
    if (txRow) {
      return { success: true, type: 'tx', target: `/tx/${lowerHash}` }
    }

    // Fallback to live RPC lookup (e.g. unindexed or mempool transaction/block)
    try {
      await callRpc('getblock', [lowerHash, true])
      return { success: true, type: 'block', target: `/block/${lowerHash}` }
    } catch (_) {}

    try {
      await callRpc('getrawtransaction', [lowerHash, 1])
      return { success: true, type: 'tx', target: `/tx/${lowerHash}` }
    } catch (_) {}

    return { success: false, error: 'Block or transaction hash not found' }
  }

  // 3. Check for Wallet Address (KristaTech KT... addresses are 35 chars; support 33-36 Base58 chars)
  if (/^[1-9A-HJ-NP-Za-km-z]{33,36}$/.test(query)) {
    return { success: true, type: 'address', target: `/address/${query}` }
  }

  return { success: false, error: 'Search query format not recognized' }
})
