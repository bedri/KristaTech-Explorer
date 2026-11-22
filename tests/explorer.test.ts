import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  calculateBlockSubsidy,
  calculateTotalSupply,
  buildConsensusInfo,
  calculateModelDSplits,
  calculateCoordinatorWeights,
  getDynamicLlmqSpec,
  classifyBlockRewardOutputs,
  detectSearchQueryType,
  maskPeerAddr
} from '../app/utils/protocol.ts'
import {
  formatCoins,
  formatNumber,
  formatDate,
  formatRelativeTime,
  formatDurationSeconds,
  shortenHash,
  formatBytes,
  formatHashrate,
  decodeOpReturnAsm
} from '../app/utils/formatters.ts'
import { generateQrMatrix } from '../app/utils/qr.ts'
import {
  isBurnAddress,
  normalizeTaprootAddress,
  BURN_ADDRESSES,
  TREASURY_ADDRESS
} from '../server/utils/db.ts'
import {
  ALLOWED_RPC_METHODS,
  assertAllowedRpcMethod,
  isTxBroadcastEnabled,
  MAX_RAW_TX_HEX_LENGTH,
  validateRawTxHex
} from '../server/utils/rpc.ts'
import {
  BoundedTtlCache,
  isValidAddressParam,
  isValidCompressedPubkey,
  isValidTxid,
  parsePagination
} from '../server/utils/api.ts'
import { computeFeeEstimates } from '../server/utils/fees.ts'
import { computeValidatorWindowStats } from '../server/utils/validatorStats.ts'
import {
  parseTopicsParam,
  publishExplorerEvent,
  registerSseClient,
  resetSseHubForTests
} from '../server/utils/events.ts'
import { buildOpenApiSpec } from '../server/utils/openapi.ts'
import { explorerTranslations, translateKey } from '../app/composables/useI18n.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')

function listFilesRecursive(dir: string, ext: string): string[] {
  const out: string[] = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(full, ext))
    } else if (entry.isFile() && full.endsWith(ext)) {
      out.push(full)
    }
  }
  return out
}

describe('KristaTech Protocol & Tokenomics Math (v1.5.9.0 / 70983)', () => {
  it('computes exact C++ CMasternode::GetBlockValue subsidy schedule', () => {
    assert.equal(calculateBlockSubsidy(0), 0)
    assert.equal(calculateBlockSubsidy(1), 0)
    assert.equal(calculateBlockSubsidy(2), 17)
    assert.equal(calculateBlockSubsidy(4800), 17)
    assert.equal(calculateBlockSubsidy(5000), 17)
    assert.equal(calculateBlockSubsidy(259201), 17)
    // First quarterly 2.15% geometric decay at height 2 + 259,200 = 259,202: 17 * 0.9785 = 16.6345
    assert.equal(calculateBlockSubsidy(259202), 16.6345)
  })

  it('computes exact cumulative theoretical block supply across all epochs', () => {
    assert.equal(calculateTotalSupply(0), 0)
    assert.equal(calculateTotalSupply(1), 0)
    // Block 2..4800 = 4,799 blocks * 17 = 81,583 KRISTA
    assert.equal(calculateTotalSupply(4800), 81583)
    // Block 2..5000 = 4,999 blocks * 17 = 84,983 KRISTA
    assert.equal(calculateTotalSupply(5000), 84983)
    // Period 0 (Blocks 2..259201 = 259,200 blocks * 17) = 4,406,400 KRISTA
    assert.equal(calculateTotalSupply(259201), 4406400)
    // Block 259202 adds Period 1 reward 16.6345 -> 4,406,416.6345 KRISTA
    assert.equal(calculateTotalSupply(259202), 4406416.6345)
  })

  it('computes exact UPGRADE_FAIRNESS Model D & Pre-Model D splits (Equal-Pay & Dynamic LLMQ)', () => {
    // At Block 5000, gross subsidy is 17 KRISTA, 7% treasury = 1.19, 93% net = 15.81
    const split5000 = calculateModelDSplits(5000)
    assert.equal(split5000.subsidy, 17)
    assert.equal(split5000.treasury, 1.19)
    assert.equal(split5000.netPool, 15.81)
    assert.equal(split5000.passiveMn, 5.5335) // 35% of 15.81
    assert.equal(split5000.committeeTotal, 6.324) // 40% of 15.81
    assert.equal(split5000.producer, 2.3715) // 15% of 15.81 (PoW)
    assert.equal(split5000.posStaker, 1.8972) // 12% of 15.81 (PoS Staker)
    assert.equal(split5000.posCoordinator, 0.4743) // 3% of 15.81 (PoS Signing Coordinator)
    assert.equal(split5000.llmqTotal, 1.581) // 10% of 15.81
    assert.equal(split5000.llmqQuorumSize, 5)
    assert.equal(split5000.llmqPerSigner, 0.3162) // 15.81 * 10% / 5 signers
    assert.equal(split5000.committeeSeatEach, 0.57490909) // Equal Work -> Equal Pay (40% / 11)
    assert.equal(split5000.mnSeatEach, 0.57490909)
    assert.equal(split5000.coinLockSeat, 0.57490909)
    assert.equal(split5000.openPowSeatEach, 0.57490909)

    // Dynamic LLMQ scaling across MN counts
    assert.deepEqual(getDynamicLlmqSpec(4), { size: 5, threshold: 3 })
    assert.deepEqual(getDynamicLlmqSpec(25), { size: 9, threshold: 5 })
    assert.deepEqual(getDynamicLlmqSpec(50), { size: 11, threshold: 6 })
    assert.deepEqual(getDynamicLlmqSpec(100), { size: 15, threshold: 8 })
    assert.equal(calculateModelDSplits(5000, 17, 100).llmqPerSigner, 0.1054)

    // Pre-Model D UPGRADE_FAIRNESS split (Block 1000: 25% producer [20%+5% PoS] / 75% equal-pay committee)
    const split1000 = calculateModelDSplits(1000)
    assert.equal(split1000.treasury, 1.19)
    assert.equal(split1000.passiveMn, 0)
    assert.equal(split1000.producer, 3.9525)
    assert.equal(split1000.posStaker, 3.162)
    assert.equal(split1000.posCoordinator, 0.7905)
    assert.equal(split1000.committeeTotal, 11.8575)
    assert.equal(split1000.committeeSeatEach, 1.07795454)
  })

  it('computes ADAM_FAIR_COORD_V4 proportional capital Coordinator VRF (4,200 : 250 : 10) with >=75% MN floor', () => {
    // Unfloored case: 5 MNs = 21,000 vs 4 CL + 6 PL = 1,060 -> 3 * 1,060 = 3,180 <= 21,000
    const unfloored = calculateCoordinatorWeights({
      masternode: 5,
      coin_lock: 4,
      pow_lock: 6
    })
    assert.equal(unfloored.mnFloorApplied, false)
    assert.equal(unfloored.activeMnCount, 5)
    assert.equal(unfloored.eligibleCoinLockSeats, 4)
    assert.equal(unfloored.eligiblePowLockSeats, 6)
    assert.equal(unfloored.totalMnWeight, 21000)
    assert.equal(unfloored.totalCoinLockWeight, 1000)
    assert.equal(unfloored.totalPowLockWeight, 60)
    assert.equal(unfloored.totalPoolWeight, 22060)
    assert.equal(unfloored.mnSharePct, 95.19)

    // Floored case: 1 MN = 4,200 vs 20 CL (5,000) + 100 PL (1,000) = 6,000 non-MN -> 3 * 6,000 > 4,200 -> 75% floor
    const floored = calculateCoordinatorWeights({
      masternode: 1,
      coin_lock: 20,
      pow_lock: 100
    })
    assert.equal(floored.mnFloorApplied, true)
    assert.equal(floored.mnSharePct, 75)
    assert.equal(floored.coinLockSharePct, 20.83)
    assert.equal(floored.powLockSharePct, 4.17)
  })

  it('maps consensus eras and milestones accurately across height transitions', () => {
    assert.equal(buildConsensusInfo(50).nextHeight, 200)
    assert.equal(buildConsensusInfo(500).currentEra, 'ADAM Dual-Track (Pre-Model D)')
    assert.equal(buildConsensusInfo(500).nextHeight, 2500)
    assert.equal(buildConsensusInfo(3000).currentEra, 'ADAM Dual-Track • Open-Entry Active')
    assert.equal(buildConsensusInfo(3000).nextHeight, 4800)
    assert.equal(buildConsensusInfo(4900).currentEra, 'PoMBL (Block v12)')
    assert.equal(buildConsensusInfo(5000).currentEra, 'Model D (PoBLS + Dynamic LLMQ)')
    assert.equal(buildConsensusInfo(260000).currentEra, 'Model D • Epoch #2')
  })

  it('classifies PoS/PoW Model D & Pre-Model D block reward outputs including 1-block lag LLMQ and PoS Coordinator', () => {
    const classifiedModelD = classifyBlockRewardOutputs(
      [
        { n: 1, address: 'KTStakerAddr', amount: 1.8972 },
        { n: 2, address: 'KTPassiveMnAddr', amount: 5.5335 },
        { n: 3, address: 'KTPrevLlmqSigner1', amount: 0.3162 },
        { n: 4, address: 'KTSeat1Addr', amount: 0.57490909 },
        { n: 5, address: 'KTCoordAddr', amount: 0.4743 },
        { n: 6, address: TREASURY_ADDRESS, amount: 1.19 },
        { n: 7, address: BURN_ADDRESSES[0]!, amount: 3.5 }
      ],
      {
        height: 5000,
        isProofOfStake: true,
        adamCoordinator: 'KTCoordAddr',
        solvedCommitteeAddrs: new Set(['KTSeat1Addr']),
        solvedSeatCount: 1,
        prevLlmqSignerAddrs: new Set(['KTPrevLlmqSigner1']),
        activeMnCount: 5,
        treasuryAddress: TREASURY_ADDRESS,
        isBurnAddress
      }
    )
    assert.deepEqual(
      classifiedModelD.map((o) => o.role),
      ['staker', 'masternode', 'llmq', 'committee', 'coordinator', 'treasury', 'protocol_burn']
    )

    const classifiedPreModelD = classifyBlockRewardOutputs(
      [
        { n: 1, address: 'KTStakerAddr', amount: 3.162 },
        { n: 2, address: 'KTSeat1Addr', amount: 1.07795454 },
        { n: 3, address: 'KTCoordAddr', amount: 0.7905 },
        { n: 4, address: TREASURY_ADDRESS, amount: 1.19 }
      ],
      {
        height: 1000,
        isProofOfStake: true,
        adamCoordinator: 'KTCoordAddr',
        solvedCommitteeAddrs: new Set(['KTSeat1Addr']),
        solvedSeatCount: 1,
        treasuryAddress: TREASURY_ADDRESS,
        isBurnAddress
      }
    )
    assert.deepEqual(
      classifiedPreModelD.map((o) => o.role),
      ['staker', 'committee', 'coordinator', 'treasury']
    )
  })

  it('detects smart search query types accurately', () => {
    assert.equal(detectSearchQueryType(''), 'empty')
    assert.equal(detectSearchQueryType('5000'), 'height')
    assert.equal(detectSearchQueryType('a'.repeat(64)), 'hash')
    assert.equal(detectSearchQueryType('02' + 'b'.repeat(64)), 'pubkey')
    assert.equal(detectSearchQueryType('03' + 'c'.repeat(64)), 'pubkey')
    assert.equal(detectSearchQueryType('kt1p' + 'q'.repeat(58)), 'taproot')
    assert.equal(detectSearchQueryType(TREASURY_ADDRESS), 'address')
    assert.equal(detectSearchQueryType('not-a-valid-query!'), 'unknown')
  })

  it('masks IPv4 and IPv6 peer socket endpoints without leaking full host IPs', () => {
    const maskedV4 = maskPeerAddr('168.119.227.178:27999')
    assert.equal(maskedV4, '168.119.xxx.xxx:27999')
    assert.ok(!maskedV4.includes('227.178'))

    const maskedV6 = maskPeerAddr('[2a01:4f8:c012:3456::1]:27999')
    assert.equal(maskedV6, '[2a01:4f8:xxxx:xxxx]:27999')
    assert.ok(!maskedV6.includes('c012'))
  })
})

describe('Formatters, OP_RETURN Decoder, QR Matrix & Taproot Normalizer', () => {
  it('formats coins, numbers, bytes, hashrate, and relative timestamps deterministically', () => {
    assert.equal(formatCoins(40), '40.00 KRISTA')
    assert.equal(formatCoins(14.715), '14.715 KRISTA')
    assert.equal(formatNumber(1234567.891, 2), '1,234,567.89')
    assert.equal(formatDate(1700000000), '2023-11-14 22:13:20 UTC')
    assert.equal(formatRelativeTime(990, 'en', 1000), '10s ago')
    assert.equal(formatRelativeTime(990, 'tr', 1000), '10 sn önce')
    assert.equal(formatDurationSeconds(125, 'en'), '2m 5s')
    assert.equal(formatDurationSeconds(125, 'tr'), '2 dk 5 sn')
    assert.equal(shortenHash('0123456789abcdef0123456789abcdef', 6), '012345...abcdef')
    assert.equal(formatBytes(2048), '2.00 KB')
    assert.equal(formatHashrate(2500000), '2.50 MH/s')
  })

  it('decodes printable UTF-8 OP_RETURN payloads and rejects non-printable binary safely', () => {
    const helloHex = Buffer.from('KristaTech v2.0', 'utf8').toString('hex')
    const decoded = decodeOpReturnAsm(`OP_RETURN ${helloHex}`)
    assert.ok(decoded)
    assert.equal(decoded.dataHex, helloHex)
    assert.equal(decoded.utf8Text, 'KristaTech v2.0')

    const binary = decodeOpReturnAsm('OP_RETURN ff00fe01')
    assert.ok(binary)
    assert.equal(binary.utf8Text, null)
    assert.equal(decodeOpReturnAsm('OP_DUP OP_HASH160 deadbeef OP_EQUALVERIFY OP_CHECKSIG'), null)
  })

  it('generates valid ISO/IEC 18004 QR matrices with intact 7x7 finder corners', () => {
    const mShort = generateQrMatrix('KRISTA')
    assert.equal(mShort.length, 21)
    assert.equal(mShort[0]!.length, 21)

    const mAddr = generateQrMatrix(TREASURY_ADDRESS)
    assert.equal(mAddr.length, 29) // 35 bytes + 2 header = 37 -> Version 3 (29x29)
    assert.equal(mAddr[0]!.length, 29)

    const mTaproot = generateQrMatrix('kt1p' + 'q'.repeat(58))
    assert.equal(mTaproot.length, 33) // 62 bytes + 2 header = 64 -> Version 4 (33x33)

    // Verify top-left, top-right, bottom-left 7x7 finder corners (outer ring + center module dark, inner ring light)
    for (const [top, left] of [
      [0, 0],
      [0, mAddr.length - 7],
      [mAddr.length - 7, 0]
    ] as const) {
      assert.equal(mAddr[top]![left], true)
      assert.equal(mAddr[top + 6]![left + 6], true)
      assert.equal(mAddr[top + 1]![left + 1], false)
      assert.equal(mAddr[top + 3]![left + 3], true)
    }

    // Deterministic output
    assert.deepEqual(mAddr, generateQrMatrix(TREASURY_ADDRESS))
  })

  it('identifies burn addresses and upgrades legacy 0x3fffffff Taproot addresses to BIP-350', () => {
    for (const b of BURN_ADDRESSES) {
      assert.equal(isBurnAddress(b), true)
    }
    assert.equal(isBurnAddress(TREASURY_ADDRESS), false)

    // Construct a synthetic 62-char legacy kt1p address with 0x3fffffff polymod checksum
    const charset = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
    const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
    const polymod = (vals: number[]) => {
      let chk = 1
      for (const v of vals) {
        const top = chk >>> 25
        chk = ((chk & 0x1ffffff) << 5) ^ v
        for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i]!
      }
      return chk
    }
    const hrp = 'kt'
    const prefixVals = [hrp.charCodeAt(0) >>> 5, hrp.charCodeAt(1) >>> 5, 0, hrp.charCodeAt(0) & 31, hrp.charCodeAt(1) & 31]
    // Witness v1 ('p' = 1) + 52 five-bit data symbols = 53 symbols + 6 checksum symbols = 59 after 'kt1' (total len 62)
    const dataVals = [1, ...Array.from({ length: 52 }, (_, i) => i % 32)]
    const legacyMod = polymod([...prefixVals, ...dataVals, 0, 0, 0, 0, 0, 0]) ^ 0x3fffffff
    let legacyChk = ''
    for (let p = 0; p < 6; p++) legacyChk += charset[(legacyMod >>> (5 * (5 - p))) & 31]
    const legacyAddr = `kt1${dataVals.map((v) => charset[v]).join('')}${legacyChk}`

    const upgraded = normalizeTaprootAddress(legacyAddr)
    assert.notEqual(upgraded, legacyAddr)
    assert.equal(upgraded.length, 62)
    // Idempotent once upgraded to BIP-350 (0x2bc830a3)
    assert.equal(normalizeTaprootAddress(upgraded), upgraded)
  })
})

describe('i18n Parity & Prototype-Pollution Safety', () => {
  it('maintains 100% EN <-> TR key parity with non-empty translations', () => {
    const enKeys = Object.keys(explorerTranslations.en!).sort()
    const trKeys = Object.keys(explorerTranslations.tr!).sort()
    assert.deepEqual(trKeys, enKeys)
    assert.ok(enKeys.length >= 150, `Expected >= 150 keys, found ${enKeys.length}`)

    for (const k of enKeys) {
      assert.ok(explorerTranslations.en![k]!.trim().length > 0, `Empty EN translation for ${k}`)
      assert.ok(explorerTranslations.tr![k]!.trim().length > 0, `Empty TR translation for ${k}`)
    }
  })

  it('guards translateKey against Object.prototype keys', () => {
    assert.equal(translateKey('en', '__proto__'), '__proto__')
    assert.equal(translateKey('en', 'constructor'), 'constructor')
    assert.equal(translateKey('__proto__', 'explorer'), explorerTranslations.en!.explorer)
  })
})

describe('Static Security & Accessibility Audit (Vue + Nitro Server)', () => {
  it('contains zero unsafe DOM injection sinks across all Vue templates and scripts', () => {
    const vueFiles = listFilesRecursive(path.join(ROOT_DIR, 'app'), '.vue')
    assert.ok(vueFiles.length >= 14, `Expected >= 14 Vue files, found ${vueFiles.length}`)

    const forbidden = [/v-html\s*=/, /\.innerHTML\b/, /\.outerHTML\b/, /document\.write\s*\(/, /\beval\s*\(/]
    for (const file of vueFiles) {
      const src = fs.readFileSync(file, 'utf8')
      for (const pattern of forbidden) {
        assert.equal(pattern.test(src), false, `Forbidden sink ${pattern} found in ${path.relative(ROOT_DIR, file)}`)
      }

      // Every external target="_blank" link must include rel="noopener noreferrer"
      const blankTags = src.match(/<[a-zA-Z][^>]*target="_blank"[^>]*>/g) || []
      for (const tag of blankTags) {
        assert.match(tag, /rel="noopener noreferrer"/, `Missing rel="noopener noreferrer" in ${path.relative(ROOT_DIR, file)}: ${tag}`)
      }
    }
  })

  it('verifies every server RPC method is allowlisted and blocks mutating RPC commands', () => {
    const serverFiles = listFilesRecursive(path.join(ROOT_DIR, 'server'), '.ts')
    for (const file of serverFiles) {
      const src = fs.readFileSync(file, 'utf8')
      for (const m of src.matchAll(/callRpc\(\s*['"]([a-zA-Z0-9_]+)['"]/g)) {
        const method = m[1]!
        assert.equal(
          ALLOWED_RPC_METHODS.has(method),
          true,
          `RPC method '${method}' in ${path.relative(ROOT_DIR, file)} missing from ALLOWED_RPC_METHODS`
        )
      }
      for (const m of src.matchAll(/method:\s*['"]([a-zA-Z0-9_]+)['"]/g)) {
        const method = m[1]!
        if (method === 'POST') continue
        assert.equal(
          ALLOWED_RPC_METHODS.has(method),
          true,
          `Batch RPC method '${method}' in ${path.relative(ROOT_DIR, file)} missing from ALLOWED_RPC_METHODS`
        )
      }
    }

    assert.doesNotThrow(() => assertAllowedRpcMethod('spork', ['show']))
    assert.doesNotThrow(() => assertAllowedRpcMethod('spork', ['active']))
    assert.doesNotThrow(() => assertAllowedRpcMethod('estimatesmartfee', [1]))
    assert.doesNotThrow(() => assertAllowedRpcMethod('decoderawtransaction', ['deadbeef']))
    assert.equal(ALLOWED_RPC_METHODS.has('sendrawtransaction'), false)
    assert.throws(() => assertAllowedRpcMethod('sendtoaddress', []))
    assert.throws(() => assertAllowedRpcMethod('sendrawtransaction', []))
    assert.throws(() => assertAllowedRpcMethod('spork', ['SPORK_2_INSTANTSEND_ENABLED', 0]))
  })
})

describe('API v2.1 Utilities, Validation, Caching, Fees, Validator Stats, SSE & OpenAPI', () => {
  it('validates addresses, txids, compressed pubkeys, pagination, and BoundedTtlCache', async () => {
    assert.equal(isValidAddressParam(TREASURY_ADDRESS), true)
    assert.equal(isValidAddressParam('kt1p' + 'q'.repeat(58)), true)
    assert.equal(isValidAddressParam('invalid!addr'), false)
    assert.equal(isValidTxid('a'.repeat(64)), true)
    assert.equal(isValidTxid('g'.repeat(64)), false)
    assert.equal(isValidCompressedPubkey('02' + 'f'.repeat(64)), true)
    assert.equal(isValidCompressedPubkey('04' + 'f'.repeat(64)), false)

    assert.deepEqual(parsePagination({ page: '-5', limit: '999' }, { maxLimit: 100 }), {
      page: 1,
      limit: 100,
      offset: 0
    })
    assert.deepEqual(parsePagination({ page: '3', limit: '20' }), {
      page: 3,
      limit: 20,
      offset: 40
    })

    const cache = new BoundedTtlCache<number>(50, 2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    assert.equal(cache.size, 2)
    assert.equal(cache.get('a'), undefined)
    assert.equal(cache.get('c'), 3)

    let calls = 0
    const [r1, r2] = await Promise.all([
      cache.getOrLoad('shared', async () => {
        calls++
        await new Promise((r) => setTimeout(r, 10))
        return 42
      }),
      cache.getOrLoad('shared', async () => {
        calls++
        return 99
      })
    ])
    assert.equal(calls, 1)
    assert.equal(r1, 42)
    assert.equal(r2, 42)
  })

  it('validates raw transaction hex and defaults broadcast toggle to disabled', () => {
    assert.equal(isTxBroadcastEnabled({}), false)
    assert.equal(isTxBroadcastEnabled({ enableTxBroadcast: 'false' }), false)
    assert.equal(isTxBroadcastEnabled({ enableTxBroadcast: 'true' }), true)

    assert.equal(validateRawTxHex('').valid, false)
    assert.equal(validateRawTxHex('0102').valid, false) // too short
    assert.equal(validateRawTxHex('0'.repeat(21)).valid, false) // odd length
    assert.equal(validateRawTxHex('zz'.repeat(20)).valid, false) // non-hex
    assert.equal(validateRawTxHex('a'.repeat(MAX_RAW_TX_HEX_LENGTH + 2)).valid, false)

    const ok = validateRawTxHex('  0100000001' + 'aa'.repeat(30) + '  ')
    assert.equal(ok.valid, true)
    assert.equal(ok.byteLength, 35)
  })

  it('computes monotonic fee tiers with relayfee fallback when estimatesmartfee returns -1', () => {
    const fallback = computeFeeEstimates({
      smartFeeFast: { feerate: -1, blocks: 25 },
      smartFeeStandard: { feerate: -1, blocks: 25 },
      smartFeeEconomy: { feerate: -1, blocks: 25 },
      relayFeeKristaPerKb: 0.0001,
      feeInfo20: {
        'Starting block': 680,
        'Ending block': 699,
        txcount: 3,
        txcount_all: 23,
        txbytes: 750,
        ttlfee: '0.003',
        feeperkb: '0.004'
      }
    })
    assert.equal(fallback.source, 'relayfee_fallback')
    assert.equal(fallback.minRelay.satPerByte, 10)
    assert.equal(fallback.tiers.economy.satPerByte, 10)
    assert.ok(fallback.tiers.fast.satPerByte >= fallback.tiers.standard.satPerByte)
    assert.ok(fallback.tiers.standard.satPerByte >= fallback.tiers.economy.satPerByte)
    assert.equal(fallback.recent20Blocks?.txCount, 3)

    const smart = computeFeeEstimates({
      smartFeeFast: { feerate: 0.0005 },
      smartFeeStandard: { feerate: 0.00025 },
      smartFeeEconomy: { feerate: 0.00012 },
      relayFeeKristaPerKb: 0.0001
    })
    assert.equal(smart.source, 'estimatesmartfee')
    assert.equal(smart.tiers.fast.satPerByte, 50)
    assert.equal(smart.tiers.standard.satPerByte, 25)
    assert.equal(smart.tiers.economy.satPerByte, 12)
  })

  it('computes validator window statistics with 11+1 vAdamMiners alignment', () => {
    const target = 'KValAddr1'
    const miners12 = [target, 'KOther1', 'KOther2', 'KOther3', 'KOther4', 'KOther5', 'KOther6', 'KOther7', 'KOther8', 'KOther9', 'KOther10', 'KCoordSlot']
    const stats = computeValidatorWindowStats(target, [
      {
        height: 5002,
        hash: 'h5002',
        time: 1700000060,
        is_pos: 1,
        adam_coordinator: target,
        producer_address: target,
        adam_miners: JSON.stringify(miners12),
        adam_solutions: JSON.stringify(['sol0', '', '', '', '', '', '', '', '', '', '']),
        adam_quorum_signers: JSON.stringify({ signers: [target, 'KOther1'] })
      },
      {
        height: 5001,
        hash: 'h5001',
        time: 1700000030,
        is_pos: 0,
        adam_coordinator: 'KOther1',
        producer_address: 'KOther1',
        adam_miners: JSON.stringify(['KOther1', target]),
        adam_solutions: JSON.stringify(['sol0', '']),
        adam_quorum_signers: JSON.stringify({ signers: ['KOther1'] })
      }
    ])

    assert.equal(stats.blocksEvaluated, 2)
    assert.equal(stats.committeeSelections, 2)
    assert.equal(stats.seatsSolved, 1)
    assert.equal(stats.solveRatePct, 50)
    assert.equal(stats.blocksCoordinated, 1)
    assert.equal(stats.blocksProduced, 1)
    assert.equal(stats.llmqSignatures, 1)
    assert.deepEqual(stats.recentActivity[0]?.roles, ['coordinator', 'producer', 'committee_solved', 'llmq_signer'])
    assert.deepEqual(stats.recentActivity[1]?.roles, ['committee_missed'])
  })

  it('enforces SSE topic filtering, per-IP caps, and global caps cleanly', () => {
    resetSseHubForTests()
    try {
      assert.deepEqual(Array.from(parseTopicsParam('block,invalid,reorg')), ['block', 'reorg'])
      assert.deepEqual(Array.from(parseTopicsParam(undefined)), ['block', 'mempool', 'reorg'])

      const receivedA: string[] = []
      const receivedB: string[] = []
      const r1 = registerSseClient('10.0.0.1', new Set(['block']), (c) => receivedA.push(c), () => {}, { maxClients: 4, maxPerIp: 2 })
      const r2 = registerSseClient('10.0.0.1', new Set(['mempool']), (c) => receivedB.push(c), () => {}, { maxClients: 4, maxPerIp: 2 })
      const r3 = registerSseClient('10.0.0.1', new Set(['block']), () => {}, () => {}, { maxClients: 4, maxPerIp: 2 })

      assert.equal(r1.ok, true)
      assert.equal(r2.ok, true)
      assert.equal(r3.ok, false)
      if (!r3.ok) assert.equal(r3.status, 429)

      const delivered = publishExplorerEvent('block', { height: 700 })
      assert.equal(delivered, 1)
      assert.equal(receivedA.length, 1)
      assert.equal(receivedB.length, 0)
      assert.match(receivedA[0]!, /event: block/)

      if (r1.ok) r1.unregister()
      if (r2.ok) r2.unregister()
    } finally {
      resetSseHubForTests()
    }
  })

  it('builds valid OpenAPI 3.1.0 specification listing all v2.1 API paths', () => {
    const spec = buildOpenApiSpec('https://explorer.kristalteknoloji.com')
    assert.equal(spec.openapi, '3.1.0')
    const paths = Object.keys(spec.paths)
    for (const requiredPath of [
      '/api/health',
      '/api/openapi.json',
      '/api/status',
      '/api/supply',
      '/api/fees',
      '/api/contracts',
      '/api/events',
      '/api/tx/{id}',
      '/api/tx/decode',
      '/api/tx/broadcast',
      '/api/address/{id}',
      '/api/address/{id}/balance',
      '/api/address/{id}/utxos',
      '/api/address/{id}/txs',
      '/api/validator/{address}'
    ]) {
      assert.ok(paths.includes(requiredPath), `OpenAPI spec missing ${requiredPath}`)
    }
  })
})
