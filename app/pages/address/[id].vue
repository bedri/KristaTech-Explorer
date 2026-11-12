<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { formatCoins, formatDate, shortenHash } from '~/utils/formatters'

const { t } = useI18n()
const route = useRoute()
const addressId = computed(() => route.params.id)
const currentPage = ref(1)
const isCopied = ref(false)

watch(addressId, () => {
  currentPage.value = 1
})

const { data: addressResult, error } = await useFetch(() => `/api/address/${addressId.value}?page=${currentPage.value}&limit=50`)

// Clipboard copy helper
function copyAddress() {
  if (!navigator.clipboard) return
  navigator.clipboard.writeText(addressResult.value?.address || addressId.value)
  isCopied.value = true
  setTimeout(() => {
    isCopied.value = false
  }, 2000)
}

function changePage(newPage) {
  if (!addressResult.value?.totalPages) return
  if (newPage >= 1 && newPage <= addressResult.value.totalPages) {
    currentPage.value = newPage
  }
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
      <div class="inline-flex p-3 bg-red-100 dark:bg-red-500/10 rounded-lg text-red-600 dark:text-red-400">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8" />
      </div>
      <h3 class="text-xl font-bold text-slate-800 dark:text-white">{{ t('addrNotFound') }}</h3>
      <p class="text-red-600 dark:text-red-300/80 max-w-md mx-auto">
        {{ t('addrNotFoundDesc') }}
      </p>
    </div>

    <!-- Address Stats & History -->
    <div v-else class="space-y-8">
      <!-- Protocol Burn Address Banner -->
      <div
        v-if="addressResult.isBurnAddress"
        class="p-5 rounded-2xl bg-orange-500/10 border border-orange-500/30 flex items-start gap-4"
      >
        <div class="p-2.5 rounded-xl bg-orange-500/20 text-orange-600 dark:text-orange-400 shrink-0">
          <UIcon name="i-heroicons-fire" class="w-6 h-6" />
        </div>
        <div class="space-y-1">
          <h3 class="text-base font-bold text-orange-700 dark:text-orange-300">
            🔥 {{ t('burnAddressBannerTitle') }}
          </h3>
          <p class="text-sm text-orange-700/80 dark:text-orange-200/80 leading-relaxed">
            {{ t('burnAddressBannerDesc') }}
          </p>
        </div>
      </div>

      <!-- Address Header -->
      <div class="glass-card rounded-2xl p-6 md:p-8 space-y-4">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="space-y-1.5">
            <div class="flex flex-wrap items-center gap-2">
              <span
                v-if="addressResult.isBurnAddress"
                class="text-xs font-semibold px-2.5 py-0.5 rounded bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30"
              >
                🔥 {{ t('burnBadge') }}
              </span>
              <span
                v-else-if="addressResult.isTreasuryAddress"
                class="text-xs font-semibold px-2.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30"
              >
                {{ t('treasuryAddressBadge') }}
              </span>
              <span
                v-else-if="addressResult.isTaprootAddress"
                class="text-xs font-semibold px-2.5 py-0.5 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30"
              >
                📜 {{ t('taprootAddressBadge') }}
              </span>
              <span
                v-else
                class="text-xs font-semibold px-2 py-0.5 rounded bg-brand-salmon/10 text-brand-salmon border border-brand-salmon/25"
              >
                {{ t('walletAddress') }}
              </span>
            </div>

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
          <p class="text-sm font-medium text-slate-500 dark:text-slate-300">
            {{ addressResult.isBurnAddress ? `🔥 ${t('burnedSupply')}` : t('currentBalance') }}
          </p>
          <h3 class="text-xl font-bold mt-1 break-all" :class="addressResult.isBurnAddress ? 'text-orange-600 dark:text-orange-400' : 'text-brand-salmon'">
            {{ formatCoins(addressResult.balance) }}
          </h3>
          <p v-if="addressResult.lockedBalance > 0" class="mt-2 text-xs text-amber-600 dark:text-amber-300 font-medium">
            🔒 {{ t('lockedValidatorBalance') }}: {{ formatCoins(addressResult.lockedBalance) }}
            <span v-if="addressResult.maxLockHeight">(#{{ addressResult.maxLockHeight }})</span>
          </p>
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
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <UIcon name="i-heroicons-clock" class="w-5 h-5 text-brand-blue" />
            {{ t('txHistory') }}
          </h3>

          <div v-if="addressResult.totalPages > 1" class="flex items-center gap-2 text-xs">
            <button
              type="button"
              :disabled="currentPage <= 1"
              @click="changePage(currentPage - 1)"
              class="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {{ t('prevPage') }}
            </button>
            <span class="text-slate-600 dark:text-slate-300 font-medium">
              {{ t('pageOf') }} {{ currentPage }} / {{ addressResult.totalPages }}
            </span>
            <button
              type="button"
              :disabled="currentPage >= addressResult.totalPages"
              @click="changePage(currentPage + 1)"
              class="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {{ t('nextPage') }}
            </button>
          </div>
        </div>

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
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <!-- Direction badge -->
                      <span
                        v-if="tx.received > 0 && tx.sent === 0"
                        class="px-2.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold"
                      >
                        {{ t('incoming') }}
                      </span>
                      <span
                        v-else-if="tx.sent > 0 && tx.received === 0"
                        class="px-2.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold"
                      >
                        {{ t('outgoing') }}
                      </span>
                      <span
                        v-else
                        class="px-2.5 py-0.5 rounded bg-brand-blue/10 text-brand-blue text-xs font-semibold"
                      >
                        {{ t('combined') }}
                      </span>

                      <!-- Protocol classification badge -->
                      <span v-if="tx.txType === 'coinstake'" class="px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-300 text-[10px] font-semibold">
                        {{ t('coinstake') }}
                      </span>
                      <span v-else-if="tx.txType === 'coinbase'" class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold">
                        COINBASE
                      </span>
                      <span v-else-if="tx.txType === 'coin_lock'" class="px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-300 text-[10px] font-semibold">
                        🔒 {{ t('coinLockBadge') }}
                      </span>
                      <span v-else-if="tx.txType === 'pow_lock'" class="px-2 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-300 text-[10px] font-semibold">
                        ⚡ {{ t('powLockBadge') }}
                      </span>
                      <span v-else-if="tx.txType === 'zerocoin_pow'" class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 text-[10px] font-semibold">
                        🌱 {{ t('trackZeroCoin') }}
                      </span>
                      <span v-else-if="tx.txType === 'burn'" class="px-2 py-0.5 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[10px] font-semibold">
                        🔥 {{ t('burnBadge') }}
                      </span>
                    </div>
                  </td>
                  <td class="p-4 font-semibold">
                    <span v-if="tx.received > 0 && tx.sent === 0" class="text-emerald-600 dark:text-emerald-400">
                      +{{ formatCoins(tx.received) }}
                    </span>
                    <span v-else-if="tx.sent > 0 && tx.received === 0" class="text-red-600 dark:text-red-400">
                      -{{ formatCoins(tx.sent) }}
                    </span>
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
