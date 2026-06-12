import fs from 'fs';
import path from 'path';
import os from 'os';
import sqlite3 from 'sqlite3';

const cookiePath = path.join(os.homedir(), '.kristatech', '.cookie');
const auth = Buffer.from(fs.readFileSync(cookiePath, 'utf8').trim()).toString('base64');
const url = 'http://127.0.0.1:27979/';

async function callRpc(method, params = []) {
  const body = {
    jsonrpc: '1.0',
    id: 'test',
    method,
    params
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'Authorization': `Basic ${auth}`
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.result;
}

// Database Setup
const dbDir = path.join(os.homedir(), '.kristatech-explorer');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const dbPath = path.join(dbDir, 'explorer.db');
const db = new sqlite3.Database(dbPath);

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function syncBlock(height) {
  try {
    console.log(`Syncing block ${height}...`);
    const blockHash = await callRpc('getblockhash', [height]);
    const block = await callRpc('getblock', [blockHash, true]);

    console.log(`Block hash: ${block.hash}. Contains ${block.tx.length} txs.`);

    await dbRun('BEGIN TRANSACTION');

    await dbRun(
      'INSERT OR REPLACE INTO blocks (height, hash, difficulty, time, tx_count, size) VALUES (?, ?, ?, ?, ?, ?)',
      [block.height, block.hash, block.difficulty, block.time, block.tx.length, block.size]
    )

    for (const txid of block.tx) {
      console.log(`Fetching transaction ${txid}...`);
      const tx = await callRpc('getrawtransaction', [txid, 1]);

      let totalVoutValue = 0;
      let totalVinValue = 0;
      const isCoinbase = tx.vin.length > 0 && !!tx.vin[0].coinbase;

      for (const out of tx.vout) {
        totalVoutValue += out.value;
        let address = 'Nonstandard';
        if (out.scriptPubKey && out.scriptPubKey.addresses && out.scriptPubKey.addresses.length > 0) {
          address = out.scriptPubKey.addresses[0];
        } else if (out.scriptPubKey && out.scriptPubKey.type === 'pubkey') {
          address = 'Pubkey-output';
        }
        await dbRun(
          'INSERT OR REPLACE INTO vout (txid, n, address, amount, spent_txid) VALUES (?, ?, ?, ?, NULL)',
          [tx.txid, out.n, address, out.value]
        );
      }

      for (let i = 0; i < tx.vin.length; i++) {
        const vinEntry = tx.vin[i];
        if (vinEntry.coinbase) {
          await dbRun(
            'INSERT OR REPLACE INTO vin (txid, n, prev_txid, prev_vout, address, amount) VALUES (?, ?, "coinbase", 0, "Coinbase", 0)',
            [tx.txid, i]
          );
        } else {
          const prevTxid = vinEntry.txid;
          const prevVout = vinEntry.vout;
          const prevOut = await dbGet(
            'SELECT address, amount FROM vout WHERE txid = ? AND n = ?',
            [prevTxid, prevVout]
          );
          if (prevOut) {
            await dbRun(
              'INSERT OR REPLACE INTO vin (txid, n, prev_txid, prev_vout, address, amount) VALUES (?, ?, ?, ?, ?, ?)',
              [tx.txid, i, prevTxid, prevVout, prevOut.address, prevOut.amount]
            );
            await dbRun(
              'UPDATE vout SET spent_txid = ? WHERE txid = ? AND n = ?',
              [tx.txid, prevTxid, prevVout]
            );
            totalVinValue += prevOut.amount;
          } else {
            await dbRun(
              'INSERT OR REPLACE INTO vin (txid, n, prev_txid, prev_vout, address, amount) VALUES (?, ?, ?, ?, "Unknown", 0)',
              [tx.txid, i, prevTxid, prevVout]
            );
          }
        }
      }

      let fee = 0;
      if (!isCoinbase) {
        fee = totalVinValue - totalVoutValue;
        if (fee < 0) fee = 0;
      }

      await dbRun(
        'INSERT OR REPLACE INTO transactions (txid, block_hash, time, value, fee) VALUES (?, ?, ?, ?, ?)',
        [tx.txid, block.hash, block.time, totalVoutValue, fee]
      );
    }

    await dbRun('COMMIT');
    console.log(`Successfully synced block ${height}!`);
  } catch (err) {
    console.error(`Error syncing block ${height}:`, err);
    try { await dbRun('ROLLBACK'); } catch (_) {}
  }
}

async function run() {
  // Setup tables if needed
  await dbRun(`
    CREATE TABLE IF NOT EXISTS blocks (
      height INTEGER PRIMARY KEY,
      hash TEXT UNIQUE,
      difficulty REAL,
      time INTEGER,
      tx_count INTEGER,
      size INTEGER
    )
  `);
  await dbRun(`
    CREATE TABLE IF NOT EXISTS transactions (
      txid TEXT PRIMARY KEY,
      block_hash TEXT,
      time INTEGER,
      value REAL,
      fee REAL
    )
  `);
  await dbRun(`
    CREATE TABLE IF NOT EXISTS vin (
      txid TEXT,
      n INTEGER,
      prev_txid TEXT,
      prev_vout INTEGER,
      address TEXT,
      amount REAL,
      PRIMARY KEY (txid, n)
    )
  `);
  await dbRun(`
    CREATE TABLE IF NOT EXISTS vout (
      txid TEXT,
      n INTEGER,
      address TEXT,
      amount REAL,
      spent_txid TEXT,
      PRIMARY KEY (txid, n)
    )
  `);
  
  await syncBlock(0);
  await syncBlock(1);
  db.close();
}

run();
