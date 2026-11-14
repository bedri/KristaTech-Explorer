/**
 * Dependency-free ISO/IEC 18004 QR Code Matrix Generator (Byte mode, ECC Level L, Versions 1..6).
 * Supports payloads up to 134 UTF-8 bytes (covers all Base58Check, 62-char Bech32m Taproot, and URI strings).
 */

interface VersionSpec {
  version: number
  size: number
  dataCodewords: number
  ecCodewords: number
  alignment: number[]
}

const VERSION_SPECS: VersionSpec[] = [
  { version: 1, size: 21, dataCodewords: 19, ecCodewords: 7, alignment: [] },
  { version: 2, size: 25, dataCodewords: 34, ecCodewords: 10, alignment: [6, 18] },
  { version: 3, size: 29, dataCodewords: 55, ecCodewords: 15, alignment: [6, 22] },
  { version: 4, size: 33, dataCodewords: 80, ecCodewords: 20, alignment: [6, 26] },
  { version: 5, size: 37, dataCodewords: 108, ecCodewords: 26, alignment: [6, 30] },
  { version: 6, size: 41, dataCodewords: 136, ecCodewords: 36, alignment: [6, 34] } // 2 blocks of (68 data, 18 ec)
]

const GF_EXP = new Uint8Array(512)
const GF_LOG = new Uint8Array(256)
;(() => {
  let x = 1
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x
    GF_LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255]!
  }
})()

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1])
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1)
    const root = GF_EXP[i]!
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]!
      next[j + 1] ^= gfMul(poly[j]!, root)
    }
    poly = next
  }
  return poly
}

function rsComputeRemainder(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = rsGeneratorPoly(ecLen)
  const rem = new Uint8Array(ecLen)
  for (let i = 0; i < data.length; i++) {
    const factor = data[i]! ^ rem[0]!
    rem.copyWithin(0, 1)
    rem[ecLen - 1] = 0
    for (let j = 0; j < ecLen; j++) {
      rem[j] ^= gfMul(gen[j + 1]!, factor)
    }
  }
  return rem
}

function encodeCodewords(bytes: Uint8Array, spec: VersionSpec): Uint8Array {
  const bits: number[] = []
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1)
    }
  }

  // Byte mode indicator (0100) + 8-bit character count (Versions 1..9)
  pushBits(0b0100, 4)
  pushBits(bytes.length, 8)
  for (const b of bytes) pushBits(b, 8)

  const capacityBits = spec.dataCodewords * 8
  const terminator = Math.min(4, capacityBits - bits.length)
  pushBits(0, terminator)
  while (bits.length % 8 !== 0) bits.push(0)

  const data = new Uint8Array(spec.dataCodewords)
  for (let i = 0; i < bits.length / 8; i++) {
    let byte = 0
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | bits[i * 8 + b]!
    }
    data[i] = byte
  }
  const pads = [0xec, 0x11]
  for (let i = bits.length / 8, p = 0; i < spec.dataCodewords; i++, p++) {
    data[i] = pads[p % 2]!
  }

  if (spec.version < 6) {
    const ec = rsComputeRemainder(data, spec.ecCodewords)
    const out = new Uint8Array(spec.dataCodewords + spec.ecCodewords)
    out.set(data, 0)
    out.set(ec, spec.dataCodewords)
    return out
  }

  // Version 6-L uses 2 interleaved RS blocks of (68 data, 18 EC)
  const b1 = data.slice(0, 68)
  const b2 = data.slice(68, 136)
  const ec1 = rsComputeRemainder(b1, 18)
  const ec2 = rsComputeRemainder(b2, 18)
  const out = new Uint8Array(172)
  let pos = 0
  for (let i = 0; i < 68; i++) {
    out[pos++] = b1[i]!
    out[pos++] = b2[i]!
  }
  for (let i = 0; i < 18; i++) {
    out[pos++] = ec1[i]!
    out[pos++] = ec2[i]!
  }
  return out
}

function formatBitsEccL(mask: number): number {
  // ECC Level L = 01, combined with 3-bit mask
  const data = (0b01 << 3) | mask
  let rem = data << 10
  for (let i = 14; i >= 10; i--) {
    if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10)
  }
  return ((data << 10) | rem) ^ 0x5412
}

export function generateQrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text || '')
  const spec = VERSION_SPECS.find((s) => bytes.length + 2 <= s.dataCodewords) || VERSION_SPECS[VERSION_SPECS.length - 1]!
  const payload = bytes.length + 2 <= spec.dataCodewords ? bytes : bytes.slice(0, spec.dataCodewords - 2)
  const codewords = encodeCodewords(payload, spec)

  const n = spec.size
  const modules: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false))
  const isFunc: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false))

  const setFunc = (r: number, c: number, dark: boolean) => {
    if (r < 0 || r >= n || c < 0 || c >= n) return
    modules[r]![c] = dark
    isFunc[r]![c] = true
  }

  const drawFinder = (top: number, left: number) => {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const r = top + dy
        const c = left + dx
        const inOuter = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6
        const onRing = dx === 0 || dx === 6 || dy === 0 || dy === 6
        const inCore = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4
        setFunc(r, c, inOuter && (onRing || inCore))
      }
    }
  }

  drawFinder(0, 0)
  drawFinder(0, n - 7)
  drawFinder(n - 7, 0)

  // Timing patterns
  for (let i = 8; i < n - 8; i++) {
    setFunc(6, i, i % 2 === 0)
    setFunc(i, 6, i % 2 === 0)
  }

  // Alignment patterns
  const align = spec.alignment
  for (let i = 0; i < align.length; i++) {
    for (let j = 0; j < align.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) {
        continue
      }
      const cy = align[i]!
      const cx = align[j]!
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFunc(cy + dy, cx + dx, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
        }
      }
    }
  }

  // Reserve format info & dark module
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      isFunc[8]![i] = true
      isFunc[i]![8] = true
    }
  }
  for (let i = 0; i < 8; i++) {
    isFunc[8]![n - 1 - i] = true
    isFunc[n - 1 - i]![8] = true
  }
  setFunc(n - 8, 8, true)

  // Place data bits in upward/downward 2-column zig-zag
  let bitIdx = 0
  const totalBits = codewords.length * 8
  let upward = true
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < n; vert++) {
      const r = upward ? n - 1 - vert : vert
      for (let j = 0; j < 2; j++) {
        const c = right - j
        if (!isFunc[r]![c]) {
          let dark = false
          if (bitIdx < totalBits) {
            dark = ((codewords[bitIdx >>> 3]! >>> (7 - (bitIdx & 7))) & 1) === 1
            bitIdx++
          }
          // Apply Mask 0: (r + c) % 2 === 0
          if ((r + c) % 2 === 0) dark = !dark
          modules[r]![c] = dark
        }
      }
    }
    upward = !upward
  }

  // Write Format Information bits for Mask 0
  const fmt = formatBitsEccL(0)
  for (let i = 0; i <= 5; i++) modules[8]![i] = ((fmt >>> (14 - i)) & 1) === 1
  modules[8]![7] = ((fmt >>> 8) & 1) === 1
  modules[8]![8] = ((fmt >>> 7) & 1) === 1
  modules[7]![8] = ((fmt >>> 6) & 1) === 1
  for (let i = 0; i <= 5; i++) modules[5 - i]![8] = ((fmt >>> i) & 1) === 1

  for (let i = 0; i < 8; i++) modules[8]![n - 1 - i] = ((fmt >>> i) & 1) === 1
  for (let i = 0; i < 7; i++) modules[n - 7 + i]![8] = ((fmt >>> (14 - i)) & 1) === 1

  return modules
}
