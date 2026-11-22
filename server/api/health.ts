import { callRpc, isTxBroadcastEnabled } from '../utils/rpc'
import { dbGet } from '../utils/db'
import { API_VERSION, BoundedTtlCache, setCacheControl } from '../utils/api'
import { getIndexerState } from '../utils/indexerState'
import { getEventStreamStats } from '../utils/events'

const healthCache = new BoundedTtlCache<{ statusCode: number; body: any }>(2000, 2)

export default defineEventHandler(async (event) => {
  setCacheControl(event, 0)

  const result = await healthCache.getOrLoad('health', async () => {
    let dbOk = false
    let indexedHeight: number | null = null
    try {
      const row = await dbGet('SELECT MAX(height) as height FROM blocks')
      dbOk = true
      indexedHeight = row && row.height !== null && row.height !== undefined ? Number(row.height) : 0
    } catch (_) {
      dbOk = false
    }

    let rpcConnected = false
    let nodeHeight: number | null = null
    let chain = 'unknown'
    let verificationProgress: number | null = null
    try {
      const info = await callRpc('getblockchaininfo')
      if (info && typeof info === 'object') {
        rpcConnected = true
        nodeHeight = typeof info.blocks === 'number' ? info.blocks : null
        chain = info.chain || 'main'
        verificationProgress =
          typeof info.verificationprogress === 'number'
            ? Math.round(info.verificationprogress * 1e6) / 1e6
            : null
      }
    } catch (_) {
      rpcConnected = false
    }

    const idxState = getIndexerState()
    const syncLag =
      nodeHeight !== null && indexedHeight !== null ? Math.max(0, nodeHeight - indexedHeight) : null
    const synced = syncLag !== null && syncLag <= 5

    let status: 'ok' | 'syncing' | 'degraded' = 'ok'
    if (!dbOk || !rpcConnected) {
      status = 'degraded'
    } else if (!synced) {
      status = 'syncing'
    }

    const statusCode = status === 'degraded' ? 503 : 200
    const config = useRuntimeConfig()

    return {
      statusCode,
      body: {
        success: status !== 'degraded',
        status,
        apiVersion: API_VERSION,
        chain,
        uptimeSeconds: Math.floor((Date.now() - idxState.startedAt) / 1000),
        database: {
          connected: dbOk,
          indexedHeight
        },
        rpc: {
          connected: rpcConnected,
          nodeHeight,
          verificationProgress
        },
        indexer: {
          isSyncing: idxState.isSyncing,
          syncLag,
          synced,
          lastSyncAttemptAt: idxState.lastSyncAttemptAt,
          lastSyncSuccessAt: idxState.lastSyncSuccessAt,
          lastSyncError: idxState.lastSyncError,
          lastSyncErrorAt: idxState.lastSyncErrorAt,
          reorgCount: idxState.reorgCount
        },
        features: {
          txBroadcastEnabled: isTxBroadcastEnabled(config),
          sse: getEventStreamStats()
        },
        timestamp: Math.floor(Date.now() / 1000)
      }
    }
  })

  setResponseStatus(event, result.statusCode)
  return result.body
})
