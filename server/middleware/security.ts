interface RateLimitBucket {
  count: number
  resetAt: number
}

const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 120 // 120 API requests per minute per IP
const ipBuckets = new Map<string, RateLimitBucket>()

// Prune expired buckets every 5 minutes to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now()
  for (const [ip, bucket] of ipBuckets.entries()) {
    if (now > bucket.resetAt) {
      ipBuckets.delete(ip)
    }
  }
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

export default defineEventHandler((event) => {
  // 1. Set standard HTTP Security Headers
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  setResponseHeader(event, 'X-Frame-Options', 'DENY')
  setResponseHeader(event, 'Referrer-Policy', 'strict-origin-when-cross-origin')
  setResponseHeader(event, 'Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  setResponseHeader(event, 'X-XSS-Protection', '1; mode=block')

  // 2. Apply IP-based Rate Limiting on /api/* endpoints
  const url = event.path || event.node?.req?.url || ''
  if (url.startsWith('/api/')) {
    const ip = getClientIp(event)
    // Exempt local loopback health checks from rate limit
    if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
      const now = Date.now()
      let bucket = ipBuckets.get(ip)
      if (!bucket || now > bucket.resetAt) {
        bucket = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS }
        ipBuckets.set(ip, bucket)
      } else {
        bucket.count++
      }

      if (bucket.count > RATE_LIMIT_MAX_REQUESTS) {
        setResponseStatus(event, 429)
        return {
          success: false,
          error: 'Too many requests, please try again later.'
        }
      }
    }
  }
})
