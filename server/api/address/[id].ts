import { dbGet, dbQuery } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const address = event.context.params?.id || ''

  try {
    // 1. Calculate received, sent, and net balance
    const receivedRow = await dbGet('SELECT SUM(amount) as total FROM vout WHERE address = ?', [address])
    const sentRow = await dbGet('SELECT SUM(amount) as total FROM vin WHERE address = ?', [address])

    const totalReceived = receivedRow?.total || 0
    const totalSent = sentRow?.total || 0
    const balance = totalReceived - totalSent

    // 2. Fetch recent transactions involving this address
    const transactions = await dbQuery(`
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
      LIMIT 100
    `, [address, address])

    return {
      success: true,
      address,
      balance,
      totalReceived,
      totalSent,
      txCount: transactions.length,
      transactions
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message || `Failed to fetch address ${address}`
    }
  }
})
