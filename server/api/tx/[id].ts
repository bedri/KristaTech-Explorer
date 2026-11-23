import { callRpc } from '../../utils/rpc'
import { dbGet, dbQuery, isBurnAddress } from '../../utils/db'
import { setCacheControl } from '../../utils/api'
import { decodeKtdip3ProTxAsm, decodeOpReturnAsm } from '../../../app/utils/formatters'
import { maskPeerAddr } from '../../../app/utils/protocol'

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
          lock_height: m ? parseInt(m[1], 10) : null,
          script_asm: out.scriptPubKey?.asm || null,
          script_hex: out.scriptPubKey?.hex || null
        }
      })
    }

    // Backfill script_asm / script_hex from live RPC tx.vout for any legacy indexed outputs
    const rpcVoutByN = new Map<number, any>()
    if (Array.isArray(tx.vout)) {
      for (const rv of tx.vout) {
        if (typeof rv?.n === 'number') rpcVoutByN.set(rv.n, rv)
      }
    }

    // Enrich outputs with burn flag, script details, OP_RETURN decoder, and MESCAL decompiler
    const enrichedVout = []
    for (const o of vout || []) {
      const rpcOut = rpcVoutByN.get(o.n)
      const scriptAsm = o.script_asm || rpcOut?.scriptPubKey?.asm || null
      const scriptHex = o.script_hex || rpcOut?.scriptPubKey?.hex || null
      const opReturnDecoded =
        o.script_type === 'nulldata' || o.address === 'OP_RETURN'
          ? decodeOpReturnAsm(scriptAsm)
          : null
      const proTxDecoded =
        o.script_type === 'nulldata' || o.address === 'OP_RETURN'
          ? decodeKtdip3ProTxAsm(scriptAsm)
          : null

      let mescalDecompiled: any = null
      if (o.script_type === 'mescalcontract' && scriptHex) {
        try {
          mescalDecompiled = await callRpc('decompilemescal', [scriptHex])
        } catch (_) {
          mescalDecompiled = null
        }
      }

      enrichedVout.push({
        ...o,
        script_asm: scriptAsm,
        script_hex: scriptHex,
        isBurn: isBurnAddress(o.address),
        opReturnDecoded,
        proTxDecoded,
        mescalDecompiled
      })
    }

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
    const txProTx = enrichedVout.find((o: any) => o.proTxDecoded)?.proTxDecoded || null
    let txType = txRow?.tx_type || (isCoinbase ? 'coinbase' : isCoinstake ? 'coinstake' : 'standard')
    if (txProTx && txType === 'standard') {
      txType = 'protx'
    }

    let proTxInfo: any = null
    if (txProTx) {
      try {
        const info = await callRpc('protx', ['info', txid])
        if (info && typeof info === 'object') {
          const opRewardBps = typeof info.operatorReward === 'number' ? info.operatorReward : 0
          proTxInfo = {
            proTxHash: info.proTxHash || txid,
            collateralHash: info.collateralHash || '',
            collateralIndex: info.collateralIndex ?? 0,
            serviceMasked: info.service ? maskPeerAddr(info.service) : null,
            ownerAddress: info.ownerAddress || '',
            votingAddress: info.votingAddress || '',
            payoutAddress: info.payoutAddress || info.ownerAddress || '',
            operatorPubKey: info.operatorPubKey || '',
            operatorRewardBps: opRewardBps,
            operatorRewardPct: Math.round((opRewardBps / 100) * 100) / 100,
            registeredHeight: info.registeredHeight ?? -1,
            lastPaidHeight: info.lastPaidHeight ?? 0,
            posePenalty: info.PoSePenalty ?? 0,
            poseRevivedHeight: info.PoSeRevivedHeight ?? -1,
            poseBanHeight: info.PoSeBanHeight ?? -1,
            revocationReason: info.revocationReason ?? 0,
            valid: Boolean(info.valid)
          }
        }
      } catch (_) {
        proTxInfo = null
      }
    }

    let feeSats = 0
    let totalInSats = 0
    const totalOutSats = enrichedVout.reduce((sum: number, out: any) => sum + toSatoshi(out.amount), 0)

    if (!isCoinbase) {
      totalInSats = vin.reduce((sum: number, input: any) => sum + toSatoshi(input.amount), 0)
      if (!isCoinstake && totalInSats > 0) {
        feeSats = Math.max(0, totalInSats - totalOutSats)
      }
    }

    const txSize = tx.size || 0
    const feeRateSatByte = txSize > 0 && feeSats > 0 ? Math.round((feeSats / txSize) * 100) / 100 : 0
    const rawHex = typeof tx.hex === 'string' && tx.hex.length <= 131072 ? tx.hex : null

    setCacheControl(event, (tx.confirmations || 0) >= 6 ? 60 : 5, 10)

    return {
      success: true,
      txid: tx.txid,
      version: tx.version ?? 1,
      locktime: tx.locktime ?? 0,
      confirmations: tx.confirmations || 0,
      size: txSize,
      time: blockTime || tx.time,
      blockhash: tx.blockhash,
      blockheight: blockHeight,
      isCoinbase,
      isCoinstake,
      txType,
      proTx: txProTx,
      proTxInfo,
      fee: fromSatoshi(feeSats),
      feeRateSatByte,
      totalIn: fromSatoshi(totalInSats),
      totalOut: fromSatoshi(totalOutSats),
      hex: rawHex,
      vin,
      vout: enrichedVout,
      rawTx: {
        txid: tx.txid,
        version: tx.version,
        locktime: tx.locktime,
        size: tx.size,
        blockhash: tx.blockhash,
        confirmations: tx.confirmations,
        time: tx.time,
        vin: tx.vin,
        vout: tx.vout
      }
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
