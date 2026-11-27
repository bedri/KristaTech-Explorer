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
            'Real-time KristaTech (KRISTA) blockchain explorer: Balanced Model D (15+1 • 8+2+5 • 5/10/60/25), 4,200:250:10 Proportional VRF (≥55% Model D / ≥75% Pre-Model D MN floor), KTDIP3 & Hardening v4 2/3 BFT dynamic LLMQ (4/5–11/15), BIP324 P2P v2, MESCAL v2 Taproot & BIP174 PSBT smart contracts.'
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
    rpcPassword: process.env.NUXT_RPC_PASSWORD || '',
    enableTxBroadcast: process.env.NUXT_ENABLE_TX_BROADCAST || 'false',
    apiCorsOrigin: process.env.NUXT_API_CORS_ORIGIN || '*'
  }
})
