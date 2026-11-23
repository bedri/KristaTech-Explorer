import { dbGet, normalizeTaprootAddress } from '../utils/db'
import { callRpc } from '../utils/rpc'
import { getValidatorPoolData } from './validators'

export default defineEventHandler(async (event) => {
  const query = ((getQuery(event).q as string) || '').trim()

  if (!query) {
    return { success: false, error: 'Query is empty' }
  }

  // 1. Check for Block Height (digits only)
  if (/^\d{1,9}$/.test(query)) {
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

  // 2. Check for 66-hex Validator / Quorum Compressed Public Key (02... or 03...)
  if (/^(02|03)[0-9a-fA-F]{64}$/.test(query)) {
    const lowerPub = query.toLowerCase()
    try {
      const pool = await getValidatorPoolData()
      const valMatch = (pool.validators || []).find(
        (v: any) => String(v.pubkey || '').toLowerCase() === lowerPub
      )
      if (valMatch?.address) {
        return { success: true, type: 'address', target: `/address/${valMatch.address}` }
      }
      const qMatch = (pool.quorum?.members || []).find(
        (m: any) => String(m.pubkey || '').toLowerCase() === lowerPub
      )
      if (qMatch?.addr) {
        return { success: true, type: 'address', target: `/address/${qMatch.addr}` }
      }
    } catch (_) {}
    return { success: false, error: 'Validator public key not found in active pool' }
  }

  // 2b. Check for 96-hex KTDIP3 BLS12-381 Masternode Operator Public Key
  if (/^[0-9a-fA-F]{96}$/.test(query)) {
    const lowerBls = query.toLowerCase()
    try {
      const pool = await getValidatorPoolData()
      const mnMatch = (pool.masternodes || []).find(
        (m: any) => String(m.operatorPubKey || m.pubkey || '').toLowerCase() === lowerBls
      )
      const targetAddr = mnMatch?.ownerAddress || mnMatch?.addr
      if (targetAddr) {
        return { success: true, type: 'address', target: `/address/${targetAddr}` }
      }
    } catch (_) {}
    return { success: false, error: 'BLS12-381 operator public key not found in masternode list' }
  }

  // 3. Check for Hash (64 hex characters)
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

  // 4. Check for Wallet or Taproot Contract Address (Base58 33-36 chars or 62-char Bech32m kt1p.../tk1p.../rt1p...)
  if (/^((kt|tk|rt)1p[ac-hj-np-z02-9]{58}|[1-9A-HJ-NP-Za-km-z]{33,36})$/.test(query)) {
    const normalized = normalizeTaprootAddress(query)
    return { success: true, type: 'address', target: `/address/${normalized}` }
  }

  return { success: false, error: 'Search query format not recognized' }
})
