import fs from 'fs'
import path from 'path'
import os from 'os'

interface RpcConnectionInfo {
  url: string
  auth: string
}

// Strict read-only allowlist of RPC methods permitted by the Explorer
const ALLOWED_RPC_METHODS = new Set([
  'getblockchaininfo',
  'getconnectioncount',
  'getinfo',
  'getmasternodecount',
  'getblockhash',
  'getblock',
  'getrawtransaction'
])

function assertAllowedRpcMethod(method: string): void {
  if (!ALLOWED_RPC_METHODS.has(method)) {
    throw new Error(`Disallowed RPC method: ${method}`)
  }
}

function readKristaConf(): Record<string, string> {
  const confPath = path.join(os.homedir(), '.kristatech', 'kristatech.conf')
  const result: Record<string, string> = {}
  try {
    if (fs.existsSync(confPath)) {
      const content = fs.readFileSync(confPath, 'utf8')
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim()
          const val = trimmed.slice(eqIdx + 1).trim()
          result[key] = val
        }
      }
    }
  } catch (err) {
    console.error('Failed to read kristatech.conf:', err)
  }
  return result
}

export function getRpcConnectionInfo(config: any): RpcConnectionInfo {
  const conf = readKristaConf()

  const host = config.rpcHost || conf.rpcconnect || '127.0.0.1'
  const port = conf.rpcport || config.rpcPort || '27998'
  const url = `http://${host}:${port}/`

  const rpcUser = conf.rpcuser || config.rpcUser
  const rpcPassword = conf.rpcpassword || config.rpcPassword

  if (rpcUser && rpcPassword) {
    const auth = Buffer.from(`${rpcUser}:${rpcPassword}`).toString('base64')
    return { url, auth }
  }

  // Otherwise, use cookie authentication
  let cookiePath = config.rpcCookiePath
  if (!cookiePath) {
    cookiePath = path.join(os.homedir(), '.kristatech', '.cookie')
  }

  try {
    if (fs.existsSync(cookiePath)) {
      const cookieContent = fs.readFileSync(cookiePath, 'utf8').trim()
      return {
        url,
        auth: Buffer.from(cookieContent).toString('base64')
      }
    }
  } catch (err) {
    console.error('Failed to read RPC cookie file:', err)
  }

  throw new Error('RPC credentials missing and cookie file not found')
}

export function getRpcAuth(config: any): string {
  return getRpcConnectionInfo(config).auth
}

export async function callRpc(method: string, params: any[] = []): Promise<any> {
  assertAllowedRpcMethod(method)

  const config = useRuntimeConfig()
  const { url, auth } = getRpcConnectionInfo(config)

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

export async function callRpcBatch(requests: { method: string; params?: any[] }[]): Promise<any[]> {
  if (requests.length === 0) return []

  for (const req of requests) {
    assertAllowedRpcMethod(req.method)
  }

  const config = useRuntimeConfig()
  const { url, auth } = getRpcConnectionInfo(config)

  const body = requests.map((req, idx) => ({
    jsonrpc: '1.0',
    id: idx,
    method: req.method,
    params: req.params || []
  }))

  try {
    const response = await $fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify(body)
    }) as any[]

    if (!Array.isArray(response)) {
      throw new Error('Invalid batch RPC response')
    }

    // Sort by id to preserve exact request order
    response.sort((a, b) => a.id - b.id)

    return response.map((item) => {
      if (item?.error) {
        throw new Error(`RPC Batch Error: ${JSON.stringify(item.error)}`)
      }
      return item?.result
    })
  } catch (err: any) {
    console.error('RPC batch request failed:', err.message || err)
    throw err
  }
}
