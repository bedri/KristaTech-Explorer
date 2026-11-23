import { callRpc, callRpcBatch } from '../utils/rpc'
import { dbQuery, isBurnAddress, normalizeTaprootAddress } from '../utils/db'
import { setCacheControl, toSatoshi } from '../utils/api'
import { decodeKtdip3ProTxAsm } from '../../app/utils/formatters'

export interface MempoolAddressDelta {
  receivedSats: number
  sentSats: number
  txCount: number
}

interface MempoolSnapshotResult {
  payload: any
  rawTxMap: Map<string, any>
  addressDeltas: Map<string, MempoolAddressDelta>
}

const MEMPOOL_CACHE_TTL_MS = 3000
const MAX_MEMPOOL_PREVOUT_LOOKUPS = 500
let cachedMempool: any = null
let cachedMempoolTime = 0
let cachedMempoolRawTxs: Map<string, any> = new Map()
let cachedAddressDeltas: Map<string, MempoolAddressDelta> = new Map()
let inflightMempoolPromise: Promise<MempoolSnapshotResult> | null = null

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
  let hasProTx = false
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
      else if (st === 'nulldata' && decodeKtdip3ProTxAsm(out?.scriptPubKey?.asm) !== null) hasProTx = true
      if (isBurnAddress(normalizeTaprootAddress(addr)) && sats > 0) hasBurn = true
    }
  }

  let txType = 'standard'
  if (hasCoinLock) txType = 'coin_lock'
  else if (hasZeroCoin) txType = 'zerocoin_pow'
  else if (hasPowLock) txType = 'pow_lock'
  else if (hasProTx) txType = 'protx'
  else if (hasBurn) txType = 'burn'
  else if (hasContract) txType = 'contract'

  return {
    txType,
    totalOut: Math.round(totalOutSats) / 1e8
  }
}

async function computeMempoolAddressDeltas(
  rawTxMap: Map<string, any>
): Promise<Map<string, MempoolAddressDelta>> {
  const deltas = new Map<string, MempoolAddressDelta>()
  if (rawTxMap.size === 0) return deltas

  const txSetsByAddr = new Map<string, Set<string>>()
  const ensureEntry = (addr: string, txid: string): MempoolAddressDelta => {
    let entry = deltas.get(addr)
    if (!entry) {
      entry = { receivedSats: 0, sentSats: 0, txCount: 0 }
      deltas.set(addr, entry)
    }
    let txSet = txSetsByAddr.get(addr)
    if (!txSet) {
      txSet = new Set<string>()
      txSetsByAddr.set(addr, txSet)
    }
    if (!txSet.has(txid)) {
      txSet.add(txid)
      entry.txCount = txSet.size
    }
    return entry
  }

  const neededPrevTxids = new Set<string>()
  const pendingInputs: Array<{ txid: string; prevTxid: string; prevVout: number }> = []

  for (const [txid, rawTx] of rawTxMap.entries()) {
    if (Array.isArray(rawTx?.vout)) {
      for (const out of rawTx.vout) {
        const sats = toSatoshi(out?.value)
        if (sats <= 0) continue
        const addrs: string[] = Array.isArray(out?.scriptPubKey?.addresses)
          ? out.scriptPubKey.addresses
          : []
        for (const rawAddr of addrs) {
          const addr = normalizeTaprootAddress(rawAddr)
          if (!addr) continue
          const entry = ensureEntry(addr, txid)
          entry.receivedSats += sats
        }
      }
    }
    if (Array.isArray(rawTx?.vin)) {
      for (const inp of rawTx.vin) {
        if (
          pendingInputs.length < MAX_MEMPOOL_PREVOUT_LOOKUPS &&
          inp?.txid &&
          inp.txid !== ZERO_COIN_SENTINEL_TXID &&
          typeof inp?.vout === 'number'
        ) {
          neededPrevTxids.add(inp.txid)
          pendingInputs.push({ txid, prevTxid: inp.txid, prevVout: inp.vout })
        }
      }
    }
  }

  if (pendingInputs.length > 0 && neededPrevTxids.size > 0) {
    const prevOutMap = new Map<string, { address: string; sats: number }>()
    const prevTxids = Array.from(neededPrevTxids)
    for (let i = 0; i < prevTxids.length; i += 100) {
      const chunk = prevTxids.slice(i, i + 100)
      const placeholders = chunk.map(() => '?').join(', ')
      const rows = await dbQuery(
        `SELECT txid, n, address, amount FROM vout WHERE txid IN (${placeholders})`,
        chunk
      )
      for (const r of rows || []) {
        if (r?.txid && typeof r?.n === 'number' && r?.address) {
          prevOutMap.set(`${r.txid}:${r.n}`, {
            address: normalizeTaprootAddress(r.address),
            sats: toSatoshi(r.amount)
          })
        }
      }
    }

    for (const inp of pendingInputs) {
      const prev = prevOutMap.get(`${inp.prevTxid}:${inp.prevVout}`)
      if (prev && prev.sats > 0) {
        const entry = ensureEntry(prev.address, inp.txid)
        entry.sentSats += prev.sats
      }
    }
  }

  return deltas
}

async function loadMempoolSnapshot(): Promise<MempoolSnapshotResult> {
  const now = Date.now()
  if (cachedMempool && now - cachedMempoolTime < MEMPOOL_CACHE_TTL_MS) {
    return {
      payload: cachedMempool,
      rawTxMap: cachedMempoolRawTxs,
      addressDeltas: cachedAddressDeltas
    }
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

    const addressDeltas = await computeMempoolAddressDeltas(rawTxMap).catch(
      () => new Map<string, MempoolAddressDelta>()
    )

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
    cachedAddressDeltas = addressDeltas
    cachedMempoolTime = Date.now()
    return { payload, rawTxMap, addressDeltas }
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
