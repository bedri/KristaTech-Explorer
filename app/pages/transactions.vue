<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from '~/composables/useI18n'
import {
  formatCoins,
  formatDate,
  formatNumber,
  formatRelativeTime,
  shortenHash
} from '~/utils/formatters'

const { locale, t } = useI18n()
const page = ref(1)
const limit = ref(25)
const filter = ref('all')

watch([filter, limit], () => {
  page.value = 1
})

const { data: txData, refresh } = await useFetch(
  () => `/api/transactions?page=${page.value}&limit=${limit.value}&type=${filter.value}`
)

const sortKey = ref('time')
const sortDir = ref('descending')
const sortAnnouncement = ref('')

function toggleSort(col, label) {
  if (sortKey.value === col) {
    sortDir.value = sortDir.value === 'ascending' ? 'descending' : 'ascending'
  } else {
    sortKey.value = col
    sortDir.value = 'ascending'
  }
  sortAnnouncement.value = `${t('sortStatusTemplate')} ${label}, ${sortDir.value}, ${sortedTransactions.value.length} rows`
}

const sortedTransactions = computed(() => {
  const rows = [...(txData.value?.transactions || [])]
  const factor = sortDir.value === 'ascending' ? 1 : -1
  return rows.sort((a, b) => {
    const va = Number(a[sortKey.value] ?? 0)
    const vb = Number(b[sortKey.value] ?? 0)
    return factor * (va - vb)
  })
})

const categoryPills = computed(() => {
  const c = txData.value?.countsByType || {}
  return [
    { key: 'all', label: t('allFilter'), count: c.all || 0 },
    { key: 'standard', label: t('filterStandard'), count: c.standard || 0 },
    { key: 'rewards', label: t('filterRewards'), count: c.rewards || 0 },
    { key: 'coin_lock', label: '🔒 250 Lock', count: c.coin_lock || 0 },
    { key: 'pow_lock', label: '⚡ 10 PoW', count: c.pow_lock || 0 },
    { key: 'zerocoin_pow', label: '🌱 Zero-Coin', count: c.zerocoin_pow || 0 },
    { key: 'burn', label: `🔥 ${t('filterBurns')}`, count: c.burn || 0 },
    { key: 'contract', label: `📜 ${t('filterContracts')}`, count: c.contract || 0 }
  ]
})

function goToPage(p) {
  const max = txData.value?.totalPages || 1
  if (p >= 1 && p <= max) page.value = p
}
</script>

<template>
  <div class="space-y-6">
    <AppBreadcrumbs :items="[{ label: t('navDashboard'), to: '/' }, { label: t('navTransactions'), to: '/transactions' }]" />

    <!-- Header & Category Filters -->
    <div class="glass-card rounded-2xl p-6 space-y-4">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div class="space-y-1">
          <h1 id="txs-table-caption" class="text-2xl font-extrabold text-slate-800 dark:text-white flex items-center gap-2">
            <UIcon name="i-heroicons-arrows-right-left" class="w-6 h-6 text-brand-blue" aria-hidden="true" />
            {{ t('txsExplorerTitle') }}
          </h1>
          <p class="text-sm text-slate-600 dark:text-slate-300">
            {{ t('txsExplorerDesc') }}
          </p>
        </div>

        <div class="flex items-center gap-2">
          <select
            v-model.number="limit"
            aria-label="Rows per page"
            class="h-9 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            <option :value="25">25 / page</option>
            <option :value="50">50 / page</option>
            <option :value="100">100 / page</option>
          </select>

          <button
            type="button"
            @click="refresh()"
            class="h-9 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
          >
            <UIcon name="i-heroicons-arrow-path" class="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <!-- Filter Pills -->
      <div class="flex flex-wrap gap-2 pt-2 border-t border-slate-200/60 dark:border-white/10">
        <button
          v-for="pill in categoryPills"
          :key="pill.key"
          type="button"
          @click="filter = pill.key"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer"
          :class="
            filter === pill.key
              ? 'bg-brand-blue text-white border-brand-blue shadow-sm'
              : 'bg-slate-100/80 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
          "
        >
          <span>{{ pill.label }}</span>
          <span
            class="px-1.5 py-0.2 rounded text-[10px] font-mono"
            :class="filter === pill.key ? 'bg-white/20 text-white' : 'bg-slate-200/80 dark:bg-slate-900 text-slate-600 dark:text-slate-300'"
          >
            {{ formatNumber(pill.count, 0) }}
          </span>
        </button>
      </div>
    </div>

    <div role="status" class="sr-status">{{ sortAnnouncement }}</div>

    <!-- Transactions Data Table -->
    <div class="glass-card rounded-2xl overflow-hidden data-panel-contain">
      <div tabindex="0" role="region" aria-labelledby="txs-table-caption" class="table-wrapper">
        <table class="text-left text-sm">
          <thead class="bg-slate-100 dark:bg-slate-900/95 text-slate-700 dark:text-gray-300 font-semibold uppercase text-xs">
            <tr>
              <th scope="col" class="p-3.5">{{ t('txid') }}</th>
              <th scope="col" class="p-3.5">{{ t('type') }}</th>
              <th scope="col" :aria-sort="sortKey === 'block_height' ? sortDir : undefined">
                <button type="button" class="sort-btn" @click="toggleSort('block_height', t('height'))">
                  <span>{{ t('height') }}</span>
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" class="sort-icon w-3.5 h-3.5 shrink-0">
                    <path d="M8 11.5L3.5 6.5h9L8 11.5z" />
                  </svg>
                </button>
              </th>
              <th scope="col" :aria-sort="sortKey === 'value' ? sortDir : undefined">
                <button type="button" class="sort-btn" @click="toggleSort('value', t('amount'))">
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
              <th scope="col" :aria-sort="sortKey === 'time' ? sortDir : undefined">
                <button type="button" class="sort-btn justify-end" @click="toggleSort('time', t('time'))">
                  <span>{{ t('time') }}</span>
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" class="sort-icon w-3.5 h-3.5 shrink-0">
                    <path d="M8 11.5L3.5 6.5h9L8 11.5z" />
                  </svg>
                </button>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200/60 dark:divide-white/5">
            <tr
              v-for="tx in sortedTransactions"
              :key="tx.txid"
              class="hover:bg-slate-100/50 dark:hover:bg-white/5 transition-colors"
            >
              <td class="p-3.5 font-mono text-xs sm:text-sm text-brand-blue whitespace-nowrap">
                <NuxtLink :to="`/tx/${tx.txid}`" class="hover:text-brand-salmon transition-colors">
                  {{ shortenHash(tx.txid, 10) }}
                </NuxtLink>
              </td>
              <td class="p-3.5 whitespace-nowrap">
                <TxTypeBadge :tx-type="tx.txType" :is-coinbase="tx.isCoinbase" :is-coinstake="tx.isCoinstake" />
              </td>
              <td class="p-3.5 font-mono text-xs whitespace-nowrap">
                <NuxtLink v-if="tx.block_height !== null" :to="`/block/${tx.block_height}`" class="text-brand-salmon font-semibold hover:underline">
                  #{{ tx.block_height }}
                </NuxtLink>
                <span v-else class="text-slate-400">—</span>
              </td>
              <td class="p-3.5 font-semibold text-slate-800 dark:text-gray-200 whitespace-nowrap">
                {{ formatCoins(tx.value, 4) }}
              </td>
              <td class="p-3.5 text-slate-600 dark:text-gray-300 whitespace-nowrap">
                {{ formatCoins(tx.fee, 6) }}
              </td>
              <td class="p-3.5 text-right text-slate-600 dark:text-gray-300 whitespace-nowrap" :title="formatDate(tx.time)">
                <div class="text-xs font-medium">{{ formatRelativeTime(tx.time, locale) }}</div>
                <div class="text-[10px] text-slate-400 font-mono">{{ formatDate(tx.time) }}</div>
              </td>
            </tr>
            <tr v-if="!sortedTransactions.length">
              <td colspan="6" class="p-8 text-center text-slate-400">{{ t('noTxs') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="(txData?.totalPages || 1) > 1" class="flex items-center justify-between gap-4 text-xs sm:text-sm">
      <span class="text-slate-500 dark:text-slate-400">
        {{ t('pageOf') }} <strong>{{ page }}</strong> / <strong>{{ txData?.totalPages }}</strong>
      </span>
      <div class="flex items-center gap-2">
        <button
          type="button"
          :disabled="page <= 1"
          @click="goToPage(page - 1)"
          class="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/10 disabled:opacity-40 disabled:cursor-not-allowed font-semibold cursor-pointer"
        >
          ← {{ t('prevPage') }}
        </button>
        <button
          type="button"
          :disabled="page >= (txData?.totalPages || 1)"
          @click="goToPage(page + 1)"
          class="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/10 disabled:opacity-40 disabled:cursor-not-allowed font-semibold cursor-pointer"
        >
          {{ t('nextPage') }} →
        </button>
      </div>
    </div>
  </div>
</template>
