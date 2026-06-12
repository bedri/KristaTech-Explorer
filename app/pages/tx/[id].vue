<script setup>
import { computed } from 'vue'
import { useI18n } from '~/composables/useI18n'

const { t } = useI18n()
const route = useRoute()
const txid = computed(() => route.params.id)

const { data: txResult, error } = await useFetch(() => `/api/tx/${txid.value}`)

// Utility formatting functions
function formatCoins(amount) {
  if (amount === undefined || amount === null) return '0.00 KRISTA'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8
  }).format(amount) + ' KRISTA'
}

function formatDate(timestamp) {
  if (!timestamp) return 'N/A'
  const d = new Date(timestamp * 1000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  return (bytes / 1024).toFixed(2) + ' KB'
}

function shortenHash(hash, len = 10) {
  if (!hash) return ''
  return `${hash.slice(0, len)}...${hash.slice(-len)}`
}
</script>

<template>
  <div class="space-y-8">
    <!-- Breadcrumb -->
    <div>
      <NuxtLink to="/" class="flex items-center gap-2 text-sm text-brand-salmon hover:text-brand-salmon-hover transition-colors font-semibold">
        <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
        {{ t('backDashboard') }}
      </NuxtLink>
    </div>

    <!-- Error State -->
    <div v-if="error || !txResult?.success" class="p-6 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-500/20 rounded-xl text-center space-y-4">
      <div class="inline-flex p-3 bg-red-100 dark:bg-red-500/10 rounded-lg text-red-650 dark:text-red-400">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8" />
      </div>
      <h3 class="text-xl font-bold text-slate-800 dark:text-white">{{ t('txNotFound') }}</h3>
      <p class="text-red-650 dark:text-red-300/80 max-w-md mx-auto">
        {{ t('txNotFoundDesc') }}
      </p>
    </div>

    <!-- Tx Details -->
    <div v-else class="space-y-6">
      <div class="glass-card rounded-2xl p-6 md:p-8 space-y-6">
        <div class="border-b border-slate-200/60 dark:border-white/5 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 class="text-2xl font-extrabold text-slate-800 dark:text-white flex items-center gap-2">
              {{ t('txDetails') }}
            </h2>
            <p class="text-xs font-mono text-slate-500 dark:text-slate-400 break-all mt-1">{{ txResult.txid }}</p>
          </div>
          <div class="flex items-center gap-3">
            <span class="px-3 py-1 rounded bg-brand-salmon/10 border border-brand-salmon/25 text-brand-salmon text-xs font-semibold">
              {{ txResult.confirmations }} {{ t('confirmations') }}
            </span>
          </div>
        </div>

        <!-- Metadata Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-sm">
          <div class="space-y-1">
            <p class="text-slate-500 dark:text-slate-300/80 font-medium">{{ t('timestamp') }}</p>
            <p class="text-slate-800 dark:text-gray-200 font-semibold">{{ formatDate(txResult.time) }}</p>
          </div>
          <div class="space-y-1">
            <p class="text-slate-500 dark:text-slate-300/80 font-medium">{{ t('includedBlock') }}</p>
            <p class="text-slate-800 dark:text-gray-200 font-semibold">
              <NuxtLink v-if="txResult.blockheight" :to="`/block/${txResult.blockheight}`" class="text-brand-salmon font-semibold hover:underline">
                #{{ txResult.blockheight }}
              </NuxtLink>
              <span v-else class="text-slate-500 dark:text-slate-300">{{ t('unconfirmed') }}</span>
            </p>
          </div>
          <div class="space-y-1">
            <p class="text-slate-500 dark:text-slate-300/80 font-medium">{{ t('size') }}</p>
            <p class="text-slate-800 dark:text-gray-200 font-semibold">{{ formatBytes(txResult.size) }}</p>
          </div>
          <div class="space-y-1">
            <p class="text-slate-500 dark:text-slate-300/80 font-medium">{{ t('fee') }}</p>
            <p class="text-slate-800 dark:text-gray-200 font-semibold">{{ formatCoins(txResult.fee) }}</p>
          </div>
        </div>
      </div>

      <!-- Inputs & Outputs Flow Section -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 relative">
        <!-- Visual Flow Connector (Desktop Only) -->
        <div class="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-white/10 items-center justify-center shadow-lg text-brand-salmon">
          <UIcon name="i-heroicons-arrow-right" class="w-5 h-5" />
        </div>

        <!-- Left Column: Inputs (Girdiler) -->
        <div class="space-y-4">
          <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <UIcon name="i-heroicons-arrow-down-tray" class="w-5 h-5 text-brand-blue" />
            {{ t('inputs') }}
          </h3>
          
          <div class="space-y-3">
            <div 
              v-for="(input, idx) in txResult.vin" 
              :key="idx" 
              class="glass-card rounded-xl p-4 border border-slate-200/60 dark:border-white/5 space-y-2"
            >
              <div class="flex justify-between items-center gap-2">
                <!-- Coinbase/Standard Checker -->
                <div v-if="input.prev_txid === 'coinbase'" class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">COINBASE</span>
                  <span class="text-sm text-slate-700 dark:text-gray-300">{{ t('newCoins') }}</span>
                </div>
                <div v-else class="space-y-1">
                  <p class="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {{ t('prevTxid') }}: 
                    <NuxtLink :to="`/tx/${input.prev_txid}`" class="text-brand-blue font-semibold hover:underline">
                      {{ shortenHash(input.prev_txid, 6) }}
                    </NuxtLink>
                    #{{ input.prev_vout }}
                  </p>
                  <p class="text-sm font-semibold text-slate-700 dark:text-gray-200">
                    <NuxtLink :to="`/address/${input.address}`" class="text-brand-salmon hover:underline">
                      {{ input.address }}
                    </NuxtLink>
                  </p>
                </div>
                
                <div class="text-right">
                  <p class="text-sm font-bold text-slate-800 dark:text-white">{{ formatCoins(input.amount) }}</p>
                </div>
              </div>
            </div>
            
            <div v-if="!txResult.vin?.length" class="text-center p-6 text-slate-500 dark:text-slate-400">
              {{ t('noInputs') }}
            </div>
          </div>
        </div>

        <!-- Right Column: Outputs (Çıktılar) -->
        <div class="space-y-4">
          <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <UIcon name="i-heroicons-arrow-up-tray" class="w-5 h-5 text-brand-salmon" />
            {{ t('outputs') }}
          </h3>

          <div class="space-y-3">
            <div 
              v-for="output in txResult.vout" 
              :key="output.n" 
              class="glass-card rounded-xl p-4 border border-slate-200/60 dark:border-white/5 space-y-2"
            >
              <div class="flex justify-between items-center gap-2">
                <div class="space-y-1">
                  <p class="text-xs text-slate-500 dark:text-slate-400">Index: #{{ output.n }}</p>
                  <p class="text-sm font-semibold text-slate-700 dark:text-gray-200">
                    <NuxtLink :to="`/address/${output.address}`" class="text-brand-salmon hover:underline">
                      {{ output.address }}
                    </NuxtLink>
                  </p>
                </div>

                <div class="text-right space-y-1">
                  <p class="text-sm font-bold text-slate-800 dark:text-white">{{ formatCoins(output.amount) }}</p>
                  
                  <!-- Spend status badge -->
                  <div class="flex justify-end">
                    <span 
                      v-if="output.spent_txid" 
                      class="px-2 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold"
                      :title="t('spent')"
                    >
                      {{ t('spent') }}
                    </span>
                    <span 
                      v-else 
                      class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold"
                      :title="t('unspent')"
                    >
                      {{ t('unspent') }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="!txResult.vout?.length" class="text-center p-6 text-slate-500 dark:text-slate-400">
              {{ t('noOutputs') }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
