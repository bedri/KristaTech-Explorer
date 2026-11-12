import { callRpc, callRpcBatch } from '../utils/rpc'
import { dbGet, dbQuery, dbRun, ensureDb, isBurnAddress, normalizeTaprootAddress } from '../utils/db'

let isSyncing = false
const BATCH_SIZE = 100
const ZERO_COIN_SENTINEL_TXID = '0000000000000000000000000000000000000000000000000000000000000001'

function toSatoshi(amount: number | null | undefined): number {
  return Math.round((amount || 0) * 1e8)
}

function fromSatoshi(sats: number): number {
  return Math.round(sats) / 1e8
}

function extractCltvLockHeight(asm: string | undefined | null): number | null {
  if (!asm) return null
  const m = asm.match(/\b(\d+)\s+OP_CHECKLOCKTIMEVERIFY\b/)
  if (!m || !m[1]) return null
  const val = parseInt(m[1], 10)
  return Number.isFinite(val) ? val : null
}

async function getNextBlockHeightToSync(): Promise<number> {
  const row = await dbGet('SELECT MAX(height) as height FROM blocks')
  if (row && row.height !== null && row.height !== undefined) {
    return row.height + 1
  }
  return 0 // Start from Genesis block (0)
}

/**
 * Atomically rolls back an orphaned block at `height`:
 * - Clears `spent_txid` pointers on any `vout` rows spent by transactions in this block
 * - Deletes `vin`, `vout`, and `transactions` rows belonging to this block
 * - Deletes the `blocks` row at `height`
 */
async function rollbackBlock(height: number): Promise<boolean> {
  try {
    const dbBlock = await dbGet('SELECT hash FROM blocks WHERE height = ?', [height])
    if (!dbBlock) return true

    await dbRun('BEGIN TRANSACTION')

    const txs = await dbQuery('SELECT txid FROM transactions WHERE block_hash = ?', [dbBlock.hash])
    for (const tx of txs) {
      await dbRun('UPDATE vout SET spent_txid = NULL WHERE spent_txid = ?', [tx.txid])
      await dbRun('DELETE FROM vin WHERE txid = ?', [tx.txid])
      await dbRun('DELETE FROM vout WHERE txid = ?', [tx.txid])
    }

    await dbRun('DELETE FROM transactions WHERE block_hash = ?', [dbBlock.hash])
    await dbRun('DELETE FROM blocks WHERE height = ?', [height])

    await dbRun('COMMIT')
    console.log(`[Indexer] Rolled back orphaned block at height ${height} (${dbBlock.hash})`)
    return true
  } catch (err) {
    console.error(`[Indexer] Failed to roll back block at height ${height}:`, err)
    try {
      await dbRun('ROLLBACK')
    } catch (_) {}
    return false
  }
}

async function insertBlockAndTxs(block: any, txMap: Map<string, any>): Promise<void> {
  const height = block.height
  const isPos = block.isProofOfStake ? 1 : 0
  const isPow = block.isProofOfWork ? 1 : 0
  const adamMiners = block.vAdamMiners ? JSON.stringify(block.vAdamMiners) : null
  const adamSolutions = block.vAdamSolutions ? JSON.stringify(block.vAdamSolutions) : null
  const adamVrfProof = block.vAdamVRFProof || null
  const adamCoordinatorSig = block.vAdamCoordinatorSig || null
  const adamCoordinator = block.adamCoordinator || null
  const adamSeatAlgos = block.adamSeatAlgos ? JSON.stringify(block.adamSeatAlgos) : null
  const vQuorumSig = block.vQuorumSig || null
  const adamQuorumSigners = block.adamQuorumSigners ? JSON.stringify(block.adamQuorumSigners) : null

  await dbRun(
    `INSERT OR REPLACE INTO blocks (
      height, hash, difficulty, time, tx_count, size, is_pos, is_pow,
      adam_miners, adam_solutions, adam_vrf_proof, adam_coordinator_sig,
      adam_coordinator, adam_seat_algos, v_quorum_sig, adam_quorum_signers
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      adamCoordinatorSig,
      adamCoordinator,
      adamSeatAlgos,
      vQuorumSig,
      adamQuorumSigners
    ]
  )

  // Special case for Genesis Block (height 0) since its coinbase transaction cannot be fetched via RPC txindex
  if (height === 0) {
    const genesisTxid = block.tx[0]
    await dbRun(
      'INSERT OR REPLACE INTO transactions (txid, block_hash, time, value, fee, is_coinbase, is_coinstake, tx_type) VALUES (?, ?, ?, ?, ?, 1, 0, "coinbase")',
      [genesisTxid, block.hash, block.time, 0, 0]
    )
    await dbRun(
      'INSERT OR REPLACE INTO vout (txid, n, address, amount, spent_txid, script_type, lock_height) VALUES (?, 0, "Genesis", 0, NULL, "genesis", NULL)',
      [genesisTxid]
    )
    await dbRun(
      'INSERT OR REPLACE INTO vin (txid, n, prev_txid, prev_vout, address, amount) VALUES (?, 0, "coinbase", 0, "Coinbase", 0)',
      [genesisTxid]
    )
    return
  }

  for (let txIdx = 0; txIdx < block.tx.length; txIdx++) {
    const txid = block.tx[txIdx]
    const tx = txMap.get(txid) || (await callRpc('getrawtransaction', [txid, 1]))

    let totalVoutSats = 0
    let totalVinSats = 0
    const isCoinbase = tx.vin.length > 0 && !!tx.vin[0].coinbase
    const isCoinstake = isPos === 1 && txIdx === 1

    let hasCoinLock = false
    let hasPowLock = false
    let hasZeroCoinSentinel = false
    let hasBurnOutput = false
    let hasContractOutput = false

    // A. Process outputs (vout)
    for (const out of tx.vout) {
      const outSats = toSatoshi(out.value)
      totalVoutSats += outSats

      let scriptType: string = out.scriptPubKey?.type || 'nonstandard'
      let lockHeight: number | null = null
      let address = 'Nonstandard'

      if (isCoinstake && out.n === 0 && outSats === 0 && scriptType === 'nonstandard') {
        address = 'Coinstake-Marker'
        scriptType = 'coinstake_marker'
      } else if (isPos === 1 && isCoinbase && out.n === 0 && outSats === 0 && scriptType === 'nonstandard') {
        address = 'Coinbase'
        scriptType = 'pos_coinbase_marker'
      } else if (out.scriptPubKey && out.scriptPubKey.addresses && out.scriptPubKey.addresses.length > 0) {
        address = normalizeTaprootAddress(out.scriptPubKey.addresses[0])
      } else if (scriptType === 'nulldata') {
        address = 'OP_RETURN'
      } else if (scriptType === 'pubkey') {
        address = 'Pubkey-output'
      } else if (scriptType === 'mescalcontract') {
        address = 'MESCAL-Contract'
      }

      if (scriptType === 'adam_coinlock') {
        hasCoinLock = true
        lockHeight = extractCltvLockHeight(out.scriptPubKey?.asm)
      } else if (scriptType === 'adam_powlock') {
        hasPowLock = true
        lockHeight = extractCltvLockHeight(out.scriptPubKey?.asm)
      } else if (scriptType === 'mescalcontract' || scriptType === 'witness_v1_taproot') {
        hasContractOutput = true
      }

      if (isBurnAddress(address) && outSats > 0) {
        hasBurnOutput = true
      }

      await dbRun(
        'INSERT OR REPLACE INTO vout (txid, n, address, amount, spent_txid, script_type, lock_height) VALUES (?, ?, ?, ?, NULL, ?, ?)',
        [tx.txid, out.n, address, fromSatoshi(outSats), scriptType, lockHeight]
      )
    }

    // B. Process inputs (vin)
    for (let i = 0; i < tx.vin.length; i++) {
      const vinEntry = tx.vin[i]

      if (vinEntry.coinbase) {
        await dbRun(
          'INSERT OR REPLACE INTO vin (txid, n, prev_txid, prev_vout, address, amount) VALUES (?, ?, "coinbase", 0, "Coinbase", 0)',
          [tx.txid, i]
        )
      } else if (vinEntry.txid === ZERO_COIN_SENTINEL_TXID && vinEntry.vout === 0) {
        hasZeroCoinSentinel = true
        await dbRun(
          'INSERT OR REPLACE INTO vin (txid, n, prev_txid, prev_vout, address, amount) VALUES (?, ?, ?, ?, "Zero-Coin PoW", 0)',
          [tx.txid, i, vinEntry.txid, vinEntry.vout]
        )
      } else {
        const prevTxid = vinEntry.txid
        const prevVout = vinEntry.vout

        const prevOut = await dbGet(
          'SELECT address, amount FROM vout WHERE txid = ? AND n = ?',
          [prevTxid, prevVout]
        )

        if (prevOut) {
          const prevSats = toSatoshi(prevOut.amount)
          await dbRun(
            'INSERT OR REPLACE INTO vin (txid, n, prev_txid, prev_vout, address, amount) VALUES (?, ?, ?, ?, ?, ?)',
            [tx.txid, i, prevTxid, prevVout, prevOut.address, fromSatoshi(prevSats)]
          )

          await dbRun(
            'UPDATE vout SET spent_txid = ? WHERE txid = ? AND n = ?',
            [tx.txid, prevTxid, prevVout]
          )

          totalVinSats += prevSats
        } else {
          await dbRun(
            'INSERT OR REPLACE INTO vin (txid, n, prev_txid, prev_vout, address, amount) VALUES (?, ?, ?, ?, "Unknown", 0)',
            [tx.txid, i, prevTxid, prevVout]
          )
        }
      }
    }

    // C. Calculate fee with exact satoshi arithmetic
    let feeSats = 0
    if (!isCoinbase && !isCoinstake) {
      feeSats = Math.max(0, totalVinSats - totalVoutSats)
    }

    // D. Classify transaction type
    let txType = 'standard'
    if (isCoinbase) txType = 'coinbase'
    else if (isCoinstake) txType = 'coinstake'
    else if (hasCoinLock) txType = 'coin_lock'
    else if (hasZeroCoinSentinel) txType = 'zerocoin_pow'
    else if (hasPowLock) txType = 'pow_lock'
    else if (hasBurnOutput) txType = 'burn'
    else if (hasContractOutput) txType = 'contract'

    // E. Insert Transaction record
    await dbRun(
      'INSERT OR REPLACE INTO transactions (txid, block_hash, time, value, fee, is_coinbase, is_coinstake, tx_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        tx.txid,
        block.hash,
        block.time,
        fromSatoshi(totalVoutSats),
        fromSatoshi(feeSats),
        isCoinbase ? 1 : 0,
        isCoinstake ? 1 : 0,
        txType
      ]
    )
  }
}

async function syncBatch(startHeight: number, endHeight: number): Promise<boolean> {
  try {
    const heights: number[] = []
    for (let h = startHeight; h <= endHeight; h++) {
      heights.push(h)
    }

    // 1. Batch fetch block hashes
    const blockHashes = await callRpcBatch(
      heights.map((h) => ({ method: 'getblockhash', params: [h] }))
    )

    // 2. Batch fetch block objects
    const blocks = await callRpcBatch(
      blockHashes.map((hash) => ({ method: 'getblock', params: [hash, true] }))
    )

    if (!blocks || blocks.length === 0) return false

    // Verify parent linkage at batch boundary and within batch to catch mid-sync reorgs
    if (startHeight > 0 && blocks[0]?.previousblockhash) {
      const prevDbBlock = await dbGet('SELECT hash FROM blocks WHERE height = ?', [startHeight - 1])
      if (prevDbBlock && prevDbBlock.hash !== blocks[0].previousblockhash) {
        console.warn(
          `[Indexer] Parent hash mismatch at height ${startHeight} (DB prev=${prevDbBlock.hash}, block.previousblockhash=${blocks[0].previousblockhash}). Rolling back height ${startHeight - 1}...`
        )
        await rollbackBlock(startHeight - 1)
        return false
      }
    }
    for (let i = 1; i < blocks.length; i++) {
      if (blocks[i]?.previousblockhash && blocks[i].previousblockhash !== blocks[i - 1]?.hash) {
        console.warn(`[Indexer] Mid-batch reorg detected between heights ${blocks[i - 1]?.height} and ${blocks[i]?.height}. Retrying...`)
        return false
      }
    }

    // 3. Collect all non-genesis transaction IDs and batch fetch raw transactions
    const txidsToFetch: string[] = []
    for (const block of blocks) {
      if (block.height === 0) continue
      for (const txid of block.tx) {
        txidsToFetch.push(txid)
      }
    }

    const txMap = new Map<string, any>()
    if (txidsToFetch.length > 0) {
      const rawTxs = await callRpcBatch(
        txidsToFetch.map((txid) => ({ method: 'getrawtransaction', params: [txid, 1] }))
      )
      for (const tx of rawTxs) {
        if (tx && tx.txid) {
          txMap.set(tx.txid, tx)
        }
      }
    }

    // 4. Write all blocks and transactions in a single atomic SQLite transaction
    await dbRun('BEGIN TRANSACTION')
    for (const block of blocks) {
      await insertBlockAndTxs(block, txMap)
    }
    await dbRun('COMMIT')
    return true
  } catch (err) {
    console.error(`[Indexer] Error syncing batch ${startHeight}-${endHeight}:`, err)
    try {
      await dbRun('ROLLBACK')
    } catch (_) {}
    return false
  }
}

async function checkAndHandleReorg(targetMaxHeight: number): Promise<void> {
  const row = await dbGet('SELECT height, hash FROM blocks ORDER BY height DESC LIMIT 1')
  if (!row || row.height === null || row.height === undefined) return

  // If node height is lower than indexed height (e.g. chain reset), wipe and resync
  if (row.height > targetMaxHeight) {
    console.warn(`[Indexer] Node height (${targetMaxHeight}) is lower than indexed height (${row.height}). Resetting database...`)
    await dbRun('BEGIN TRANSACTION')
    await dbRun('DELETE FROM vin')
    await dbRun('DELETE FROM vout')
    await dbRun('DELETE FROM transactions')
    await dbRun('DELETE FROM blocks')
    await dbRun('COMMIT')
    return
  }

  // Verify tip hash matches node's block hash at that height
  const nodeHashAtTip = await callRpc('getblockhash', [row.height])
  if (nodeHashAtTip !== row.hash) {
    // Check if even genesis changed (full chain replacement)
    const genesisRow = await dbGet('SELECT hash FROM blocks WHERE height = 0')
    const nodeGenesisHash = await callRpc('getblockhash', [0])
    if (genesisRow && genesisRow.hash !== nodeGenesisHash) {
      console.warn('[Indexer] Genesis block hash changed. Resetting database...')
      await dbRun('BEGIN TRANSACTION')
      await dbRun('DELETE FROM vin')
      await dbRun('DELETE FROM vout')
      await dbRun('DELETE FROM transactions')
      await dbRun('DELETE FROM blocks')
      await dbRun('COMMIT')
      return
    }

    // Otherwise walk backwards to find the fork point and cleanly revert UTXO state
    let forkHeight = row.height
    while (forkHeight > 0) {
      const dbBlock = await dbGet('SELECT hash FROM blocks WHERE height = ?', [forkHeight])
      const chainHash = await callRpc('getblockhash', [forkHeight])
      if (dbBlock && dbBlock.hash === chainHash) {
        break
      }
      await rollbackBlock(forkHeight)
      forkHeight--
    }
    console.warn(`[Indexer] Reorg handled, rolled back to height ${forkHeight}`)
  }
}

async function syncLoop() {
  if (isSyncing) return
  isSyncing = true

  try {
    await ensureDb()
    const nodeInfo = await callRpc('getblockchaininfo')
    const targetMaxHeight = nodeInfo.blocks

    await checkAndHandleReorg(targetMaxHeight)

    let nextHeightToSync = await getNextBlockHeightToSync()

    if (nextHeightToSync <= targetMaxHeight) {
      console.log(`[Indexer] Catching up from block ${nextHeightToSync} to ${targetMaxHeight}...`)

      while (nextHeightToSync <= targetMaxHeight) {
        const endHeight = Math.min(nextHeightToSync + BATCH_SIZE - 1, targetMaxHeight)
        const success = await syncBatch(nextHeightToSync, endHeight)
        if (!success) {
          const updatedNext = await getNextBlockHeightToSync()
          if (updatedNext < nextHeightToSync) {
            await checkAndHandleReorg(targetMaxHeight)
            nextHeightToSync = await getNextBlockHeightToSync()
            continue
          }
          console.warn(`[Indexer] Failed to sync blocks ${nextHeightToSync}-${endHeight}. Retrying later...`)
          break
        }
        nextHeightToSync = endHeight + 1
      }
      console.log(`[Indexer] Synced up to block ${nextHeightToSync - 1}`)
    }
  } catch (err) {
    console.error('[Indexer] Sync loop error:', err)
  } finally {
    isSyncing = false
    setTimeout(syncLoop, 5000)
  }
}

export default defineNitroPlugin(() => {
  console.log('[Indexer] Initializing background syncing plugin...')
  setTimeout(syncLoop, 1000)
})
