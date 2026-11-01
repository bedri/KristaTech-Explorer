import { callRpc } from '../../utils/rpc'
import { dbGet, dbQuery } from '../../utils/db'

function toSatoshi(amount: number | null | undefined): number {
  return Math.round((amount || 0) * 1e8)
}

function fromSatoshi(sats: number): number {
  return Math.round(sats) / 1e8
}

export default defineEventHandler(async (event) => {
  const rawId = (event.context.params?.id || '').trim()

  if (!/^[0-9a-fA-F]{64}$/.test(rawId)) {
    setResponseStatus(event, 400)
    return {
      success: false,
      error: 'Invalid transaction ID format'
    }
  }

  const txid = rawId.toLowerCase()

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

    // 4. Calculate stats with satoshi precision
    const isCoinbase = tx.vin.length > 0 && !!tx.vin[0].coinbase
    let feeSats = 0
    let totalInSats = 0
    const totalOutSats = vout.reduce((sum: number, out: any) => sum + toSatoshi(out.amount), 0)

    if (!isCoinbase) {
      totalInSats = vin.reduce((sum: number, input: any) => sum + toSatoshi(input.amount), 0)
      feeSats = Math.max(0, totalInSats - totalOutSats)
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
      fee: fromSatoshi(feeSats),
      totalIn: fromSatoshi(totalInSats),
      totalOut: fromSatoshi(totalOutSats),
      vin,
      vout
    }
  } catch (err: any) {
    console.error(`[API /tx/${txid}] Error:`, err.message || err)
    setResponseStatus(event, 404)
    return {
      success: false,
      error: 'Transaction not found'
    }
  }
})
