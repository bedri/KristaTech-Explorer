import { callRpc } from '../../utils/rpc'
import { dbGet, dbQuery } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const txid = event.context.params?.id || ''

  try {
    // 1. Fetch raw transaction details from the node
    const tx = await callRpc('getrawtransaction', [txid, 1])

    // 2. Fetch inputs and outputs from SQLite index
    const vin = await dbQuery('SELECT * FROM vin WHERE txid = ? ORDER BY n ASC', [txid])
    const vout = await dbQuery('SELECT * FROM vout WHERE txid = ? ORDER BY n ASC', [txid])

    // 3. Resolve block height if blockhash is present
    let blockHeight = null
    let blockTime = tx.time

    if (tx.blockhash) {
      const block = await dbGet('SELECT height, time FROM blocks WHERE hash = ?', [tx.blockhash])
      if (block) {
        blockHeight = block.height
        blockTime = block.time
      }
    }

    // 4. Calculate stats
    const isCoinbase = tx.vin.length > 0 && !!tx.vin[0].coinbase
    let fee = 0
    let totalIn = 0
    const totalOut = vout.reduce((sum: number, out: any) => sum + out.amount, 0)

    if (!isCoinbase) {
      totalIn = vin.reduce((sum: number, input: any) => sum + input.amount, 0)
      fee = totalIn - totalOut
      if (fee < 0) fee = 0
    }

    return {
      success: true,
      txid: tx.txid,
      confirmations: tx.confirmations || 0,
      size: tx.size,
      time: blockTime || tx.time,
      blockhash: tx.blockhash,
      blockheight: blockHeight,
      isCoinbase,
      fee,
      totalIn,
      totalOut,
      vin,
      vout
    }
  } catch (err: any) {
    setResponseStatus(event, 404)
    return {
      success: false,
      error: err.message || `Transaction ${txid} not found`
    }
  }
})
