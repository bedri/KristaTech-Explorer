import sqlite3 from 'sqlite3'
import path from 'path'
import os from 'os'
import fs from 'fs'

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const BECH32M_CONST = 0x2bc830a3
const LEGACY_BECH32M_CONST = 0x3fffffff

export const BURN_ADDRESSES = [
  'KTburnCYcDjF1GsXa5k3tc3eZrVVbqefyWr',
  'KTburnUHdmKMVx4z8BcnZYZCWYKxRgfZp95'
] as const

export const TREASURY_ADDRESS = 'KTeRC2Kj8hXcuzRohxPp2LtYFRJm2BceRoP'

export function isBurnAddress(addr: string | null | undefined): boolean {
  if (!addr) return false
  return (BURN_ADDRESSES as readonly string[]).includes(addr)
}

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
let dbInitPromise: Promise<sqlite3.Database> | null = null

function getDbPath(): { dbDir: string; dbPath: string } {
  const dbDir = path.join(os.homedir(), '.kristatech-explorer')
  const dbPath = path.join(dbDir, 'explorer.db')
  return { dbDir, dbPath }
}

function runRaw(db: sqlite3.Database, sql: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve(this)
    })
  })
}

function allRaw(db: sqlite3.Database, sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows || [])
    })
  })
}

async function ensureColumn(db: sqlite3.Database, table: string, columnDef: string): Promise<void> {
  try {
    await runRaw(db, `ALTER TABLE ${table} ADD COLUMN ${columnDef};`)
  } catch (_) {
    // Column already exists — safe to ignore
  }
}

export function resetDbConnection(): void {
  if (dbInstance) {
    try {
      dbInstance.close(() => {})
    } catch (_) {}
  }
  dbInstance = null
  dbInitPromise = null
}

export function ensureDb(): Promise<sqlite3.Database> {
  const { dbDir, dbPath } = getDbPath()

  // If the database file was deleted externally (e.g. by reindex.sh), reset the cached connection
  if (dbInstance && !fs.existsSync(dbPath)) {
    resetDbConnection()
  }

  if (dbInitPromise) {
    return dbInitPromise
  }

  dbInitPromise = (async () => {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }

    const db = await new Promise<sqlite3.Database>((resolve, reject) => {
      const instance = new sqlite3.Database(dbPath, (err) => {
        if (err) reject(err)
        else resolve(instance)
      })
    })

    db.on('error', (err) => {
      console.error('[DB] Unexpected SQLite error event:', err)
    })

    if (typeof db.configure === 'function') {
      db.configure('busyTimeout', 10000)
    }

    await runRaw(db, 'PRAGMA busy_timeout = 10000;')
    await runRaw(db, 'PRAGMA journal_mode = WAL;')
    await runRaw(db, 'PRAGMA synchronous = NORMAL;')

    await runRaw(
      db,
      `
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
        adam_coordinator_sig TEXT,
        adam_coordinator TEXT,
        adam_seat_algos TEXT,
        v_quorum_sig TEXT,
        adam_quorum_signers TEXT,
        producer_address TEXT,
        reward REAL DEFAULT 0,
        solved_seats INTEGER DEFAULT 0,
        version INTEGER DEFAULT 1
      )
    `
    )

    await runRaw(
      db,
      `
      CREATE TABLE IF NOT EXISTS transactions (
        txid TEXT PRIMARY KEY,
        block_hash TEXT,
        time INTEGER,
        value REAL,
        fee REAL,
        is_coinbase INTEGER DEFAULT 0,
        is_coinstake INTEGER DEFAULT 0,
        tx_type TEXT DEFAULT 'standard'
      )
    `
    )

    await runRaw(
      db,
      `
      CREATE TABLE IF NOT EXISTS vin (
        txid TEXT,
        n INTEGER,
        prev_txid TEXT,
        prev_vout INTEGER,
        address TEXT,
        amount REAL,
        PRIMARY KEY (txid, n)
      )
    `
    )

    await runRaw(
      db,
      `
      CREATE TABLE IF NOT EXISTS vout (
        txid TEXT,
        n INTEGER,
        address TEXT,
        amount REAL,
        spent_txid TEXT,
        script_type TEXT,
        lock_height INTEGER,
        script_asm TEXT,
        script_hex TEXT,
        PRIMARY KEY (txid, n)
      )
    `
    )

    // Idempotent column migrations for existing databases
    await ensureColumn(db, 'blocks', 'adam_coordinator TEXT')
    await ensureColumn(db, 'blocks', 'adam_seat_algos TEXT')
    await ensureColumn(db, 'blocks', 'v_quorum_sig TEXT')
    await ensureColumn(db, 'blocks', 'adam_quorum_signers TEXT')
    await ensureColumn(db, 'blocks', 'producer_address TEXT')
    await ensureColumn(db, 'blocks', 'reward REAL DEFAULT 0')
    await ensureColumn(db, 'blocks', 'solved_seats INTEGER DEFAULT 0')
    await ensureColumn(db, 'blocks', 'version INTEGER DEFAULT 1')

    await ensureColumn(db, 'transactions', 'is_coinbase INTEGER DEFAULT 0')
    await ensureColumn(db, 'transactions', 'is_coinstake INTEGER DEFAULT 0')
    await ensureColumn(db, 'transactions', "tx_type TEXT DEFAULT 'standard'")

    await ensureColumn(db, 'vout', 'script_type TEXT')
    await ensureColumn(db, 'vout', 'lock_height INTEGER')
    await ensureColumn(db, 'vout', 'script_asm TEXT')
    await ensureColumn(db, 'vout', 'script_hex TEXT')

    // Indexes for high performance queries
    await runRaw(db, 'CREATE INDEX IF NOT EXISTS idx_blocks_hash ON blocks(hash);')
    await runRaw(db, 'CREATE INDEX IF NOT EXISTS idx_blocks_pos ON blocks(is_pos, height DESC);')
    await runRaw(db, 'CREATE INDEX IF NOT EXISTS idx_blocks_coordinator ON blocks(adam_coordinator);')
    await runRaw(db, 'CREATE INDEX IF NOT EXISTS idx_blocks_producer ON blocks(producer_address);')
    await runRaw(db, 'CREATE INDEX IF NOT EXISTS idx_transactions_block ON transactions(block_hash);')
    await runRaw(db, 'CREATE INDEX IF NOT EXISTS idx_transactions_time ON transactions(time DESC);')
    await runRaw(db, 'CREATE INDEX IF NOT EXISTS idx_transactions_type_time ON transactions(tx_type, time DESC);')
    await runRaw(db, 'CREATE INDEX IF NOT EXISTS idx_vin_address ON vin(address);')
    await runRaw(db, 'CREATE INDEX IF NOT EXISTS idx_vout_address ON vout(address);')
    await runRaw(db, 'CREATE INDEX IF NOT EXISTS idx_vout_spent ON vout(spent_txid);')
    await runRaw(db, 'CREATE INDEX IF NOT EXISTS idx_vout_unspent_addr ON vout(spent_txid, address);')
    await runRaw(db, 'CREATE INDEX IF NOT EXISTS idx_vout_script_type ON vout(script_type);')
    await runRaw(db, 'CREATE INDEX IF NOT EXISTS idx_vout_addr_spent_amount ON vout(address, spent_txid, amount DESC);')

    // SEC-11 Migration: upgrade any legacy 0x3fffffff Bech32m Taproot addresses to BIP-350 (0x2bc830a3)
    try {
      const taprootRows = await allRaw(
        db,
        "SELECT DISTINCT address FROM vout WHERE address LIKE 'kt1p%' OR address LIKE 'tk1p%' OR address LIKE 'rt1p%' UNION SELECT DISTINCT address FROM vin WHERE address LIKE 'kt1p%' OR address LIKE 'tk1p%' OR address LIKE 'rt1p%'"
      )
      for (const row of taprootRows) {
        if (!row?.address) continue
        const normalized = normalizeTaprootAddress(row.address)
        if (normalized !== row.address) {
          await runRaw(db, 'UPDATE vout SET address = ? WHERE address = ?', [normalized, row.address])
          await runRaw(db, 'UPDATE vin SET address = ? WHERE address = ?', [normalized, row.address])
        }
      }
    } catch (_) {}

    // KTDIP3 Migration: reclassify any previously indexed ProTx transactions from 'standard' to 'protx'
    try {
      await runRaw(
        db,
        `UPDATE transactions
         SET tx_type = 'protx'
         WHERE tx_type = 'standard'
           AND txid IN (
             SELECT txid FROM vout
             WHERE script_type = 'nulldata'
               AND (
                 script_asm LIKE 'OP_RETURN 4b544449503301%' OR
                 script_asm LIKE 'OP_RETURN 4b544449503302%' OR
                 script_asm LIKE 'OP_RETURN 4b544449503303%' OR
                 script_asm LIKE 'OP_RETURN 4b544449503304%'
               )
           )`
      )
    } catch (_) {}

    dbInstance = db
    return db
  })().catch((err) => {
    dbInstance = null
    dbInitPromise = null
    throw err
  })

  return dbInitPromise
}

export function getDb(): sqlite3.Database {
  if (dbInstance) return dbInstance
  const { dbDir, dbPath } = getDbPath()
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }
  const db = new sqlite3.Database(dbPath)
  dbInstance = db
  return db
}

// Promise helpers for database operations
export async function dbQuery(sql: string, params: any[] = []): Promise<any[]> {
  const db = await ensureDb()
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
}

export async function dbGet(sql: string, params: any[] = []): Promise<any> {
  const db = await ensureDb()
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })
}

export async function dbRun(sql: string, params: any[] = []): Promise<any> {
  const db = await ensureDb()
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve(this)
    })
  })
}
