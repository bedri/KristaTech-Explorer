import { API_VERSION } from '../utils/api'

interface RateLimitBucket {
  count: number
  resetAt: number
}

const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 120 // 120 API requests per minute per IP
const BROADCAST_RATE_LIMIT_MAX_REQUESTS = 10 // 10 broadcast attempts per minute per IP
const MAX_IP_BUCKETS = 10_000
const ipBuckets = new Map<string, RateLimitBucket>()

function pruneBuckets(now: number): void {
  for (const [key, bucket] of ipBuckets.entries()) {
    if (now > bucket.resetAt) {
      ipBuckets.delete(key)
    }
  }
  while (ipBuckets.size > MAX_IP_BUCKETS) {
    const oldestKey = ipBuckets.keys().next().value
    if (oldestKey === undefined) break
    ipBuckets.delete(oldestKey)
  }
}

// Prune expired buckets every 5 minutes to prevent unbounded memory growth
setInterval(() => {
  pruneBuckets(Date.now())
}, 300_000).unref?.()

function getClientIp(event: any): string {
  const xff = getRequestHeader(event, 'x-forwarded-for')
  if (xff) {
    return xff.split(',')[0].trim()
  }
  const realIp = getRequestHeader(event, 'x-real-ip')
  if (realIp) {
    return realIp.trim()
  }
  return event.node?.req?.socket?.remoteAddress || '127.0.0.1'
}

function isLoopbackIp(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}

export default defineEventHandler((event) => {
  // 1. Set standard HTTP Security Headers
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  setResponseHeader(event, 'X-Frame-Options', 'DENY')
  setResponseHeader(event, 'Referrer-Policy', 'strict-origin-when-cross-origin')
  setResponseHeader(event, 'Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  setResponseHeader(event, 'X-XSS-Protection', '1; mode=block')

  // 2. Apply CORS, API versioning, and IP-based Rate Limiting on /api/* endpoints
  const url = event.path || event.node?.req?.url || ''
  if (url.startsWith('/api/')) {
    const config = useRuntimeConfig()
    const corsOrigin = String(config?.apiCorsOrigin || '*')

    setResponseHeader(event, 'X-API-Version', API_VERSION)
    setResponseHeader(event, 'Access-Control-Allow-Origin', corsOrigin)
    setResponseHeader(event, 'Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    setResponseHeader(event, 'Access-Control-Allow-Headers', 'Content-Type, Accept, Last-Event-ID')
    setResponseHeader(
      event,
      'Access-Control-Expose-Headers',
      'X-API-Version, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After'
    )

    if (event.method === 'OPTIONS') {
      setResponseStatus(event, 204)
      return ''
    }

    const pathname = url.split('?')[0] || url
    const isBroadcast = pathname === '/api/tx/broadcast'
    const limitMax = isBroadcast ? BROADCAST_RATE_LIMIT_MAX_REQUESTS : RATE_LIMIT_MAX_REQUESTS
    const ip = getClientIp(event)
    const now = Date.now()

    // Exempt local loopback health checks from general rate limit, but still limit broadcast tests
    if (!isLoopbackIp(ip) || isBroadcast) {
      const bucketKey = isBroadcast ? `broadcast:${ip}` : `api:${ip}`
      if (!ipBuckets.has(bucketKey) && ipBuckets.size >= MAX_IP_BUCKETS) {
        pruneBuckets(now)
      }

      let bucket = ipBuckets.get(bucketKey)
      if (!bucket || now > bucket.resetAt) {
        bucket = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS }
        ipBuckets.set(bucketKey, bucket)
      } else {
        bucket.count++
      }

      const remaining = Math.max(0, limitMax - bucket.count)
      const resetEpochSec = Math.ceil(bucket.resetAt / 1000)

      setResponseHeader(event, 'X-RateLimit-Limit', String(limitMax))
      setResponseHeader(event, 'X-RateLimit-Remaining', String(remaining))
      setResponseHeader(event, 'X-RateLimit-Reset', String(resetEpochSec))

      if (bucket.count > limitMax) {
        const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
        setResponseHeader(event, 'Retry-After', String(retryAfterSec))
        setResponseStatus(event, 429)
        return {
          success: false,
          code: 'RATE_LIMITED',
          error: 'Too many requests, please try again later.'
        }
      }
    } else {
      setResponseHeader(event, 'X-RateLimit-Limit', String(limitMax))
      setResponseHeader(event, 'X-RateLimit-Remaining', String(limitMax))
    }
  }
})
