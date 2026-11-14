export function formatCoins(amount: number | undefined | null, maxDecimals = 8): string {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return '0.00 KRISTA'
  const normalized = Math.round(amount * 1e8) / 1e8
  return (
    new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: maxDecimals
    }).format(normalized) + ' KRISTA'
  )
}

export function formatNumber(val: number | undefined | null, maxDecimals = 2): string {
  if (val === undefined || val === null || Number.isNaN(val)) return '0'
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: maxDecimals
  }).format(val)
}

export function formatDate(timestamp: number | undefined | null): string {
  if (!timestamp) return 'N/A'
  const d = new Date(timestamp * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`
}

export function formatRelativeTime(
  timestamp: number | undefined | null,
  locale = 'en',
  nowSec?: number
): string {
  if (!timestamp) return '—'
  const baseNow = nowSec ?? Math.floor(Date.now() / 1000)
  const diff = Math.max(0, baseNow - Math.floor(timestamp))
  const isTr = locale === 'tr'

  if (diff < 5) return isTr ? 'şimdi' : 'just now'
  if (diff < 60) return isTr ? `${diff} sn önce` : `${diff}s ago`
  const mins = Math.floor(diff / 60)
  if (mins < 60) return isTr ? `${mins} dk önce` : `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return isTr ? `${hours} sa önce` : `${hours}h ago`
  const days = Math.floor(hours / 24)
  return isTr ? `${days} gün önce` : `${days}d ago`
}

export function formatDurationSeconds(seconds: number | undefined | null, locale = 'en'): string {
  if (seconds === undefined || seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return locale === 'tr' ? '0 sn' : '0s'
  }
  const s = Math.round(seconds)
  const isTr = locale === 'tr'
  if (s < 60) return isTr ? `${s} sn` : `${s}s`
  const mins = Math.floor(s / 60)
  const remSec = s % 60
  if (mins < 60) {
    return remSec > 0
      ? isTr ? `${mins} dk ${remSec} sn` : `${mins}m ${remSec}s`
      : isTr ? `${mins} dk` : `${mins}m`
  }
  const hours = Math.floor(mins / 60)
  const remMin = mins % 60
  if (hours < 24) {
    return remMin > 0
      ? isTr ? `${hours} sa ${remMin} dk` : `${hours}h ${remMin}m`
      : isTr ? `${hours} sa` : `${hours}h`
  }
  const days = Math.floor(hours / 24)
  const remHr = hours % 24
  return remHr > 0
    ? isTr ? `${days}g ${remHr}sa` : `${days}d ${remHr}h`
    : isTr ? `${days}g` : `${days}d`
}

export function shortenHash(hash: string | undefined | null, len = 8): string {
  if (!hash) return ''
  if (hash.length <= len * 2 + 3) return hash
  return `${hash.slice(0, len)}...${hash.slice(-len)}`
}

export function formatBytes(bytes: number | undefined | null): string {
  if (!bytes || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function formatHashrate(hps: number | undefined | null): string {
  if (!hps || !Number.isFinite(hps) || hps <= 0) return '0 H/s'
  if (hps < 1e3) return `${hps.toFixed(1)} H/s`
  if (hps < 1e6) return `${(hps / 1e3).toFixed(2)} KH/s`
  if (hps < 1e9) return `${(hps / 1e6).toFixed(2)} MH/s`
  if (hps < 1e12) return `${(hps / 1e9).toFixed(2)} GH/s`
  return `${(hps / 1e12).toFixed(2)} TH/s`
}

export function decodeOpReturnAsm(asm: string | undefined | null): {
  dataHex: string
  utf8Text: string | null
} | null {
  if (!asm || !asm.includes('OP_RETURN')) return null
  const parts = asm.trim().split(/\s+/)
  const idx = parts.indexOf('OP_RETURN')
  if (idx === -1 || idx + 1 >= parts.length) return null
  const hexCandidate = parts.slice(idx + 1).join('')
  if (!/^[0-9a-fA-F]{2,}$/.test(hexCandidate) || hexCandidate.length % 2 !== 0) {
    return { dataHex: hexCandidate, utf8Text: null }
  }

  try {
    const bytes = new Uint8Array(hexCandidate.length / 2)
    for (let i = 0; i < hexCandidate.length; i += 2) {
      bytes[i / 2] = parseInt(hexCandidate.slice(i, i + 2), 16)
    }
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    // Accept only printable text (allow spaces/newlines/tabs)
    const isPrintable = /^[\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]+$/.test(decoded)
    return {
      dataHex: hexCandidate.toLowerCase(),
      utf8Text: isPrintable ? decoded : null
    }
  } catch (_) {
    return {
      dataHex: hexCandidate.toLowerCase(),
      utf8Text: null
    }
  }
}
