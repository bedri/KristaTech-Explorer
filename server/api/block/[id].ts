import { callRpc } from '../../utils/rpc'
import { dbGet, dbQuery, isBurnAddress, TREASURY_ADDRESS } from '../../utils/db'
import { getValidatorPoolData } from '../validators'
import { calculateBlockSubsidy } from '../../../app/utils/protocol'

function normalizeAmount(val: number | null | undefined): number {
  return Math.round((val || 0) * 1e8) / 1e8
}

function classifyRewardOutput(
  out: any,
  block: any,
  solvedCommitteeAddrs: Set<string>,
  llmqSignerAddrs: Set<string>
): string {
  const addr = out.address || ''
  if (isBurnAddress(addr)) return 'protocol_burn'
  if (addr === TREASURY_ADDRESS) return 'treasury'

  if (block.height >= 2200) {
    if ((!block.isProofOfStake && out.n === 0) || (block.isProofOfStake && out.n === 1)) {
      return 'producer'
    }
    if (block.adamCoordinator && addr === block.adamCoordinator && out.n <= 2) {
      return 'producer'
    }
    if (llmqSignerAddrs.has(addr)) {
      return 'llmq'
    }
    if (solvedCommitteeAddrs.has(addr)) {
      return 'committee'
    }
    return 'masternode'
  }

  if (block.height >= 200) {
    if ((!block.isProofOfStake && out.n === 0) || (block.isProofOfStake && out.n === 1)) {
      return 'producer'
    }
    if (block.adamCoordinator && addr === block.adamCoordinator && out.n <= 2) {
      return 'producer'
    }
    if (solvedCommitteeAddrs.has(addr)) {
      return 'committee'
    }
  }

  return 'miner_reward'
}

export default defineEventHandler(async (event) => {
  const idStr = (event.context.params?.id || '').trim()
  const isHeight = /^\d{1,9}$/.test(idStr)
  const isHash = /^[0-9a-fA-F]{64}$/.test(idStr)

  if (!isHeight && !isHash) {
    setResponseStatus(event, 400)
    return {
      success: false,
      error: 'Invalid block height or hash format'
    }
  }

  try {
    let blockHash = idStr.toLowerCase()

    // 1. If dynamic parameter is height, resolve hash
    if (isHeight) {
      const height = parseInt(idStr, 10)
      const dbBlock = await dbGet('SELECT hash FROM blocks WHERE height = ?', [height])
      if (dbBlock) {
        blockHash = dbBlock.hash
      } else {
        blockHash = await callRpc('getblockhash', [height])
      }
    }

    // 2. Query node for the block details
    const block = await callRpc('getblock', [blockHash, true])
    const dbMeta = await dbGet(
      'SELECT producer_address, reward FROM blocks WHERE hash = ?',
      [blockHash]
    )

    // Compute deltaTime against parent block
    let deltaTime: number | null = null
    if (block.height > 0) {
      const prevRow = await dbGet('SELECT time FROM blocks WHERE height = ?', [block.height - 1])
      if (prevRow && typeof prevRow.time === 'number') {
        deltaTime = Math.max(0, (block.time || 0) - prevRow.time)
      }
    }

    // 3. Query local indexed transactions for this block
    const rawTransactions = await dbQuery(
      'SELECT txid, time, value, fee, is_coinbase, is_coinstake, tx_type FROM transactions WHERE block_hash = ?',
      [blockHash]
    )

    let totalFeesSats = 0
    const transactions = (rawTransactions || []).map((tx: any) => {
      const feeNorm = normalizeAmount(tx.fee)
      if (!tx.is_coinbase && !tx.is_coinstake) {
        totalFeesSats += Math.round(feeNorm * 1e8)
      }
      return {
        ...tx,
        value: normalizeAmount(tx.value),
        fee: feeNorm,
        isCoinbase: Boolean(tx.is_coinbase),
        isCoinstake: Boolean(tx.is_coinstake),
        txType: tx.tx_type || 'standard'
      }
    })

    // Map active validator tracks onto committee seats if available
    const validatorTracks: Record<string, string> = {}
    try {
      const pool = await getValidatorPoolData()
      for (const v of pool.validators || []) {
        if (v.address && !validatorTracks[v.address]) {
          validatorTracks[v.address] = v.track
        }
      }
    } catch (_) {}

    // 4. Build reward distribution breakdown from the reward transaction
    let rewardOutputs: any[] = []
    if (block.height > 0 && Array.isArray(block.tx) && block.tx.length > 0) {
      const rewardTxid = block.isProofOfStake && block.tx.length > 1 ? block.tx[1] : block.tx[0]
      const rawRewardOuts = await dbQuery(
        'SELECT n, address, amount, script_type FROM vout WHERE txid = ? ORDER BY n ASC',
        [rewardTxid]
      )

      const solvedCommitteeAddrs = new Set<string>()
      if (Array.isArray(block.vAdamMiners) && Array.isArray(block.vAdamSolutions)) {
        const seatCount =
          block.vAdamMiners.length === block.vAdamSolutions.length + 1
            ? block.vAdamSolutions.length
            : block.vAdamMiners.length
        for (let i = 0; i < seatCount; i++) {
          const sol = block.vAdamSolutions[i]
          if (sol && String(sol).length > 0 && block.vAdamMiners[i]) {
            solvedCommitteeAddrs.add(block.vAdamMiners[i])
          }
        }
      }

      const llmqSignerAddrs = new Set<string>(
        Array.isArray(block.adamQuorumSigners?.signers) ? block.adamQuorumSigners.signers : []
      )

      rewardOutputs = (rawRewardOuts || [])
        .filter((o: any) => (o.amount || 0) > 0)
        .map((o: any) => ({
          n: o.n,
          address: o.address,
          amount: normalizeAmount(o.amount),
          role: classifyRewardOutput(o, block, solvedCommitteeAddrs, llmqSignerAddrs)
        }))
    }

    const totalFees = Math.round(totalFeesSats) / 1e8
    const subsidy = calculateBlockSubsidy(block.height)
    const blockReward = normalizeAmount(dbMeta?.reward || subsidy)

    return {
      success: true,
      block: {
        hash: block.hash,
        confirmations: block.confirmations,
        size: block.size,
        height: block.height,
        version: block.version,
        merkleroot: block.merkleroot,
        time: block.time,
        deltaTime,
        nonce: block.nonce ?? 0,
        bits: block.bits || '',
        chainwork: block.chainwork || '',
        difficulty: block.difficulty,
        previousblockhash: block.previousblockhash,
        nextblockhash: block.nextblockhash,
        tx_count: block.tx.length,
        is_pos: block.isProofOfStake,
        is_pow: block.isProofOfWork,
        producerAddress: dbMeta?.producer_address || block.adamCoordinator || null,
        reward: blockReward,
        subsidy,
        totalFees,
        vAdamMiners: block.vAdamMiners || null,
        vAdamSolutions: block.vAdamSolutions || null,
        vAdamVRFProof: block.vAdamVRFProof || null,
        vAdamCoordinatorSig: block.vAdamCoordinatorSig || null,
        adamCoordinator: block.adamCoordinator || null,
        adamSeatAlgos: block.adamSeatAlgos || null,
        vQuorumSig: block.vQuorumSig || null,
        adamQuorumSigners: block.adamQuorumSigners || null,
        validatorTracks,
        rewardOutputs
      },
      rawBlock: block,
      transactions
    }
  } catch (err: any) {
    console.error(`[API /block/${idStr}] Error:`, err.message || err)
    setResponseStatus(event, 404)
    return {
      success: false,
      error: 'Block not found'
    }
  }
})
