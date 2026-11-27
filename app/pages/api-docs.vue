<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { useI18n } from '~/composables/useI18n'

const { t } = useI18n()

const SAMPLE_ADDR = 'KTeRC2Kj8hXcuzRohxPp2LtYFRJm2BceRoP'
const SAMPLE_TXID = '0000000000000000000000000000000000000000000000000000000000000000'

const endpoints = [
  {
    method: 'GET',
    path: '/api/health',
    desc: 'Node RPC status, SQLite indexer sync lag, uptimeSeconds, SSE subscriber counts, and feature flags.',
    category: 'Chain Telemetry'
  },
  {
    method: 'GET',
    path: '/api/openapi.json',
    desc: 'Machine-readable OpenAPI 3.1.0 specification covering all Explorer REST & SSE endpoints.',
    category: 'Chain Telemetry'
  },
  {
    method: 'GET',
    path: '/api/status',
    desc: 'Live network status, consensus milestone, mempool summary, latest blocks & txs.',
    category: 'Chain Telemetry'
  },
  {
    method: 'GET',
    path: `/api/search?q=${SAMPLE_ADDR}`,
    desc: 'Smart query resolver for block height, block/tx hash, wallet/Taproot address, 66-hex validator pubkey, or 96-hex BLS12-381 operator pubkey.',
    category: 'Chain Telemetry'
  },
  {
    method: 'GET',
    path: '/api/network',
    desc: '60-block chart series, upgrade roadmap, Model D splits, privacy-masked BIP324 v2 peers, and Sporks.',
    category: 'Chain Telemetry'
  },
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
    path: '/api/richlist?limit=25',
    desc: 'Top UTXO holders, Developer Treasury, and official KTburn ledger.',
    category: 'Supply / Trackers'
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
    desc: 'Paginated transaction stream filterable by standard, rewards, coin_lock, pow_lock, zerocoin_pow, protx (KTDIP3), burn, contract.',
    category: 'Ledger'
  },
  {
    method: 'GET',
    path: `/api/tx/${SAMPLE_TXID}`,
    displayPath: '/api/tx/{txid}',
    desc: 'Full transaction breakdown with vin/vout, OP_RETURN & KTDIP3 ProTx decoding, MESCAL v2 decompiler, and sat/B fee rate.',
    category: 'Ledger',
    skipLiveTest: true
  },
  {
    method: 'GET',
    path: `/api/address/${SAMPLE_ADDR}`,
    desc: 'Combined address overview: balance, history, top 100 UTXOs, validator membership, and produced blocks.',
    category: 'Wallet / Address'
  },
  {
    method: 'GET',
    path: `/api/address/${SAMPLE_ADDR}/balance?includeMempool=true`,
    desc: 'Fast balance check returning spendable, timelocked, satoshi integers, and optional mempool delta.',
    category: 'Wallet / Address'
  },
  {
    method: 'GET',
    path: `/api/address/${SAMPLE_ADDR}/utxos?page=1&limit=50&spendableOnly=false&sort=amount_desc`,
    desc: 'Paginated UTXO set with scriptHex, confirmations, and timelock unlock countdown for tx construction.',
    category: 'Wallet / Address'
  },
  {
    method: 'GET',
    path: `/api/address/${SAMPLE_ADDR}/txs?page=1&limit=25&direction=all&type=all`,
    desc: 'Paginated address transaction ledger filterable by direction (in/out), tx type, and block height range.',
    category: 'Wallet / Address'
  },
  {
    method: 'GET',
    path: '/api/fees',
    desc: 'Recommended fast/standard/economy fee tiers (sat/B & KRISTA/kB) with relay-fee floor and 20-block stats.',
    category: 'Transactions & Fees'
  },
  {
    method: 'POST',
    path: '/api/tx/decode',
    desc: 'Decode raw serialized transaction hex (max 100 KB) with burn & OP_RETURN annotations via read-only RPC.',
    category: 'Transactions & Fees',
    curlExample: 'curl -s -X POST -H "Content-Type: application/json" -d \'{"hex":"<RAW_TX_HEX>"}\' "https://explorer.kristalteknoloji.com/api/tx/decode"',
    skipLiveTest: true
  },
  {
    method: 'POST',
    path: '/api/tx/broadcast',
    desc: 'Opt-in raw transaction relay (requires NUXT_ENABLE_TX_BROADCAST=true; dedicated 10 req/min rate limit).',
    category: 'Transactions & Fees',
    optIn: true,
    curlExample: 'curl -s -X POST -H "Content-Type: application/json" -d \'{"hex":"<SIGNED_RAW_TX_HEX>"}\' "https://explorer.kristalteknoloji.com/api/tx/broadcast"',
    skipLiveTest: true
  },
  {
    method: 'GET',
    path: '/api/validators',
    desc: 'Active ADAM validator pool, Dual-Track quotas (7/1/3 Pre-Model D → 8/2/5 Balanced Model D, 60%/15 = 4.00%), KTDIP3 Masternodes (BLS12-381, PoSe), 4,200:250:10 VRF (≥75% V4 / ≥55% V5 MN floor), and Dynamic 2/3 BFT LLMQ (4/5–11/15).',
    category: 'Consensus & Validators'
  },
  {
    method: 'GET',
    path: `/api/validator/${SAMPLE_ADDR}?window=200`,
    desc: 'Per-validator / Masternode performance analytics (by address, 66-hex secp256k1 pubkey, or 96-hex BLS12-381 operator pubkey) over a bounded block window.',
    category: 'Consensus & Validators'
  },
  {
    method: 'GET',
    path: '/api/contracts?page=1&limit=25&kind=all&decompile=false',
    desc: 'Paginated MESCAL smart contracts, Taproot (P2TR) outputs, and decoded OP_RETURN ledger with batch decompile option.',
    category: 'Contracts'
  },
  {
    method: 'GET',
    path: '/api/mempool',
    desc: 'Live unconfirmed mempool queue, fee rates (sat/B), and waiting durations.',
    category: 'Mempool & Streaming'
  },
  {
    method: 'GET',
    path: '/api/events?topics=block,mempool,reorg',
    desc: 'Real-time Server-Sent Events (SSE) stream pushing new blocks, mempool txs, and chain reorg notifications.',
    category: 'Mempool & Streaming',
    skipLiveTest: true
  }
]

const selectedCategory = ref('ALL')
const categories = computed(() => {
  const uniq = Array.from(new Set(endpoints.map((e) => e.category)))
  return ['ALL', ...uniq]
})

const filteredEndpoints = computed(() => {
  if (selectedCategory.value === 'ALL') return endpoints
  return endpoints.filter((e) => e.category === selectedCategory.value)
})

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

// Live SSE Stream Tester state
const sseConnected = ref(false)
const sseLogs = ref([])
let eventSourceInstance = null

function appendSseLog(eventName, dataText) {
  const entry = {
    ts: new Date().toISOString().slice(11, 19),
    event: eventName,
    data: dataText
  }
  sseLogs.value = [entry, ...sseLogs.value].slice(0, 30)
}

function toggleSseStream() {
  if (sseConnected.value && eventSourceInstance) {
    eventSourceInstance.close()
    eventSourceInstance = null
    sseConnected.value = false
    return
  }

  if (typeof EventSource === 'undefined') return
  const es = new EventSource('/api/events?topics=block,mempool,reorg')
  eventSourceInstance = es
  sseConnected.value = true

  const listen = (evtName) => {
    es.addEventListener(evtName, (evt) => {
      appendSseLog(evtName, evt.data || '')
    })
  }
  listen('connected')
  listen('block')
  listen('mempool')
  listen('reorg')

  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) {
      sseConnected.value = false
    }
  }
}

onUnmounted(() => {
  if (eventSourceInstance) {
    eventSourceInstance.close()
    eventSourceInstance = null
  }
})
</script>

<template>
  <div class="space-y-6">
    <AppBreadcrumbs :items="[{ label: t('navDashboard'), to: '/' }, { label: t('navApi'), to: '/api-docs' }]" />

    <div class="glass-card rounded-2xl p-6 space-y-3">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="space-y-1">
          <h1 class="text-2xl font-extrabold text-slate-800 dark:text-white flex items-center gap-2">
            <UIcon name="i-heroicons-code-bracket-square" class="w-6 h-6 text-brand-blue" aria-hidden="true" />
            {{ t('apiDocsTitle') }}
          </h1>
          <p class="text-sm text-slate-600 dark:text-slate-300">{{ t('apiDocsDesc') }}</p>
        </div>

        <a
          href="/api/openapi.json"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-blue hover:bg-brand-blue-hover text-white text-xs font-bold transition-colors shrink-0"
        >
          <UIcon name="i-heroicons-document-text" class="w-4 h-4" aria-hidden="true" />
          {{ t('apiOpenApiBtn') }}
        </a>
      </div>

      <div class="text-xs font-mono px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300">
        {{ t('apiCorsRateInfo') }}
      </div>

      <!-- Category Filter Pills -->
      <div class="flex flex-wrap gap-2 pt-1">
        <button
          v-for="cat in categories"
          :key="cat"
          type="button"
          @click="selectedCategory = cat"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          :class="selectedCategory === cat
            ? 'bg-brand-blue text-white'
            : 'bg-slate-200/70 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-300/70 dark:hover:bg-white/10'"
        >
          {{ cat === 'ALL' ? t('apiCategoryAll') : cat }}
        </button>
      </div>
    </div>

    <!-- Live Response Drawer -->
    <div v-if="livePreviewPath" class="glass-card rounded-2xl p-5 space-y-3 border border-brand-blue/30">
      <div class="flex items-center justify-between gap-2">
        <span class="font-mono text-xs sm:text-sm font-bold text-brand-blue break-all">GET {{ livePreviewPath }}</span>
        <button
          type="button"
          @click="livePreviewPath = ''"
          class="text-xs px-2.5 py-1 rounded bg-slate-200 dark:bg-white/10 font-semibold cursor-pointer shrink-0"
        >
          Close ✕
        </button>
      </div>
      <pre class="p-4 rounded-xl bg-slate-950 text-emerald-300 font-mono text-xs overflow-x-auto max-h-96">{{ isLoadingPreview ? 'Loading...' : livePreviewBody }}</pre>
    </div>

    <!-- Endpoint Cards -->
    <div class="grid grid-cols-1 gap-4">
      <div
        v-for="ep in filteredEndpoints"
        :key="ep.path"
        class="glass-card rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div class="space-y-1.5 min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="px-2 py-0.5 rounded font-mono text-xs font-bold"
              :class="ep.method === 'POST'
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'"
            >
              {{ ep.method }}
            </span>
            <code class="font-mono text-xs sm:text-sm font-bold text-slate-800 dark:text-white break-all">
              {{ ep.displayPath || ep.path }}
            </code>
            <span class="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-white/5 text-[10px] font-semibold text-slate-500">
              {{ ep.category }}
            </span>
            <span
              v-if="ep.optIn"
              class="px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold"
            >
              {{ t('apiOptInBadge') }}
            </span>
          </div>
          <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300">{{ ep.desc }}</p>
          <p class="font-mono text-[11px] text-slate-400 truncate">
            {{ ep.curlExample || `curl -s "https://explorer.kristalteknoloji.com${ep.displayPath || ep.path}"` }}
          </p>
        </div>

        <div v-if="!ep.skipLiveTest" class="flex items-center gap-2 shrink-0">
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

    <!-- Live SSE Stream Tester -->
    <div class="glass-card rounded-2xl p-5 space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="space-y-1">
          <h2 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <span
              class="w-2.5 h-2.5 rounded-full"
              :class="sseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'"
              aria-hidden="true"
            ></span>
            {{ t('apiSseTitle') }}
          </h2>
          <p class="text-xs text-slate-600 dark:text-slate-300">{{ t('apiSseDesc') }}</p>
        </div>

        <div class="flex items-center gap-3 shrink-0">
          <span class="text-xs font-semibold text-slate-500">
            {{ sseConnected ? t('apiSseConnected') : t('apiSseDisconnected') }}
          </span>
          <button
            type="button"
            @click="toggleSseStream"
            class="px-3.5 py-2 rounded-lg text-xs font-semibold text-white transition-colors cursor-pointer"
            :class="sseConnected ? 'bg-rose-600 hover:bg-rose-700' : 'bg-brand-blue hover:bg-brand-blue-hover'"
          >
            {{ sseConnected ? t('apiSseDisconnect') : t('apiSseConnect') }}
          </button>
        </div>
      </div>

      <div class="p-4 rounded-xl bg-slate-950 text-emerald-300 font-mono text-xs overflow-x-auto max-h-64 space-y-1.5">
        <p v-if="sseLogs.length === 0" class="text-slate-400">{{ t('apiSseEmptyLog') }}</p>
        <div v-for="(item, idx) in sseLogs" :key="idx" class="break-all">
          <span class="text-slate-400">[{{ item.ts }}]</span>
          <span class="text-sky-400 font-bold mx-1.5">{{ item.event }}</span>
          <span>{{ item.data }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
