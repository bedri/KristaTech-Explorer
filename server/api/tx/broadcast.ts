import {
  broadcastRawTransaction,
  isTxBroadcastEnabled,
  validateRawTxHex
} from '../../utils/rpc'
import { apiError, setCacheControl } from '../../utils/api'

export default defineEventHandler(async (event) => {
  setCacheControl(event, 0)

  if (event.method !== 'POST') {
    setResponseHeader(event, 'Allow', 'POST, OPTIONS')
    return apiError(event, 405, 'Method Not Allowed. Use POST with JSON { hex }.', 'METHOD_NOT_ALLOWED')
  }

  const config = useRuntimeConfig()
  if (!isTxBroadcastEnabled(config)) {
    return apiError(
      event,
      503,
      'Transaction broadcast relay is disabled on this Explorer instance (set NUXT_ENABLE_TX_BROADCAST=true to enable).',
      'BROADCAST_DISABLED'
    )
  }

  let body: any = null
  try {
    body = await readBody(event)
  } catch (_) {
    return apiError(event, 400, 'Invalid JSON request body', 'INVALID_JSON')
  }

  const check = validateRawTxHex(body?.hex)
  if (!check.valid || !check.normalized) {
    return apiError(event, 400, check.error || 'Invalid raw transaction hex', 'INVALID_TX_HEX')
  }

  try {
    const txid = await broadcastRawTransaction(check.normalized)
    return {
      success: true,
      txid,
      byteLength: check.byteLength
    }
  } catch (err: any) {
    const msg = String(err?.message || err || 'Broadcast failed')
    if (msg === 'TX_BROADCAST_DISABLED') {
      return apiError(event, 503, 'Transaction broadcast relay is disabled.', 'BROADCAST_DISABLED')
    }
    if (msg.startsWith('RPC Error:')) {
      return apiError(
        event,
        400,
        msg.replace(/^RPC Error:\s*/, ''),
        'TX_REJECTED'
      )
    }
    console.error('[API /tx/broadcast] Error:', msg)
    return apiError(event, 502, 'Node RPC unavailable for broadcast', 'RPC_UNAVAILABLE')
  }
})
