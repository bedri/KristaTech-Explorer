export type ExplorerEventType = 'block' | 'mempool' | 'reorg'

export const ALLOWED_SSE_TOPICS = new Set<string>(['block', 'mempool', 'reorg'])
export const MAX_SSE_CLIENTS = 100
export const MAX_SSE_PER_IP = 3
export const HEARTBEAT_INTERVAL_MS = 25_000
export const MEMPOOL_POLL_INTERVAL_MS = 5_000

interface SseClient {
  id: number
  ip: string
  topics: Set<string>
  write: (chunk: string) => void
  close: () => void
}

const clients = new Map<number, SseClient>()
let nextClientId = 1
let nextEventId = 1
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let mempoolTimer: ReturnType<typeof setInterval> | null = null
let mempoolFetcher: (() => Promise<string[]>) | null = null
let knownMempoolTxids: Set<string> | null = null
let isPollingMempool = false

export function parseTopicsParam(raw?: string | null): Set<string> {
  if (!raw || typeof raw !== 'string') {
    return new Set(ALLOWED_SSE_TOPICS)
  }
  const selected = new Set<string>()
  for (const part of raw.split(',')) {
    const clean = part.trim().toLowerCase()
    if (ALLOWED_SSE_TOPICS.has(clean)) {
      selected.add(clean)
    }
  }
  return selected.size > 0 ? selected : new Set(ALLOWED_SSE_TOPICS)
}

export function setMempoolFetcher(fn: (() => Promise<string[]>) | null): void {
  mempoolFetcher = fn
}

function hasMempoolSubscribers(): boolean {
  for (const client of clients.values()) {
    if (client.topics.has('mempool')) return true
  }
  return false
}

function stopTimersIfIdle(): void {
  if (clients.size === 0 && heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  if (!hasMempoolSubscribers() && mempoolTimer) {
    clearInterval(mempoolTimer)
    mempoolTimer = null
    knownMempoolTxids = null
  }
}

function ensureHeartbeatTimer(): void {
  if (heartbeatTimer || clients.size === 0) return
  heartbeatTimer = setInterval(() => {
    const frame = `: heartbeat ${Date.now()}\n\n`
    for (const [id, client] of clients.entries()) {
      try {
        client.write(frame)
      } catch (_) {
        unregisterSseClient(id)
      }
    }
  }, HEARTBEAT_INTERVAL_MS)
  heartbeatTimer.unref?.()
}

async function pollMempoolChanges(): Promise<void> {
  if (isPollingMempool || !mempoolFetcher || !hasMempoolSubscribers()) return
  isPollingMempool = true
  try {
    const txids = await mempoolFetcher()
    if (!Array.isArray(txids)) return
    const currentSet = new Set(txids.map((t) => String(t)))

    if (knownMempoolTxids === null) {
      knownMempoolTxids = currentSet
      return
    }

    const added: string[] = []
    for (const txid of currentSet) {
      if (!knownMempoolTxids.has(txid)) {
        added.push(txid)
      }
    }
    knownMempoolTxids = currentSet

    if (added.length > 0) {
      publishExplorerEvent('mempool', {
        addedTxids: added.slice(0, 25),
        addedCount: added.length,
        size: currentSet.size,
        timestamp: Math.floor(Date.now() / 1000)
      })
    }
  } catch (_) {
    // Ignore transient RPC polling failures
  } finally {
    isPollingMempool = false
  }
}

function ensureMempoolTimer(): void {
  if (mempoolTimer || !hasMempoolSubscribers()) return
  mempoolTimer = setInterval(() => {
    void pollMempoolChanges()
  }, MEMPOOL_POLL_INTERVAL_MS)
  mempoolTimer.unref?.()
}

export function unregisterSseClient(clientId: number): void {
  const client = clients.get(clientId)
  if (!client) return
  clients.delete(clientId)
  try {
    client.close()
  } catch (_) {}
  stopTimersIfIdle()
}

export function registerSseClient(
  ip: string,
  topics: Set<string>,
  write: (chunk: string) => void,
  close: () => void,
  limits?: { maxClients?: number; maxPerIp?: number }
):
  | { ok: true; clientId: number; unregister: () => void }
  | { ok: false; status: number; code: string; error: string } {
  const maxClients = limits?.maxClients ?? MAX_SSE_CLIENTS
  const maxPerIp = limits?.maxPerIp ?? MAX_SSE_PER_IP

  if (clients.size >= maxClients) {
    return {
      ok: false,
      status: 503,
      code: 'SSE_CAPACITY_EXCEEDED',
      error: 'Event stream server capacity reached; please retry later.'
    }
  }

  let ipCount = 0
  for (const existing of clients.values()) {
    if (existing.ip === ip) ipCount++
  }
  if (ipCount >= maxPerIp) {
    return {
      ok: false,
      status: 429,
      code: 'SSE_IP_LIMIT_EXCEEDED',
      error: `Too many concurrent event streams from this IP (max ${maxPerIp}).`
    }
  }

  const clientId = nextClientId++
  clients.set(clientId, {
    id: clientId,
    ip,
    topics,
    write,
    close
  })

  ensureHeartbeatTimer()
  ensureMempoolTimer()

  return {
    ok: true,
    clientId,
    unregister: () => unregisterSseClient(clientId)
  }
}

export function formatSseFrame(id: number, event: string, data: any): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export function publishExplorerEvent(
  type: ExplorerEventType,
  payload: Record<string, any>
): number {
  const eventId = nextEventId++
  const frame = formatSseFrame(eventId, type, {
    type,
    ...payload
  })

  let delivered = 0
  for (const [id, client] of clients.entries()) {
    if (!client.topics.has(type)) continue
    try {
      client.write(frame)
      delivered++
    } catch (_) {
      unregisterSseClient(id)
    }
  }
  return delivered
}

export function getEventStreamStats() {
  let mempoolSubscribers = 0
  for (const c of clients.values()) {
    if (c.topics.has('mempool')) mempoolSubscribers++
  }
  return {
    activeClients: clients.size,
    maxClients: MAX_SSE_CLIENTS,
    maxPerIp: MAX_SSE_PER_IP,
    mempoolSubscribers
  }
}

export function resetSseHubForTests(): void {
  for (const id of Array.from(clients.keys())) {
    unregisterSseClient(id)
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  if (mempoolTimer) {
    clearInterval(mempoolTimer)
    mempoolTimer = null
  }
  knownMempoolTxids = null
  mempoolFetcher = null
  isPollingMempool = false
  nextClientId = 1
  nextEventId = 1
}
