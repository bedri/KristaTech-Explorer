import { callRpc } from '../../utils/rpc'
import { dbGet, dbQuery, isBurnAddress } from '../../utils/db'

const ZERO_COIN_SENTINEL_TXID = '0000000000000000000000000000000000000000000000000000000000000001'

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

    // 2. Fetch indexed transaction metadata, inputs, and outputs from SQLite index
    const txRow = await dbGet(
      'SELECT is_coinbase, is_coinstake, tx_type FROM transactions WHERE txid = ?',
      [txid]
    )
    let vin = await dbQuery('SELECT * FROM vin WHERE txid = ? ORDER BY n ASC', [txid])
    let vout = await dbQuery('SELECT * FROM vout WHERE txid = ? ORDER BY n ASC', [txid])

    // Live mempool fallback if transaction is unconfirmed and not yet in SQLite
    if ((!vin || vin.length === 0) && Array.isArray(tx.vin)) {
      vin = tx.vin.map((inEntry: any, idx: number) => {
        if (inEntry.coinbase) {
          return { txid, n: idx, prev_txid: 'coinbase', prev_vout: 0, address: 'Coinbase', amount: 0 }
        }
        if (inEntry.txid === ZERO_COIN_SENTINEL_TXID && inEntry.vout === 0) {
          return { txid, n: idx, prev_txid: inEntry.txid, prev_vout: 0, address: 'Zero-Coin PoW', amount: 0 }
        }
        return {
          txid,
          n: idx,
          prev_txid: inEntry.txid,
          prev_vout: inEntry.vout,
          address: 'Unconfirmed-Input',
          amount: 0
        }
      })
    }

    if ((!vout || vout.length === 0) && Array.isArray(tx.vout)) {
      vout = tx.vout.map((out: any) => {
        const scriptType = out.scriptPubKey?.type || 'nonstandard'
        let address = 'Nonstandard'
        if (out.scriptPubKey?.addresses?.length > 0) {
          address = out.scriptPubKey.addresses[0]
        } else if (scriptType === 'nulldata') {
          address = 'OP_RETURN'
        } else if (scriptType === 'mescalcontract') {
          address = 'MESCAL-Contract'
        }
        const m = (out.scriptPubKey?.asm || '').match(/\b(\d+)\s+OP_CHECKLOCKTIMEVERIFY\b/)
        return {
          txid,
          n: out.n,
          address,
          amount: out.value || 0,
          spent_txid: null,
          script_type: scriptType,
          lock_height: m ? parseInt(m[1], 10) : null
        }
      })
    }

    // Enrich outputs with burn flag
    vout = (vout || []).map((o: any) => ({
      ...o,
      isBurn: isBurnAddress(o.address)
    }))

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
    const isCoinbase = Boolean(txRow?.is_coinbase) || (tx.vin.length > 0 && !!tx.vin[0].coinbase)
    const isCoinstake = Boolean(txRow?.is_coinstake)
    const txType = txRow?.tx_type || (isCoinbase ? 'coinbase' : isCoinstake ? 'coinstake' : 'standard')

    let feeSats = 0
    let totalInSats = 0
    const totalOutSats = vout.reduce((sum: number, out: any) => sum + toSatoshi(out.amount), 0)

    if (!isCoinbase) {
      totalInSats = vin.reduce((sum: number, input: any) => sum + toSatoshi(input.amount), 0)
      if (!isCoinstake && totalInSats > 0) {
        feeSats = Math.max(0, totalInSats - totalOutSats)
      }
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
      isCoinstake,
      txType,
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
