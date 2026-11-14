// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],

  app: {
    head: {
      meta: [
        { name: 'color-scheme', content: 'light dark' },
        {
          name: 'description',
          content:
            'Real-time KristaTech (KRISTA) blockchain explorer: ADAM 11+1 hybrid PoW/PoS blocks, 65:16:4 Coordinator VRF, LLMQ BLS quorums, MESCAL Taproot smart contracts, mempool, supply & rich list.'
        }
      ],
      link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico?v=2' }]
    }
  },

  server: {
    allowedHosts: ['explorer.kristalteknoloji.com']
  },

  devServer: {
    port: 27799,
    host: '127.0.0.1'
  },

  runtimeConfig: {
    rpcHost: process.env.NUXT_RPC_HOST || '127.0.0.1',
    rpcPort: process.env.NUXT_RPC_PORT || '27998',
    rpcCookiePath: process.env.NUXT_RPC_COOKIE_PATH || '',
    rpcUser: process.env.NUXT_RPC_USER || '',
    rpcPassword: process.env.NUXT_RPC_PASSWORD || ''
  }
})
