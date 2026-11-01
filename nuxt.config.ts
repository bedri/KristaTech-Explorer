// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  
  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico?v=2' }
      ]
    }
  },
  
  devServer: {
    port: 27799
  },
  
  runtimeConfig: {
    rpcHost: process.env.NUXT_RPC_HOST || '127.0.0.1',
    rpcPort: process.env.NUXT_RPC_PORT || '27998',
    rpcCookiePath: process.env.NUXT_RPC_COOKIE_PATH || '',
    rpcUser: process.env.NUXT_RPC_USER || '',
    rpcPassword: process.env.NUXT_RPC_PASSWORD || '',
  }
})
