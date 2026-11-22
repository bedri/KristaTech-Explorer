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
import { ALLOWED_RPC_METHODS, assertAllowedRpcMethod } from '../server/utils/rpc.ts'
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
    assert.throws(() => assertAllowedRpcMethod('sendtoaddress', []))
    assert.throws(() => assertAllowedRpcMethod('spork', ['SPORK_2_INSTANTSEND_ENABLED', 0]))
  })
})
