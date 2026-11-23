export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('beforeResponse', (event) => {
    try {
      event.node?.res?.removeHeader?.('x-powered-by')
    } catch (_) {}
  })

  nitroApp.hooks.hook('render:response', (response) => {
    try {
      if (response?.headers && typeof response.headers === 'object') {
        delete response.headers['x-powered-by']
        delete response.headers['X-Powered-By']
      }
    } catch (_) {}
  })
})
