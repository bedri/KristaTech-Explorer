import { buildOpenApiSpec } from '../utils/openapi'
import { setCacheControl } from '../utils/api'

export default defineEventHandler((event) => {
  setResponseHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  setCacheControl(event, 300, 300)

  const host = getRequestHeader(event, 'host')
  const proto = getRequestHeader(event, 'x-forwarded-proto') || 'https'
  const serverUrl = host ? `${proto}://${host}` : 'https://explorer.kristalteknoloji.com'

  return buildOpenApiSpec(serverUrl)
})
