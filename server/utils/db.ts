import sqlite3 from 'sqlite3'
import path from 'path'
import os from 'os'
import fs from 'fs'

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const BECH32M_CONST = 0x2bc830a3
const LEGACY_BECH32M_CONST = 0x3fffffff

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  let chk = 1
  for (const v of values) {
    const top = chk >>> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) chk ^= GEN[i]!
    }
  }
  return chk
}

/**
 * Converts a legacy pre-SEC-11 Bech32m Taproot address (0x3fffffff checksum)
 * to the standard BIP-350 Bech32m Taproot address (0x2bc830a3 checksum).
 */
export function normalizeTaprootAddress(address: string): string {
  if (!/^(kt|tk|rt)1p[ac-hj-np-z02-9]{58}$/.test(address)) return address
  const hrp = address.slice(0, 2)
  const dataPart = address.slice(3)
  const values: number[] = [
    hrp.charCodeAt(0) >>> 5,
    hrp.charCodeAt(1) >>> 5,
    0,
    hrp.charCodeAt(0) & 31,
    hrp.charCodeAt(1) & 31
  ]
  for (let i = 0; i < dataPart.length; i++) {
    const idx = BECH32_CHARSET.indexOf(dataPart[i]!)
    if (idx === -1) return address
    values.push(idx)
  }
  const poly = bech32Polymod(values)
  if (poly === BECH32M_CONST) return address
  if (poly !== LEGACY_BECH32M_CONST) return address

  const payload = values.slice(0, -6)
  const mod = bech32Polymod([...payload, 0, 0, 0, 0, 0, 0]) ^ BECH32M_CONST
  let newChk = ''
  for (let p = 0; p < 6; p++) {
    newChk += BECH32_CHARSET[(mod >>> (5 * (5 - p))) & 31]
  }
  return `${hrp}1${dataPart.slice(0, -6)}${newChk}`
}

let dbInstance: sqlite3.Database | null = null

export function getDb(): sqlite3.Database {
  if (dbInstance) return dbInstance

  // Save database under user home directory
  const dbDir = path.join(os.homedir(), '.kristatech-explorer')
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  const dbPath = path.join(dbDir, 'explorer.db')
  const db = new sqlite3.Database(dbPath)

  // Configure SQLite performance and schemas
  db.serialize(() => {
    db.run('PRAGMA journal_mode=WAL;')
    db.run('PRAGMA synchronous=NORMAL;')

    // Blocks table
    db.run(`
      CREATE TABLE IF NOT EXISTS blocks (
        height INTEGER PRIMARY KEY,
        hash TEXT UNIQUE,
        difficulty REAL,
        time INTEGER,
        tx_count INTEGER,
        size INTEGER,
        is_pos INTEGER,
        is_pow INTEGER,
        adam_miners TEXT,
        adam_solutions TEXT,
        adam_vrf_proof TEXT,
        adam_coordinator_sig TEXT
      )
    `)

    // Transactions table
    db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        txid TEXT PRIMARY KEY,
        block_hash TEXT,
        time INTEGER,
        value REAL,
        fee REAL
      )
    `)

    // Inputs table (vin)
    db.run(`
      CREATE TABLE IF NOT EXISTS vin (
        txid TEXT,
        n INTEGER,
        prev_txid TEXT,
        prev_vout INTEGER,
        address TEXT,
        amount REAL,
        PRIMARY KEY (txid, n)
      )
    `)

    // Outputs table (vout)
    db.run(`
      CREATE TABLE IF NOT EXISTS vout (
        txid TEXT,
        n INTEGER,
        address TEXT,
        amount REAL,
        spent_txid TEXT,
        PRIMARY KEY (txid, n)
      )
    `)

    // Indexes for high performance queries
    db.run('CREATE INDEX IF NOT EXISTS idx_blocks_hash ON blocks(hash);')
    db.run('CREATE INDEX IF NOT EXISTS idx_transactions_block ON transactions(block_hash);')
    db.run('CREATE INDEX IF NOT EXISTS idx_vin_address ON vin(address);')
    db.run('CREATE INDEX IF NOT EXISTS idx_vout_address ON vout(address);')
    db.run('CREATE INDEX IF NOT EXISTS idx_vout_spent ON vout(spent_txid);')

    // SEC-11 Migration: upgrade any legacy 0x3fffffff Bech32m Taproot addresses to BIP-350 (0x2bc830a3)
    db.all(
      "SELECT DISTINCT address FROM vout WHERE address LIKE 'kt1p%' OR address LIKE 'tk1p%' OR address LIKE 'rt1p%' UNION SELECT DISTINCT address FROM vin WHERE address LIKE 'kt1p%' OR address LIKE 'tk1p%' OR address LIKE 'rt1p%'",
      [],
      (err, rows: Array<{ address: string }>) => {
        if (err || !rows) return
        for (const row of rows) {
          const normalized = normalizeTaprootAddress(row.address)
          if (normalized !== row.address) {
            db.run('UPDATE vout SET address = ? WHERE address = ?', [normalized, row.address])
            db.run('UPDATE vin SET address = ? WHERE address = ?', [normalized, row.address])
          }
        }
      }
    )
  })

  dbInstance = db
  return db
}

// Promise helpers for database operations
export function dbQuery(sql: string, params: any[] = []): Promise<any[]> {
  const db = getDb()
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
}

export function dbGet(sql: string, params: any[] = []): Promise<any> {
  const db = getDb()
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })
}

export function dbRun(sql: string, params: any[] = []): Promise<any> {
  const db = getDb()
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err)
      else resolve(this)
    })
  })
}
