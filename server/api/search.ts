import { dbGet, normalizeTaprootAddress } from '../utils/db'

export default defineEventHandler(async (event) => {
  const query = (getQuery(event).q as string || '').trim()

  if (!query) {
    return { success: false, error: 'Query is empty' }
  }

  // 1. Check for Block Height (digits only)
  if (/^\d+$/.test(query)) {
    return { success: true, type: 'block', target: `/block/${query}` }
  }

  // 2. Check for Hash (64 hex characters)
  if (/^[0-9a-fA-F]{64}$/.test(query)) {
    // Determine if it is a block hash by checking our database
    const blockRow = await dbGet('SELECT hash FROM blocks WHERE hash = ?', [query])
    if (blockRow) {
      return { success: true, type: 'block', target: `/block/${query}` }
    }
    // Otherwise, treat it as a transaction ID (txid)
    return { success: true, type: 'tx', target: `/tx/${query}` }
  }

  // 3. Check for Wallet or Taproot Contract Address (Base58 33-36 chars or 62-char Bech32m kt1p.../tk1p.../rt1p...)
  if (/^((kt|tk|rt)1p[ac-hj-np-z02-9]{58}|[a-zA-Z0-9]{33,36})$/.test(query)) {
    const normalized = normalizeTaprootAddress(query)
    return { success: true, type: 'address', target: `/address/${normalized}` }
  }

  return { success: false, error: 'Search query format not recognized' }
})
