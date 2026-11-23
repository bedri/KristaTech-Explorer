export const CANONICAL_EXPLORER_URL = 'https://explorer.kristalteknoloji.com'
export const MAX_JSON_POST_BYTES = 262_144 // 256 KB

export const EXPLORER_PAGE_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"

export const EXPLORER_API_CSP = "default-src 'none'; frame-ancestors 'none'"

const ALLOWED_OPENAPI_HOSTS = new Set([
  'explorer.kristalteknoloji.com',
  'localhost',
  '127.0.0.1'
])

export function isLoopbackIp(ip: string): boolean {
  const clean = (ip || '').trim()
  return clean === '127.0.0.1' || clean === '::1' || clean === '::ffff:127.0.0.1'
}

export function normalizeRequestPath(rawUrl: string): string {
  const raw = String(rawUrl || '')
  const pathOnly = raw.split('?')[0]?.split('#')[0] || '/'
  let decoded = pathOnly
  try {
    decoded = decodeURIComponent(pathOnly)
  } catch (_) {
    decoded = pathOnly.replace(/%2f/gi, '/')
  }
  const collapsed = decoded.replace(/^\/+/, '/')
  return collapsed.startsWith('/') ? collapsed : `/${collapsed}`
}

export function isApiRequestPath(rawUrl: string): boolean {
  return normalizeRequestPath(rawUrl).startsWith('/api/')
}

export function resolveClientIp(input: {
  xRealIp?: string | null
  xForwardedFor?: string | null
  remoteAddress?: string | null
}): { ip: string; isDirectLoopback: boolean } {
  const realIp = String(input?.xRealIp || '').trim()
  if (realIp) {
    return {
      ip: realIp,
      isDirectLoopback: false
    }
  }

  const xff = String(input?.xForwardedFor || '').trim()
  if (xff) {
    const parts = xff
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length > 0) {
      // Take the rightmost peer appended by our trusted reverse proxy rather than client-forged index 0
      return {
        ip: parts[parts.length - 1]!,
        isDirectLoopback: false
      }
    }
  }

  const remote = String(input?.remoteAddress || '').trim() || '127.0.0.1'
  return {
    ip: remote,
    isDirectLoopback: isLoopbackIp(remote)
  }
}

export function resolveSafeOpenApiServerUrl(
  hostHeader?: string | null,
  protoHeader?: string | null,
  extraAllowedHosts?: string[]
): string {
  const rawProto = String(protoHeader || 'https')
    .split(',')[0]
    ?.trim()
    .toLowerCase()
  const proto = rawProto === 'http' || rawProto === 'https' ? rawProto : 'https'

  const rawHost = String(hostHeader || '')
    .split(',')[0]
    ?.trim()
  if (!rawHost || !/^[a-zA-Z0-9.-]+(:\d{1,5})?$/.test(rawHost)) {
    return CANONICAL_EXPLORER_URL
  }

  const hostname = rawHost.split(':')[0]?.toLowerCase() || ''
  const allowed = extraAllowedHosts?.length
    ? new Set([...ALLOWED_OPENAPI_HOSTS, ...extraAllowedHosts.map((h) => h.toLowerCase())])
    : ALLOWED_OPENAPI_HOSTS

  if (!allowed.has(hostname)) {
    return CANONICAL_EXPLORER_URL
  }

  return `${proto}://${rawHost}`
}

export function isContentLengthExceeded(
  headerVal?: string | null,
  maxBytes = MAX_JSON_POST_BYTES
): boolean {
  if (headerVal === undefined || headerVal === null || headerVal === '') return false
  const parsed = Number(String(headerVal).trim())
  if (!Number.isFinite(parsed) || parsed < 0) return false
  return parsed > maxBytes
}
