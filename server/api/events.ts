import { callRpc } from '../utils/rpc'
import { dbGet } from '../utils/db'
import { API_VERSION, apiError } from '../utils/api'
import { resolveClientIp } from '../utils/security'
import {
  formatSseFrame,
  parseTopicsParam,
  registerSseClient,
  setMempoolFetcher
} from '../utils/events'

export default defineEventHandler(async (event) => {
  setMempoolFetcher(() => callRpc('getrawmempool', [false]))

  const query = getQuery(event)
  const topics = parseTopicsParam(query.topics ? String(query.topics) : undefined)
  const { ip } = resolveClientIp({
    xRealIp: getRequestHeader(event, 'x-real-ip'),
    xForwardedFor: getRequestHeader(event, 'x-forwarded-for'),
    remoteAddress: event.node?.req?.socket?.remoteAddress
  })

  const res = event.node.res
  const req = event.node.req

  const registration = registerSseClient(
    ip,
    topics,
    (chunk: string) => {
      if (!res.writableEnded) {
        res.write(chunk)
      }
    },
    () => {
      if (!res.writableEnded) {
        res.end()
      }
    }
  )

  if (!registration.ok) {
    return apiError(event, registration.status, registration.error, registration.code)
  }

  // Establish persistent SSE response stream
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  if (typeof (res as any).flushHeaders === 'function') {
    ;(res as any).flushHeaders()
  }

  let indexedHeight: number | null = null
  let nodeHeight: number | null = null
  let mempoolSize = 0
  try {
    const [row, bc, mp] = await Promise.all([
      dbGet('SELECT MAX(height) as height FROM blocks').catch(() => null),
      callRpc('getblockchaininfo').catch(() => null),
      callRpc('getmempoolinfo').catch(() => null)
    ])
    indexedHeight = row?.height ?? null
    nodeHeight = bc?.blocks ?? null
    mempoolSize = mp?.size ?? 0
  } catch (_) {}

  const welcomeFrame = formatSseFrame(0, 'connected', {
    apiVersion: API_VERSION,
    clientId: registration.clientId,
    topics: Array.from(topics),
    height: nodeHeight ?? indexedHeight ?? 0,
    indexedHeight,
    mempoolSize,
    timestamp: Math.floor(Date.now() / 1000)
  })
  res.write(welcomeFrame)

  await new Promise<void>((resolve) => {
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      registration.unregister()
      resolve()
    }
    req.on('close', cleanup)
    req.on('aborted', cleanup)
    res.on('close', cleanup)
    res.on('error', cleanup)
  })
})
