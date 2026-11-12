<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { formatCoins, formatDate, shortenHash, formatBytes } from '~/utils/formatters'

const { t } = useI18n()
const { data: status, refresh } = await useFetch('/api/status')

// Auto-refresh stats every 10 seconds
let refreshInterval
onMounted(() => {
  refreshInterval = setInterval(() => {
    refresh()
  }, 10000)
})

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval)
})
</script>

<template>
  <div class="space-y-8">
    <!-- Intro Banner -->
    <div class="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-100 to-slate-200/50 dark:from-slate-900 dark:to-indigo-950/80 border border-slate-200 dark:border-white/5 shadow-2xl transition-all duration-300 p-6 sm:p-8">
      <div class="absolute right-0 bottom-0 top-0 w-1/3 bg-radial-gradient from-brand-salmon/10 to-transparent pointer-events-none"></div>
      <div class="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div class="space-y-2 max-w-2xl">
          <h2 class="text-3xl font-extrabold tracking-tight text-slate-800 dark:text-white sm:text-4xl dark:text-glow-indigo">
            {{ t('explorerNetwork') }}
          </h2>
          <p class="text-slate-600 dark:text-gray-400 text-lg">
            {{ t('explorerDesc') }}
          </p>
        </div>
        <div v-if="status?.consensusInfo" class="shrink-0">
          <span class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/80 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            {{ status.consensusInfo.algorithmLabel }}
          </span>
        </div>
      </div>
    </div>

    <!-- Network Statistics Grid (6 Cards: 3x2 on desktop) -->
    <div v-if="status?.success" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <!-- Card 1: Height -->
      <div class="glass-card rounded-xl p-6 relative overflow-hidden group">
        <div class="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity duration-300">
          <UIcon name="i-heroicons-cube" class="w-24 h-24 text-brand-salmon" />
        </div>
        <div class="flex items-center gap-4">
          <div class="p-3 bg-brand-salmon/10 rounded-lg text-brand-salmon">
            <UIcon name="i-heroicons-cube" class="w-6 h-6" />
          </div>
          <div>
            <p class="text-sm font-medium text-slate-500 dark:text-slate-300/80">{{ t('blockHeight') }}</p>
            <h3 class="text-2xl font-bold text-slate-800 dark:text-white mt-1">{{ status.height }}</h3>
          </div>
        </div>
        <div class="mt-4 text-xs text-slate-600 dark:text-slate-300 flex justify-between items-center">
          <span>{{ t('indexed') }}: {{ status.indexedHeight }}</span>
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        </div>
      </div>

      <!-- Card 2: Circulating Supply -->
      <div class="glass-card rounded-xl p-6 relative overflow-hidden group">
        <div class="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity duration-300">
          <UIcon name="i-heroicons-banknotes" class="w-24 h-24 text-brand-blue" />
        </div>
        <div class="flex items-center gap-4">
          <div class="p-3 bg-brand-blue/10 rounded-lg text-brand-blue">
            <UIcon name="i-heroicons-banknotes" class="w-6 h-6" />
          </div>
          <div>
            <p class="text-sm font-medium text-slate-500 dark:text-slate-300/80">{{ t('circulatingSupply') }}</p>
            <h3 class="text-2xl font-bold text-slate-800 dark:text-white mt-1">
              {{ new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(status.circulatingSupply ?? status.totalSupply) }} KRISTA
            </h3>
          </div>
        </div>
        <div class="mt-4 text-xs text-slate-600 dark:text-slate-300 flex justify-between items-center">
          <span>{{ t('premine') }}: 0 KRISTA</span>
          <span v-if="status.totalSupply !== status.circulatingSupply" class="text-slate-500 dark:text-slate-400">
            Minted: {{ new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(status.totalSupply) }}
          </span>
        </div>
      </div>

      <!-- Card 3: Burned Supply -->
      <div class="glass-card rounded-xl p-6 relative overflow-hidden group">
        <div class="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity duration-300">
          <UIcon name="i-heroicons-fire" class="w-24 h-24 text-orange-500" />
        </div>
        <div class="flex items-center gap-4">
          <div class="p-3 bg-orange-500/10 rounded-lg text-orange-500">
            <UIcon name="i-heroicons-fire" class="w-6 h-6" />
          </div>
          <div>
            <p class="text-sm font-medium text-slate-500 dark:text-slate-300/80">🔥 {{ t('burnedSupply') }}</p>
            <h3 class="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">
              {{ new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(status.burnedSupply?.total || 0) }} KRISTA
            </h3>
          </div>
        </div>
        <div class="mt-4 text-xs text-slate-600 dark:text-slate-300 flex flex-wrap justify-between items-center gap-2">
          <span>
            {{ t('protocolBurn') }}: {{ new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(status.burnedSupply?.protocolBurn || 0) }}
            • {{ t('voluntaryBurn') }}: {{ new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(status.burnedSupply?.voluntaryBurn || 0) }}
          </span>
          <NuxtLink to="/address/KTburnCYcDjF1GsXa5k3tc3eZrVVbqefyWr" class="text-orange-600 dark:text-orange-400 hover:underline font-mono">
            KTburn...
          </NuxtLink>
        </div>
      </div>

      <!-- Card 4: Difficulty & Dynamic Consensus -->
      <div class="glass-card rounded-xl p-6 relative overflow-hidden group">
        <div class="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity duration-300">
          <UIcon name="i-heroicons-cpu-chip" class="w-24 h-24 text-brand-salmon" />
        </div>
        <div class="flex items-center gap-4">
          <div class="p-3 bg-brand-salmon/10 rounded-lg text-brand-salmon">
            <UIcon name="i-heroicons-cpu-chip" class="w-6 h-6" />
          </div>
          <div>
            <p class="text-sm font-medium text-slate-500 dark:text-slate-300/80">{{ t('difficulty') }}</p>
            <h3 class="text-2xl font-bold text-slate-800 dark:text-white mt-1">{{ Number(status.difficulty || 0).toFixed(6) }}</h3>
          </div>
        </div>
        <div class="mt-4 text-xs text-slate-600 dark:text-slate-300 truncate" :title="status.consensusInfo?.algorithmLabel">
          <span>{{ t('algorithm') }}: {{ status.consensusInfo?.algorithmLabel || 'X11KVS' }}</span>
        </div>
      </div>

      <!-- Card 5: Connections & Masternodes -->
      <div class="glass-card rounded-xl p-6 relative overflow-hidden group">
        <div class="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity duration-300">
          <UIcon name="i-heroicons-globe-alt" class="w-24 h-24 text-brand-blue" />
        </div>
        <div class="flex items-center gap-4">
          <div class="p-3 bg-brand-blue/10 rounded-lg text-brand-blue">
            <UIcon name="i-heroicons-globe-alt" class="w-6 h-6" />
          </div>
          <div>
            <p class="text-sm font-medium text-slate-500 dark:text-slate-300/80">{{ t('connMasternode') }}</p>
            <h3 class="text-2xl font-bold text-slate-800 dark:text-white mt-1">{{ status.connections }} {{ t('peers') }}</h3>
          </div>
        </div>
        <div class="mt-4 text-xs text-slate-600 dark:text-slate-300 flex gap-2">
          <span>{{ t('activeMn') }}: {{ status.masternodes?.enabled }} / {{ status.masternodes?.total }}</span>
        </div>
      </div>

      <!-- Card 6: Active Validator Pool -->
      <div class="glass-card rounded-xl p-6 relative overflow-hidden group">
        <div class="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity duration-300">
          <UIcon name="i-heroicons-shield-check" class="w-24 h-24 text-purple-500" />
        </div>
        <div class="flex items-center gap-4">
          <div class="p-3 bg-purple-500/10 rounded-lg text-purple-500">
            <UIcon name="i-heroicons-shield-check" class="w-6 h-6" />
          </div>
          <div>
            <p class="text-sm font-medium text-slate-500 dark:text-slate-300/80">{{ t('validatorPool') }}</p>
            <h3 class="text-2xl font-bold text-slate-800 dark:text-white mt-1">
              {{ status.validatorPool?.total || 0 }} {{ t('validatorsTotal') }}
            </h3>
          </div>
        </div>
        <div class="mt-4 text-[11px] text-slate-600 dark:text-slate-300 flex flex-wrap gap-1.5">
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
          <span v-if="status.validatorPool?.bootstrap > 0" class="px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-600 dark:text-slate-300 font-medium">
            {{ t('trackBootstrap') }}: {{ status.validatorPool.bootstrap }}
          </span>
        </div>
      </div>
    </div>

    <!-- Tables Columns -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Latest Blocks Column -->
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <UIcon name="i-heroicons-rectangle-stack" class="w-5 h-5 text-brand-salmon" />
            {{ t('latestBlocks') }}
          </h3>
        </div>

        <div class="glass-card rounded-xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-gray-300 font-semibold uppercase text-xs">
                <tr>
                  <th class="p-4">{{ t('height') }}</th>
                  <th class="p-4">{{ t('type') }}</th>
                  <th class="p-4">{{ t('blockHash') }}</th>
                  <th class="p-4">{{ t('txCount') }}</th>
                  <th class="p-4">{{ t('size') }}</th>
                  <th class="p-4 text-right">{{ t('time') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200/60 dark:divide-white/5">
                <tr v-for="block in status?.latestBlocks" :key="block.height" class="hover:bg-slate-100/50 dark:hover:bg-white/5 transition-colors group">
                  <td class="p-4 font-bold text-brand-salmon">
                    <NuxtLink :to="`/block/${block.height}`" class="hover:underline">{{ block.height }}</NuxtLink>
                  </td>
                  <td class="p-4">
                    <span
                      v-if="block.is_pos"
                      class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 border border-purple-500/25 text-purple-600 dark:text-purple-300 shadow-sm shadow-purple-500/5"
                    >
                      <UIcon name="i-heroicons-shield-check" class="w-3.5 h-3.5" />
                      PoS
                    </span>
                    <span
                      v-else
                      class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-salmon/10 border border-brand-salmon/25 text-brand-salmon shadow-sm shadow-brand-salmon/5"
                    >
                      <UIcon name="i-heroicons-cpu-chip" class="w-3.5 h-3.5" />
                      PoW
                    </span>
                  </td>
                  <td class="p-4 font-mono text-slate-700 dark:text-gray-300">
                    <NuxtLink :to="`/block/${block.hash}`" class="hover:text-brand-salmon transition-colors">{{ shortenHash(block.hash, 6) }}</NuxtLink>
                  </td>
                  <td class="p-4 text-slate-700 dark:text-gray-300">{{ block.tx_count }}</td>
                  <td class="p-4 text-slate-700 dark:text-gray-300">{{ formatBytes(block.size) }}</td>
                  <td class="p-4 text-slate-600 dark:text-gray-300 text-right">{{ formatDate(block.time) }}</td>
                </tr>
                <tr v-if="!status?.latestBlocks?.length">
                  <td colspan="6" class="p-6 text-center text-slate-400 dark:text-gray-500">{{ t('noBlocks') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Latest Transactions Column -->
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <UIcon name="i-heroicons-arrows-right-left" class="w-5 h-5 text-brand-blue" />
            {{ t('latestTransactions') }}
          </h3>
        </div>

        <div class="glass-card rounded-xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-gray-300 font-semibold uppercase text-xs">
                <tr>
                  <th class="p-4">{{ t('txid') }}</th>
                  <th class="p-4">{{ t('amount') }}</th>
                  <th class="p-4">{{ t('fee') }}</th>
                  <th class="p-4 text-right">{{ t('time') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200/60 dark:divide-white/5">
                <tr v-for="tx in status?.latestTransactions" :key="tx.txid" class="hover:bg-slate-100/50 dark:hover:bg-white/5 transition-colors group">
                  <td class="p-4 font-mono text-brand-blue">
                    <div class="flex items-center gap-2 flex-wrap">
                      <NuxtLink :to="`/tx/${tx.txid}`" class="hover:text-brand-salmon transition-colors">{{ shortenHash(tx.txid, 8) }}</NuxtLink>
                      <span v-if="tx.txType === 'coinstake'" class="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-300 text-[10px] font-sans font-semibold">
                        COINSTAKE
                      </span>
                      <span v-else-if="tx.txType === 'coin_lock'" class="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-300 text-[10px] font-sans font-semibold">
                        🔒 250 Lock
                      </span>
                      <span v-else-if="tx.txType === 'pow_lock'" class="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-300 text-[10px] font-sans font-semibold">
                        ⚡ 10 PoW
                      </span>
                      <span v-else-if="tx.txType === 'zerocoin_pow'" class="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 text-[10px] font-sans font-semibold">
                        🌱 Zero-Coin
                      </span>
                      <span v-else-if="tx.txType === 'burn'" class="px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[10px] font-sans font-semibold">
                        🔥 {{ t('burnBadge') }}
                      </span>
                    </div>
                  </td>
                  <td class="p-4 font-semibold text-slate-700 dark:text-gray-300">{{ formatCoins(tx.value) }}</td>
                  <td class="p-4 text-slate-600 dark:text-gray-300">{{ formatCoins(tx.fee) }}</td>
                  <td class="p-4 text-slate-600 dark:text-gray-300 text-right">{{ formatDate(tx.time) }}</td>
                </tr>
                <tr v-if="!status?.latestTransactions?.length">
                  <td colspan="4" class="p-6 text-center text-slate-400 dark:text-gray-500">{{ t('noTxs') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
