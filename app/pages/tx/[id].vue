<script setup>
import { computed } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { formatCoins, formatDate, formatBytes, shortenHash } from '~/utils/formatters'

const { t } = useI18n()
const route = useRoute()
const txid = computed(() => route.params.id)

const { data: txResult, error } = await useFetch(() => `/api/tx/${txid.value}`)

const NON_CLICKABLE_LABELS = new Set([
  'Coinbase',
  'Zero-Coin PoW',
  'OP_RETURN',
  'Coinstake-Marker',
  'MESCAL-Contract',
  'Nonstandard',
  'Pubkey-output',
  'Unconfirmed-Input'
])

function isClickableAddress(addr) {
  return addr && !NON_CLICKABLE_LABELS.has(addr)
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
      <div class="inline-flex p-3 bg-red-100 dark:bg-red-500/10 rounded-lg text-red-600 dark:text-red-400">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8" />
      </div>
      <h3 class="text-xl font-bold text-slate-800 dark:text-white">{{ t('txNotFound') }}</h3>
      <p class="text-red-600 dark:text-red-300/80 max-w-md mx-auto">
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
          <div class="flex flex-wrap items-center gap-2.5">
            <span v-if="txResult.isCoinbase" class="px-3 py-1 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
              COINBASE
            </span>
            <span v-else-if="txResult.isCoinstake" class="px-3 py-1 rounded bg-purple-500/10 border border-purple-500/25 text-purple-600 dark:text-purple-300 text-xs font-semibold">
              {{ t('coinstake') }}
            </span>
            <span v-else-if="txResult.txType === 'coin_lock'" class="px-3 py-1 rounded bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-300 text-xs font-semibold">
              🔒 {{ t('coinLockBadge') }}
            </span>
            <span v-else-if="txResult.txType === 'pow_lock'" class="px-3 py-1 rounded bg-sky-500/10 border border-sky-500/25 text-sky-600 dark:text-sky-300 text-xs font-semibold">
              ⚡ {{ t('powLockBadge') }}
            </span>
            <span v-else-if="txResult.txType === 'zerocoin_pow'" class="px-3 py-1 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-300 text-xs font-semibold">
              🌱 {{ t('zeroCoinPow') }}
            </span>
            <span v-else-if="txResult.txType === 'burn'" class="px-3 py-1 rounded bg-orange-500/10 border border-orange-500/25 text-orange-600 dark:text-orange-400 text-xs font-semibold">
              🔥 {{ t('burnBadge') }}
            </span>
            <span v-else-if="txResult.txType === 'contract'" class="px-3 py-1 rounded bg-indigo-500/10 border border-indigo-500/25 text-indigo-600 dark:text-indigo-300 text-xs font-semibold">
              📜 {{ t('taprootContract') }}
            </span>

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
              <NuxtLink v-if="txResult.blockheight !== null && txResult.blockheight !== undefined" :to="`/block/${txResult.blockheight}`" class="text-brand-salmon font-semibold hover:underline">
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
                <!-- Coinbase Checker -->
                <div v-if="input.prev_txid === 'coinbase'" class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">COINBASE</span>
                  <span class="text-sm text-slate-700 dark:text-gray-300">{{ t('newCoins') }}</span>
                </div>
                <!-- Zero-Coin PoW Sentinel Checker -->
                <div v-else-if="input.address === 'Zero-Coin PoW'" class="space-y-1">
                  <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/25 text-emerald-600 dark:text-emerald-300 text-xs font-semibold">
                      🌱 {{ t('zeroCoinPow') }}
                    </span>
                  </div>
                  <p class="text-xs font-mono text-slate-500 dark:text-slate-400">
                    Sentinel: 0x0000...0001:0
                  </p>
                </div>
                <!-- Standard Input -->
                <div v-else class="space-y-1 min-w-0">
                  <p class="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {{ t('prevTxid') }}:
                    <NuxtLink :to="`/tx/${input.prev_txid}`" class="text-brand-blue font-semibold hover:underline">
                      {{ shortenHash(input.prev_txid, 6) }}
                    </NuxtLink>
                    #{{ input.prev_vout }}
                  </p>
                  <p class="text-sm font-semibold text-slate-700 dark:text-gray-200 break-all">
                    <NuxtLink v-if="isClickableAddress(input.address)" :to="`/address/${input.address}`" class="text-brand-salmon hover:underline">
                      {{ input.address }}
                    </NuxtLink>
                    <span v-else class="text-slate-500 dark:text-slate-400">{{ input.address }}</span>
                  </p>
                </div>

                <div class="text-right shrink-0">
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
                <div class="space-y-1.5 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs text-slate-500 dark:text-slate-400">Index: #{{ output.n }}</span>
                    <span
                      v-if="output.script_type === 'adam_coinlock'"
                      class="px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-300 text-[11px] font-semibold"
                    >
                      🔒 {{ t('coinLockBadge') }}
                    </span>
                    <span
                      v-else-if="output.script_type === 'adam_powlock'"
                      class="px-2 py-0.5 rounded bg-sky-500/15 text-sky-600 dark:text-sky-300 text-[11px] font-semibold"
                    >
                      ⚡ {{ t('powLockBadge') }}
                    </span>
                    <span
                      v-else-if="output.script_type === 'witness_v1_taproot' || output.script_type === 'mescalcontract'"
                      class="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 text-[11px] font-semibold"
                    >
                      📜 {{ t('taprootContract') }}
                    </span>
                    <span
                      v-else-if="output.script_type === 'nulldata' || output.address === 'OP_RETURN'"
                      class="px-2 py-0.5 rounded bg-slate-500/15 text-slate-600 dark:text-slate-300 text-[11px] font-mono font-semibold"
                    >
                      {{ t('opReturnBadge') }}
                    </span>
                    <span
                      v-else-if="output.script_type === 'coinstake_marker'"
                      class="px-2 py-0.5 rounded bg-purple-500/15 text-purple-600 dark:text-purple-300 text-[11px] font-semibold"
                    >
                      {{ t('coinstake') }}
                    </span>

                    <span
                      v-if="output.isBurn"
                      class="px-2 py-0.5 rounded bg-orange-500/15 text-orange-600 dark:text-orange-400 text-[11px] font-semibold"
                    >
                      🔥 {{ t('burnBadge') }}
                    </span>

                    <span
                      v-if="output.lock_height"
                      class="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-[11px] font-mono"
                    >
                      {{ t('lockedUntilBlock') }} #{{ output.lock_height }}
                    </span>
                  </div>

                  <p class="text-sm font-semibold text-slate-700 dark:text-gray-200 break-all">
                    <NuxtLink v-if="isClickableAddress(output.address)" :to="`/address/${output.address}`" class="text-brand-salmon hover:underline">
                      {{ output.address }}
                    </NuxtLink>
                    <span v-else class="text-slate-500 dark:text-slate-400">{{ output.address }}</span>
                  </p>
                </div>

                <div class="text-right space-y-1 shrink-0">
                  <p class="text-sm font-bold text-slate-800 dark:text-white">{{ formatCoins(output.amount) }}</p>

                  <!-- Spend status badge -->
                  <div v-if="output.script_type !== 'nulldata' && output.script_type !== 'coinstake_marker' && output.script_type !== 'pos_coinbase_marker'" class="flex justify-end">
                    <span
                      v-if="output.isBurn"
                      class="px-2 py-0.5 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 text-xs font-semibold"
                    >
                      🔥 {{ t('burnBadge') }}
                    </span>
                    <span
                      v-else-if="output.spent_txid"
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
