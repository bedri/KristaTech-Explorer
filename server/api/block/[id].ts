import { callRpc } from '../../utils/rpc'
import { dbGet, dbQuery } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const idStr = event.context.params?.id || ''

  try {
    let blockHash = idStr
    const isHeight = /^\d+$/.test(idStr)

    // 1. If dynamic parameter is height, resolve hash
    if (isHeight) {
      const height = parseInt(idStr)
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
    const transactions = await dbQuery(
      'SELECT txid, time, value, fee FROM transactions WHERE block_hash = ?',
      [blockHash]
    )

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
    setResponseStatus(event, 404)
    return {
      success: false,
      error: err.message || `Block ${idStr} not found`
    }
  }
})
