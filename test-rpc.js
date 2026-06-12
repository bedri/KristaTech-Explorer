import fs from 'fs';
import path from 'path';
import os from 'os';

async function test() {
  const cookiePath = path.join(os.homedir(), '.kristatech', '.cookie');
  console.log('Reading cookie from:', cookiePath);
  
  if (!fs.existsSync(cookiePath)) {
    console.error('Cookie file does not exist!');
    return;
  }
  
  const content = fs.readFileSync(cookiePath, 'utf8').trim();
  console.log('Cookie content read successfully (length:', content.length, ')');
  
  const auth = Buffer.from(content).toString('base64');
  const url = 'http://127.0.0.1:27979/';
  
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
