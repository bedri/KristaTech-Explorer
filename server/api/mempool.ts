import { callRpc, callRpcBatch } from '../utils/rpc'
import { isBurnAddress, normalizeTaprootAddress } from '../utils/db'
import { setCacheControl } from '../utils/api'

const MEMPOOL_CACHE_TTL_MS = 3000
let cachedMempool: any = null
let cachedMempoolTime = 0
let cachedMempoolRawTxs: Map<string, any> = new Map()
let inflightMempoolPromise: Promise<{ payload: any; rawTxMap: Map<string, any> }> | null = null

const ZERO_COIN_SENTINEL_TXID = '0000000000000000000000000000000000000000000000000000000000000001'

function normalizeAmount(val: number | null | undefined): number {
  return Math.round((val || 0) * 1e8) / 1e8
}

function classifyRawMempoolTx(rawTx: any): { txType: string; totalOut: number } {
  if (!rawTx || typeof rawTx !== 'object') {
    return { txType: 'standard', totalOut: 0 }
  }
  let totalOutSats = 0
  let hasCoinLock = false
  let hasPowLock = false
  let hasZeroCoin = false
  let hasBurn = false
  let hasContract = false

  if (Array.isArray(rawTx.vin)) {
    for (const v of rawTx.vin) {
      if (v?.txid === ZERO_COIN_SENTINEL_TXID && v?.vout === 0) {
        hasZeroCoin = true
      }
    }
  }

  if (Array.isArray(rawTx.vout)) {
    for (const out of rawTx.vout) {
      const sats = Math.round((out?.value || 0) * 1e8)
      totalOutSats += sats
      const st = out?.scriptPubKey?.type || ''
      const addr = out?.scriptPubKey?.addresses?.[0] || ''
      if (st === 'adam_coinlock') hasCoinLock = true
      else if (st === 'adam_powlock') hasPowLock = true
      else if (st === 'mescalcontract' || st === 'witness_v1_taproot') hasContract = true
      if (isBurnAddress(normalizeTaprootAddress(addr)) && sats > 0) hasBurn = true
    }
  }

  let txType = 'standard'
  if (hasCoinLock) txType = 'coin_lock'
  else if (hasZeroCoin) txType = 'zerocoin_pow'
  else if (hasPowLock) txType = 'pow_lock'
  else if (hasBurn) txType = 'burn'
  else if (hasContract) txType = 'contract'

  return {
    txType,
    totalOut: Math.round(totalOutSats) / 1e8
  }
}

async function loadMempoolSnapshot(): Promise<{ payload: any; rawTxMap: Map<string, any> }> {
  const now = Date.now()
  if (cachedMempool && now - cachedMempoolTime < MEMPOOL_CACHE_TTL_MS) {
    return { payload: cachedMempool, rawTxMap: cachedMempoolRawTxs }
  }

  if (inflightMempoolPromise) {
    return inflightMempoolPromise
  }

  inflightMempoolPromise = (async () => {
    const info = await callRpc('getmempoolinfo').catch(() => ({ size: 0, bytes: 0, usage: 0 }))
    const rawPool = await callRpc('getrawmempool', [true]).catch(() => ({}))

    const entries: any[] = []
    if (rawPool && typeof rawPool === 'object' && !Array.isArray(rawPool)) {
      for (const [txid, meta] of Object.entries<any>(rawPool)) {
        entries.push({
          txid,
          size: meta?.size || 0,
          fee: normalizeAmount(meta?.fee || 0),
          modifiedfee: normalizeAmount(meta?.modifiedfee ?? meta?.fee ?? 0),
          time: meta?.time || Math.floor(now / 1000),
          height: meta?.height || 0
        })
      }
    }

    entries.sort((a, b) => b.time - a.time)
    const topEntries = entries.slice(0, 50)

    const rawTxMap = new Map<string, any>()
    if (topEntries.length > 0) {
      try {
        const rawTxs = await callRpcBatch(
          topEntries.map((e) => ({ method: 'getrawtransaction', params: [e.txid, 1] }))
        )
        for (const rt of rawTxs || []) {
          if (rt && rt.txid) rawTxMap.set(rt.txid, rt)
        }
      } catch (_) {}
    }

    const nowSec = Math.floor(now / 1000)
    let totalFeesSats = 0
    for (const e of entries) {
      totalFeesSats += Math.round((e.fee || 0) * 1e8)
    }

    const transactions = topEntries.map((e) => {
      const classified = classifyRawMempoolTx(rawTxMap.get(e.txid))
      const feeSats = Math.round((e.fee || 0) * 1e8)
      const feeRateSatByte = e.size > 0 ? Math.round((feeSats / e.size) * 100) / 100 : 0
      return {
        txid: e.txid,
        size: e.size,
        fee: e.fee,
        feeRateSatByte,
        totalOut: classified.totalOut,
        txType: classified.txType,
        time: e.time,
        waitingSeconds: Math.max(0, nowSec - e.time)
      }
    })

    const payload = {
      success: true,
      size: info?.size ?? entries.length,
      bytes: info?.bytes ?? 0,
      usage: info?.usage ?? 0,
      totalFees: Math.round(totalFeesSats) / 1e8,
      transactions
    }

    cachedMempool = payload
    cachedMempoolRawTxs = rawTxMap
    cachedMempoolTime = Date.now()
    return { payload, rawTxMap }
  })().finally(() => {
    inflightMempoolPromise = null
  })

  return inflightMempoolPromise
}

export async function getCachedMempoolSummary() {
  return loadMempoolSnapshot()
}

export default defineEventHandler(async (event) => {
  try {
    setCacheControl(event, 3, 5)
    const { payload } = await loadMempoolSnapshot()
    return payload
  } catch (err: any) {
    console.error('[API /mempool] Error:', err?.message || err)
    setResponseStatus(event, 500)
    return {
      success: false,
      code: 'MEMPOOL_INSPECT_FAILED',
      error: 'Failed to inspect mempool'
    }
  }
})
