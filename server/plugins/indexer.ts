import { callRpc } from '../utils/rpc'
import { dbGet, dbRun } from '../utils/db'

let isSyncing = false

async function getNextBlockHeightToSync(): Promise<number> {
  const row = await dbGet('SELECT MAX(height) as height FROM blocks')
  if (row && row.height !== null) {
    return row.height + 1
  }
  return 0 // Start from Genesis block (0)
}

async function syncBlock(height: number): Promise<boolean> {
  try {
    const blockHash = await callRpc('getblockhash', [height])
    const block = await callRpc('getblock', [blockHash, true])

    // Start SQL Transaction to ensure atomicity
    await dbRun('BEGIN TRANSACTION')

    // 1. Insert Block headers
    const isPos = block.isProofOfStake ? 1 : 0
    const isPow = block.isProofOfWork ? 1 : 0
    const adamMiners = block.vAdamMiners ? JSON.stringify(block.vAdamMiners) : null
    const adamSolutions = block.vAdamSolutions ? JSON.stringify(block.vAdamSolutions) : null
    const adamVrfProof = block.vAdamVRFProof || null
    const adamCoordinatorSig = block.vAdamCoordinatorSig || null

    await dbRun(
      'INSERT OR REPLACE INTO blocks (height, hash, difficulty, time, tx_count, size, is_pos, is_pow, adam_miners, adam_solutions, adam_vrf_proof, adam_coordinator_sig) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        block.height,
        block.hash,
        block.difficulty,
        block.time,
        block.tx.length,
        block.size,
        isPos,
        isPow,
        adamMiners,
        adamSolutions,
        adamVrfProof,
        adamCoordinatorSig
      ]
    )

    // Special case for Genesis Block (height 0) since its coinbase transaction cannot be fetched via RPC txindex
    if (height === 0) {
      const genesisTxid = block.tx[0]
      await dbRun(
        'INSERT OR REPLACE INTO transactions (txid, block_hash, time, value, fee) VALUES (?, ?, ?, ?, ?)',
        [genesisTxid, block.hash, block.time, 0, 0]
      )
      await dbRun(
        'INSERT OR REPLACE INTO vout (txid, n, address, amount, spent_txid) VALUES (?, 0, "Genesis", 0, NULL)',
        [genesisTxid]
      )
      await dbRun(
        'INSERT OR REPLACE INTO vin (txid, n, prev_txid, prev_vout, address, amount) VALUES (?, 0, "coinbase", 0, "Coinbase", 0)',
        [genesisTxid]
      )
      await dbRun('COMMIT')
      return true
    }

    // 2. Process transactions
    for (const txid of block.tx) {
      const tx = await callRpc('getrawtransaction', [txid, 1])

      let totalVoutValue = 0
      let totalVinValue = 0
      const isCoinbase = tx.vin.length > 0 && !!tx.vin[0].coinbase

      // A. Process outputs (vout)
      for (const out of tx.vout) {
        totalVoutValue += out.value
        let address = 'Nonstandard'

        if (out.scriptPubKey && out.scriptPubKey.addresses && out.scriptPubKey.addresses.length > 0) {
          address = out.scriptPubKey.addresses[0]
        } else if (out.scriptPubKey && out.scriptPubKey.type === 'pubkey') {
          // Some outputs are direct pay-to-pubkey and don't list addresses directly
          // We can parse or display Type or N/A
          address = 'Pubkey-output'
        }

        await dbRun(
          'INSERT OR REPLACE INTO vout (txid, n, address, amount, spent_txid) VALUES (?, ?, ?, ?, NULL)',
          [tx.txid, out.n, address, out.value]
        )
      }

      // B. Process inputs (vin)
      for (let i = 0; i < tx.vin.length; i++) {
        const vinEntry = tx.vin[i]

        if (vinEntry.coinbase) {
          // Coinbase transaction input
          await dbRun(
            'INSERT OR REPLACE INTO vin (txid, n, prev_txid, prev_vout, address, amount) VALUES (?, ?, "coinbase", 0, "Coinbase", 0)',
            [tx.txid, i]
          )
        } else {
          // Standard input spending a previous output
          const prevTxid = vinEntry.txid
          const prevVout = vinEntry.vout

          // Look up previous output in our database to get address and amount
          const prevOut = await dbGet(
            'SELECT address, amount FROM vout WHERE txid = ? AND n = ?',
            [prevTxid, prevVout]
          )

          if (prevOut) {
            await dbRun(
              'INSERT OR REPLACE INTO vin (txid, n, prev_txid, prev_vout, address, amount) VALUES (?, ?, ?, ?, ?, ?)',
              [tx.txid, i, prevTxid, prevVout, prevOut.address, prevOut.amount]
            )

            // Mark previous output as spent by this transaction
            await dbRun(
              'UPDATE vout SET spent_txid = ? WHERE txid = ? AND n = ?',
              [tx.txid, prevTxid, prevVout]
            )

            totalVinValue += prevOut.amount
          } else {
            // Fallback if previous output was not indexed (should not happen since we start from 0)
            await dbRun(
              'INSERT OR REPLACE INTO vin (txid, n, prev_txid, prev_vout, address, amount) VALUES (?, ?, ?, ?, "Unknown", 0)',
              [tx.txid, i, prevTxid, prevVout]
            )
          }
        }
      }

      // C. Calculate fee
      let fee = 0
      if (!isCoinbase) {
        fee = totalVinValue - totalVoutValue
        if (fee < 0) fee = 0 // Safeguard
      }

      // D. Insert Transaction record
      await dbRun(
        'INSERT OR REPLACE INTO transactions (txid, block_hash, time, value, fee) VALUES (?, ?, ?, ?, ?)',
        [tx.txid, block.hash, block.time, totalVoutValue, fee]
      )
    }

    // Commit Transaction
    await dbRun('COMMIT')
    return true
  } catch (err) {
    console.error(`Error syncing block ${height}:`, err)
    try {
      await dbRun('ROLLBACK')
    } catch (_) {}
    return false
  }
}

async function syncLoop() {
  if (isSyncing) return
  isSyncing = true

  try {
    const nodeInfo = await callRpc('getblockchaininfo')
    const targetMaxHeight = nodeInfo.blocks

    let nextHeightToSync = await getNextBlockHeightToSync()

    if (nextHeightToSync <= targetMaxHeight) {
      console.log(`[Indexer] Catching up from block ${nextHeightToSync} to ${targetMaxHeight}...`)
      
      while (nextHeightToSync <= targetMaxHeight) {
        const success = await syncBlock(nextHeightToSync)
        if (!success) {
          console.warn(`[Indexer] Failed to sync block ${nextHeightToSync}. Retrying later...`)
          break;
        }
        nextHeightToSync++
      }
      console.log(`[Indexer] Synced up to block ${nextHeightToSync - 1}`)
    }
  } catch (err) {
    console.error('[Indexer] Sync loop error:', err)
  } finally {
    isSyncing = false
    // Poll again after 10 seconds if caught up, or immediately (50ms) if there are blocks remaining
    setTimeout(syncLoop, 10000)
  }
}

export default defineNitroPlugin((nitroApp) => {
  console.log('[Indexer] Initializing background syncing plugin...')
  // Start the sync loop after a short delay to allow Nitro server to fully boot
  setTimeout(syncLoop, 3000)
})
