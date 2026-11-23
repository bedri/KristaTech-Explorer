import { buildOpenApiSpec } from '../utils/openapi'
import { setCacheControl } from '../utils/api'
import { resolveSafeOpenApiServerUrl } from '../utils/security'

export default defineEventHandler((event) => {
  setResponseHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  setCacheControl(event, 300, 300)

  const serverUrl = resolveSafeOpenApiServerUrl(
    getRequestHeader(event, 'host'),
    getRequestHeader(event, 'x-forwarded-proto')
  )

  return buildOpenApiSpec(serverUrl)
})
