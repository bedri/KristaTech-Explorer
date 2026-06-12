import fs from 'fs'
import path from 'path'
import os from 'os'

export function getRpcAuth(config: any): string {
  if (config.rpcUser && config.rpcPassword) {
    return Buffer.from(`${config.rpcUser}:${config.rpcPassword}`).toString('base64')
  }

  // Otherwise, use cookie authentication
  let cookiePath = config.rpcCookiePath
  if (!cookiePath) {
    cookiePath = path.join(os.homedir(), '.kristatech', '.cookie')
  }

  try {
    if (fs.existsSync(cookiePath)) {
      const cookieContent = fs.readFileSync(cookiePath, 'utf8').trim()
      // The cookie file format is "__cookie__:<password>" or "rpcuser:rpcpassword"
      return Buffer.from(cookieContent).toString('base64')
    }
  } catch (err) {
    console.error('Failed to read RPC cookie file:', err)
  }

  throw new Error(`RPC credentials missing and cookie file not found at: ${cookiePath}`)
}

export async function callRpc(method: string, params: any[] = []): Promise<any> {
  const config = useRuntimeConfig()
  const auth = getRpcAuth(config)
  const url = `http://${config.rpcHost}:${config.rpcPort}/`

  const body = {
    jsonrpc: '1.0',
    id: 'krista-explorer',
    method,
    params
  }

  try {
    const response = await $fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify(body)
    }) as any

    if (response?.error) {
      throw new Error(`RPC Error: ${JSON.stringify(response.error)}`)
    }

    return response?.result
  } catch (err: any) {
    console.error(`RPC method ${method} failed:`, err.message || err)
    throw err
  }
}
