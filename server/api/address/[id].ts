import { dbGet, dbQuery } from '../../utils/db'

const SPECIAL_ADDRESS_LABELS = new Set(['Genesis', 'Coinbase', 'Nonstandard', 'Pubkey-output'])

function isValidAddressParam(addr: string): boolean {
  if (SPECIAL_ADDRESS_LABELS.has(addr)) return true
  return /^[1-9A-HJ-NP-Za-km-z]{33,36}$/.test(addr)
}

function toSatoshi(amount: number | null | undefined): number {
  return Math.round((amount || 0) * 1e8)
}

function fromSatoshi(sats: number): number {
  return Math.round(sats) / 1e8
}

export default defineEventHandler(async (event) => {
  const address = (event.context.params?.id || '').trim()

  if (!isValidAddressParam(address)) {
    setResponseStatus(event, 400)
    return {
      success: false,
      error: 'Invalid wallet address format'
    }
  }

  const query = getQuery(event)
  const page = Math.max(1, parseInt((query.page as string) || '1', 10) || 1)
  const limit = Math.min(100, Math.max(10, parseInt((query.limit as string) || '50', 10) || 50))
  const offset = (page - 1) * limit

  try {
    // 1. Calculate received, sent, and net balance using satoshi integer arithmetic
    const receivedRow = await dbGet('SELECT SUM(amount) as total FROM vout WHERE address = ?', [address])
    const sentRow = await dbGet('SELECT SUM(amount) as total FROM vin WHERE address = ?', [address])

    const receivedSats = toSatoshi(receivedRow?.total)
    const sentSats = toSatoshi(sentRow?.total)
    const balanceSats = Math.max(0, receivedSats - sentSats)

    const totalReceived = fromSatoshi(receivedSats)
    const totalSent = fromSatoshi(sentSats)
    const balance = fromSatoshi(balanceSats)

    // 2. Get true total distinct transaction count for this address
    const countRow = await dbGet(
      `
      SELECT COUNT(*) as count FROM (
        SELECT txid FROM vout WHERE address = ?
        UNION
        SELECT txid FROM vin WHERE address = ?
      )
    `,
      [address, address]
    )
    const txCount = countRow?.count || 0
    const totalPages = Math.max(1, Math.ceil(txCount / limit))

    // 3. Fetch paginated transactions involving this address
    const rawTransactions = await dbQuery(
      `
      SELECT txid, SUM(received) as received, SUM(sent) as sent, time FROM (
        SELECT v.txid, v.amount as received, 0 as sent, t.time 
        FROM vout v
        JOIN transactions t ON v.txid = t.txid
        WHERE v.address = ?
        
        UNION ALL
        
        SELECT v.txid, 0 as received, v.amount as sent, t.time 
        FROM vin v
        JOIN transactions t ON v.txid = t.txid
        WHERE v.address = ?
      ) 
      GROUP BY txid 
      ORDER BY time DESC 
      LIMIT ? OFFSET ?
    `,
      [address, address, limit, offset]
    )

    const transactions = rawTransactions.map((tx: any) => ({
      txid: tx.txid,
      received: fromSatoshi(toSatoshi(tx.received)),
      sent: fromSatoshi(toSatoshi(tx.sent)),
      time: tx.time
    }))

    return {
      success: true,
      address,
      balance,
      totalReceived,
      totalSent,
      txCount,
      page,
      limit,
      totalPages,
      transactions
    }
  } catch (err: any) {
    console.error(`[API /address/${address}] Error:`, err.message || err)
    setResponseStatus(event, 500)
    return {
      success: false,
      error: 'Failed to fetch address details'
    }
  }
})
