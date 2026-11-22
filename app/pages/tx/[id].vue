<script setup>
import { ref, computed } from 'vue'
import { useI18n } from '~/composables/useI18n'
import {
  formatCoins,
  formatDate,
  formatRelativeTime,
  formatBytes,
  shortenHash
} from '~/utils/formatters'

const { locale, t } = useI18n()
const route = useRoute()
const txid = computed(() => route.params.id)

const { data: txResult, error } = await useFetch(() => `/api/tx/${txid.value}`)

const activeTab = ref('overview')
function onTabKeydown(e) {
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault()
    activeTab.value = activeTab.value === 'overview' ? 'raw' : 'overview'
    document.getElementById(`tx-tab-${activeTab.value}`)?.focus()
  }
}

const openScripts = ref({})
function toggleScript(n) {
  openScripts.value = {
    ...openScripts.value,
    [n]: !openScripts.value[n]
  }
}

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
  <div class="space-y-6">
    <AppBreadcrumbs
      :items="[
        { label: t('navDashboard'), to: '/' },
        { label: t('navTransactions'), to: '/transactions' },
        { label: shortenHash(String(txid), 8), to: `/tx/${txid}` }
      ]"
    />

    <!-- Error State -->
    <div v-if="error || !txResult?.success" class="p-6 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-500/20 rounded-xl text-center space-y-4">
      <div class="inline-flex p-3 bg-red-100 dark:bg-red-500/10 rounded-lg text-red-600 dark:text-red-400">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8" aria-hidden="true" />
      </div>
      <h1 class="text-xl font-bold text-slate-800 dark:text-white">{{ t('txNotFound') }}</h1>
      <p class="text-red-600 dark:text-red-300/80 max-w-md mx-auto">
        {{ t('txNotFoundDesc') }}
      </p>
    </div>

    <!-- Tx Details -->
    <div v-else class="space-y-6">
      <div class="glass-card rounded-2xl p-6 md:p-8 space-y-5">
        <div class="border-b border-slate-200/60 dark:border-white/5 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-extrabold text-slate-800 dark:text-white">
              {{ t('txDetails') }}
            </h1>
            <p class="text-xs font-mono text-slate-500 dark:text-slate-400 break-all mt-1">{{ txResult.txid }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <TxTypeBadge :tx-type="txResult.txType" :is-coinbase="txResult.isCoinbase" :is-coinstake="txResult.isCoinstake" />
            <span class="px-3 py-1 rounded bg-brand-salmon/10 border border-brand-salmon/25 text-brand-salmon text-xs font-semibold">
              {{ txResult.confirmations }} {{ t('confirmations') }}
            </span>
          </div>
        </div>

        <!-- Tabs -->
        <div role="tablist" aria-label="Transaction view tabs" class="explorer-tablist" @keydown="onTabKeydown">
          <button
            id="tx-tab-overview"
            role="tab"
            type="button"
            :aria-selected="activeTab === 'overview' ? 'true' : 'false'"
            :tabindex="activeTab === 'overview' ? 0 : -1"
            @click="activeTab = 'overview'"
          >
            {{ t('overviewTab') }}
          </button>
          <button
            id="tx-tab-raw"
            role="tab"
            type="button"
            :aria-selected="activeTab === 'raw' ? 'true' : 'false'"
            :tabindex="activeTab === 'raw' ? 0 : -1"
            @click="activeTab = 'raw'"
          >
            {{ t('rawJsonTab') }}
          </button>
        </div>

        <div role="tabpanel" aria-labelledby="tx-tab-overview" :hidden="activeTab !== 'overview' ? true : undefined">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 text-sm pt-2">
            <div class="space-y-0.5">
              <p class="text-slate-500 dark:text-slate-400 text-xs font-medium">{{ t('timestamp') }}</p>
              <p class="text-slate-800 dark:text-gray-200 font-semibold">{{ formatDate(txResult.time) }}</p>
              <p class="text-xs text-slate-500">{{ formatRelativeTime(txResult.time, locale) }}</p>
            </div>
            <div class="space-y-0.5">
              <p class="text-slate-500 dark:text-slate-400 text-xs font-medium">{{ t('includedBlock') }}</p>
              <p class="text-slate-800 dark:text-gray-200 font-semibold">
                <NuxtLink v-if="txResult.blockheight !== null && txResult.blockheight !== undefined" :to="`/block/${txResult.blockheight}`" class="text-brand-salmon font-bold hover:underline">
                  #{{ txResult.blockheight }}
                </NuxtLink>
                <span v-else class="text-amber-600 dark:text-amber-300">{{ t('unconfirmed') }}</span>
              </p>
              <p class="text-xs text-slate-500 font-mono">v{{ txResult.version }} • locktime {{ txResult.locktime }}</p>
            </div>
            <div class="space-y-0.5">
              <p class="text-slate-500 dark:text-slate-400 text-xs font-medium">{{ t('amount') }} (Out)</p>
              <p class="text-slate-800 dark:text-gray-200 font-bold">{{ formatCoins(txResult.totalOut) }}</p>
              <p class="text-xs text-slate-500">{{ t('size') }}: {{ formatBytes(txResult.size) }}</p>
            </div>
            <div class="space-y-0.5">
              <p class="text-slate-500 dark:text-slate-400 text-xs font-medium">{{ t('fee') }} & {{ t('feeRate') }}</p>
              <p class="text-slate-800 dark:text-gray-200 font-semibold">{{ formatCoins(txResult.fee, 8) }}</p>
              <p class="text-xs text-slate-500 font-mono">{{ txResult.feeRateSatByte }} sat/B</p>
            </div>
          </div>
        </div>

        <div role="tabpanel" aria-labelledby="tx-tab-raw" :hidden="activeTab !== 'raw' ? true : undefined">
          <div class="pt-2 space-y-3">
            <div v-if="txResult.hex" class="space-y-1">
              <p class="text-xs font-semibold text-slate-500 uppercase">Raw Transaction Hex</p>
              <div class="p-3 rounded-xl bg-slate-950 text-sky-300 font-mono text-xs break-all max-h-32 overflow-y-auto">{{ txResult.hex }}</div>
            </div>
            <pre class="p-4 rounded-xl bg-slate-950 text-emerald-300 font-mono text-xs overflow-x-auto max-h-[420px]">{{ JSON.stringify(txResult.rawTx, null, 2) }}</pre>
          </div>
        </div>
      </div>

      <!-- Inputs & Outputs Flow -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 relative">
        <!-- Left: Inputs -->
        <div class="space-y-4">
          <h2 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <UIcon name="i-heroicons-arrow-down-tray" class="w-5 h-5 text-brand-blue" aria-hidden="true" />
            {{ t('inputs') }} ({{ txResult.vin?.length || 0 }})
          </h2>

          <div class="space-y-3">
            <div
              v-for="(input, idx) in txResult.vin"
              :key="idx"
              class="glass-card rounded-xl p-4 space-y-2"
            >
              <div class="flex justify-between items-center gap-2">
                <div v-if="input.prev_txid === 'coinbase'" class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">COINBASE</span>
                  <span class="text-sm text-slate-700 dark:text-gray-300">{{ t('newCoins') }}</span>
                </div>
                <div v-else-if="input.address === 'Zero-Coin PoW'" class="space-y-1">
                  <span class="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/25 text-emerald-600 dark:text-emerald-300 text-xs font-semibold">
                    🌱 {{ t('zeroCoinPow') }}
                  </span>
                  <p class="text-xs font-mono text-slate-500 dark:text-slate-400">Sentinel: 0x0000...0001:0</p>
                </div>
                <div v-else class="space-y-1 min-w-0">
                  <p class="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {{ t('prevTxid') }}:
                    <NuxtLink :to="`/tx/${input.prev_txid}`" class="text-brand-blue font-semibold hover:underline">
                      {{ shortenHash(input.prev_txid, 7) }}
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
          </div>
        </div>

        <!-- Right: Outputs -->
        <div class="space-y-4">
          <h2 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <UIcon name="i-heroicons-arrow-up-tray" class="w-5 h-5 text-brand-salmon" aria-hidden="true" />
            {{ t('outputs') }} ({{ txResult.vout?.length || 0 }})
          </h2>

          <div class="space-y-3">
            <div
              v-for="output in txResult.vout"
              :key="output.n"
              class="glass-card rounded-xl p-4 space-y-3"
            >
              <div class="flex justify-between items-start gap-3">
                <div class="space-y-1.5 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs font-mono text-slate-500">#{{ output.n }}</span>
                    <span v-if="output.script_type === 'adam_coinlock'" class="px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-semibold">
                      🔒 {{ t('coinLockBadge') }}
                    </span>
                    <span v-else-if="output.script_type === 'adam_powlock'" class="px-2 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 text-[11px] font-semibold">
                      ⚡ {{ t('powLockBadge') }}
                    </span>
                    <span v-else-if="output.script_type === 'cltv_timelock'" class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold">
                      ⏳ {{ t('polTimelockBadge') }}
                    </span>
                    <span v-else-if="output.script_type === 'witness_v1_taproot' || output.script_type === 'mescalcontract'" class="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[11px] font-semibold">
                      📜 {{ t('taprootContract') }}
                    </span>
                    <span v-else-if="output.script_type === 'nulldata' || output.address === 'OP_RETURN'" class="px-2 py-0.5 rounded bg-slate-500/15 text-slate-600 dark:text-slate-300 text-[11px] font-mono font-semibold">
                      {{ t('opReturnBadge') }}
                    </span>
                    <span v-if="output.isBurn" class="px-2 py-0.5 rounded bg-orange-500/15 text-orange-600 dark:text-orange-400 text-[11px] font-semibold">
                      🔥 {{ t('burnBadge') }}
                    </span>
                    <span v-if="output.lock_height" class="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-[11px] font-mono">
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

                <div class="text-right space-y-1.5 shrink-0">
                  <p class="text-sm font-bold text-slate-800 dark:text-white">{{ formatCoins(output.amount) }}</p>

                  <!-- Clickable Spend Status Link -->
                  <div v-if="!['nulldata', 'coinstake_marker', 'pos_coinbase_marker'].includes(output.script_type)" class="flex justify-end">
                    <span v-if="output.isBurn" class="px-2 py-0.5 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 text-xs font-semibold">
                      🔥 {{ t('burnBadge') }}
                    </span>
                    <NuxtLink
                      v-else-if="output.spent_txid"
                      :to="`/tx/${output.spent_txid}`"
                      class="px-2 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-600 dark:text-red-300 text-[11px] font-semibold transition-colors"
                    >
                      {{ t('spentInTx') }} {{ shortenHash(output.spent_txid, 5) }} →
                    </NuxtLink>
                    <span v-else class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                      {{ t('unspent') }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Decoded OP_RETURN Payload -->
              <div v-if="output.opReturnDecoded" class="p-3 rounded-lg bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-white/10 space-y-1 text-xs">
                <div class="font-semibold text-slate-600 dark:text-slate-300">{{ t('decodedOpReturn') }}</div>
                <p v-if="output.opReturnDecoded.utf8Text" class="font-mono text-emerald-700 dark:text-emerald-300 break-all">
                  UTF-8: "{{ output.opReturnDecoded.utf8Text }}"
                </p>
                <p class="font-mono text-slate-500 break-all">Hex: {{ output.opReturnDecoded.dataHex }}</p>
              </div>

              <!-- Decompiled MESCAL Contract -->
              <div v-if="output.mescalDecompiled" class="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/20 space-y-1 text-xs">
                <div class="font-semibold text-indigo-700 dark:text-indigo-300">📜 {{ t('mescalDecompiled') }}</div>
                <pre class="font-mono text-[11px] text-slate-700 dark:text-slate-200 overflow-x-auto">{{ typeof output.mescalDecompiled === 'string' ? output.mescalDecompiled : JSON.stringify(output.mescalDecompiled, null, 2) }}</pre>
              </div>

              <!-- Toggleable Script ASM / Hex -->
              <div v-if="output.script_asm || output.script_hex" class="pt-1">
                <button
                  type="button"
                  @click="toggleScript(output.n)"
                  :aria-expanded="openScripts[output.n] ? 'true' : 'false'"
                  class="text-[11px] font-semibold text-brand-blue hover:underline cursor-pointer"
                >
                  {{ openScripts[output.n] ? '▾' : '▸' }} {{ t('scriptDetails') }} ({{ output.script_type }})
                </button>
                <div v-if="openScripts[output.n]" class="mt-2 p-2.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10 font-mono text-[11px] space-y-1 break-all">
                  <div v-if="output.script_asm"><span class="text-slate-400">ASM:</span> {{ output.script_asm }}</div>
                  <div v-if="output.script_hex"><span class="text-slate-400">HEX:</span> {{ output.script_hex }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
