<script setup>
import { ref } from 'vue'
import { useI18n } from '~/composables/useI18n'

const { t } = useI18n()

const endpoints = [
  {
    method: 'GET',
    path: '/api/supply',
    desc: 'Full JSON supply report (total, circulating, locked collateral, burned, subsidy).',
    category: 'Supply / Trackers'
  },
  {
    method: 'GET',
    path: '/api/supply?q=circulating',
    desc: 'Plain-text circulating supply float for CoinGecko / CoinMarketCap.',
    category: 'Supply / Trackers'
  },
  {
    method: 'GET',
    path: '/api/supply?q=total',
    desc: 'Plain-text total minted supply float.',
    category: 'Supply / Trackers'
  },
  {
    method: 'GET',
    path: '/api/status',
    desc: 'Live network status, consensus milestone, mempool summary, latest blocks & txs.',
    category: 'Chain Telemetry'
  },
  {
    method: 'GET',
    path: '/api/blocks?page=1&limit=10&type=all',
    desc: 'Paginated block ledger with PoW/PoS filter, Δt interval, reward, and solved ADAM seats.',
    category: 'Ledger'
  },
  {
    method: 'GET',
    path: '/api/block/1',
    desc: 'Full block details by height or 64-hex block hash, including ADAM committee & reward split.',
    category: 'Ledger'
  },
  {
    method: 'GET',
    path: '/api/transactions?page=1&limit=10&type=all',
    desc: 'Paginated transaction stream filterable by standard, rewards, coin_lock, pow_lock, zerocoin_pow, burn, contract.',
    category: 'Ledger'
  },
  {
    method: 'GET',
    path: '/api/validators',
    desc: 'Active ADAM validator pool, Dual-Track 7/1/3 Equal-Pay quotas, KTDIP3 Masternodes, 4,200:250:10 Fair Coordinator VRF (≥75% MN floor), and Dynamic LLMQ Quorum.',
    category: 'Consensus'
  },
  {
    method: 'GET',
    path: '/api/mempool',
    desc: 'Live unconfirmed mempool queue, fee rates (sat/B), and waiting durations.',
    category: 'Mempool'
  },
  {
    method: 'GET',
    path: '/api/richlist?limit=25',
    desc: 'Top UTXO holders, Developer Treasury, and official KTburn ledger.',
    category: 'Supply / Trackers'
  },
  {
    method: 'GET',
    path: '/api/network',
    desc: '60-block chart series, upgrade roadmap, Model D splits, privacy-masked peers, and Sporks.',
    category: 'Analytics'
  }
]

const livePreviewPath = ref('')
const livePreviewBody = ref('')
const isLoadingPreview = ref(false)

async function testEndpoint(path) {
  livePreviewPath.value = path
  isLoadingPreview.value = true
  try {
    const res = await fetch(path)
    const text = await res.text()
    try {
      livePreviewBody.value = JSON.stringify(JSON.parse(text), null, 2)
    } catch (_) {
      livePreviewBody.value = text
    }
  } catch (err) {
    livePreviewBody.value = `Error: ${err?.message || 'Request failed'}`
  } finally {
    isLoadingPreview.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <AppBreadcrumbs :items="[{ label: t('navDashboard'), to: '/' }, { label: t('navApi'), to: '/api-docs' }]" />

    <div class="glass-card rounded-2xl p-6 space-y-2">
      <h1 class="text-2xl font-extrabold text-slate-800 dark:text-white flex items-center gap-2">
        <UIcon name="i-heroicons-code-bracket-square" class="w-6 h-6 text-brand-blue" aria-hidden="true" />
        {{ t('apiDocsTitle') }}
      </h1>
      <p class="text-sm text-slate-600 dark:text-slate-300">{{ t('apiDocsDesc') }}</p>
    </div>

    <!-- Live Response Drawer -->
    <div v-if="livePreviewPath" class="glass-card rounded-2xl p-5 space-y-3 border border-brand-blue/30">
      <div class="flex items-center justify-between gap-2">
        <span class="font-mono text-xs sm:text-sm font-bold text-brand-blue">GET {{ livePreviewPath }}</span>
        <button
          type="button"
          @click="livePreviewPath = ''"
          class="text-xs px-2.5 py-1 rounded bg-slate-200 dark:bg-white/10 font-semibold cursor-pointer"
        >
          Close ✕
        </button>
      </div>
      <pre class="p-4 rounded-xl bg-slate-950 text-emerald-300 font-mono text-xs overflow-x-auto max-h-96">{{ isLoadingPreview ? 'Loading...' : livePreviewBody }}</pre>
    </div>

    <!-- Endpoint Cards -->
    <div class="grid grid-cols-1 gap-4">
      <div
        v-for="ep in endpoints"
        :key="ep.path"
        class="glass-card rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div class="space-y-1.5 min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-mono text-xs font-bold">
              {{ ep.method }}
            </span>
            <code class="font-mono text-xs sm:text-sm font-bold text-slate-800 dark:text-white break-all">
              {{ ep.path }}
            </code>
            <span class="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-white/5 text-[10px] font-semibold text-slate-500">
              {{ ep.category }}
            </span>
          </div>
          <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300">{{ ep.desc }}</p>
          <p class="font-mono text-[11px] text-slate-400 truncate">
            curl -s "https://explorer.kristalteknoloji.com{{ ep.path }}"
          </p>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button
            type="button"
            @click="testEndpoint(ep.path)"
            class="px-3.5 py-2 rounded-lg bg-brand-blue hover:bg-brand-blue-hover text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            {{ t('tryEndpoint') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
