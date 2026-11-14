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

describe('KristaTech Protocol & Tokenomics Math (v1.5.7.0 / 70983)', () => {
  it('computes exact C++ CMasternode::GetBlockValue subsidy schedule', () => {
    assert.equal(calculateBlockSubsidy(0), 0)
    assert.equal(calculateBlockSubsidy(1), 0)
    assert.equal(calculateBlockSubsidy(2), 40)
    assert.equal(calculateBlockSubsidy(2200), 40)
    assert.equal(calculateBlockSubsidy(2201), 30)
    assert.equal(calculateBlockSubsidy(5000), 30)
    assert.equal(calculateBlockSubsidy(5001), 20)
    assert.equal(calculateBlockSubsidy(9999), 20)
    assert.equal(calculateBlockSubsidy(10000), 15)
    // First quarterly 1.9% geometric decay at height 10,000 + 259,200 = 269,200: 15 * 0.981 = 14.715
    assert.equal(calculateBlockSubsidy(269200), 14.715)
  })

  it('computes exact cumulative theoretical block supply across all bootstrap epochs', () => {
    assert.equal(calculateTotalSupply(0), 0)
    assert.equal(calculateTotalSupply(1), 0)
    // Blocks 2..2200 = 2,199 blocks * 40 = 87,960 KRISTA
    assert.equal(calculateTotalSupply(2200), 87960)
    // Blocks 2201..5000 = 2,800 blocks * 30 = 84,000 -> 87,960 + 84,000 = 171,960 KRISTA
    assert.equal(calculateTotalSupply(5000), 171960)
    // Blocks 5001..9999 = 4,999 blocks * 20 = 99,980 -> 171,960 + 99,980 = 271,940 KRISTA
    assert.equal(calculateTotalSupply(9999), 271940)
    // Block 10000 adds 15 -> 271,955 KRISTA
    assert.equal(calculateTotalSupply(10000), 271955)
  })

  it('computes exact Model D reward splits (7% Treasury + 93% Net Pool -> 35/40/15/10)', () => {
    // At Block 2200, gross subsidy is still 40 KRISTA
    const split2200 = calculateModelDSplits(2200)
    assert.equal(split2200.subsidy, 40)
    assert.equal(split2200.treasury, 2.8)
    assert.equal(split2200.netPool, 37.2)
    assert.equal(split2200.passiveMn, 13.02) // 35% of 37.2
    assert.equal(split2200.committeeTotal, 14.88) // 40% of 37.2
    assert.equal(split2200.producer, 5.58) // 15% of 37.2
    assert.equal(split2200.llmqTotal, 3.72) // 10% of 37.2
    assert.equal(split2200.llmqPerSigner, 0.744) // 2% of 37.2 each across 5 signers
    assert.equal(split2200.coinLockSeat, 2.976) // 8% of 37.2
    assert.equal(split2200.openPowSeatEach, 1.488) // 4% of 37.2 each across 3 Open PoW seats

    // Pre-Model D Dual-Track split (e.g., Block 1000: 60% producer / 40% committee)
    const split1000 = calculateModelDSplits(1000)
    assert.equal(split1000.treasury, 2.8)
    assert.equal(split1000.passiveMn, 0)
    assert.equal(split1000.producer, 22.32)
    assert.equal(split1000.committeeTotal, 14.88)
  })

  it('computes Quadratic Stake-Weighted Coordinator VRF (65 : 16 : 4) with strict track quotas', () => {
    const weights = calculateCoordinatorWeights({
      masternode: 5,
      coin_lock: 4, // strictly capped to 1 eligible seat
      pow_lock: 6 // strictly capped to 3 eligible seats
    })
    assert.equal(weights.activeMnCount, 5)
    assert.equal(weights.eligibleCoinLockSeats, 1)
    assert.equal(weights.eligiblePowLockSeats, 3)
    assert.equal(weights.totalMnWeight, 325) // 5 * 65
    assert.equal(weights.totalCoinLockWeight, 16) // 1 * 16
    assert.equal(weights.totalPowLockWeight, 12) // 3 * 4
    assert.equal(weights.totalPoolWeight, 353)
  })

  it('maps consensus eras and milestones accurately across height transitions', () => {
    assert.equal(buildConsensusInfo(50).nextHeight, 200)
    assert.equal(buildConsensusInfo(500).currentEra, 'ADAM v1')
    assert.equal(buildConsensusInfo(800).currentEra, 'ADAM v1.2 (Dual-Track)')
    assert.equal(buildConsensusInfo(2100).currentEra, 'ADAM v2 (PoMBL)')
    assert.equal(buildConsensusInfo(2500).currentEra, 'Model D (PoBLS + LLMQ)')
    assert.equal(buildConsensusInfo(12000).currentEra, 'Model D • Epoch #1')
  })

  it('detects smart search query types accurately', () => {
    assert.equal(detectSearchQueryType(''), 'empty')
    assert.equal(detectSearchQueryType('2200'), 'height')
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
})
