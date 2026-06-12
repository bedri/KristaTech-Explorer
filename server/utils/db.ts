import sqlite3 from 'sqlite3'
import path from 'path'
import os from 'os'
import fs from 'fs'

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
