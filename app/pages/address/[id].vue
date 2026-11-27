<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from '~/composables/useI18n'
import {
  formatCoins,
  formatDate,
  formatDurationSeconds,
  formatNumber,
  formatRelativeTime,
  shortenHash
} from '~/utils/formatters'
import { generateQrMatrix } from '~/utils/qr'

const { locale, t } = useI18n()
const route = useRoute()
const addressId = computed(() => route.params.id)
const currentPage = ref(1)
const directionFilter = ref('all')
const isCopied = ref(false)

watch([addressId, directionFilter], () => {
  currentPage.value = 1
})

const { data: addressResult, error } = await useFetch(
  () =>
    `/api/address/${encodeURIComponent(String(addressId.value))}?page=${currentPage.value}&limit=50&direction=${directionFilter.value}`
)

const activeTab = ref('txs')
const tabKeys = ['txs', 'utxos', 'validator', 'qr']

function onTabKeydown(e) {
  const idx = tabKeys.indexOf(activeTab.value)
  if (idx === -1) return
  let nextIdx = -1
  if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabKeys.length
  else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabKeys.length) % tabKeys.length
  else if (e.key === 'Home') nextIdx = 0
  else if (e.key === 'End') nextIdx = tabKeys.length - 1
  if (nextIdx !== -1) {
    e.preventDefault()
    activeTab.value = tabKeys[nextIdx]
    document.getElementById(`addr-tab-${tabKeys[nextIdx]}`)?.focus()
  }
}

const qrMatrix = computed(() => {
  const addr = addressResult.value?.address || String(addressId.value || '')
  return generateQrMatrix(addr)
})

function copyAddress() {
  if (!navigator.clipboard) return
  navigator.clipboard.writeText(addressResult.value?.address || String(addressId.value))
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

function exportTransactionsCsv() {
  const rows = addressResult.value?.transactions || []
  if (!rows.length || typeof document === 'undefined') return
  const header = ['txid,type,received_krista,sent_krista,net_krista,utc_timestamp']
  for (const tx of rows) {
    const net = Math.round(((tx.received || 0) - (tx.sent || 0)) * 1e8) / 1e8
    header.push(
      `${tx.txid},${tx.txType},${tx.received},${tx.sent},${net},"${formatDate(tx.time)}"`
    )
  }
  const blob = new Blob([header.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `krista-${addressResult.value.address.slice(0, 12)}-txs.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="space-y-6">
    <AppBreadcrumbs
      :items="[
        { label: t('navDashboard'), to: '/' },
        { label: t('navRichList'), to: '/richlist' },
        { label: shortenHash(String(addressId), 8), to: `/address/${addressId}` }
      ]"
    />

    <!-- Error State -->
    <div v-if="error || !addressResult?.success" class="p-6 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-500/20 rounded-xl text-center space-y-4">
      <div class="inline-flex p-3 bg-red-100 dark:bg-red-500/10 rounded-lg text-red-600 dark:text-red-400">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8" aria-hidden="true" />
      </div>
      <h1 class="text-xl font-bold text-slate-800 dark:text-white">{{ t('addrNotFound') }}</h1>
      <p class="text-red-600 dark:text-red-300/80 max-w-md mx-auto">
        {{ t('addrNotFoundDesc') }}
      </p>
    </div>

    <!-- Address Content -->
    <div v-else class="space-y-6">
      <!-- Official Burn Address Banner -->
      <div
        v-if="addressResult.isBurnAddress"
        class="p-5 rounded-2xl bg-orange-500/10 border border-orange-500/30 flex items-start gap-4"
      >
        <div class="p-2.5 rounded-xl bg-orange-500/20 text-orange-600 dark:text-orange-400 shrink-0">
          <UIcon name="i-heroicons-fire" class="w-6 h-6" aria-hidden="true" />
        </div>
        <div class="space-y-1">
          <h2 class="text-base font-bold text-orange-700 dark:text-orange-300">
            🔥 {{ t('burnAddressBannerTitle') }}
          </h2>
          <p class="text-sm text-orange-700/80 dark:text-orange-200/80 leading-relaxed">
            {{ t('burnAddressBannerDesc') }}
          </p>
        </div>
      </div>

      <!-- Address Identity Header -->
      <div class="glass-card rounded-2xl p-6 md:p-8 space-y-4">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="space-y-2 min-w-0">
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
                class="text-xs font-semibold px-2.5 py-0.5 rounded bg-brand-salmon/10 text-brand-salmon border border-brand-salmon/25"
              >
                {{ t('walletAddress') }}
              </span>

              <span
                v-for="(ve, vIdx) in addressResult.validatorEntries || []"
                :key="vIdx"
                class="text-xs font-semibold px-2.5 py-0.5 rounded bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30"
              >
                🛡️ ADAM {{ ve.track }} ({{ ve.vrfTickets }} VRF)
              </span>

              <span
                v-if="addressResult.quorumMember"
                class="text-xs font-semibold px-2.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
              >
                ✓ LLMQ Rank #{{ addressResult.quorumMember.rank }}
              </span>

              <span
                v-for="(mr, mrIdx) in addressResult.masternodeRoles || []"
                :key="`mr-${mrIdx}`"
                class="text-xs font-semibold px-2.5 py-0.5 rounded bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30"
              >
                KTDIP3 {{ mr.roles.join(' / ') }} ({{ mr.status }})
              </span>
            </div>

            <h1 class="text-lg sm:text-xl md:text-2xl font-extrabold text-slate-800 dark:text-white font-mono break-all">
              {{ addressResult.address }}
            </h1>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <button
              type="button"
              @click="copyAddress"
              class="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <UIcon name="i-heroicons-clipboard-document" class="w-4 h-4" aria-hidden="true" />
              <span>{{ isCopied ? t('copied') : t('copyAddress') }}</span>
            </button>
            <button
              type="button"
              @click="activeTab = 'qr'"
              class="px-3 py-2 rounded-lg bg-brand-blue/10 hover:bg-brand-blue/20 border border-brand-blue/25 text-brand-blue text-xs font-semibold cursor-pointer"
            >
              {{ t('qrCodeTab') }}
            </button>
          </div>
        </div>
      </div>

      <!-- 4 KPI Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div class="glass-card rounded-xl p-5">
          <p class="text-xs font-medium text-slate-500 dark:text-slate-300">
            {{ addressResult.isBurnAddress ? `🔥 ${t('burnedSupply')}` : t('currentBalance') }}
          </p>
          <p class="text-xl font-extrabold mt-1 break-all" :class="addressResult.isBurnAddress ? 'text-orange-600 dark:text-orange-400' : 'text-brand-salmon'">
            {{ formatCoins(addressResult.balance) }}
          </p>
          <p v-if="addressResult.lockedBalance > 0" class="mt-2 text-xs text-amber-600 dark:text-amber-300 font-medium">
            🔒 {{ t('lockedValidatorBalance') }}: {{ formatCoins(addressResult.lockedBalance) }}
            <span v-if="addressResult.maxLockHeight">(#{{ addressResult.maxLockHeight }})</span>
          </p>
        </div>

        <div class="glass-card rounded-xl p-5">
          <p class="text-xs font-medium text-slate-500 dark:text-slate-300">{{ t('totalReceived') }}</p>
          <p class="text-xl font-extrabold text-slate-800 dark:text-white mt-1 break-all">{{ formatCoins(addressResult.totalReceived) }}</p>
        </div>

        <div class="glass-card rounded-xl p-5">
          <p class="text-xs font-medium text-slate-500 dark:text-slate-300">{{ t('totalSent') }}</p>
          <p class="text-xl font-extrabold text-slate-800 dark:text-white mt-1 break-all">{{ formatCoins(addressResult.totalSent) }}</p>
        </div>

        <div class="glass-card rounded-xl p-5">
          <p class="text-xs font-medium text-slate-500 dark:text-slate-300">{{ t('totalTxs') }}</p>
          <p class="text-xl font-extrabold text-slate-800 dark:text-white mt-1">
            {{ formatNumber(addressResult.txCount, 0) }} {{ t('txCountLabel') }}
          </p>
          <p class="mt-2 text-xs text-slate-500">UTXOs: {{ addressResult.utxos?.length || 0 }}</p>
        </div>
      </div>

      <!-- 4 Accessible Tabs: Transactions | UTXOs | Validator & Blocks | QR Code -->
      <div class="space-y-4">
        <div role="tablist" aria-label="Address views" class="explorer-tablist" @keydown="onTabKeydown">
          <button
            id="addr-tab-txs"
            role="tab"
            type="button"
            :aria-selected="activeTab === 'txs' ? 'true' : 'false'"
            :tabindex="activeTab === 'txs' ? 0 : -1"
            @click="activeTab = 'txs'"
          >
            {{ t('txHistory') }} ({{ formatNumber(addressResult.txCount, 0) }})
          </button>
          <button
            id="addr-tab-utxos"
            role="tab"
            type="button"
            :aria-selected="activeTab === 'utxos' ? 'true' : 'false'"
            :tabindex="activeTab === 'utxos' ? 0 : -1"
            @click="activeTab = 'utxos'"
          >
            {{ t('utxosTab') }} ({{ addressResult.utxos?.length || 0 }})
          </button>
          <button
            id="addr-tab-validator"
            role="tab"
            type="button"
            :aria-selected="activeTab === 'validator' ? 'true' : 'false'"
            :tabindex="activeTab === 'validator' ? 0 : -1"
            @click="activeTab = 'validator'"
          >
            {{ t('validatorTab') }} ({{ addressResult.producedBlocks?.length || 0 }})
          </button>
          <button
            id="addr-tab-qr"
            role="tab"
            type="button"
            :aria-selected="activeTab === 'qr' ? 'true' : 'false'"
            :tabindex="activeTab === 'qr' ? 0 : -1"
            @click="activeTab = 'qr'"
          >
            {{ t('qrCodeTab') }}
          </button>
        </div>

        <!-- TAB 1: Transaction History -->
        <div role="tabpanel" aria-labelledby="addr-tab-txs" :hidden="activeTab !== 'txs' ? true : undefined">
          <div class="space-y-4 data-panel-contain">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="inline-flex rounded-lg bg-slate-100 dark:bg-white/5 p-0.5 border border-slate-200 dark:border-white/10 text-xs font-semibold">
                <button
                  v-for="dir in [
                    { key: 'all', label: t('allFilter') },
                    { key: 'in', label: t('incoming') },
                    { key: 'out', label: t('outgoing') }
                  ]"
                  :key="dir.key"
                  type="button"
                  @click="directionFilter = dir.key"
                  class="px-3 py-1.5 rounded-md transition-colors cursor-pointer"
                  :class="directionFilter === dir.key ? 'bg-brand-blue text-white' : 'text-slate-600 dark:text-slate-300'"
                >
                  {{ dir.label }}
                </button>
              </div>

              <div class="flex items-center gap-2">
                <button
                  v-if="addressResult.transactions?.length"
                  type="button"
                  @click="exportTransactionsCsv"
                  class="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <UIcon name="i-heroicons-arrow-down-tray" class="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{{ t('exportCsv') }}</span>
                </button>

                <div v-if="addressResult.totalPages > 1" class="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    :disabled="currentPage <= 1"
                    @click="changePage(currentPage - 1)"
                    class="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 disabled:opacity-40 cursor-pointer"
                  >
                    {{ t('prevPage') }}
                  </button>
                  <span>{{ currentPage }} / {{ addressResult.totalPages }}</span>
                  <button
                    type="button"
                    :disabled="currentPage >= addressResult.totalPages"
                    @click="changePage(currentPage + 1)"
                    class="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 disabled:opacity-40 cursor-pointer"
                  >
                    {{ t('nextPage') }}
                  </button>
                </div>
              </div>
            </div>

            <div class="glass-card rounded-xl overflow-hidden">
              <div tabindex="0" role="region" aria-label="Address transactions" class="table-wrapper">
                <table class="text-left text-sm">
                  <thead class="bg-slate-100 dark:bg-slate-900/95 text-slate-700 dark:text-gray-300 font-semibold uppercase text-xs">
                    <tr>
                      <th scope="col" class="p-3.5">{{ t('txid') }}</th>
                      <th scope="col" class="p-3.5">{{ t('type') }}</th>
                      <th scope="col" class="p-3.5">{{ t('effectAmount') }}</th>
                      <th scope="col" class="p-3.5 text-right">{{ t('time') }}</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-200/60 dark:divide-white/5">
                    <tr v-for="tx in addressResult.transactions" :key="tx.txid" class="hover:bg-slate-100/50 dark:hover:bg-white/5">
                      <td class="p-3.5 font-mono text-brand-blue whitespace-nowrap">
                        <NuxtLink :to="`/tx/${tx.txid}`" class="hover:text-brand-salmon">{{ shortenHash(tx.txid, 12) }}</NuxtLink>
                      </td>
                      <td class="p-3.5 whitespace-nowrap">
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <span v-if="tx.received > 0 && tx.sent === 0" class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                            {{ t('incoming') }}
                          </span>
                          <span v-else-if="tx.sent > 0 && tx.received === 0" class="px-2 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold">
                            {{ t('outgoing') }}
                          </span>
                          <span v-else class="px-2 py-0.5 rounded bg-brand-blue/10 text-brand-blue text-xs font-semibold">
                            {{ t('combined') }}
                          </span>
                          <TxTypeBadge :tx-type="tx.txType" />
                        </div>
                      </td>
                      <td class="p-3.5 font-semibold whitespace-nowrap">
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
                      <td class="p-3.5 text-right text-slate-600 dark:text-gray-300 whitespace-nowrap" :title="formatDate(tx.time)">
                        <div class="text-xs font-medium">{{ formatRelativeTime(tx.time, locale) }}</div>
                        <div class="text-[10px] text-slate-400 font-mono">{{ formatDate(tx.time) }}</div>
                      </td>
                    </tr>
                    <tr v-if="!addressResult.transactions?.length">
                      <td colspan="4" class="p-8 text-center text-slate-400">{{ t('noAddressTxs') }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 2: Unspent Outputs (UTXOs) -->
        <div role="tabpanel" aria-labelledby="addr-tab-utxos" :hidden="activeTab !== 'utxos' ? true : undefined">
          <div class="glass-card rounded-xl overflow-hidden">
            <div v-if="addressResult.utxos?.length" tabindex="0" role="region" aria-label="Unspent outputs" class="table-wrapper">
              <table class="text-left text-sm">
                <thead class="bg-slate-100 dark:bg-slate-900/95 text-slate-700 dark:text-gray-300 font-semibold uppercase text-xs">
                  <tr>
                    <th scope="col" class="p-3.5">OutPoint</th>
                    <th scope="col" class="p-3.5">{{ t('amount') }}</th>
                    <th scope="col" class="p-3.5">Script</th>
                    <th scope="col" class="p-3.5">{{ t('confirmations') }}</th>
                    <th scope="col" class="p-3.5 text-right">{{ t('unlockCountdown') }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-200/60 dark:divide-white/5">
                  <tr v-for="u in addressResult.utxos" :key="`${u.txid}-${u.n}`">
                    <td class="p-3.5 font-mono text-xs text-brand-blue whitespace-nowrap">
                      <NuxtLink :to="`/tx/${u.txid}`" class="hover:underline">{{ shortenHash(u.txid, 10) }}:{{ u.n }}</NuxtLink>
                    </td>
                    <td class="p-3.5 font-bold text-slate-800 dark:text-white whitespace-nowrap">{{ formatCoins(u.amount) }}</td>
                    <td class="p-3.5 font-mono text-xs text-slate-500 whitespace-nowrap">{{ u.scriptType }}</td>
                    <td class="p-3.5 font-mono text-xs whitespace-nowrap">{{ formatNumber(u.confirmations, 0) }}</td>
                    <td class="p-3.5 text-right text-xs whitespace-nowrap">
                      <span v-if="u.lockHeight && u.unlockBlocksRemaining > 0" class="px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-mono">
                        🔒 #{{ u.lockHeight }} ({{ formatDurationSeconds(u.unlockBlocksRemaining * 30, locale) }})
                      </span>
                      <span v-else class="text-emerald-600 dark:text-emerald-400 font-semibold">{{ t('unspent') }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="p-8 text-center text-slate-400 text-sm">{{ t('noUtxos') }}</div>
          </div>
        </div>

        <!-- TAB 3: Validator & Produced Blocks -->
        <div role="tabpanel" aria-labelledby="addr-tab-validator" :hidden="activeTab !== 'validator' ? true : undefined">
          <div class="glass-card rounded-xl p-6 space-y-5">
            <div v-if="addressResult.validatorEntries?.length" class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                v-for="(ve, idx) in addressResult.validatorEntries"
                :key="idx"
                class="p-4 rounded-xl bg-purple-500/10 border border-purple-500/25 space-y-1 text-xs"
              >
                <div class="font-bold text-purple-700 dark:text-purple-300 uppercase">
                  ADAM Seat #{{ ve.index + 1 }} • {{ ve.track }}
                </div>
                <div class="font-mono break-all text-slate-600 dark:text-slate-300">PubKey: {{ ve.pubkey }}</div>
                <div class="font-semibold text-slate-800 dark:text-white">
                  {{ t('vrfTickets') }}: {{ ve.vrfTickets }} ({{ ve.vrfSeatPct }}%)
                  <span v-if="ve.unlock_height > 0">• Unlock #{{ ve.unlock_height }}</span>
                </div>
              </div>
            </div>

            <div v-if="addressResult.masternodeRoles?.length" class="space-y-2">
              <h3 class="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
                🛡️ {{ t('masternodeRolesTitle') }}
              </h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                  v-for="(mr, idx) in addressResult.masternodeRoles"
                  :key="`tab-mr-${idx}`"
                  class="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/25 space-y-1.5 text-xs"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-bold text-cyan-700 dark:text-cyan-300 uppercase">
                      {{ mr.roles.join(' / ') }} • {{ mr.status }}
                    </span>
                    <span class="font-mono text-slate-500">PoSe {{ mr.posePenalty }}/100</span>
                  </div>
                  <div v-if="mr.proTxHash" class="font-mono break-all">
                    ProTx:
                    <NuxtLink :to="`/tx/${mr.proTxHash}`" class="text-brand-blue hover:underline">
                      {{ shortenHash(mr.proTxHash, 10) }}
                    </NuxtLink>
                  </div>
                  <div v-if="mr.payoutAddress" class="font-mono break-all text-slate-600 dark:text-slate-300">
                    {{ t('payoutAddressLabel') }}: {{ mr.payoutAddress }}
                  </div>
                  <div v-if="mr.operatorPubKey" class="font-mono break-all text-slate-500">
                    BLS: {{ shortenHash(mr.operatorPubKey, 10) }}
                  </div>
                </div>
              </div>
            </div>

            <div v-if="addressResult.producedBlocks?.length" tabindex="0" role="region" aria-label="Produced blocks" class="table-wrapper">
              <table class="text-left text-sm">
                <thead class="bg-slate-100 dark:bg-slate-900/95 text-slate-700 dark:text-gray-300 font-semibold uppercase text-xs">
                  <tr>
                    <th scope="col" class="p-3.5">{{ t('height') }}</th>
                    <th scope="col" class="p-3.5">{{ t('type') }}</th>
                    <th scope="col" class="p-3.5">{{ t('reward') }}</th>
                    <th scope="col" class="p-3.5">ADAM</th>
                    <th scope="col" class="p-3.5 text-right">{{ t('time') }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-200/60 dark:divide-white/5">
                  <tr v-for="b in addressResult.producedBlocks" :key="b.height">
                    <td class="p-3.5 font-bold text-brand-salmon">
                      <NuxtLink :to="`/block/${b.height}`" class="hover:underline">#{{ b.height }}</NuxtLink>
                    </td>
                    <td class="p-3.5">
                      <span class="px-2 py-0.5 rounded text-xs font-semibold" :class="b.isPos ? 'bg-purple-500/15 text-purple-600 dark:text-purple-300' : 'bg-brand-salmon/15 text-brand-salmon'">
                        {{ b.isPos ? 'PoS' : 'PoW' }}
                      </span>
                    </td>
                    <td class="p-3.5 font-semibold">{{ formatCoins(b.reward, 2) }}</td>
                    <td class="p-3.5 font-mono text-xs">{{ b.height >= 200 ? `${b.solvedSeats}/${b.height >= 5000 ? 15 : 11}` : '—' }}</td>
                    <td class="p-3.5 text-right text-xs text-slate-500">{{ formatDate(b.time) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="py-6 text-center text-slate-400 text-sm">{{ t('noCoordinatedBlocks') }}</div>
          </div>
        </div>

        <!-- TAB 4: Pure-SVG QR Code -->
        <div role="tabpanel" aria-labelledby="addr-tab-qr" :hidden="activeTab !== 'qr' ? true : undefined">
          <div class="glass-card rounded-xl p-8 flex flex-col items-center justify-center space-y-4 text-center">
            <div class="p-4 rounded-2xl bg-white shadow-lg border border-slate-200 inline-block">
              <svg
                :viewBox="`0 0 ${qrMatrix.length + 4} ${qrMatrix.length + 4}`"
                class="w-48 h-48"
                shape-rendering="crispEdges"
                role="img"
                :aria-label="`QR Code for ${addressResult.address}`"
              >
                <rect width="100%" height="100%" fill="#ffffff" />
                <g v-for="(row, rIdx) in qrMatrix" :key="rIdx">
                  <rect
                    v-for="(dark, cIdx) in row"
                    v-show="dark"
                    :key="cIdx"
                    :x="cIdx + 2"
                    :y="rIdx + 2"
                    width="1"
                    height="1"
                    fill="#0f172a"
                  />
                </g>
              </svg>
            </div>
            <p class="font-mono text-xs sm:text-sm text-slate-700 dark:text-slate-200 break-all max-w-md">
              {{ addressResult.address }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
