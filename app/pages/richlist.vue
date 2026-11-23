<script setup>
import { ref, computed } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { formatCoins, formatNumber } from '~/utils/formatters'

const { t } = useI18n()
const { data: rich, refresh } = await useFetch('/api/richlist?limit=100')

const sortKey = ref('rank')
const sortDir = ref('ascending')
const sortAnnouncement = ref('')
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function toggleSort(col, label) {
  if (sortKey.value === col) {
    sortDir.value = sortDir.value === 'ascending' ? 'descending' : 'ascending'
  } else {
    sortKey.value = col
    sortDir.value = 'ascending'
  }
  sortAnnouncement.value = `${t('sortStatusTemplate')} ${label}, ${sortDir.value}, ${sortedHolders.value.length} rows`
}

const sortedHolders = computed(() => {
  const rows = [...(rich.value?.holders || [])]
  const factor = sortDir.value === 'ascending' ? 1 : -1
  return rows.sort((a, b) => {
    if (sortKey.value === 'address') {
      return factor * collator.compare(String(a.address || ''), String(b.address || ''))
    }
    return factor * (Number(a[sortKey.value] ?? 0) - Number(b[sortKey.value] ?? 0))
  })
})

const supplyBar = computed(() => {
  const minted = Math.max(1, Number(rich.value?.totalSupply || 1))
  const burned = Number(rich.value?.burnedSupply?.total || 0)
  const locked = Number(rich.value?.lockedValidatorSupply || 0)
  const free = Math.max(0, Number(rich.value?.circulatingSupply || 0) - locked)
  return {
    freePct: Math.min(100, Math.round((free / minted) * 1000) / 10),
    lockedPct: Math.min(100, Math.round((locked / minted) * 1000) / 10),
    burnedPct: Math.min(100, Math.round((burned / minted) * 1000) / 10)
  }
})
</script>

<template>
  <div class="space-y-6">
    <AppBreadcrumbs :items="[{ label: t('navDashboard'), to: '/' }, { label: t('navRichList'), to: '/richlist' }]" />

    <!-- Header -->
    <div class="glass-card rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div class="space-y-1">
        <h1 id="richlist-table-caption" class="text-2xl font-extrabold text-slate-800 dark:text-white flex items-center gap-2">
          <UIcon name="i-heroicons-banknotes" class="w-6 h-6 text-brand-blue" aria-hidden="true" />
          {{ t('richListTitle') }}
        </h1>
        <p class="text-sm text-slate-600 dark:text-slate-300">{{ t('richListDesc') }}</p>
      </div>
      <div class="flex items-center gap-2">
        <NuxtLink
          to="/api-docs"
          class="h-9 px-3 rounded-lg bg-brand-blue/10 hover:bg-brand-blue/20 border border-brand-blue/25 text-xs font-semibold text-brand-blue inline-flex items-center gap-1.5"
        >
          <span>/api/supply</span>
        </NuxtLink>
        <button
          type="button"
          @click="refresh()"
          class="h-9 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
        >
          <UIcon name="i-heroicons-arrow-path" class="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>

    <!-- Supply Composition Visual Bar + KPI Cards -->
    <div v-if="rich?.success" class="glass-card rounded-2xl p-6 space-y-5">
      <div class="space-y-2">
        <div class="flex flex-wrap items-center justify-between text-xs font-semibold gap-2">
          <div class="flex flex-wrap items-center gap-4">
            <span class="inline-flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-brand-blue"></span>
              Liquid: {{ supplyBar.freePct }}%
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              Locked Collateral: {{ supplyBar.lockedPct }}%
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
              Burned: {{ supplyBar.burnedPct }}%
            </span>
          </div>
          <span class="font-mono text-slate-500">~204.95M Asymptote (210M Hard Cap) • Premine: 0</span>
        </div>
        <div class="w-full h-3 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden flex">
          <div class="bg-brand-blue h-full" :style="{ width: `${supplyBar.freePct}%` }"></div>
          <div class="bg-amber-500 h-full" :style="{ width: `${supplyBar.lockedPct}%` }"></div>
          <div class="bg-orange-500 h-full" :style="{ width: `${supplyBar.burnedPct}%` }"></div>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-2">
        <div class="p-4 rounded-xl bg-slate-100/80 dark:bg-white/5 border border-slate-200 dark:border-white/10">
          <div class="text-xs text-slate-500">{{ t('circulatingSupply') }}</div>
          <div class="text-lg font-extrabold text-slate-800 dark:text-white mt-0.5">{{ formatCoins(rich.circulatingSupply, 2) }}</div>
        </div>
        <div class="p-4 rounded-xl bg-slate-100/80 dark:bg-white/5 border border-slate-200 dark:border-white/10">
          <div class="text-xs text-slate-500">🔒 {{ t('lockedSupplyCard') }}</div>
          <div class="text-lg font-extrabold text-amber-600 dark:text-amber-300 mt-0.5">{{ formatCoins(rich.lockedValidatorSupply, 2) }}</div>
        </div>
        <div class="p-4 rounded-xl bg-slate-100/80 dark:bg-white/5 border border-slate-200 dark:border-white/10">
          <div class="text-xs text-slate-500">🔥 {{ t('burnedSupply') }}</div>
          <div class="text-lg font-extrabold text-orange-600 dark:text-orange-400 mt-0.5">{{ formatCoins(rich.burnedSupply?.total || 0, 4) }}</div>
        </div>
        <div class="p-4 rounded-xl bg-slate-100/80 dark:bg-white/5 border border-slate-200 dark:border-white/10">
          <div class="text-xs text-slate-500">{{ t('holderCount') }}</div>
          <div class="text-lg font-extrabold text-slate-800 dark:text-white mt-0.5">{{ formatNumber(rich.holderCount, 0) }}</div>
        </div>
        <div class="p-4 rounded-xl bg-slate-100/80 dark:bg-white/5 border border-slate-200 dark:border-white/10">
          <div class="text-xs text-slate-500">{{ t('top10Share') }} / {{ t('top50Share') }}</div>
          <div class="text-lg font-extrabold text-brand-blue mt-0.5">{{ rich.top10Pct }}% / {{ rich.top50Pct }}%</div>
        </div>
      </div>
    </div>

    <!-- Special Protocol Accounts: Treasury & Official Burn Addresses -->
    <div v-if="rich?.success" class="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div class="glass-card rounded-xl p-5 space-y-2 border border-amber-500/20">
        <div class="flex items-center justify-between text-xs">
          <span class="font-bold text-amber-600 dark:text-amber-300 uppercase">{{ t('treasuryAddressBadge') }} (7.0%)</span>
          <span class="font-mono text-slate-500">{{ rich.treasury.utxoCount }} UTXOs</span>
        </div>
        <NuxtLink :to="`/address/${rich.treasury.address}`" class="block font-mono text-xs sm:text-sm text-brand-salmon hover:underline truncate">
          {{ rich.treasury.address }}
        </NuxtLink>
        <div class="text-lg font-extrabold text-slate-800 dark:text-white">{{ formatCoins(rich.treasury.balance, 2) }}</div>
      </div>

      <div
        v-for="b in rich.burnAddresses"
        :key="b.address"
        class="glass-card rounded-xl p-5 space-y-2 border border-orange-500/20"
      >
        <div class="flex items-center justify-between text-xs">
          <span class="font-bold text-orange-600 dark:text-orange-400 uppercase">🔥 {{ t('burnAddressBannerTitle') }}</span>
          <span class="font-mono text-slate-500">{{ b.outputs }} outputs</span>
        </div>
        <NuxtLink :to="`/address/${b.address}`" class="block font-mono text-xs sm:text-sm text-orange-600 dark:text-orange-300 hover:underline truncate">
          {{ b.address }}
        </NuxtLink>
        <div class="text-lg font-extrabold text-orange-600 dark:text-orange-400">{{ formatCoins(b.burned, 4) }}</div>
      </div>
    </div>

    <div role="status" class="sr-status">{{ sortAnnouncement }}</div>

    <!-- Top 100 Holders Table -->
    <div class="glass-card rounded-2xl overflow-hidden data-panel-contain">
      <div tabindex="0" role="region" aria-labelledby="richlist-table-caption" class="table-wrapper">
        <table class="text-left text-sm">
          <thead class="bg-slate-100 dark:bg-slate-900/95 text-slate-700 dark:text-gray-300 font-semibold uppercase text-xs">
            <tr>
              <th scope="col" :aria-sort="sortKey === 'rank' ? sortDir : undefined">
                <button type="button" class="sort-btn" @click="toggleSort('rank', t('rank'))">
                  <span>{{ t('rank') }}</span>
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
              <th scope="col" :aria-sort="sortKey === 'balance' ? sortDir : undefined">
                <button type="button" class="sort-btn" @click="toggleSort('balance', t('currentBalance'))">
                  <span>{{ t('currentBalance') }}</span>
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" class="sort-icon w-3.5 h-3.5 shrink-0">
                    <path d="M8 11.5L3.5 6.5h9L8 11.5z" />
                  </svg>
                </button>
              </th>
              <th scope="col" :aria-sort="sortKey === 'lockedBalance' ? sortDir : undefined">
                <button type="button" class="sort-btn" @click="toggleSort('lockedBalance', t('lockedValidatorBalance'))">
                  <span>{{ t('lockedValidatorBalance') }}</span>
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" class="sort-icon w-3.5 h-3.5 shrink-0">
                    <path d="M8 11.5L3.5 6.5h9L8 11.5z" />
                  </svg>
                </button>
              </th>
              <th scope="col" :aria-sort="sortKey === 'utxoCount' ? sortDir : undefined">
                <button type="button" class="sort-btn" @click="toggleSort('utxoCount', 'UTXOs')">
                  <span>UTXOs</span>
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" class="sort-icon w-3.5 h-3.5 shrink-0">
                    <path d="M8 11.5L3.5 6.5h9L8 11.5z" />
                  </svg>
                </button>
              </th>
              <th scope="col" :aria-sort="sortKey === 'sharePct' ? sortDir : undefined">
                <button type="button" class="sort-btn justify-end" @click="toggleSort('sharePct', t('supplyShare'))">
                  <span>{{ t('supplyShare') }}</span>
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" class="sort-icon w-3.5 h-3.5 shrink-0">
                    <path d="M8 11.5L3.5 6.5h9L8 11.5z" />
                  </svg>
                </button>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200/60 dark:divide-white/5">
            <tr v-for="h in sortedHolders" :key="h.address" class="hover:bg-slate-100/50 dark:hover:bg-white/5">
              <td class="p-3.5 font-mono font-bold text-slate-700 dark:text-slate-200">#{{ h.rank }}</td>
              <td class="p-3.5 font-mono text-xs sm:text-sm whitespace-nowrap">
                <div class="flex items-center gap-2 flex-wrap">
                  <NuxtLink :to="`/address/${h.address}`" class="text-brand-salmon font-semibold hover:underline">
                    {{ h.address }}
                  </NuxtLink>
                  <span v-if="h.isTreasury" class="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-sans font-bold">
                    TREASURY
                  </span>
                  <span v-if="h.validatorTrack" class="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-700 dark:text-purple-300 text-[10px] font-sans font-semibold">
                    {{ h.validatorTrack }}
                  </span>
                  <span v-if="h.isTaproot" class="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[10px] font-sans font-semibold">
                    Taproot
                  </span>
                </div>
              </td>
              <td class="p-3.5 font-bold text-slate-800 dark:text-white whitespace-nowrap">
                {{ formatCoins(h.balance, 2) }}
              </td>
              <td class="p-3.5 font-mono text-xs text-amber-600 dark:text-amber-300 whitespace-nowrap">
                {{ h.lockedBalance > 0 ? formatCoins(h.lockedBalance, 2) : '—' }}
              </td>
              <td class="p-3.5 font-mono text-xs text-slate-600 dark:text-slate-300">{{ h.utxoCount }}</td>
              <td class="p-3.5 text-right whitespace-nowrap">
                <div class="inline-flex items-center gap-2">
                  <div class="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden hidden sm:block">
                    <div class="h-full bg-brand-blue rounded-full" :style="{ width: `${Math.min(100, h.sharePct)}%` }"></div>
                  </div>
                  <span class="font-mono text-xs font-semibold text-brand-blue">{{ h.sharePct }}%</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
