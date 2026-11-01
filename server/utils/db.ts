import sqlite3 from 'sqlite3'
import path from 'path'
import os from 'os'
import fs from 'fs'

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
        adam_coordinator_sig TEXT
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
        fee REAL
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
        PRIMARY KEY (txid, n)
      )
    `
    )

    await runRaw(db, 'CREATE INDEX IF NOT EXISTS idx_blocks_hash ON blocks(hash);')
    await runRaw(db, 'CREATE INDEX IF NOT EXISTS idx_transactions_block ON transactions(block_hash);')
    await runRaw(db, 'CREATE INDEX IF NOT EXISTS idx_transactions_time ON transactions(time DESC);')
    await runRaw(db, 'CREATE INDEX IF NOT EXISTS idx_vin_address ON vin(address);')
    await runRaw(db, 'CREATE INDEX IF NOT EXISTS idx_vout_address ON vout(address);')
    await runRaw(db, 'CREATE INDEX IF NOT EXISTS idx_vout_spent ON vout(spent_txid);')

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
