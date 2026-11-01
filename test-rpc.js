import fs from 'fs';
import path from 'path';
import os from 'os';

function getRpcAuthAndUrl() {
  const confPath = path.join(os.homedir(), '.kristatech', 'kristatech.conf');
  let user = process.env.NUXT_RPC_USER || '';
  let pass = process.env.NUXT_RPC_PASSWORD || '';
  let port = process.env.NUXT_RPC_PORT || '27998';

  if (fs.existsSync(confPath)) {
    const content = fs.readFileSync(confPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [k, v] = trimmed.split('=');
      if (k === 'rpcuser') user = v.trim();
      if (k === 'rpcpassword') pass = v.trim();
      if (k === 'rpcport') port = v.trim();
    }
    return {
      url: `http://127.0.0.1:${port}/`,
      auth: Buffer.from(`${user}:${pass}`).toString('base64')
    };
  }

  const cookiePath = path.join(os.homedir(), '.kristatech', '.cookie');
  if (fs.existsSync(cookiePath)) {
    const content = fs.readFileSync(cookiePath, 'utf8').trim();
    return {
      url: `http://127.0.0.1:${port}/`,
      auth: Buffer.from(content).toString('base64')
    };
  }

  return {
    url: `http://127.0.0.1:${port}/`,
    auth: Buffer.from(`${user}:${pass}`).toString('base64')
  };
}

async function test() {
  const { url, auth } = getRpcAuthAndUrl();
  console.log('Testing RPC at:', url);

  const body = {
    jsonrpc: '1.0',
    id: 'test',
    method: 'getblockchaininfo',
    params: []
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify(body)
    });

    console.log('HTTP Status:', res.status);
    const data = await res.json();
    console.log('Response:', data);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

test();
