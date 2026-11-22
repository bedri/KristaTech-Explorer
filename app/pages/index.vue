<script setup>
import { ref, computed } from 'vue'
import { useI18n } from '~/composables/useI18n'
import {
  formatCoins,
  formatDate,
  formatRelativeTime,
  formatDurationSeconds,
  shortenHash,
  formatBytes,
  formatNumber,
  formatHashrate
} from '~/utils/formatters'

const { locale, t } = useI18n()
const { data: status } = await useFetch('/api/status', {
  key: 'global-explorer-status'
})

const txQuickFilter = ref('all')

const filteredLatestTxs = computed(() => {
  const list = status.value?.latestTransactions || []
  if (txQuickFilter.value === 'all') return list.slice(0, 10)
  if (txQuickFilter.value === 'rewards') {
    return list.filter((tx) => tx.txType === 'coinbase' || tx.txType === 'coinstake').slice(0, 10)
  }
  if (txQuickFilter.value === 'registrations') {
    return list
      .filter((tx) => ['coin_lock', 'pow_lock', 'zerocoin_pow'].includes(tx.txType))
      .slice(0, 10)
  }
  return list.filter((tx) => tx.txType === txQuickFilter.value).slice(0, 10)
})

const currentEraLabel = computed(() => {
  const info = status.value?.consensusInfo
  if (!info) return 'Bootstrap PoW'
  return locale.value === 'tr' ? info.currentEraTr || info.phase : info.currentEra || info.phase
})

const nextMilestoneLabel = computed(() => {
  const info = status.value?.consensusInfo
  if (!info) return ''
  return locale.value === 'tr' ? info.nextLabelTr || info.nextLabel : info.nextLabel
})
</script>

<template>
  <div class="space-y-8">
    <!-- Hero + Live Consensus Milestone Progress Banner -->
    <div class="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-100 to-cobalt-100/60 dark:from-slate-900 dark:to-cobalt-950/90 border border-slate-200 dark:border-white/10 shadow-xl p-6 sm:p-8 space-y-6">
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div class="space-y-2 max-w-2xl">
          <h1 class="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-800 dark:text-white">
            {{ t('explorerNetwork') }}
          </h1>
          <p class="text-slate-600 dark:text-slate-300 text-sm sm:text-base">
            {{ t('explorerDesc') }}
          </p>
        </div>

        <div v-if="status?.consensusInfo" class="flex flex-wrap items-center gap-2 shrink-0">
          <span class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/85 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true"></span>
            {{ status.consensusInfo.algorithmLabel }}
          </span>
        </div>
      </div>

      <!-- Milestone Progress Strip -->
      <div
        v-if="status?.consensusInfo"
        class="p-4 rounded-xl bg-white/75 dark:bg-slate-950/55 border border-slate-200/80 dark:border-white/10 space-y-2"
      >
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-bold text-brand-blue dark:text-cobalt-300">{{ currentEraLabel }}</span>
            <span class="text-slate-400" aria-hidden="true">→</span>
            <span class="font-semibold text-slate-700 dark:text-slate-200">
              {{ t('nextMilestone') }}: {{ nextMilestoneLabel }} (#{{ formatNumber(status.consensusInfo.nextHeight, 0) }})
            </span>
          </div>
          <div class="text-xs font-mono text-slate-600 dark:text-slate-300">
            {{ formatNumber(status.consensusInfo.blocksRemaining, 0) }} blocks •
            {{ t('milestoneEta') }}: {{ formatDurationSeconds(status.consensusInfo.etaSeconds, locale) }}
          </div>
        </div>
        <div class="w-full h-2 rounded-full bg-slate-200/80 dark:bg-white/10 overflow-hidden">
          <div
            class="h-full rounded-full bg-gradient-to-r from-brand-blue to-brand-salmon transition-all duration-500"
            :style="{ width: `${status.consensusInfo.progressPct || 0}%` }"
          ></div>
        </div>
      </div>
    </div>

    <!-- 6 Primary Network KPI Cards -->
    <div v-if="status?.success" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      <!-- Card 1: Block Height & Avg Time -->
      <NuxtLink to="/blocks" class="glass-card rounded-xl p-5 relative overflow-hidden group block">
        <div class="flex items-center gap-4">
          <div class="p-3 bg-brand-salmon/10 rounded-lg text-brand-salmon">
            <UIcon name="i-heroicons-cube" class="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <p class="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-300/80">{{ t('blockHeight') }}</p>
            <p class="text-2xl font-extrabold text-slate-800 dark:text-white mt-0.5">#{{ formatNumber(status.height, 0) }}</p>
          </div>
        </div>
        <div class="mt-4 text-xs text-slate-600 dark:text-slate-300 flex justify-between items-center">
          <span>{{ t('avgBlockTime') }}: <strong>{{ status.avgBlockTime }}s</strong> • {{ t('blockSubsidy') }}: <strong>{{ status.currentSubsidy }} KRISTA</strong></span>
          <span class="text-brand-salmon font-semibold group-hover:translate-x-0.5 transition-transform">→</span>
        </div>
      </NuxtLink>

      <!-- Card 2: Circulating & Locked Supply -->
      <NuxtLink to="/richlist" class="glass-card rounded-xl p-5 relative overflow-hidden group block">
        <div class="flex items-center gap-4">
          <div class="p-3 bg-brand-blue/10 rounded-lg text-brand-blue">
            <UIcon name="i-heroicons-banknotes" class="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <p class="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-300/80">{{ t('circulatingSupply') }}</p>
            <p class="text-2xl font-extrabold text-slate-800 dark:text-white mt-0.5">
              {{ formatNumber(status.circulatingSupply ?? status.totalSupply, 2) }} KRISTA
            </p>
          </div>
        </div>
        <div class="mt-4 text-xs text-slate-600 dark:text-slate-300 flex justify-between items-center">
          <span>{{ t('premine') }}: 0 • 🔒 {{ formatNumber(status.lockedValidatorSupply || 0, 0) }} KRISTA</span>
          <span class="text-brand-blue font-semibold group-hover:translate-x-0.5 transition-transform">→</span>
        </div>
      </NuxtLink>

      <!-- Card 3: Burned Supply -->
      <NuxtLink to="/address/KTburnCYcDjF1GsXa5k3tc3eZrVVbqefyWr" class="glass-card rounded-xl p-5 relative overflow-hidden group block">
        <div class="flex items-center gap-4">
          <div class="p-3 bg-orange-500/10 rounded-lg text-orange-500">
            <UIcon name="i-heroicons-fire" class="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <p class="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-300/80">🔥 {{ t('burnedSupply') }}</p>
            <p class="text-2xl font-extrabold text-orange-600 dark:text-orange-400 mt-0.5">
              {{ formatNumber(status.burnedSupply?.total || 0, 4) }} KRISTA
            </p>
          </div>
        </div>
        <div class="mt-4 text-xs text-slate-600 dark:text-slate-300 flex justify-between items-center">
          <span>
            {{ t('protocolBurn') }}: {{ formatNumber(status.burnedSupply?.protocolBurn || 0, 2) }} •
            {{ t('voluntaryBurn') }}: {{ formatNumber(status.burnedSupply?.voluntaryBurn || 0, 2) }}
          </span>
          <span class="text-orange-500 font-mono text-[11px]">KTburn... →</span>
        </div>
      </NuxtLink>

      <!-- Card 4: Difficulty & Hashrate -->
      <NuxtLink to="/network" class="glass-card rounded-xl p-5 relative overflow-hidden group block">
        <div class="flex items-center gap-4">
          <div class="p-3 bg-brand-salmon/10 rounded-lg text-brand-salmon">
            <UIcon name="i-heroicons-cpu-chip" class="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <p class="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-300/80">{{ t('difficulty') }}</p>
            <p class="text-2xl font-extrabold text-slate-800 dark:text-white mt-0.5">{{ Number(status.difficulty || 0).toFixed(6) }}</p>
          </div>
        </div>
        <div class="mt-4 text-xs text-slate-600 dark:text-slate-300 flex justify-between items-center">
          <span>{{ t('networkHashrate') }}: <strong>{{ formatHashrate(status.hashrate) }}</strong></span>
          <span class="text-brand-salmon font-semibold group-hover:translate-x-0.5 transition-transform">→</span>
        </div>
      </NuxtLink>

      <!-- Card 5: Connections, Masternodes & Mempool -->
      <NuxtLink to="/mempool" class="glass-card rounded-xl p-5 relative overflow-hidden group block">
        <div class="flex items-center gap-4">
          <div class="p-3 bg-brand-blue/10 rounded-lg text-brand-blue">
            <UIcon name="i-heroicons-globe-alt" class="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <p class="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-300/80">{{ t('connMasternode') }}</p>
            <p class="text-2xl font-extrabold text-slate-800 dark:text-white mt-0.5">
              {{ status.connections }} {{ t('peers') }}
            </p>
          </div>
        </div>
        <div class="mt-4 text-xs text-slate-600 dark:text-slate-300 flex justify-between items-center">
          <span>
            {{ t('activeMn') }}: {{ status.masternodes?.enabled }}/{{ status.masternodes?.total }} •
            {{ t('navMempool') }}: <strong>{{ status.mempool?.size || 0 }} tx</strong>
          </span>
          <span class="text-brand-blue font-semibold group-hover:translate-x-0.5 transition-transform">→</span>
        </div>
      </NuxtLink>

      <!-- Card 6: Active Validator Pool & 4,200:250:10 Fair VRF -->
      <NuxtLink to="/validators" class="glass-card rounded-xl p-5 relative overflow-hidden group block">
        <div class="flex items-center gap-4">
          <div class="p-3 bg-purple-500/10 rounded-lg text-purple-500">
            <UIcon name="i-heroicons-shield-check" class="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <p class="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-300/80">{{ t('validatorPool') }}</p>
            <p class="text-2xl font-extrabold text-slate-800 dark:text-white mt-0.5">
              {{ status.validatorPool?.total || 0 }} {{ t('validatorsTotal') }}
            </p>
          </div>
        </div>
        <div class="mt-4 text-[11px] text-slate-600 dark:text-slate-300 flex flex-wrap items-center justify-between gap-1.5">
          <div class="flex flex-wrap gap-1.5">
            <span class="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-300 font-medium">
              {{ t('trackMasternode') }}: {{ status.validatorPool?.masternode || 0 }}
            </span>
            <span class="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-300 font-medium">
              {{ t('trackCoinLock') }}: {{ status.validatorPool?.coin_lock || 0 }}
            </span>
            <span class="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-300 font-medium">
              {{ t('trackPowLock') }}: {{ status.validatorPool?.pow_lock || 0 }}
            </span>
            <span v-if="status.validatorPool?.zerocoin_pow > 0" class="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 font-medium">
              {{ t('trackZeroCoin') }}: {{ status.validatorPool.zerocoin_pow }}
            </span>
          </div>
          <span class="text-purple-500 font-semibold group-hover:translate-x-0.5 transition-transform">→</span>
        </div>
      </NuxtLink>
    </div>

    <!-- Latest Blocks & Latest Transactions Columns -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-8">
      <!-- Latest Blocks Panel -->
      <section class="space-y-4 data-panel-contain">
        <div class="flex items-center justify-between gap-2">
          <h2 id="dash-latest-blocks-heading" class="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <UIcon name="i-heroicons-rectangle-stack" class="w-5 h-5 text-brand-salmon" aria-hidden="true" />
            {{ t('latestBlocks') }}
          </h2>
          <NuxtLink
            to="/blocks"
            class="text-xs sm:text-sm font-semibold text-brand-salmon hover:underline inline-flex items-center gap-1"
          >
            {{ t('viewAllBlocks') }} →
          </NuxtLink>
        </div>

        <div class="glass-card rounded-xl overflow-hidden">
          <div tabindex="0" role="region" aria-labelledby="dash-latest-blocks-heading" class="table-wrapper">
            <table class="text-left text-sm">
              <thead class="bg-slate-100 dark:bg-slate-900/95 text-slate-700 dark:text-gray-300 font-semibold uppercase text-xs">
                <tr>
                  <th scope="col" class="p-3.5">{{ t('height') }}</th>
                  <th scope="col" class="p-3.5">{{ t('type') }}</th>
                  <th scope="col" class="p-3.5">{{ t('producerOrCoord') }}</th>
                  <th scope="col" class="p-3.5">{{ t('txCount') }}</th>
                  <th scope="col" class="p-3.5">{{ t('reward') }}</th>
                  <th scope="col" class="p-3.5 text-right">{{ t('time') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200/60 dark:divide-white/5">
                <tr
                  v-for="block in status?.latestBlocks"
                  :key="block.height"
                  class="hover:bg-slate-100/50 dark:hover:bg-white/5 transition-colors"
                >
                  <td class="p-3.5 font-bold text-brand-salmon whitespace-nowrap">
                    <NuxtLink :to="`/block/${block.height}`" class="hover:underline">#{{ block.height }}</NuxtLink>
                  </td>
                  <td class="p-3.5 whitespace-nowrap">
                    <span
                      v-if="block.is_pos"
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 border border-purple-500/25 text-purple-600 dark:text-purple-300"
                    >
                      PoS
                    </span>
                    <span
                      v-else
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-brand-salmon/10 border border-brand-salmon/25 text-brand-salmon"
                    >
                      PoW
                    </span>
                  </td>
                  <td class="p-3.5 font-mono text-xs text-slate-700 dark:text-gray-300 whitespace-nowrap">
                    <NuxtLink
                      v-if="block.producer_address && !['Genesis', 'Miner'].includes(block.producer_address)"
                      :to="`/address/${block.producer_address}`"
                      class="text-brand-blue hover:underline"
                    >
                      {{ shortenHash(block.producer_address, 6) }}
                    </NuxtLink>
                    <span v-else class="text-slate-500">{{ block.producer_address || 'Miner' }}</span>
                  </td>
                  <td class="p-3.5 text-slate-700 dark:text-gray-300 whitespace-nowrap">
                    {{ block.tx_count }}
                  </td>
                  <td class="p-3.5 font-semibold text-slate-800 dark:text-gray-200 whitespace-nowrap">
                    {{ formatNumber(block.reward, 2) }} KRISTA
                  </td>
                  <td class="p-3.5 text-slate-600 dark:text-gray-300 text-right whitespace-nowrap" :title="formatDate(block.time)">
                    <span>{{ formatRelativeTime(block.time, locale) }}</span>
                    <span v-if="block.deltaTime !== null" class="ml-1 text-[11px] font-mono text-slate-400">({{ block.deltaTime }}s)</span>
                  </td>
                </tr>
                <tr v-if="!status?.latestBlocks?.length">
                  <td colspan="6" class="p-6 text-center text-slate-400 dark:text-gray-500">{{ t('noBlocks') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- Latest Transactions Panel -->
      <section class="space-y-4 data-panel-contain">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 id="dash-latest-txs-heading" class="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <UIcon name="i-heroicons-arrows-right-left" class="w-5 h-5 text-brand-blue" aria-hidden="true" />
            {{ t('latestTransactions') }}
          </h2>
          <div class="flex items-center gap-2">
            <div class="hidden sm:flex items-center gap-1 bg-slate-100 dark:bg-white/5 p-0.5 rounded-lg border border-slate-200 dark:border-white/10 text-[11px]">
              <button
                v-for="f in [
                  { key: 'all', label: t('allFilter') },
                  { key: 'standard', label: t('filterStandard') },
                  { key: 'registrations', label: t('filterRegistrations') },
                  { key: 'rewards', label: t('filterRewards') }
                ]"
                :key="f.key"
                type="button"
                @click="txQuickFilter = f.key"
                class="px-2 py-1 rounded-md font-semibold transition-colors cursor-pointer"
                :class="txQuickFilter === f.key ? 'bg-brand-blue text-white' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'"
              >
                {{ f.label }}
              </button>
            </div>
            <NuxtLink
              to="/transactions"
              class="text-xs sm:text-sm font-semibold text-brand-blue hover:underline inline-flex items-center gap-1"
            >
              {{ t('viewAllTxs') }} →
            </NuxtLink>
          </div>
        </div>

        <div class="glass-card rounded-xl overflow-hidden">
          <div tabindex="0" role="region" aria-labelledby="dash-latest-txs-heading" class="table-wrapper">
            <table class="text-left text-sm">
              <thead class="bg-slate-100 dark:bg-slate-900/95 text-slate-700 dark:text-gray-300 font-semibold uppercase text-xs">
                <tr>
                  <th scope="col" class="p-3.5">{{ t('txid') }}</th>
                  <th scope="col" class="p-3.5">{{ t('height') }}</th>
                  <th scope="col" class="p-3.5">{{ t('amount') }}</th>
                  <th scope="col" class="p-3.5 text-right">{{ t('time') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200/60 dark:divide-white/5">
                <tr
                  v-for="tx in filteredLatestTxs"
                  :key="tx.txid"
                  class="hover:bg-slate-100/50 dark:hover:bg-white/5 transition-colors"
                >
                  <td class="p-3.5 font-mono text-brand-blue whitespace-nowrap">
                    <div class="flex items-center gap-2 flex-wrap">
                      <NuxtLink :to="`/tx/${tx.txid}`" class="hover:text-brand-salmon transition-colors">
                        {{ shortenHash(tx.txid, 7) }}
                      </NuxtLink>
                      <TxTypeBadge :tx-type="tx.txType" :is-coinbase="Boolean(tx.is_coinbase)" :is-coinstake="Boolean(tx.is_coinstake)" />
                    </div>
                  </td>
                  <td class="p-3.5 font-mono text-xs whitespace-nowrap">
                    <NuxtLink v-if="tx.block_height !== null && tx.block_height !== undefined" :to="`/block/${tx.block_height}`" class="text-brand-salmon hover:underline">
                      #{{ tx.block_height }}
                    </NuxtLink>
                    <span v-else class="text-slate-400">—</span>
                  </td>
                  <td class="p-3.5 font-semibold text-slate-700 dark:text-gray-200 whitespace-nowrap">
                    {{ formatCoins(tx.value, 4) }}
                  </td>
                  <td class="p-3.5 text-slate-600 dark:text-gray-300 text-right whitespace-nowrap" :title="formatDate(tx.time)">
                    {{ formatRelativeTime(tx.time, locale) }}
                  </td>
                </tr>
                <tr v-if="!filteredLatestTxs.length">
                  <td colspan="4" class="p-6 text-center text-slate-400 dark:text-gray-500">{{ t('noTxs') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
