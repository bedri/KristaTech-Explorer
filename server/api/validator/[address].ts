import { dbGet, dbQuery, normalizeTaprootAddress } from '../../utils/db'
import {
  apiError,
  BoundedTtlCache,
  fromSatoshi,
  isValidAddressParam,
  isValidBlsPubkey,
  isValidCompressedPubkey,
  setCacheControl,
  toSatoshi
} from '../../utils/api'
import { computeValidatorWindowStats } from '../../utils/validatorStats'
import { getValidatorPoolData } from '../validators'

const validatorDetailCache = new BoundedTtlCache<any>(10_000, 200)

export default defineEventHandler(async (event) => {
  const rawParam = decodeURIComponent((event.context.params?.address || '').trim())
  const query = getQuery(event)
  const parsedWindow = parseInt(String(query.window ?? '200'), 10)
  const windowSize = Math.min(
    1000,
    Math.max(10, Number.isFinite(parsedWindow) && parsedWindow > 0 ? parsedWindow : 200)
  )

  const isSecpPubkey = isValidCompressedPubkey(rawParam)
  const isBlsPubkey = isValidBlsPubkey(rawParam)
  const isPubkey = isSecpPubkey || isBlsPubkey
  const normalizedAddr = isPubkey ? '' : normalizeTaprootAddress(rawParam)

  if (!isPubkey && !isValidAddressParam(normalizedAddr)) {
    return apiError(
      event,
      400,
      'Invalid validator address, 66-hex secp256k1 pubkey, or 96-hex BLS12-381 operator pubkey format',
      'INVALID_VALIDATOR_ID'
    )
  }

  try {
    setCacheControl(event, 10, 15)
    const pool = await getValidatorPoolData()

    let resolvedAddress = normalizedAddr
    if (isPubkey) {
      const lowerPub = rawParam.toLowerCase()
      const valMatch = (pool.validators || []).find(
        (v: any) => String(v.pubkey || '').toLowerCase() === lowerPub
      )
      const qMatch = (pool.quorum?.members || []).find(
        (m: any) => String(m.pubkey || '').toLowerCase() === lowerPub
      )
      const mnMatch = (pool.masternodes || []).find(
        (m: any) =>
          String(m.operatorPubKey || m.pubkey || '').toLowerCase() === lowerPub
      )
      resolvedAddress =
        valMatch?.address ||
        qMatch?.addr ||
        mnMatch?.ownerAddress ||
        mnMatch?.addr ||
        ''
      if (!resolvedAddress) {
        return apiError(
          event,
          404,
          'Validator public key not found in active pool, quorum, or masternodes',
          'VALIDATOR_NOT_FOUND'
        )
      }
    }

    const cacheKey = `${resolvedAddress}:${windowSize}`
    return await validatorDetailCache.getOrLoad(cacheKey, async () => {
      const heightRow = await dbGet('SELECT MAX(height) as height FROM blocks')
      const currentHeight = heightRow?.height ?? pool.height ?? 0
      const minHeight = Math.max(0, currentHeight - windowSize + 1)

      const blockRows = await dbQuery(
        `SELECT height, hash, time, is_pos, adam_miners, adam_solutions,
                adam_coordinator, producer_address, adam_quorum_signers
         FROM blocks
         WHERE height >= ?
         ORDER BY height DESC
         LIMIT ?`,
        [minHeight, windowSize]
      )

      const performance = computeValidatorWindowStats(resolvedAddress, blockRows)

      const rewardRow = await dbGet(
        `SELECT COALESCE(SUM(v.amount), 0) as total_reward, COUNT(DISTINCT t.txid) as reward_txs
         FROM vout v
         JOIN transactions t ON v.txid = t.txid
         JOIN blocks b ON t.block_hash = b.hash
         WHERE v.address = ?
           AND (t.is_coinbase = 1 OR t.is_coinstake = 1)
           AND b.height >= ?`,
        [resolvedAddress, minHeight]
      )

      const lockedRow = await dbGet(
        `SELECT COALESCE(SUM(amount), 0) as total, MAX(lock_height) as max_lock_height
         FROM vout
         WHERE address = ?
           AND spent_txid IS NULL
           AND script_type IN ('adam_coinlock', 'adam_powlock', 'cltv_timelock')
           AND (lock_height IS NULL OR lock_height > ?)`,
        [resolvedAddress, currentHeight]
      )

      const poolEntries = (pool.validators || []).filter(
        (v: any) => v.address === resolvedAddress
      )
      const masternodeEntry =
        (pool.masternodes || []).find(
          (m: any) =>
            m.ownerAddress === resolvedAddress ||
            m.payoutAddress === resolvedAddress ||
            m.addr === resolvedAddress
        ) || null
      const quorumMember =
        (pool.quorum?.members || []).find((m: any) => m.addr === resolvedAddress) || null

      return {
        success: true,
        address: resolvedAddress,
        currentHeight,
        window: windowSize,
        windowStartHeight: minHeight,
        isActiveValidator: poolEntries.length > 0,
        isActiveMasternode: Boolean(masternodeEntry),
        inActiveQuorum: Boolean(quorumMember),
        lockedCollateral: fromSatoshi(toSatoshi(lockedRow?.total)),
        maxLockHeight: lockedRow?.max_lock_height || null,
        unlockBlocksRemaining: lockedRow?.max_lock_height
          ? Math.max(0, lockedRow.max_lock_height - currentHeight)
          : 0,
        poolEntries,
        masternodeEntry,
        quorumMember,
        coordinatorVrf: pool.coordinatorVrf,
        estimatedRewardsInWindow: fromSatoshi(toSatoshi(rewardRow?.total_reward)),
        rewardTxCountInWindow: rewardRow?.reward_txs || 0,
        performance
      }
    })
  } catch (err: any) {
    console.error(`[API /validator/${rawParam}] Error:`, err?.message || err)
    return apiError(event, 500, 'Failed to compute validator analytics', 'VALIDATOR_ANALYTICS_FAILED')
  }
})
