<script setup>
import { ref, computed } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { formatDurationSeconds, formatNumber, shortenHash } from '~/utils/formatters'

const { locale, t } = useI18n()
const { data: valData, refresh } = await useFetch('/api/validators')

const activeTab = ref('pool')
const tabKeys = ['pool', 'llmq', 'masternodes']

function onTabKeydown(e) {
  const idx = tabKeys.indexOf(activeTab.value)
  if (idx === -1) return
  let nextIdx = -1
  if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabKeys.length
  else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabKeys.length) % tabKeys.length
  else if (e.key === 'Home') nextIdx = 0
  else if (e.key === 'End') nextIdx = tabKeys.length - 1
  if (nextIdx !== -1) {
    e.preventDefault()
    activeTab.value = tabKeys[nextIdx]
    const btn = document.getElementById(`val-tab-${tabKeys[nextIdx]}`)
    btn?.focus()
  }
}

const trackFilter = ref('all')
const sortKey = ref('vrfTickets')
const sortDir = ref('descending')
const sortAnnouncement = ref('')

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function toggleSort(col, label) {
  if (sortKey.value === col) {
    sortDir.value = sortDir.value === 'ascending' ? 'descending' : 'ascending'
  } else {
    sortKey.value = col
    sortDir.value = 'ascending'
  }
  sortAnnouncement.value = `${t('sortStatusTemplate')} ${label}, ${sortDir.value}, ${sortedValidators.value.length} rows`
}

const sortedValidators = computed(() => {
  const all = valData.value?.validators || []
  const filtered = trackFilter.value === 'all' ? [...all] : all.filter((v) => v.track === trackFilter.value)
  const factor = sortDir.value === 'ascending' ? 1 : -1

  return filtered.sort((a, b) => {
    if (sortKey.value === 'address' || sortKey.value === 'track') {
      return factor * collator.compare(String(a[sortKey.value] || ''), String(b[sortKey.value] || ''))
    }
    return factor * (Number(a[sortKey.value] ?? 0) - Number(b[sortKey.value] ?? 0))
  })
})

function trackBadgeClass(track) {
  switch (track) {
    case 'masternode':
      return 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30'
    case 'coin_lock':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
    case 'pow_lock':
      return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
    case 'zerocoin_pow':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
    default:
      return 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30'
  }
}

function trackLabel(track) {
  switch (track) {
    case 'masternode':
      return `🛡️ ${t('trackMasternode')} (4,200)`
    case 'coin_lock':
      return `🔒 ${t('trackCoinLock')}`
    case 'pow_lock':
      return `⚡ ${t('trackPowLock')}`
    case 'zerocoin_pow':
      return `🌱 ${t('trackZeroCoin')}`
    default:
      return t('trackBootstrap')
  }
}
</script>

<template>
  <div class="space-y-6">
    <AppBreadcrumbs :items="[{ label: t('navDashboard'), to: '/' }, { label: t('navValidators'), to: '/validators' }]" />

    <!-- Title Banner -->
    <div class="glass-card rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div class="space-y-1">
        <h1 class="text-2xl font-extrabold text-slate-800 dark:text-white flex items-center gap-2">
          <UIcon name="i-heroicons-shield-check" class="w-6 h-6 text-purple-500" aria-hidden="true" />
          {{ t('validatorsTitle') }}
        </h1>
        <p class="text-sm text-slate-600 dark:text-slate-300">
          {{ t('validatorsDesc') }}
        </p>
      </div>
      <button
        type="button"
        @click="refresh()"
        class="self-start lg:self-center h-9 px-3.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
      >
        <UIcon name="i-heroicons-arrow-path" class="w-4 h-4" aria-hidden="true" />
        <span>#{{ formatNumber(valData?.height || 0, 0) }}</span>
      </button>
    </div>

    <!-- Dual-Track Committee Quota Cards (7 MN + 1 Coin-Lock + 3 Open PoW) -->
    <div v-if="valData?.quotas" class="grid grid-cols-1 md:grid-cols-3 gap-5">
      <div class="glass-card rounded-xl p-5 space-y-3 border-t-4 border-t-purple-500">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-300">
            Sub-Track 1A • Masternode
          </span>
          <span class="text-xs font-mono font-bold text-slate-700 dark:text-slate-200">
            {{ valData.quotas.masternode.used }} / {{ valData.quotas.masternode.max }} seats
          </span>
        </div>
        <div class="text-2xl font-extrabold text-slate-800 dark:text-white">
          {{ valData.summary?.masternode || 0 }} <span class="text-sm font-medium text-slate-500">Active (4,200 KRISTA)</span>
        </div>
        <div class="w-full h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
          <div
            class="h-full bg-purple-500 rounded-full"
            :style="{ width: `${Math.min(100, (valData.quotas.masternode.used / valData.quotas.masternode.max) * 100)}%` }"
          ></div>
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          Model D Net Pool: <strong>20.0%</strong> (~2.86% / seat) • <strong>65</strong> VRF tickets
        </p>
      </div>

      <div class="glass-card rounded-xl p-5 space-y-3 border-t-4 border-t-amber-500">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-300">
            Sub-Track 1B • Coin-Lock
          </span>
          <span class="text-xs font-mono font-bold text-slate-700 dark:text-slate-200">
            {{ valData.quotas.coinLock.used }} / {{ valData.quotas.coinLock.max }} seat
          </span>
        </div>
        <div class="text-2xl font-extrabold text-slate-800 dark:text-white">
          {{ valData.summary?.coin_lock || 0 }} <span class="text-sm font-medium text-slate-500">Registered (250 KRISTA)</span>
        </div>
        <div class="w-full h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
          <div
            class="h-full bg-amber-500 rounded-full"
            :style="{ width: `${Math.min(100, (valData.quotas.coinLock.used / valData.quotas.coinLock.max) * 100)}%` }"
          ></div>
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          Model D Net Pool: <strong>8.0%</strong> (strictly isolated) • <strong>16</strong> VRF tickets (max 1)
        </p>
      </div>

      <div class="glass-card rounded-xl p-5 space-y-3 border-t-4 border-t-sky-500">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-300">
            Track 2 • Open PoW
          </span>
          <span class="text-xs font-mono font-bold text-slate-700 dark:text-slate-200">
            {{ valData.quotas.openPow.used }} / {{ valData.quotas.openPow.max }} seats
          </span>
        </div>
        <div class="text-2xl font-extrabold text-slate-800 dark:text-white">
          {{ valData.quotas.openPow.available }} <span class="text-sm font-medium text-slate-500">Miners (10 PoW / Zero-Coin)</span>
        </div>
        <div class="w-full h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
          <div
            class="h-full bg-sky-500 rounded-full"
            :style="{ width: `${Math.min(100, (valData.quotas.openPow.used / valData.quotas.openPow.max) * 100)}%` }"
          ></div>
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          Model D Net Pool: <strong>12.0%</strong> (4.00% / seat) • <strong>4</strong> VRF tickets each (max 3 = 12)
        </p>
      </div>
    </div>

    <!-- 65 : 16 : 4 Quadratic Coordinator VRF Live Distribution -->
    <div v-if="valData?.coordinatorVrf" class="glass-card rounded-2xl p-6 space-y-4">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h2 class="text-lg font-bold text-slate-800 dark:text-white">{{ t('coordVrfTitle') }}</h2>
          <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300">{{ t('coordVrfDesc') }}</p>
        </div>
        <span class="text-xs font-mono px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10 font-semibold">
          Total Pool Weight: {{ valData.coordinatorVrf.totalPoolWeight }} tickets
        </span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div class="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 flex justify-between items-center">
          <div>
            <div class="font-bold text-purple-700 dark:text-purple-300">Masternode Track</div>
            <div class="text-slate-600 dark:text-slate-300 mt-0.5">{{ valData.coordinatorVrf.totalMnWeight }} tickets ({{ valData.coordinatorVrf.perMnSeatPct }}% / MN)</div>
          </div>
          <div class="text-lg font-extrabold text-purple-700 dark:text-purple-300">{{ valData.coordinatorVrf.mnSharePct }}%</div>
        </div>
        <div class="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex justify-between items-center">
          <div>
            <div class="font-bold text-amber-700 dark:text-amber-300">Coin-Lock Track (max 1)</div>
            <div class="text-slate-600 dark:text-slate-300 mt-0.5">{{ valData.coordinatorVrf.totalCoinLockWeight }} tickets ({{ valData.coordinatorVrf.perCoinLockSeatPct }}% / rep)</div>
          </div>
          <div class="text-lg font-extrabold text-amber-700 dark:text-amber-300">{{ valData.coordinatorVrf.coinLockSharePct }}%</div>
        </div>
        <div class="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/20 flex justify-between items-center">
          <div>
            <div class="font-bold text-sky-700 dark:text-sky-300">Funded PoW-Lock (max 3)</div>
            <div class="text-slate-600 dark:text-slate-300 mt-0.5">{{ valData.coordinatorVrf.totalPowLockWeight }} tickets ({{ valData.coordinatorVrf.perPowLockSeatPct }}% / rep)</div>
          </div>
          <div class="text-lg font-extrabold text-sky-700 dark:text-sky-300">{{ valData.coordinatorVrf.powLockSharePct }}%</div>
        </div>
      </div>
    </div>

    <!-- Accessible Tabs: Validator Pool | LLMQ Quorum | Masternodes -->
    <div class="space-y-4">
      <div role="tablist" aria-label="Validator sections" class="explorer-tablist" @keydown="onTabKeydown">
        <button
          id="val-tab-pool"
          role="tab"
          type="button"
          :aria-selected="activeTab === 'pool' ? 'true' : 'false'"
          :tabindex="activeTab === 'pool' ? 0 : -1"
          @click="activeTab = 'pool'"
        >
          {{ t('tabValidatorPool') }} ({{ valData?.summary?.total || 0 }})
        </button>
        <button
          id="val-tab-llmq"
          role="tab"
          type="button"
          :aria-selected="activeTab === 'llmq' ? 'true' : 'false'"
          :tabindex="activeTab === 'llmq' ? 0 : -1"
          @click="activeTab = 'llmq'"
        >
          {{ t('tabLlmqQuorum') }} ({{ valData?.quorum?.members?.length || 0 }})
        </button>
        <button
          id="val-tab-masternodes"
          role="tab"
          type="button"
          :aria-selected="activeTab === 'masternodes' ? 'true' : 'false'"
          :tabindex="activeTab === 'masternodes' ? 0 : -1"
          @click="activeTab = 'masternodes'"
        >
          {{ t('tabMasternodes') }} ({{ valData?.masternodes?.length || 0 }})
        </button>
      </div>

      <!-- TAB 1: ADAM Validator Pool -->
      <div role="tabpanel" aria-labelledby="val-tab-pool" :hidden="activeTab !== 'pool' ? true : undefined">
        <div class="glass-card rounded-2xl overflow-hidden space-y-3 p-4 sm:p-6 data-panel-contain">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 id="validator-pool-caption" class="text-base font-bold text-slate-800 dark:text-white">
              {{ t('tabValidatorPool') }}
            </h3>
            <div class="flex flex-wrap gap-1.5 text-xs">
              <button
                v-for="tf in [
                  { key: 'all', label: t('allFilter') },
                  { key: 'masternode', label: t('trackMasternode') },
                  { key: 'coin_lock', label: t('trackCoinLock') },
                  { key: 'pow_lock', label: t('trackPowLock') },
                  { key: 'zerocoin_pow', label: t('trackZeroCoin') },
                  { key: 'bootstrap', label: t('trackBootstrap') }
                ]"
                :key="tf.key"
                type="button"
                @click="trackFilter = tf.key"
                class="px-2.5 py-1 rounded-lg font-semibold border transition-colors cursor-pointer"
                :class="trackFilter === tf.key ? 'bg-brand-blue text-white border-brand-blue' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'"
              >
                {{ tf.label }}
              </button>
            </div>
          </div>

          <div role="status" class="sr-status">{{ sortAnnouncement }}</div>

          <div tabindex="0" role="region" aria-labelledby="validator-pool-caption" class="table-wrapper">
            <table class="text-left text-sm">
              <thead class="bg-slate-100 dark:bg-slate-900/95 text-slate-700 dark:text-gray-300 font-semibold uppercase text-xs">
                <tr>
                  <th scope="col" :aria-sort="sortKey === 'index' ? sortDir : undefined">
                    <button type="button" class="sort-btn" @click="toggleSort('index', '#')">
                      <span>#</span>
                      <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" class="sort-icon w-3.5 h-3.5 shrink-0">
                        <path d="M8 11.5L3.5 6.5h9L8 11.5z" />
                      </svg>
                    </button>
                  </th>
                  <th scope="col" :aria-sort="sortKey === 'address' ? sortDir : undefined">
                    <button type="button" class="sort-btn" @click="toggleSort('address', t('holderAddress'))">
                      <span>{{ t('holderAddress') }}</span>
                      <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" class="sort-icon w-3.5 h-3.5 shrink-0">
                        <path d="M8 11.5L3.5 6.5h9L8 11.5z" />
                      </svg>
                    </button>
                  </th>
                  <th scope="col" :aria-sort="sortKey === 'track' ? sortDir : undefined">
                    <button type="button" class="sort-btn" @click="toggleSort('track', t('type'))">
                      <span>{{ t('type') }}</span>
                      <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" class="sort-icon w-3.5 h-3.5 shrink-0">
                        <path d="M8 11.5L3.5 6.5h9L8 11.5z" />
                      </svg>
                    </button>
                  </th>
                  <th scope="col" class="p-3.5">PubKey</th>
                  <th scope="col" :aria-sort="sortKey === 'vrfTickets' ? sortDir : undefined">
                    <button type="button" class="sort-btn" @click="toggleSort('vrfTickets', t('vrfTickets'))">
                      <span>{{ t('vrfTickets') }}</span>
                      <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" class="sort-icon w-3.5 h-3.5 shrink-0">
                        <path d="M8 11.5L3.5 6.5h9L8 11.5z" />
                      </svg>
                    </button>
                  </th>
                  <th scope="col" :aria-sort="sortKey === 'vrfSeatPct' ? sortDir : undefined">
                    <button type="button" class="sort-btn" @click="toggleSort('vrfSeatPct', t('vrfSeatProb'))">
                      <span>{{ t('vrfSeatProb') }}</span>
                      <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" class="sort-icon w-3.5 h-3.5 shrink-0">
                        <path d="M8 11.5L3.5 6.5h9L8 11.5z" />
                      </svg>
                    </button>
                  </th>
                  <th scope="col" :aria-sort="sortKey === 'unlock_height' ? sortDir : undefined">
                    <button type="button" class="sort-btn justify-end" @click="toggleSort('unlock_height', t('unlockCountdown'))">
                      <span>{{ t('unlockCountdown') }}</span>
                      <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" class="sort-icon w-3.5 h-3.5 shrink-0">
                        <path d="M8 11.5L3.5 6.5h9L8 11.5z" />
                      </svg>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200/60 dark:divide-white/5">
                <tr v-for="v in sortedValidators" :key="`${v.index}-${v.pubkey}`" class="hover:bg-slate-100/50 dark:hover:bg-white/5">
                  <td class="p-3.5 font-mono text-xs text-slate-500">{{ v.index + 1 }}</td>
                  <td class="p-3.5 font-mono text-xs sm:text-sm whitespace-nowrap">
                    <NuxtLink :to="`/address/${v.address}`" class="text-brand-salmon font-semibold hover:underline">
                      {{ v.address }}
                    </NuxtLink>
                  </td>
                  <td class="p-3.5 whitespace-nowrap">
                    <span class="px-2 py-0.5 rounded border text-[11px] font-semibold" :class="trackBadgeClass(v.track)">
                      {{ trackLabel(v.track) }}
                    </span>
                  </td>
                  <td class="p-3.5 font-mono text-xs text-slate-500 whitespace-nowrap" :title="v.pubkey">
                    {{ shortenHash(v.pubkey, 8) }}
                  </td>
                  <td class="p-3.5 font-mono font-bold text-slate-800 dark:text-white whitespace-nowrap">
                    {{ v.vrfTickets }}
                  </td>
                  <td class="p-3.5 font-mono text-xs font-semibold text-brand-blue whitespace-nowrap">
                    {{ v.vrfSeatPct }}%
                  </td>
                  <td class="p-3.5 text-right text-xs whitespace-nowrap">
                    <div v-if="v.unlock_height > 0">
                      <span class="font-mono font-semibold text-slate-800 dark:text-slate-200">#{{ v.unlock_height }}</span>
                      <span v-if="v.blocksRemaining > 0" class="ml-1 text-slate-500">
                        ({{ formatDurationSeconds(v.blocksRemaining * 30, locale) }})
                      </span>
                    </div>
                    <span v-else class="text-slate-400">{{ t('permanentBootstrap') }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB 2: LLMQ Active Quorum -->
      <div role="tabpanel" aria-labelledby="val-tab-llmq" :hidden="activeTab !== 'llmq' ? true : undefined">
        <div class="glass-card rounded-2xl p-6 space-y-5">
          <div v-if="valData?.quorum" class="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div class="p-3.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
              <div class="text-slate-500">BFT Threshold</div>
              <div class="text-base font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {{ valData.quorum.threshold }} / {{ valData.quorum.members?.length || 5 }} BLS
              </div>
            </div>
            <div class="p-3.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
              <div class="text-slate-500">DKG Anchor Height</div>
              <div class="text-base font-extrabold text-slate-800 dark:text-white mt-0.5">#{{ valData.quorum.dkgHeight }}</div>
            </div>
            <div class="p-3.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 md:col-span-2">
              <div class="text-slate-500">Quorum Hash</div>
              <div class="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200 truncate mt-1" :title="valData.quorum.quorumHash">
                {{ valData.quorum.quorumHash }}
              </div>
            </div>
          </div>

          <div tabindex="0" role="region" aria-label="LLMQ Quorum Members" class="table-wrapper">
            <table class="text-left text-sm">
              <thead class="bg-slate-100 dark:bg-slate-900/95 text-slate-700 dark:text-gray-300 font-semibold uppercase text-xs">
                <tr>
                  <th scope="col" class="p-3.5">{{ t('rank') }}</th>
                  <th scope="col" class="p-3.5">{{ t('holderAddress') }}</th>
                  <th scope="col" class="p-3.5">PubKey</th>
                  <th scope="col" class="p-3.5">Collateral OutPoint</th>
                  <th scope="col" class="p-3.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200/60 dark:divide-white/5">
                <tr v-for="m in valData?.quorum?.members || []" :key="`${m.rank}-${m.pubkey}`">
                  <td class="p-3.5 font-mono font-bold">#{{ m.rank }}</td>
                  <td class="p-3.5 font-mono text-xs sm:text-sm">
                    <NuxtLink :to="`/address/${m.addr}`" class="text-brand-salmon font-semibold hover:underline">{{ m.addr }}</NuxtLink>
                  </td>
                  <td class="p-3.5 font-mono text-xs text-slate-500">{{ shortenHash(m.pubkey, 10) }}</td>
                  <td class="p-3.5 font-mono text-xs text-slate-500">{{ shortenHash(m.txhash, 8) }}:{{ m.outidx }}</td>
                  <td class="p-3.5 text-right">
                    <span class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                      {{ m.status }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB 3: Masternode Registry -->
      <div role="tabpanel" aria-labelledby="val-tab-masternodes" :hidden="activeTab !== 'masternodes' ? true : undefined">
        <div class="glass-card rounded-2xl p-6">
          <div v-if="valData?.masternodes?.length" tabindex="0" role="region" aria-label="Masternode Registry" class="table-wrapper">
            <table class="text-left text-sm">
              <thead class="bg-slate-100 dark:bg-slate-900/95 text-slate-700 dark:text-gray-300 font-semibold uppercase text-xs">
                <tr>
                  <th scope="col" class="p-3.5">{{ t('rank') }}</th>
                  <th scope="col" class="p-3.5">{{ t('holderAddress') }}</th>
                  <th scope="col" class="p-3.5">Collateral</th>
                  <th scope="col" class="p-3.5">{{ t('version') }}</th>
                  <th scope="col" class="p-3.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200/60 dark:divide-white/5">
                <tr v-for="mn in valData.masternodes" :key="`${mn.txhash}-${mn.outidx}`">
                  <td class="p-3.5 font-mono">#{{ mn.rank }}</td>
                  <td class="p-3.5 font-mono text-xs sm:text-sm">
                    <NuxtLink :to="`/address/${mn.addr}`" class="text-brand-salmon font-semibold hover:underline">{{ mn.addr }}</NuxtLink>
                  </td>
                  <td class="p-3.5 font-mono text-xs">
                    <NuxtLink v-if="mn.txhash" :to="`/tx/${mn.txhash}`" class="text-brand-blue hover:underline">
                      {{ shortenHash(mn.txhash, 8) }}:{{ mn.outidx }}
                    </NuxtLink>
                  </td>
                  <td class="p-3.5 font-mono text-xs">{{ mn.version }}</td>
                  <td class="p-3.5 text-right">
                    <span class="px-2 py-0.5 rounded bg-purple-500/15 text-purple-700 dark:text-purple-300 text-xs font-semibold">
                      {{ mn.status }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="py-10 text-center text-slate-500 dark:text-slate-400 text-sm">
            {{ t('noMasternodes') }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
