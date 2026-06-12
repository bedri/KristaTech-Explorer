<script setup>
import { ref, computed } from 'vue'
import { useI18n } from '~/composables/useI18n'

const { t } = useI18n()
const route = useRoute()
const addressId = computed(() => route.params.id)
const isCopied = ref(false)

const { data: addressResult, error } = await useFetch(() => `/api/address/${addressId.value}`)

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

function shortenHash(hash, len = 12) {
  if (!hash) return ''
  return `${hash.slice(0, len)}...${hash.slice(-len)}`
}

// Clipboard copy helper
function copyAddress() {
  if (!navigator.clipboard) return
  navigator.clipboard.writeText(addressId.value)
  isCopied.value = true
  setTimeout(() => {
    isCopied.value = false
  }, 2000)
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
    <div v-if="error || !addressResult?.success" class="p-6 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-500/20 rounded-xl text-center space-y-4">
      <div class="inline-flex p-3 bg-red-100 dark:bg-red-500/10 rounded-lg text-red-650 dark:text-red-400">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8" />
      </div>
      <h3 class="text-xl font-bold text-slate-800 dark:text-white">{{ t('addrNotFound') }}</h3>
      <p class="text-red-655 dark:text-red-300/80 max-w-md mx-auto">
        {{ t('addrNotFoundDesc') }}
      </p>
    </div>

    <!-- Address Stats & History -->
    <div v-else class="space-y-8">
      <!-- Address Header -->
      <div class="glass-card rounded-2xl p-6 md:p-8 space-y-4">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="space-y-1">
            <span class="text-xs font-semibold px-2 py-0.5 rounded bg-brand-salmon/10 text-brand-salmon border border-brand-salmon/25">{{ t('walletAddress') }}</span>
            <h2 class="text-xl md:text-2xl font-extrabold text-slate-800 dark:text-white break-all flex items-center gap-3">
              {{ addressResult.address }}
              
              <!-- Copy Button -->
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-heroicons-clipboard-document"
                :class="isCopied ? 'text-brand-salmon' : 'text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white'"
                size="sm"
                @click="copyAddress"
                :title="t('copyAddress')"
              >
                <span class="text-xs font-normal" v-if="isCopied">{{ t('copied') }}</span>
              </UButton>
            </h2>
          </div>
        </div>
      </div>

      <!-- Financial Statistics Cards Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <!-- Card 1: Balance -->
        <div class="glass-card rounded-xl p-6 relative overflow-hidden">
          <p class="text-sm font-medium text-slate-500 dark:text-slate-300">{{ t('currentBalance') }}</p>
          <h3 class="text-xl font-bold text-brand-salmon mt-1 break-all">{{ formatCoins(addressResult.balance) }}</h3>
          <div class="absolute -right-4 -bottom-4 opacity-5">
            <UIcon name="i-heroicons-scale" class="w-20 h-20 text-brand-salmon" />
          </div>
        </div>

        <!-- Card 2: Received -->
        <div class="glass-card rounded-xl p-6 relative overflow-hidden">
          <p class="text-sm font-medium text-slate-500 dark:text-slate-300">{{ t('totalReceived') }}</p>
          <h3 class="text-xl font-bold text-slate-800 dark:text-white mt-1 break-all">{{ formatCoins(addressResult.totalReceived) }}</h3>
          <div class="absolute -right-4 -bottom-4 opacity-5">
            <UIcon name="i-heroicons-arrow-down-left" class="w-20 h-20 text-brand-blue" />
          </div>
        </div>

        <!-- Card 3: Sent -->
        <div class="glass-card rounded-xl p-6 relative overflow-hidden">
          <p class="text-sm font-medium text-slate-500 dark:text-slate-300">{{ t('totalSent') }}</p>
          <h3 class="text-xl font-bold text-slate-800 dark:text-white mt-1 break-all">{{ formatCoins(addressResult.totalSent) }}</h3>
          <div class="absolute -right-4 -bottom-4 opacity-5">
            <UIcon name="i-heroicons-arrow-up-right" class="w-20 h-20 text-brand-blue" />
          </div>
        </div>

        <!-- Card 4: Tx Count -->
        <div class="glass-card rounded-xl p-6 relative overflow-hidden">
          <p class="text-sm font-medium text-slate-500 dark:text-slate-300">{{ t('totalTxs') }}</p>
          <h3 class="text-xl font-bold text-slate-800 dark:text-white mt-1">{{ addressResult.txCount }} {{ t('txCountLabel') }}</h3>
          <div class="absolute -right-4 -bottom-4 opacity-5">
            <UIcon name="i-heroicons-document-magnifying-glass" class="w-20 h-20 text-brand-salmon" />
          </div>
        </div>
      </div>

      <!-- Transaction History Table -->
      <div class="space-y-4">
        <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <UIcon name="i-heroicons-clock" class="w-5 h-5 text-brand-blue" />
          {{ t('txHistory') }}
        </h3>

        <div class="glass-card rounded-xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-gray-300 font-semibold uppercase text-xs">
                <tr>
                  <th class="p-4">{{ t('txid') }}</th>
                  <th class="p-4">{{ t('type') }}</th>
                  <th class="p-4">{{ t('effectAmount') }}</th>
                  <th class="p-4 text-right">{{ t('time') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200/60 dark:divide-white/5">
                <tr v-for="tx in addressResult.transactions" :key="tx.txid" class="hover:bg-slate-100/50 dark:hover:bg-white/5 transition-colors group">
                  <td class="p-4 font-mono text-brand-blue">
                    <NuxtLink :to="`/tx/${tx.txid}`" class="hover:text-brand-salmon transition-colors">{{ shortenHash(tx.txid, 14) }}</NuxtLink>
                  </td>
                  <td class="p-4">
                    <!-- Received badge -->
                    <span 
                      v-if="tx.received > 0 && tx.sent === 0" 
                      class="px-2.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold"
                    >
                      {{ t('incoming') }}
                    </span>
                    <!-- Sent badge -->
                    <span 
                      v-else-if="tx.sent > 0 && tx.received === 0" 
                      class="px-2.5 py-0.5 rounded bg-red-500/10 text-red-650 dark:text-red-400 text-xs font-semibold"
                    >
                      {{ t('outgoing') }}
                    </span>
                    <!-- Intra-wallet / complex tx badge -->
                    <span 
                      v-else
                      class="px-2.5 py-0.5 rounded bg-brand-blue/10 text-brand-blue text-xs font-semibold"
                    >
                      {{ t('combined') }}
                    </span>
                  </td>
                  <td class="p-4 font-semibold">
                    <span v-if="tx.received > 0 && tx.sent === 0" class="text-emerald-600 dark:text-emerald-400">
                      +{{ formatCoins(tx.received) }}
                    </span>
                    <span v-else-if="tx.sent > 0 && tx.received === 0" class="text-red-600 dark:text-red-400">
                      -{{ formatCoins(tx.sent) }}
                    </span>
                    <!-- If it is both sent and received (complex transaction inputs/outputs) -->
                    <span v-else class="text-slate-700 dark:text-gray-300">
                      {{ t('net') }}: {{ formatCoins(tx.received - tx.sent) }}
                    </span>
                  </td>
                  <td class="p-4 text-slate-600 dark:text-gray-300 text-right">{{ formatDate(tx.time) }}</td>
                </tr>
                <tr v-if="!addressResult.transactions?.length">
                  <td colspan="4" class="p-6 text-center text-slate-500 dark:text-slate-400">{{ t('noAddressTxs') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
