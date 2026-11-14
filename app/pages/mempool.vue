<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from '~/composables/useI18n'
import {
  formatBytes,
  formatCoins,
  formatDurationSeconds,
  formatNumber,
  shortenHash
} from '~/utils/formatters'

const { locale, t } = useI18n()
const { data: mempool, refresh } = await useFetch('/api/mempool')

let timer = null
onMounted(() => {
  timer = setInterval(() => {
    refresh()
  }, 5000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

const sortKey = ref('feeRateSatByte')
const sortDir = ref('descending')
const sortAnnouncement = ref('')

function toggleSort(col, label) {
  if (sortKey.value === col) {
    sortDir.value = sortDir.value === 'ascending' ? 'descending' : 'ascending'
  } else {
    sortKey.value = col
    sortDir.value = 'ascending'
  }
  sortAnnouncement.value = `${t('sortStatusTemplate')} ${label}, ${sortDir.value}, ${sortedPending.value.length} rows`
}

const sortedPending = computed(() => {
  const rows = [...(mempool.value?.transactions || [])]
  const factor = sortDir.value === 'ascending' ? 1 : -1
  return rows.sort((a, b) => factor * (Number(a[sortKey.value] ?? 0) - Number(b[sortKey.value] ?? 0)))
})
</script>

<template>
  <div class="space-y-6">
    <AppBreadcrumbs :items="[{ label: t('navDashboard'), to: '/' }, { label: t('navMempool'), to: '/mempool' }]" />

    <!-- Header -->
    <div class="glass-card rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div class="space-y-1">
        <h1 id="mempool-table-caption" class="text-2xl font-extrabold text-slate-800 dark:text-white flex items-center gap-2">
          <UIcon name="i-heroicons-bolt" class="w-6 h-6 text-brand-salmon" aria-hidden="true" />
          {{ t('mempoolTitle') }}
        </h1>
        <p class="text-sm text-slate-600 dark:text-slate-300">{{ t('mempoolDesc') }}</p>
      </div>
      <button
        type="button"
        @click="refresh()"
        class="self-start md:self-center h-9 px-3.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
      >
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true"></span>
        <span>Live • 5s</span>
      </button>
    </div>

    <!-- KPI Gauges -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      <div class="glass-card rounded-xl p-5">
        <p class="text-xs font-medium text-slate-500 dark:text-slate-400">{{ t('mempoolTxCount') }}</p>
        <p class="text-2xl font-extrabold text-slate-800 dark:text-white mt-1">{{ formatNumber(mempool?.size || 0, 0) }}</p>
      </div>
      <div class="glass-card rounded-xl p-5">
        <p class="text-xs font-medium text-slate-500 dark:text-slate-400">{{ t('mempoolSize') }}</p>
        <p class="text-2xl font-extrabold text-slate-800 dark:text-white mt-1">{{ formatBytes(mempool?.bytes || 0) }}</p>
      </div>
      <div class="glass-card rounded-xl p-5">
        <p class="text-xs font-medium text-slate-500 dark:text-slate-400">{{ t('mempoolUsage') }}</p>
        <p class="text-2xl font-extrabold text-slate-800 dark:text-white mt-1">{{ formatBytes(mempool?.usage || 0) }}</p>
      </div>
      <div class="glass-card rounded-xl p-5">
        <p class="text-xs font-medium text-slate-500 dark:text-slate-400">{{ t('totalFeesLabel') }}</p>
        <p class="text-2xl font-extrabold text-brand-salmon mt-1">{{ formatCoins(mempool?.totalFees || 0, 6) }}</p>
      </div>
    </div>

    <div role="status" class="sr-status">{{ sortAnnouncement }}</div>

    <!-- Pending Transactions Table -->
    <div class="glass-card rounded-2xl overflow-hidden data-panel-contain">
      <div v-if="sortedPending.length" tabindex="0" role="region" aria-labelledby="mempool-table-caption" class="table-wrapper">
        <table class="text-left text-sm">
          <thead class="bg-slate-100 dark:bg-slate-900/95 text-slate-700 dark:text-gray-300 font-semibold uppercase text-xs">
            <tr>
              <th scope="col" class="p-3.5">{{ t('txid') }}</th>
              <th scope="col" class="p-3.5">{{ t('type') }}</th>
              <th scope="col" :aria-sort="sortKey === 'totalOut' ? sortDir : undefined">
                <button type="button" class="sort-btn" @click="toggleSort('totalOut', t('amount'))">
                  <span>{{ t('amount') }}</span>
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" class="sort-icon w-3.5 h-3.5 shrink-0">
                    <path d="M8 11.5L3.5 6.5h9L8 11.5z" />
                  </svg>
                </button>
              </th>
              <th scope="col" :aria-sort="sortKey === 'fee' ? sortDir : undefined">
                <button type="button" class="sort-btn" @click="toggleSort('fee', t('fee'))">
                  <span>{{ t('fee') }}</span>
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" class="sort-icon w-3.5 h-3.5 shrink-0">
                    <path d="M8 11.5L3.5 6.5h9L8 11.5z" />
                  </svg>
                </button>
              </th>
              <th scope="col" :aria-sort="sortKey === 'feeRateSatByte' ? sortDir : undefined">
                <button type="button" class="sort-btn" @click="toggleSort('feeRateSatByte', t('feeRate'))">
                  <span>{{ t('feeRate') }}</span>
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" class="sort-icon w-3.5 h-3.5 shrink-0">
                    <path d="M8 11.5L3.5 6.5h9L8 11.5z" />
                  </svg>
                </button>
              </th>
              <th scope="col" :aria-sort="sortKey === 'size' ? sortDir : undefined">
                <button type="button" class="sort-btn" @click="toggleSort('size', t('size'))">
                  <span>{{ t('size') }}</span>
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" class="sort-icon w-3.5 h-3.5 shrink-0">
                    <path d="M8 11.5L3.5 6.5h9L8 11.5z" />
                  </svg>
                </button>
              </th>
              <th scope="col" :aria-sort="sortKey === 'waitingSeconds' ? sortDir : undefined">
                <button type="button" class="sort-btn justify-end" @click="toggleSort('waitingSeconds', t('waitingTime'))">
                  <span>{{ t('waitingTime') }}</span>
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" class="sort-icon w-3.5 h-3.5 shrink-0">
                    <path d="M8 11.5L3.5 6.5h9L8 11.5z" />
                  </svg>
                </button>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200/60 dark:divide-white/5">
            <tr v-for="tx in sortedPending" :key="tx.txid" class="hover:bg-slate-100/50 dark:hover:bg-white/5">
              <td class="p-3.5 font-mono text-xs sm:text-sm text-brand-blue whitespace-nowrap">
                <NuxtLink :to="`/tx/${tx.txid}`" class="hover:text-brand-salmon">{{ shortenHash(tx.txid, 10) }}</NuxtLink>
              </td>
              <td class="p-3.5 whitespace-nowrap">
                <TxTypeBadge :tx-type="tx.txType" />
              </td>
              <td class="p-3.5 font-semibold whitespace-nowrap">{{ formatCoins(tx.totalOut, 4) }}</td>
              <td class="p-3.5 whitespace-nowrap">{{ formatCoins(tx.fee, 6) }}</td>
              <td class="p-3.5 font-mono text-xs whitespace-nowrap">{{ tx.feeRateSatByte }} sat/B</td>
              <td class="p-3.5 whitespace-nowrap">{{ formatBytes(tx.size) }}</td>
              <td class="p-3.5 text-right font-mono text-xs whitespace-nowrap">
                {{ formatDurationSeconds(tx.waitingSeconds, locale) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="py-12 px-6 text-center space-y-2">
        <div class="inline-flex p-3 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <UIcon name="i-heroicons-check-circle" class="w-7 h-7" aria-hidden="true" />
        </div>
        <p class="text-sm font-semibold text-slate-700 dark:text-slate-200">{{ t('mempoolEmpty') }}</p>
      </div>
    </div>
  </div>
</template>
