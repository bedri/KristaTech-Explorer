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
const blockId = computed(() => route.params.id)
const toast = useToast()

const { data: result, error } = await useFetch(() => `/api/block/${blockId.value}`)

const activeTab = ref('overview')
function onTabKeydown(e) {
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault()
    activeTab.value = activeTab.value === 'overview' ? 'raw' : 'overview'
    document.getElementById(`blk-tab-${activeTab.value}`)?.focus()
  }
}

const committeeSeats = computed(() => {
  const b = result.value?.block
  if (!b || !Array.isArray(b.vAdamMiners) || b.vAdamMiners.length === 0) return []
  const sols = Array.isArray(b.vAdamSolutions) ? b.vAdamSolutions : []
  const algos = Array.isArray(b.adamSeatAlgos) ? b.adamSeatAlgos : []
  const tracks = b.validatorTracks || {}
  const count = b.vAdamMiners.length === sols.length + 1 ? sols.length : b.vAdamMiners.length

  const list = []
  for (let i = 0; i < count; i++) {
    const sol = sols[i] || ''
    const addr = b.vAdamMiners[i]
    list.push({
      seat: i + 1,
      address: addr,
      track: tracks[addr] || null,
      algo: algos[i] || null,
      solved: Boolean(sol && sol.length > 0),
      solutionHex: sol
    })
  }
  return list
})

const solvedSeatsCount = computed(() => committeeSeats.value.filter((s) => s.solved).length)

function trackLabel(track) {
  switch (track) {
    case 'masternode':
      return t('trackMasternode')
    case 'coin_lock':
      return t('trackCoinLock')
    case 'pow_lock':
      return t('trackPowLock')
    case 'zerocoin_pow':
      return t('trackZeroCoin')
    case 'bootstrap':
      return t('trackBootstrap')
    default:
      return ''
  }
}

function rewardRoleLabel(role) {
  const isPreModelD = (result.value?.block?.height || 0) < 5000
  switch (role) {
    case 'staker':
      return isPreModelD
        ? t('roleStaker').replace('12%', '20%').replace('%12', '%20')
        : t('roleStaker')
    case 'coordinator':
      return isPreModelD
        ? t('roleCoordinator').replace('3%', '5%').replace('%3', '%5')
        : t('roleCoordinator')
    case 'producer':
      return isPreModelD
        ? t('roleProducer').replace('15%', '25%').replace('%15', '%25')
        : t('roleProducer')
    case 'masternode':
      return t('roleMasternode')
    case 'llmq':
      return t('roleLlmq')
    case 'committee':
      return isPreModelD
        ? t('roleCommittee').replace('40%', '75%').replace('%40', '%75')
        : t('roleCommittee')
    case 'treasury':
      return t('roleTreasury')
    case 'protocol_burn':
      return `🔥 ${t('roleProtocolBurn')}`
    default:
      return t('roleMinerReward')
  }
}

function rewardRoleClass(role) {
  switch (role) {
    case 'producer':
    case 'staker':
    case 'coordinator':
      return 'bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/20'
    case 'masternode':
      return 'bg-brand-blue/10 text-brand-blue border-brand-blue/20'
    case 'llmq':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20'
    case 'committee':
      return 'bg-sky-500/10 text-sky-600 dark:text-sky-300 border-sky-500/20'
    case 'treasury':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20'
    case 'protocol_burn':
      return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20'
    default:
      return 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20'
  }
}

function copyToClipboard(text, label = 'Content') {
  if (!navigator.clipboard) return
  navigator.clipboard.writeText(text)
  toast.add({
    title: t('copied'),
    description: `${label} copied to clipboard.`,
    color: 'teal',
    icon: 'i-heroicons-check-circle',
    timeout: 2000
  })
}
</script>

<template>
  <div class="space-y-6">
    <!-- Breadcrumbs & Prev/Next Block Navigation -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <AppBreadcrumbs
        :items="[
          { label: t('navDashboard'), to: '/' },
          { label: t('navBlocks'), to: '/blocks' },
          { label: result?.block ? `#${result.block.height}` : String(blockId), to: `/block/${blockId}` }
        ]"
      />

      <div v-if="result?.success" class="flex items-center gap-2">
        <NuxtLink
          v-if="result.block.height > 0"
          :to="`/block/${result.block.height - 1}`"
          class="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-200 font-semibold transition-colors"
        >
          <UIcon name="i-heroicons-chevron-left" class="w-3.5 h-3.5" aria-hidden="true" />
          #{{ result.block.height - 1 }}
        </NuxtLink>
        <NuxtLink
          v-if="result.block.nextblockhash"
          :to="`/block/${result.block.height + 1}`"
          class="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-200 font-semibold transition-colors"
        >
          #{{ result.block.height + 1 }}
          <UIcon name="i-heroicons-chevron-right" class="w-3.5 h-3.5" aria-hidden="true" />
        </NuxtLink>
      </div>
    </div>

    <!-- Error State -->
    <div v-if="error || !result?.success" class="p-6 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-500/20 rounded-xl text-center space-y-4">
      <div class="inline-flex p-3 bg-red-100 dark:bg-red-500/10 rounded-lg text-red-600 dark:text-red-400">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8" aria-hidden="true" />
      </div>
      <h1 class="text-xl font-bold text-slate-800 dark:text-white">{{ t('blockNotFound') }}</h1>
      <p class="text-red-600 dark:text-red-300/80 max-w-md mx-auto">
        {{ t('blockNotFoundDesc') }}
      </p>
    </div>

    <!-- Block View -->
    <div v-else class="space-y-6">
      <!-- Header Summary Card -->
      <div class="glass-card rounded-2xl p-6 md:p-8 space-y-5">
        <div class="border-b border-slate-200/60 dark:border-white/5 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-extrabold text-slate-800 dark:text-white flex items-center gap-2">
              <span class="text-brand-salmon">#{{ result.block.height }}</span>
              <span>{{ t('blockDetails') }}</span>
            </h1>
            <div class="flex items-center gap-2 mt-1">
              <p class="text-xs font-mono text-slate-500 dark:text-slate-400 break-all">{{ result.block.hash }}</p>
              <button
                type="button"
                @click="copyToClipboard(result.block.hash, 'Block Hash')"
                class="text-slate-400 hover:text-brand-blue shrink-0 cursor-pointer"
                :aria-label="t('copyAddress')"
              >
                <UIcon name="i-heroicons-document-duplicate" class="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span
              v-if="result.block.is_pos"
              class="inline-flex items-center gap-1 px-3 py-1 rounded bg-purple-500/10 border border-purple-500/25 text-purple-600 dark:text-purple-300 text-xs font-semibold"
            >
              <UIcon name="i-heroicons-shield-check" class="w-3.5 h-3.5" aria-hidden="true" />
              {{ t('proofOfStake') }}
            </span>
            <span
              v-else
              class="inline-flex items-center gap-1 px-3 py-1 rounded bg-brand-salmon/10 border border-brand-salmon/25 text-brand-salmon text-xs font-semibold"
            >
              <UIcon name="i-heroicons-cpu-chip" class="w-3.5 h-3.5" aria-hidden="true" />
              {{ t('proofOfWork') }}
            </span>

            <span
              v-if="result.block.adamQuorumSigners?.verified"
              class="inline-flex items-center gap-1 px-3 py-1 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-300 text-xs font-semibold"
            >
              LLMQ {{ result.block.adamQuorumSigners.signedCount }}/{{ result.block.adamQuorumSigners.quorumSize }} {{ t('llmqVerified') }}
            </span>

            <span class="px-3 py-1 rounded bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-300 text-xs font-medium">
              {{ result.block.confirmations }} {{ t('confirmations') }}
            </span>
          </div>
        </div>

        <!-- Tabs: Overview | Raw JSON -->
        <div role="tablist" aria-label="Block inspection tabs" class="explorer-tablist" @keydown="onTabKeydown">
          <button
            id="blk-tab-overview"
            role="tab"
            type="button"
            :aria-selected="activeTab === 'overview' ? 'true' : 'false'"
            :tabindex="activeTab === 'overview' ? 0 : -1"
            @click="activeTab = 'overview'"
          >
            {{ t('overviewTab') }}
          </button>
          <button
            id="blk-tab-raw"
            role="tab"
            type="button"
            :aria-selected="activeTab === 'raw' ? 'true' : 'false'"
            :tabindex="activeTab === 'raw' ? 0 : -1"
            @click="activeTab = 'raw'"
          >
            {{ t('rawJsonTab') }}
          </button>
        </div>

        <div role="tabpanel" aria-labelledby="blk-tab-overview" :hidden="activeTab !== 'overview' ? true : undefined">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 text-sm pt-2">
            <div class="space-y-0.5">
              <p class="text-slate-500 dark:text-slate-400 text-xs font-medium">{{ t('timestamp') }}</p>
              <p class="text-slate-800 dark:text-gray-200 font-semibold">{{ formatDate(result.block.time) }}</p>
              <p class="text-xs text-slate-500">
                {{ formatRelativeTime(result.block.time, locale) }}
                <span v-if="result.block.deltaTime !== null">• Δt {{ result.block.deltaTime }}s</span>
              </p>
            </div>
            <div class="space-y-0.5">
              <p class="text-slate-500 dark:text-slate-400 text-xs font-medium">{{ t('reward') }} / {{ t('totalFeesLabel') }}</p>
              <p class="text-slate-800 dark:text-gray-200 font-bold">{{ formatCoins(result.block.reward, 4) }}</p>
              <p class="text-xs text-slate-500">{{ t('fee') }}: {{ formatCoins(result.block.totalFees, 6) }}</p>
            </div>
            <div class="space-y-0.5">
              <p class="text-slate-500 dark:text-slate-400 text-xs font-medium">{{ t('difficulty') }}</p>
              <p class="text-slate-800 dark:text-gray-200 font-semibold font-mono">{{ Number(result.block.difficulty || 0).toFixed(6) }}</p>
              <p class="text-xs text-slate-500 font-mono">{{ t('bitsLabel') }}: {{ result.block.bits || '—' }}</p>
            </div>
            <div class="space-y-0.5">
              <p class="text-slate-500 dark:text-slate-400 text-xs font-medium">{{ t('size') }} & {{ t('txCount') }}</p>
              <p class="text-slate-800 dark:text-gray-200 font-semibold">{{ formatBytes(result.block.size) }} • {{ result.block.tx_count }} tx</p>
              <p class="text-xs text-slate-500 font-mono">v{{ result.block.version }} • {{ t('nonceLabel') }}: {{ result.block.nonce }}</p>
            </div>
            <div class="space-y-0.5 sm:col-span-2">
              <p class="text-slate-500 dark:text-slate-400 text-xs font-medium">{{ t('merkleRoot') }}</p>
              <p class="text-slate-800 dark:text-gray-200 font-mono text-xs break-all">{{ result.block.merkleroot }}</p>
            </div>
            <div class="space-y-0.5 sm:col-span-2">
              <p class="text-slate-500 dark:text-slate-400 text-xs font-medium">{{ t('chainworkLabel') }}</p>
              <p class="text-slate-800 dark:text-gray-200 font-mono text-xs break-all">{{ result.block.chainwork || '—' }}</p>
            </div>
          </div>
        </div>

        <div role="tabpanel" aria-labelledby="blk-tab-raw" :hidden="activeTab !== 'raw' ? true : undefined">
          <div class="pt-2">
            <pre class="p-4 rounded-xl bg-slate-950 text-emerald-300 font-mono text-xs overflow-x-auto max-h-[480px]">{{ JSON.stringify(result.rawBlock, null, 2) }}</pre>
          </div>
        </div>
      </div>

      <!-- ADAM Hybrid Consensus Details -->
      <div
        v-if="result.block.version >= 11 || result.block.is_pos || (result.block.vAdamMiners && result.block.vAdamMiners.length > 0)"
        class="glass-card rounded-2xl p-6 md:p-8 space-y-6 border border-purple-500/15"
      >
        <div class="border-b border-slate-200/60 dark:border-white/5 pb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <UIcon name="i-heroicons-cpu-chip" class="w-5 h-5 text-purple-400" aria-hidden="true" />
            {{ t('adamDetails') }}
          </h2>
          <div class="flex items-center gap-2">
            <span v-if="committeeSeats.length > 0" class="px-2.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-300 text-xs font-semibold">
              {{ solvedSeatsCount }} / {{ committeeSeats.length }} {{ t('seatSolved') }}
            </span>
            <span class="px-2.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-semibold">
              {{ result.block.height >= 5000 ? 'Model D / ADAM v2 (PoBLS + LLMQ)' : result.block.version >= 12 ? 'PoMBL (v12 17-Algo 3-Perm)' : t('activeConsensus') }}
            </span>
          </div>
        </div>

        <!-- Coordinator & LLMQ Summary Row -->
        <div v-if="result.block.adamCoordinator || result.block.version >= 12" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div v-if="result.block.adamCoordinator" class="p-4 rounded-xl bg-slate-100/80 dark:bg-white/5 border border-slate-200 dark:border-white/5 space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {{ t('adamCoordinator') }}
              </span>
              <button
                type="button"
                @click="copyToClipboard(result.block.adamCoordinator, 'Coordinator Address')"
                class="text-xs text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <UIcon name="i-heroicons-document-duplicate" class="w-3.5 h-3.5" aria-hidden="true" />
                {{ t('copyAddress') }}
              </button>
            </div>
            <NuxtLink
              :to="`/address/${result.block.adamCoordinator}`"
              class="font-mono text-sm font-semibold text-purple-600 dark:text-purple-300 hover:underline break-all block"
            >
              {{ result.block.adamCoordinator }}
            </NuxtLink>
          </div>

          <div v-if="result.block.version >= 12" class="p-4 rounded-xl bg-slate-100/80 dark:bg-white/5 border border-slate-200 dark:border-white/5 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {{ t('llmqQuorum') }}
              </span>
              <span
                v-if="result.block.adamQuorumSigners?.verified"
                class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 text-xs font-semibold"
              >
                ✓ {{ result.block.adamQuorumSigners.signedCount }} / {{ result.block.adamQuorumSigners.quorumSize }} {{ t('llmqVerified') }}
              </span>
              <span v-else class="px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-300 text-xs font-semibold">
                {{ t('llmqPending') }}
              </span>
            </div>
            <div v-if="result.block.adamQuorumSigners?.signers?.length" class="flex flex-wrap gap-1.5 pt-1">
              <NuxtLink
                v-for="(signer, sIdx) in result.block.adamQuorumSigners.signers"
                :key="sIdx"
                :to="`/address/${signer}`"
                class="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 font-mono text-[11px] text-emerald-600 dark:text-emerald-300 hover:underline"
              >
                {{ shortenHash(signer, 6) }}
              </NuxtLink>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <!-- Elected ADAM Committee Seats -->
          <div class="space-y-3">
            <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <UIcon name="i-heroicons-users" class="w-4 h-4 text-purple-400" aria-hidden="true" />
              {{ t('adamMiners') }} ({{ committeeSeats.length }})
            </h3>
            <div v-if="committeeSeats.length > 0" class="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              <div
                v-for="seat in committeeSeats"
                :key="seat.seat"
                class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5"
              >
                <div class="space-y-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="w-5 h-5 shrink-0 rounded-md bg-purple-500/15 text-purple-600 dark:text-purple-400 font-mono text-xs flex items-center justify-center font-bold">
                      {{ seat.seat }}
                    </span>
                    <NuxtLink :to="`/address/${seat.address}`" class="font-mono text-xs sm:text-sm text-purple-600 dark:text-purple-300 hover:underline truncate">
                      {{ seat.address }}
                    </NuxtLink>
                    <span v-if="seat.track" class="px-1.5 py-0.5 rounded bg-brand-blue/15 text-brand-blue text-[10px] font-semibold">
                      {{ trackLabel(seat.track) }}
                    </span>
                  </div>
                  <div v-if="seat.algo" class="pl-7">
                    <span class="inline-block font-mono text-[11px] px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-900 text-slate-600 dark:text-slate-300">
                      {{ seat.algo }}
                    </span>
                  </div>
                </div>

                <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <span
                    v-if="seat.solved"
                    class="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/25 text-emerald-600 dark:text-emerald-300 text-[11px] font-semibold"
                  >
                    ✓ {{ t('seatSolved') }}
                  </span>
                  <span
                    v-else
                    class="px-2 py-0.5 rounded bg-slate-500/10 border border-slate-500/20 text-slate-500 dark:text-slate-400 text-[11px] font-medium"
                  >
                    ○ {{ t('seatEmpty') }}
                  </span>
                </div>
              </div>
            </div>
            <div v-else class="p-4 bg-slate-100 dark:bg-white/5 rounded-lg text-center text-slate-500 dark:text-slate-400 text-sm">
              {{ t('noAdamMiners') }}
            </div>
          </div>

          <!-- Cryptographic Proofs -->
          <div class="space-y-4">
            <div v-if="result.block.vAdamVRFProof" class="space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{{ t('vrfProof') }}</span>
                <button type="button" @click="copyToClipboard(result.block.vAdamVRFProof, 'VRF Proof')" class="text-[10px] text-purple-600 dark:text-purple-400 hover:underline font-semibold cursor-pointer">
                  Copy Hex
                </button>
              </div>
              <div class="p-3 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-lg font-mono text-xs text-slate-700 dark:text-slate-300 break-all max-h-[80px] overflow-y-auto">
                {{ result.block.vAdamVRFProof }}
              </div>
            </div>

            <div v-if="result.block.vAdamCoordinatorSig" class="space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{{ t('adamCoordinatorSig') }}</span>
                <button type="button" @click="copyToClipboard(result.block.vAdamCoordinatorSig, 'Coordinator Signature')" class="text-[10px] text-purple-600 dark:text-purple-400 hover:underline font-semibold cursor-pointer">
                  Copy Hex
                </button>
              </div>
              <div class="p-3 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-lg font-mono text-xs text-slate-700 dark:text-slate-300 break-all max-h-[80px] overflow-y-auto">
                {{ result.block.vAdamCoordinatorSig }}
              </div>
            </div>

            <div v-if="result.block.vQuorumSig" class="space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{{ t('quorumSigHex') }}</span>
                <button type="button" @click="copyToClipboard(result.block.vQuorumSig, 'LLMQ Signature')" class="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline font-semibold cursor-pointer">
                  Copy Hex
                </button>
              </div>
              <div class="p-3 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-lg font-mono text-xs text-slate-700 dark:text-slate-300 break-all max-h-[80px] overflow-y-auto">
                {{ result.block.vQuorumSig }}
              </div>
            </div>
          </div>
        </div>

        <!-- Reward Distribution -->
        <div v-if="result.block.rewardOutputs?.length > 0" class="border-t border-slate-200/60 dark:border-white/5 pt-4 space-y-3">
          <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <UIcon name="i-heroicons-chart-pie" class="w-4 h-4 text-brand-salmon" aria-hidden="true" />
            {{ t('rewardBreakdown') }}
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div
              v-for="ro in result.block.rewardOutputs"
              :key="ro.n"
              class="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-100/70 dark:bg-white/5 border border-slate-200/70 dark:border-white/5 text-xs"
            >
              <div class="min-w-0 space-y-1">
                <span class="inline-block px-2 py-0.5 rounded border font-semibold text-[11px]" :class="rewardRoleClass(ro.role)">
                  {{ rewardRoleLabel(ro.role) }}
                </span>
                <NuxtLink :to="`/address/${ro.address}`" class="block font-mono text-slate-700 dark:text-slate-300 hover:text-brand-salmon truncate">
                  {{ ro.address }}
                </NuxtLink>
              </div>
              <span class="font-bold text-slate-800 dark:text-white shrink-0">
                {{ formatCoins(ro.amount) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Bootstrap Pending Card (< 200) -->
      <div v-else-if="result.block.height < 200" class="glass-card rounded-2xl p-6 md:p-8 space-y-5 border border-brand-blue/15">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <UIcon name="i-heroicons-cpu-chip" class="w-5 h-5 text-brand-blue" aria-hidden="true" />
            {{ t('adamStatus') }}
          </h2>
          <span class="px-2.5 py-0.5 rounded-full bg-brand-blue/10 border border-brand-blue/20 text-brand-blue text-xs font-semibold">
            {{ t('adamPending') }} ({{ result.block.height }} / 200)
          </span>
        </div>
        <p class="text-sm text-slate-600 dark:text-slate-300">{{ t('adamPendingDesc') }}</p>

        <div v-if="result.block.rewardOutputs?.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2">
          <div
            v-for="ro in result.block.rewardOutputs"
            :key="ro.n"
            class="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-100/70 dark:bg-white/5 border border-slate-200/70 dark:border-white/5 text-xs"
          >
            <div class="min-w-0 space-y-1">
              <span class="inline-block px-2 py-0.5 rounded border font-semibold text-[11px]" :class="rewardRoleClass(ro.role)">
                {{ rewardRoleLabel(ro.role) }}
              </span>
              <NuxtLink :to="`/address/${ro.address}`" class="block font-mono text-slate-700 dark:text-slate-300 hover:text-brand-salmon truncate">
                {{ ro.address }}
              </NuxtLink>
            </div>
            <span class="font-bold text-slate-800 dark:text-white shrink-0">
              {{ formatCoins(ro.amount) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Transactions in Block -->
      <div class="space-y-4 data-panel-contain">
        <h2 id="blk-txs-caption" class="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <UIcon name="i-heroicons-document-text" class="w-5 h-5 text-brand-blue" aria-hidden="true" />
          {{ t('txsInBlock') }} ({{ result.transactions.length }})
        </h2>

        <div class="glass-card rounded-xl overflow-hidden">
          <div tabindex="0" role="region" aria-labelledby="blk-txs-caption" class="table-wrapper">
            <table class="text-left text-sm">
              <thead class="bg-slate-100 dark:bg-slate-900/95 text-slate-700 dark:text-gray-300 font-semibold uppercase text-xs">
                <tr>
                  <th scope="col" class="p-3.5">{{ t('txid') }}</th>
                  <th scope="col" class="p-3.5">{{ t('type') }}</th>
                  <th scope="col" class="p-3.5">{{ t('amount') }}</th>
                  <th scope="col" class="p-3.5">{{ t('fee') }}</th>
                  <th scope="col" class="p-3.5 text-right">{{ t('time') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200/60 dark:divide-white/5">
                <tr v-for="tx in result.transactions" :key="tx.txid" class="hover:bg-slate-100/50 dark:hover:bg-white/5">
                  <td class="p-3.5 font-mono text-brand-blue">
                    <NuxtLink :to="`/tx/${tx.txid}`" class="hover:text-brand-salmon break-all">{{ tx.txid }}</NuxtLink>
                  </td>
                  <td class="p-3.5 whitespace-nowrap">
                    <TxTypeBadge :tx-type="tx.txType" :is-coinbase="tx.isCoinbase" :is-coinstake="tx.isCoinstake" />
                  </td>
                  <td class="p-3.5 font-semibold text-slate-800 dark:text-gray-200 whitespace-nowrap">{{ formatCoins(tx.value) }}</td>
                  <td class="p-3.5 text-slate-700 dark:text-gray-300 whitespace-nowrap">{{ formatCoins(tx.fee) }}</td>
                  <td class="p-3.5 text-slate-600 dark:text-gray-300 text-right whitespace-nowrap">{{ formatDate(tx.time) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
