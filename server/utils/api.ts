export const API_VERSION = '2.1'

export const SPECIAL_ADDRESS_LABELS = new Set([
  'Genesis',
  'Coinbase',
  'Nonstandard',
  'Pubkey-output',
  'Zero-Coin PoW',
  'OP_RETURN',
  'Coinstake-Marker',
  'MESCAL-Contract'
])

export function isValidAddressParam(addr: string): boolean {
  if (!addr) return false
  if (SPECIAL_ADDRESS_LABELS.has(addr)) return true
  if (/^(kt|tk|rt)1p[ac-hj-np-z02-9]{58}$/.test(addr)) return true
  return /^[1-9A-HJ-NP-Za-km-z]{33,36}$/.test(addr)
}

export function isValidTxid(id: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(id || '')
}

export function isValidCompressedPubkey(val: string): boolean {
  return /^(02|03)[0-9a-fA-F]{64}$/.test(val || '')
}

export function isValidBlsPubkey(val: string): boolean {
  return /^[0-9a-fA-F]{96}$/.test(val || '')
}

export function toSatoshi(amount: number | null | undefined): number {
  return Math.round((amount || 0) * 1e8)
}

export function fromSatoshi(sats: number): number {
  return Math.round(sats) / 1e8
}

export function normalizeAmount(val: number | null | undefined): number {
  return Math.round((val || 0) * 1e8) / 1e8
}

export function parsePagination(
  query: Record<string, any>,
  opts?: { defaultLimit?: number; minLimit?: number; maxLimit?: number }
): { page: number; limit: number; offset: number } {
  const defaultLimit = opts?.defaultLimit ?? 25
  const minLimit = opts?.minLimit ?? 1
  const maxLimit = opts?.maxLimit ?? 100

  const parsedPage = parseInt(String(query?.page ?? '1'), 10)
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1

  const parsedLimit = parseInt(String(query?.limit ?? defaultLimit), 10)
  const rawLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : defaultLimit
  const limit = Math.min(maxLimit, Math.max(minLimit, rawLimit))
  const offset = (page - 1) * limit

  return { page, limit, offset }
}

export function setCacheControl(event: any, maxAgeSeconds: number, swrSeconds?: number): void {
  if (!event || typeof setResponseHeader !== 'function') return
  if (maxAgeSeconds <= 0) {
    setResponseHeader(event, 'Cache-Control', 'no-store')
    return
  }
  const swr =
    typeof swrSeconds === 'number' && swrSeconds > 0 ? `, stale-while-revalidate=${Math.floor(swrSeconds)}` : ''
  setResponseHeader(event, 'Cache-Control', `public, max-age=${Math.floor(maxAgeSeconds)}${swr}`)
}

export function apiError(
  event: any,
  statusCode: number,
  error: string,
  code: string,
  extra?: Record<string, any>
) {
  if (event && typeof setResponseStatus === 'function') {
    setResponseStatus(event, statusCode)
  }
  return {
    success: false,
    code,
    error,
    ...(extra || {})
  }
}

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export class BoundedTtlCache<T> {
  private readonly ttlMs: number
  private readonly maxEntries: number
  private readonly store = new Map<string, CacheEntry<T>>()
  private readonly inflight = new Map<string, Promise<T>>()

  constructor(ttlMs: number, maxEntries = 200) {
    this.ttlMs = Math.max(1, ttlMs)
    this.maxEntries = Math.max(1, maxEntries)
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: T): void {
    const now = Date.now()
    if (!this.store.has(key) && this.store.size >= this.maxEntries) {
      // Prune expired entries first
      for (const [k, entry] of this.store.entries()) {
        if (now > entry.expiresAt) {
          this.store.delete(k)
        }
      }
      // If still at capacity, evict the oldest inserted key
      if (this.store.size >= this.maxEntries) {
        const oldestKey = this.store.keys().next().value
        if (oldestKey !== undefined) {
          this.store.delete(oldestKey)
        }
      }
    }
    this.store.set(key, {
      value,
      expiresAt: now + this.ttlMs
    })
  }

  async getOrLoad(key: string, loader: () => Promise<T>): Promise<T> {
    const cached = this.get(key)
    if (cached !== undefined) {
      return cached
    }

    const pending = this.inflight.get(key)
    if (pending) {
      return pending
    }

    const promise = loader()
      .then((res) => {
        this.set(key, res)
        return res
      })
      .finally(() => {
        this.inflight.delete(key)
      })

    this.inflight.set(key, promise)
    return promise
  }

  clear(): void {
    this.store.clear()
    this.inflight.clear()
  }

  get size(): number {
    return this.store.size
  }
}
