export function formatCoins(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return '0.00 KRISTA'
  const normalized = Math.round(amount * 1e8) / 1e8
  return (
    new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8
    }).format(normalized) + ' KRISTA'
  )
}

export function formatDate(timestamp: number | undefined | null): string {
  if (!timestamp) return 'N/A'
  const d = new Date(timestamp * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`
}

export function shortenHash(hash: string | undefined | null, len = 8): string {
  if (!hash) return ''
  if (hash.length <= len * 2) return hash
  return `${hash.slice(0, len)}...${hash.slice(-len)}`
}

export function formatBytes(bytes: number | undefined | null): string {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  return (bytes / 1024).toFixed(2) + ' KB'
}
