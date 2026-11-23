import { callRpc, validateRawTxHex } from '../../utils/rpc'
import { isBurnAddress, normalizeTaprootAddress } from '../../utils/db'
import { apiError, normalizeAmount, setCacheControl } from '../../utils/api'
import { isContentLengthExceeded } from '../../utils/security'
import { decodeOpReturnAsm } from '../../../app/utils/formatters'

export default defineEventHandler(async (event) => {
  setCacheControl(event, 0)

  if (event.method !== 'POST') {
    setResponseHeader(event, 'Allow', 'POST, OPTIONS')
    return apiError(event, 405, 'Method Not Allowed. Use POST with JSON { hex }.', 'METHOD_NOT_ALLOWED')
  }

  if (isContentLengthExceeded(getRequestHeader(event, 'content-length'))) {
    return apiError(event, 413, 'Request payload exceeds 256 KB limit', 'PAYLOAD_TOO_LARGE')
  }

  let body: any = null
  try {
    body = await readBody(event)
  } catch (_) {
    return apiError(event, 400, 'Invalid JSON request body', 'INVALID_JSON')
  }

  const check = validateRawTxHex(body?.hex)
  if (!check.valid || !check.normalized) {
    return apiError(event, 400, check.error || 'Invalid transaction hex', 'INVALID_TX_HEX')
  }

  try {
    const decoded = await callRpc('decoderawtransaction', [check.normalized])
    const vout = Array.isArray(decoded?.vout)
      ? decoded.vout.map((out: any) => {
          const rawAddresses: string[] = Array.isArray(out?.scriptPubKey?.addresses)
            ? out.scriptPubKey.addresses
            : []
          const normalizedAddresses = rawAddresses.map((a) => normalizeTaprootAddress(a))
          const primaryAddr = normalizedAddresses[0] || null
          const scriptAsm = out?.scriptPubKey?.asm || null
          const scriptType = out?.scriptPubKey?.type || 'nonstandard'
          return {
            value: normalizeAmount(out?.value),
            n: out?.n ?? 0,
            scriptPubKey: {
              ...(out?.scriptPubKey || {}),
              addresses: normalizedAddresses.length > 0 ? normalizedAddresses : undefined
            },
            isBurn: isBurnAddress(primaryAddr),
            opReturnDecoded: scriptType === 'nulldata' ? decodeOpReturnAsm(scriptAsm) : null
          }
        })
      : []

    return {
      success: true,
      byteLength: check.byteLength,
      tx: {
        ...decoded,
        vout
      }
    }
  } catch (err: any) {
    const msg = String(err?.message || '')
    if (msg.includes('RPC Error:')) {
      return apiError(event, 400, 'Unable to decode raw transaction hex', 'TX_DECODE_REJECTED')
    }
    console.error('[API /tx/decode] Error:', msg)
    return apiError(event, 502, 'Node RPC unavailable for transaction decode', 'RPC_UNAVAILABLE')
  }
})
