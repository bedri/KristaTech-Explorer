<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from '~/composables/useI18n'
import {
  formatBytes,
  formatDate,
  formatNumber,
  formatRelativeTime,
  shortenHash
} from '~/utils/formatters'

const { locale, t } = useI18n()
const page = ref(1)
const limit = ref(25)
const typeFilter = ref('all')

watch([typeFilter, limit], () => {
  page.value = 1
})

const { data: blocksData, refresh } = await useFetch(
  () => `/api/blocks?page=${page.value}&limit=${limit.value}&type=${typeFilter.value}`
)

const sortKey = ref('height')
const sortDir = ref('descending')
const sortAnnouncement = ref('')

function toggleSort(col, label) {
  if (sortKey.value === col) {
    sortDir.value = sortDir.value === 'ascending' ? 'descending' : 'ascending'
  } else {
    sortKey.value = col
    sortDir.value = 'ascending'
  }
  const count = sortedBlocks.value.length
  sortAnnouncement.value = `${t('sortStatusTemplate')} ${label}, ${sortDir.value}, ${count} rows`
}

const sortedBlocks = computed(() => {
  const rows = [...(blocksData.value?.blocks || [])]
  const factor = sortDir.value === 'ascending' ? 1 : -1
  return rows.sort((a, b) => {
    const va = Number(a[sortKey.value] ?? 0)
    const vb = Number(b[sortKey.value] ?? 0)
    return factor * (va - vb)
  })
})

function goToPage(p) {
  const max = blocksData.value?.totalPages || 1
  if (p >= 1 && p <= max) page.value = p
}
</script>

<template>
  <div class="space-y-6">
    <AppBreadcrumbs :items="[{ label: t('navDashboard'), to: '/' }, { label: t('navBlocks'), to: '/blocks' }]" />

    <!-- Header & Filter Bar -->
    <div class="glass-card rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div class="space-y-1">
        <h1 id="blocks-table-caption" class="text-2xl font-extrabold text-slate-800 dark:text-white flex items-center gap-2">
          <UIcon name="i-heroicons-rectangle-stack" class="w-6 h-6 text-brand-salmon" aria-hidden="true" />
          {{ t('blocksExplorerTitle') }}
        </h1>
        <p class="text-sm text-slate-600 dark:text-slate-300">
          {{ t('blocksExplorerDesc') }}
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2.5">
        <div class="inline-flex rounded-xl bg-slate-100 dark:bg-white/5 p-1 border border-slate-200 dark:border-white/10 text-xs font-semibold">
          <button
            v-for="opt in [
              { key: 'all', label: `${t('allFilter')} (${formatNumber(blocksData?.counts?.all || 0, 0)})` },
              { key: 'pow', label: `PoW (${formatNumber(blocksData?.counts?.pow || 0, 0)})` },
              { key: 'pos', label: `PoS (${formatNumber(blocksData?.counts?.pos || 0, 0)})` }
            ]"
            :key="opt.key"
            type="button"
            @click="typeFilter = opt.key"
            class="px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            :class="typeFilter === opt.key ? 'bg-brand-salmon text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'"
          >
            {{ opt.label }}
          </button>
        </div>

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

    <!-- Visually hidden live status announcer for table sorting -->
    <div role="status" class="sr-status">{{ sortAnnouncement }}</div>

    <!-- Sortable Blocks Table -->
    <div class="glass-card rounded-2xl overflow-hidden data-panel-contain">
      <div tabindex="0" role="region" aria-labelledby="blocks-table-caption" class="table-wrapper">
        <table class="text-left text-sm">
          <thead class="bg-slate-100 dark:bg-slate-900/95 text-slate-700 dark:text-gray-300 font-semibold uppercase text-xs">
            <tr>
              <th scope="col" :aria-sort="sortKey === 'height' ? sortDir : undefined">
                <button type="button" class="sort-btn" @click="toggleSort('height', t('height'))">
                  <span>{{ t('height') }}</span>
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" class="sort-icon w-3.5 h-3.5 shrink-0">
                    <path d="M8 11.5L3.5 6.5h9L8 11.5z" />
                  </svg>
                </button>
              </th>
              <th scope="col" class="p-3.5">{{ t('type') }}</th>
              <th scope="col" class="p-3.5">{{ t('blockHash') }}</th>
              <th scope="col" class="p-3.5">{{ t('producerOrCoord') }}</th>
              <th scope="col" :aria-sort="sortKey === 'tx_count' ? sortDir : undefined">
                <button type="button" class="sort-btn" @click="toggleSort('tx_count', t('txCount'))">
                  <span>{{ t('txCount') }}</span>
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" class="sort-icon w-3.5 h-3.5 shrink-0">
                    <path d="M8 11.5L3.5 6.5h9L8 11.5z" />
                  </svg>
                </button>
              </th>
              <th scope="col" class="p-3.5">ADAM</th>
              <th scope="col" :aria-sort="sortKey === 'reward' ? sortDir : undefined">
                <button type="button" class="sort-btn" @click="toggleSort('reward', t('reward'))">
                  <span>{{ t('reward') }}</span>
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
              <th scope="col" :aria-sort="sortKey === 'deltaTime' ? sortDir : undefined">
                <button type="button" class="sort-btn" @click="toggleSort('deltaTime', t('deltaTime'))">
                  <span>{{ t('deltaTime') }}</span>
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
              v-for="block in sortedBlocks"
              :key="block.height"
              class="hover:bg-slate-100/50 dark:hover:bg-white/5 transition-colors"
            >
              <td class="p-3.5 font-bold text-brand-salmon whitespace-nowrap">
                <NuxtLink :to="`/block/${block.height}`" class="hover:underline">#{{ block.height }}</NuxtLink>
              </td>
              <td class="p-3.5 whitespace-nowrap">
                <span
                  v-if="block.is_pos"
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 border border-purple-500/25 text-purple-600 dark:text-purple-300"
                >
                  PoS
                </span>
                <span
                  v-else
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-brand-salmon/10 border border-brand-salmon/25 text-brand-salmon"
                >
                  PoW
                </span>
              </td>
              <td class="p-3.5 font-mono text-xs text-slate-700 dark:text-gray-300 whitespace-nowrap">
                <NuxtLink :to="`/block/${block.hash}`" class="hover:text-brand-salmon transition-colors">
                  {{ shortenHash(block.hash, 7) }}
                </NuxtLink>
              </td>
              <td class="p-3.5 font-mono text-xs whitespace-nowrap">
                <NuxtLink
                  v-if="block.producer_address && !['Genesis', 'Miner'].includes(block.producer_address)"
                  :to="`/address/${block.producer_address}`"
                  class="text-brand-blue hover:underline"
                >
                  {{ shortenHash(block.producer_address, 7) }}
                </NuxtLink>
                <span v-else class="text-slate-500">{{ block.producer_address }}</span>
              </td>
              <td class="p-3.5 text-slate-700 dark:text-gray-300 whitespace-nowrap">{{ block.tx_count }}</td>
              <td class="p-3.5 whitespace-nowrap text-xs font-mono">
                <span v-if="block.height >= 200" class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold">
                  {{ block.solved_seats }}/11
                </span>
                <span v-else class="text-slate-400">v{{ block.version }}</span>
              </td>
              <td class="p-3.5 font-semibold text-slate-800 dark:text-gray-200 whitespace-nowrap">
                {{ formatNumber(block.reward, 2) }} KRISTA
              </td>
              <td class="p-3.5 text-slate-600 dark:text-gray-300 whitespace-nowrap">{{ formatBytes(block.size) }}</td>
              <td class="p-3.5 font-mono text-xs text-slate-600 dark:text-gray-300 whitespace-nowrap">
                {{ block.deltaTime !== null ? `${block.deltaTime}s` : '—' }}
              </td>
              <td class="p-3.5 text-right text-slate-600 dark:text-gray-300 whitespace-nowrap" :title="formatDate(block.time)">
                <div class="text-xs font-medium">{{ formatRelativeTime(block.time, locale) }}</div>
                <div class="text-[10px] text-slate-400 font-mono">{{ formatDate(block.time) }}</div>
              </td>
            </tr>
            <tr v-if="!sortedBlocks.length">
              <td colspan="10" class="p-8 text-center text-slate-400">{{ t('noBlocks') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="(blocksData?.totalPages || 1) > 1" class="flex items-center justify-between gap-4 text-xs sm:text-sm">
      <span class="text-slate-500 dark:text-slate-400">
        {{ t('pageOf') }} <strong>{{ page }}</strong> / <strong>{{ blocksData?.totalPages }}</strong>
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
          :disabled="page >= (blocksData?.totalPages || 1)"
          @click="goToPage(page + 1)"
          class="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/10 disabled:opacity-40 disabled:cursor-not-allowed font-semibold cursor-pointer"
        >
          {{ t('nextPage') }} →
        </button>
      </div>
    </div>
  </div>
</template>
