import { callRpc } from '../../utils/rpc'
import { dbGet, dbQuery } from '../../utils/db'

function normalizeAmount(val: number | null | undefined): number {
  return Math.round((val || 0) * 1e8) / 1e8
}

export default defineEventHandler(async (event) => {
  const idStr = (event.context.params?.id || '').trim()
  const isHeight = /^\d{1,9}$/.test(idStr)
  const isHash = /^[0-9a-fA-F]{64}$/.test(idStr)

  if (!isHeight && !isHash) {
    setResponseStatus(event, 400)
    return {
      success: false,
      error: 'Invalid block height or hash format'
    }
  }

  try {
    let blockHash = idStr.toLowerCase()

    // 1. If dynamic parameter is height, resolve hash
    if (isHeight) {
      const height = parseInt(idStr, 10)
      const dbBlock = await dbGet('SELECT hash FROM blocks WHERE height = ?', [height])
      if (dbBlock) {
        blockHash = dbBlock.hash
      } else {
        blockHash = await callRpc('getblockhash', [height])
      }
    }

    // 2. Query node for the block details (gets confirmations and next block pointers)
    const block = await callRpc('getblock', [blockHash, true])

    // 3. Query local indexed transactions for this block
    const rawTransactions = await dbQuery(
      'SELECT txid, time, value, fee FROM transactions WHERE block_hash = ?',
      [blockHash]
    )

    const transactions = (rawTransactions || []).map((tx: any) => ({
      ...tx,
      value: normalizeAmount(tx.value),
      fee: normalizeAmount(tx.fee)
    }))

    return {
      success: true,
      block: {
        hash: block.hash,
        confirmations: block.confirmations,
        size: block.size,
        height: block.height,
        version: block.version,
        merkleroot: block.merkleroot,
        time: block.time,
        difficulty: block.difficulty,
        previousblockhash: block.previousblockhash,
        nextblockhash: block.nextblockhash,
        tx_count: block.tx.length,
        is_pos: block.isProofOfStake,
        is_pow: block.isProofOfWork,
        vAdamMiners: block.vAdamMiners || null,
        vAdamSolutions: block.vAdamSolutions || null,
        vAdamVRFProof: block.vAdamVRFProof || null,
        vAdamCoordinatorSig: block.vAdamCoordinatorSig || null
      },
      transactions
    }
  } catch (err: any) {
    console.error(`[API /block/${idStr}] Error:`, err.message || err)
    setResponseStatus(event, 404)
    return {
      success: false,
      error: 'Block not found'
    }
  }
})
