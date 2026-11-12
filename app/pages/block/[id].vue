<script setup>
import { computed } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { formatCoins, formatDate, formatBytes, shortenHash } from '~/utils/formatters'

const { t } = useI18n()
const route = useRoute()
const blockId = computed(() => route.params.id)
const toast = useToast()

const { data: result, error } = await useFetch(() => `/api/block/${blockId.value}`)

const committeeSeats = computed(() => {
  const b = result.value?.block
  if (!b || !Array.isArray(b.vAdamMiners) || b.vAdamMiners.length === 0) return []
  const sols = Array.isArray(b.vAdamSolutions) ? b.vAdamSolutions : []
  const algos = Array.isArray(b.adamSeatAlgos) ? b.adamSeatAlgos : []
  const count = b.vAdamMiners.length === sols.length + 1 ? sols.length : b.vAdamMiners.length

  const list = []
  for (let i = 0; i < count; i++) {
    const sol = sols[i] || ''
    list.push({
      seat: i + 1,
      address: b.vAdamMiners[i],
      algo: algos[i] || null,
      solved: Boolean(sol && sol.length > 0),
      solutionHex: sol
    })
  }
  return list
})

const solvedSeatsCount = computed(() => committeeSeats.value.filter((s) => s.solved).length)

function rewardRoleLabel(role) {
  switch (role) {
    case 'producer':
      return t('roleProducer')
    case 'masternode':
      return t('roleMasternode')
    case 'llmq':
      return t('roleLlmq')
    case 'committee':
      return t('roleCommittee')
    case 'treasury':
      return t('roleTreasury')
    case 'faucet':
      return t('roleFaucet')
    case 'protocol_burn':
      return `🔥 ${t('roleProtocolBurn')}`
    default:
      return t('roleMinerReward')
  }
}

function rewardRoleClass(role) {
  switch (role) {
    case 'producer':
      return 'bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/20'
    case 'masternode':
      return 'bg-brand-blue/10 text-brand-blue border-brand-blue/20'
    case 'llmq':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20'
    case 'committee':
      return 'bg-sky-500/10 text-sky-600 dark:text-sky-300 border-sky-500/20'
    case 'treasury':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20'
    case 'faucet':
      return 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border-cyan-500/20'
    case 'protocol_burn':
      return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20'
    default:
      return 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20'
  }
}

// Clipboard copy helper
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
  <div class="space-y-8">
    <!-- Breadcrumb & Navigation -->
    <div class="flex items-center justify-between">
      <NuxtLink to="/" class="flex items-center gap-2 text-sm text-brand-salmon hover:text-brand-salmon-hover transition-colors font-semibold">
        <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
        {{ t('backDashboard') }}
      </NuxtLink>
      <div v-if="result?.success" class="flex gap-2">
        <NuxtLink
          v-if="result.block.previousblockhash"
          :to="`/block/${result.block.previousblockhash}`"
          class="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-brand-salmon/10 hover:border-brand-salmon/25 text-slate-700 dark:text-gray-300 hover:text-brand-salmon transition-all"
        >
          <UIcon name="i-heroicons-chevron-left" class="w-3.5 h-3.5" />
          {{ t('prevBlock') }}
        </NuxtLink>
        <NuxtLink
          v-if="result.block.nextblockhash"
          :to="`/block/${result.block.nextblockhash}`"
          class="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-brand-salmon/10 hover:border-brand-salmon/25 text-slate-700 dark:text-gray-300 hover:text-brand-salmon transition-all"
        >
          {{ t('nextBlock') }}
          <UIcon name="i-heroicons-chevron-right" class="w-3.5 h-3.5" />
        </NuxtLink>
      </div>
    </div>

    <!-- Error State -->
    <div v-if="error || !result?.success" class="p-6 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-500/20 rounded-xl text-center space-y-4">
      <div class="inline-flex p-3 bg-red-100 dark:bg-red-500/10 rounded-lg text-red-600 dark:text-red-400">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8" />
      </div>
      <h3 class="text-xl font-bold text-slate-800 dark:text-white">{{ t('blockNotFound') }}</h3>
      <p class="text-red-600 dark:text-red-300/80 max-w-md mx-auto">
        {{ t('blockNotFoundDesc') }}
      </p>
    </div>

    <!-- Block Details Card -->
    <div v-else class="space-y-6">
      <div class="glass-card rounded-2xl p-6 md:p-8 space-y-6">
        <div class="border-b border-slate-200/60 dark:border-white/5 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 class="text-2xl font-extrabold text-slate-800 dark:text-white flex items-center gap-2">
              <span class="text-brand-salmon">#{{ result.block.height }}</span>. {{ t('blockDetails') }}
            </h2>
            <p class="text-xs font-mono text-slate-500 dark:text-slate-400 break-all mt-1">{{ result.block.hash }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2.5">
            <!-- Consensus Type Badge -->
            <span
              v-if="result.block.is_pos"
              class="inline-flex items-center gap-1 px-3 py-1 rounded bg-purple-500/10 border border-purple-500/25 text-purple-600 dark:text-purple-300 text-xs font-semibold shadow-sm shadow-purple-500/5"
            >
              <UIcon name="i-heroicons-shield-check" class="w-3.5 h-3.5" />
              {{ t('proofOfStake') }}
            </span>
            <span
              v-else
              class="inline-flex items-center gap-1 px-3 py-1 rounded bg-brand-salmon/10 border border-brand-salmon/25 text-brand-salmon text-xs font-semibold shadow-sm shadow-brand-salmon/5"
            >
              <UIcon name="i-heroicons-cpu-chip" class="w-3.5 h-3.5" />
              {{ t('proofOfWork') }}
            </span>

            <!-- LLMQ Verified Quick Badge on v12+ blocks -->
            <span
              v-if="result.block.adamQuorumSigners?.verified"
              class="inline-flex items-center gap-1 px-3 py-1 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-300 text-xs font-semibold"
            >
              <UIcon name="i-heroicons-check-badge" class="w-3.5 h-3.5" />
              LLMQ {{ result.block.adamQuorumSigners.signedCount }}/{{ result.block.adamQuorumSigners.quorumSize }} {{ t('llmqVerified') }}
            </span>

            <span class="px-3 py-1 rounded bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-300 text-xs font-medium">
              {{ result.block.confirmations }} {{ t('confirmations') }}
            </span>
          </div>
        </div>

        <!-- Metadata Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-sm">
          <div class="space-y-1">
            <p class="text-slate-500 dark:text-slate-300/80 font-medium">{{ t('timestamp') }}</p>
            <p class="text-slate-800 dark:text-gray-200 font-semibold">{{ formatDate(result.block.time) }}</p>
          </div>
          <div class="space-y-1">
            <p class="text-slate-500 dark:text-slate-300/80 font-medium">{{ t('blockType') }}</p>
            <p class="text-slate-800 dark:text-gray-200 font-semibold">
              {{ result.block.is_pos ? t('proofOfStake') : t('proofOfWork') }}
            </p>
          </div>
          <div class="space-y-1">
            <p class="text-slate-500 dark:text-slate-300/80 font-medium">{{ t('difficulty') }}</p>
            <p class="text-slate-800 dark:text-gray-200 font-semibold">{{ Number(result.block.difficulty || 0).toFixed(6) }}</p>
          </div>
          <div class="space-y-1">
            <p class="text-slate-500 dark:text-slate-300/80 font-medium">{{ t('size') }}</p>
            <p class="text-slate-800 dark:text-gray-200 font-semibold">{{ formatBytes(result.block.size) }}</p>
          </div>
          <div class="space-y-1">
            <p class="text-slate-500 dark:text-slate-300/80 font-medium">{{ t('txCount') }}</p>
            <p class="text-slate-800 dark:text-gray-200 font-semibold">{{ result.block.tx_count }}</p>
          </div>
          <div class="space-y-1">
            <p class="text-slate-500 dark:text-slate-300/80 font-medium">{{ t('version') }}</p>
            <p class="text-slate-800 dark:text-gray-200 font-semibold">v{{ result.block.version }}</p>
          </div>
          <div class="space-y-1 md:col-span-2">
            <p class="text-slate-500 dark:text-slate-300/80 font-medium">{{ t('merkleRoot') }}</p>
            <p class="text-slate-800 dark:text-gray-200 font-mono text-xs truncate" :title="result.block.merkleroot">{{ result.block.merkleroot }}</p>
          </div>
        </div>
      </div>

      <!-- ADAM Hybrid Consensus Details (All v11/v12 PoW and PoS blocks) -->
      <div
        v-if="result.block.version >= 11 || result.block.is_pos || (result.block.vAdamMiners && result.block.vAdamMiners.length > 0)"
        class="glass-card rounded-2xl p-6 md:p-8 space-y-6 border border-purple-500/10"
      >
        <div class="border-b border-slate-200/60 dark:border-white/5 pb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <UIcon name="i-heroicons-cpu-chip" class="w-5 h-5 text-purple-400" />
            {{ t('adamDetails') }}
          </h3>
          <div class="flex items-center gap-2">
            <span v-if="committeeSeats.length > 0" class="px-2.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-300 text-xs font-semibold">
              {{ solvedSeatsCount }} / {{ committeeSeats.length }} {{ t('seatSolved') }}
            </span>
            <span class="px-2.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-semibold">
              {{ result.block.height >= 2200 ? 'Model D (PoBLS + LLMQ)' : result.block.version >= 12 ? 'ADAM v2 (PoMBL)' : t('activeConsensus') }}
            </span>
          </div>
        </div>

        <!-- Coordinator & LLMQ Summary Row -->
        <div v-if="result.block.adamCoordinator || result.block.version >= 12" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <!-- Coordinator Card -->
          <div v-if="result.block.adamCoordinator" class="p-4 rounded-xl bg-slate-100/80 dark:bg-white/5 border border-slate-200 dark:border-white/5 space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {{ t('adamCoordinator') }}
              </span>
              <button
                @click="copyToClipboard(result.block.adamCoordinator, 'Coordinator Address')"
                class="text-xs text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
              >
                <UIcon name="i-heroicons-document-duplicate" class="w-3.5 h-3.5" />
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

          <!-- LLMQ BFT Quorum Card -->
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
            <div
              v-if="result.block.adamQuorumSigners?.signers?.length"
              class="flex flex-wrap gap-1.5 pt-1"
            >
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
          <!-- Elected ADAM Committee Seats (11 Validators + Solved Status + 3-Perm Algos) -->
          <div class="space-y-3">
            <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <UIcon name="i-heroicons-users" class="w-4 h-4 text-purple-400" />
              {{ t('adamMiners') }} ({{ committeeSeats.length }})
            </h4>
            <div v-if="committeeSeats.length > 0" class="space-y-2 max-h-[360px] overflow-y-auto pr-2 custom-scrollbar">
              <div
                v-for="seat in committeeSeats"
                :key="seat.seat"
                class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 hover:border-purple-500/30 transition-all group"
              >
                <div class="space-y-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="w-5 h-5 shrink-0 rounded-md bg-purple-500/15 text-purple-600 dark:text-purple-400 font-mono text-xs flex items-center justify-center font-bold">
                      {{ seat.seat }}
                    </span>
                    <NuxtLink :to="`/address/${seat.address}`" class="font-mono text-xs sm:text-sm text-purple-600 dark:text-purple-300 hover:text-purple-700 dark:hover:text-purple-200 transition-colors truncate">
                      {{ seat.address }}
                    </NuxtLink>
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
                  <button
                    @click="copyToClipboard(seat.address, 'Address')"
                    class="opacity-70 group-hover:opacity-100 p-1 text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white transition-opacity duration-200"
                    title="Copy Address"
                  >
                    <UIcon name="i-heroicons-document-duplicate" class="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            <div v-else class="p-4 bg-slate-100 dark:bg-white/5 rounded-lg text-center text-slate-500 dark:text-slate-400 text-sm">
              {{ t('noAdamMiners') }}
            </div>
          </div>

          <!-- Signature, LLMQ Signature & VRF Proofs -->
          <div class="space-y-4">
            <!-- VRF Proof -->
            <div v-if="result.block.vAdamVRFProof" class="space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{{ t('vrfProof') }}</span>
                <button @click="copyToClipboard(result.block.vAdamVRFProof, 'VRF Proof')" class="text-[10px] text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 flex items-center gap-1 font-semibold">
                  <UIcon name="i-heroicons-document-duplicate" class="w-3 h-3" />
                  Copy Hex
                </button>
              </div>
              <div class="p-3 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-lg font-mono text-xs text-slate-700 dark:text-slate-300 break-all select-all max-h-[80px] overflow-y-auto custom-scrollbar">
                {{ result.block.vAdamVRFProof }}
              </div>
            </div>

            <!-- Coordinator Signature -->
            <div v-if="result.block.vAdamCoordinatorSig" class="space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{{ t('adamCoordinatorSig') }}</span>
                <button @click="copyToClipboard(result.block.vAdamCoordinatorSig, 'Coordinator Signature')" class="text-[10px] text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 flex items-center gap-1 font-semibold">
                  <UIcon name="i-heroicons-document-duplicate" class="w-3 h-3" />
                  Copy Hex
                </button>
              </div>
              <div class="p-3 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-lg font-mono text-xs text-slate-700 dark:text-slate-300 break-all select-all max-h-[80px] overflow-y-auto custom-scrollbar">
                {{ result.block.vAdamCoordinatorSig }}
              </div>
            </div>

            <!-- LLMQ Quorum Signature Hex -->
            <div v-if="result.block.vQuorumSig" class="space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{{ t('quorumSigHex') }}</span>
                <button @click="copyToClipboard(result.block.vQuorumSig, 'LLMQ Signature')" class="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-semibold">
                  <UIcon name="i-heroicons-document-duplicate" class="w-3 h-3" />
                  Copy Hex
                </button>
              </div>
              <div class="p-3 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-lg font-mono text-xs text-slate-700 dark:text-slate-300 break-all select-all max-h-[80px] overflow-y-auto custom-scrollbar">
                {{ result.block.vQuorumSig }}
              </div>
            </div>
          </div>
        </div>

        <!-- Block Reward & Model D Distribution -->
        <div v-if="result.block.rewardOutputs?.length > 0" class="border-t border-slate-200/60 dark:border-white/5 pt-4 space-y-3">
          <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <UIcon name="i-heroicons-chart-pie" class="w-4 h-4 text-brand-salmon" />
            {{ t('rewardBreakdown') }}
          </h4>
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

        <!-- Accordion/Details for ADAM Solutions -->
        <div v-if="result.block.vAdamSolutions && result.block.vAdamSolutions.length > 0" class="border-t border-slate-200/60 dark:border-white/5 pt-4">
          <details class="group select-none">
            <summary class="flex items-center justify-between cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors py-2">
              <span class="flex items-center gap-1.5">
                <UIcon name="i-heroicons-key" class="w-4 h-4 text-purple-400" />
                {{ t('adamSolutions') }} ({{ solvedSeatsCount }} / {{ result.block.vAdamSolutions.length }})
              </span>
              <UIcon name="i-heroicons-chevron-down" class="w-4 h-4 transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <div class="mt-4 space-y-3 pl-2 select-text">
              <div
                v-for="(sol, idx) in result.block.vAdamSolutions"
                :key="idx"
                class="space-y-1"
              >
                <div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>SEAT #{{ idx + 1 }} — {{ sol ? t('seatSolved') : t('seatEmpty') }}</span>
                  <button v-if="sol" @click="copyToClipboard(sol, 'Solution')" class="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 flex items-center gap-1 font-semibold">
                    <UIcon name="i-heroicons-document-duplicate" class="w-3 h-3" />
                    Copy
                  </button>
                </div>
                <div class="p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-md font-mono text-xs text-slate-700 dark:text-slate-300 break-all max-h-[60px] overflow-y-auto custom-scrollbar">
                  {{ sol || '—' }}
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>

      <!-- ADAM Consensus Pending Activation Card (Only for blocks < 200) -->
      <div v-else-if="result.block.height < 200" class="glass-card rounded-2xl p-6 md:p-8 space-y-6 border border-brand-blue/10 relative overflow-hidden group">
        <div class="absolute -right-16 -bottom-16 w-64 h-64 bg-brand-blue/5 rounded-full blur-3xl group-hover:bg-brand-blue/10 transition-all duration-500"></div>

        <div class="border-b border-slate-200/60 dark:border-white/5 pb-4 flex items-center justify-between relative z-10">
          <h3 class="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <UIcon name="i-heroicons-cpu-chip" class="w-5 h-5 text-brand-blue" />
            {{ t('adamStatus') }}
          </h3>
          <span class="px-2.5 py-0.5 rounded-full bg-brand-blue/10 border border-brand-blue/20 text-brand-blue text-xs font-semibold flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-brand-blue animate-pulse"></span>
            {{ t('adamPending') }}
          </span>
        </div>

        <div class="space-y-4 max-w-xl relative z-10">
          <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {{ t('adamPendingDesc') }}
          </p>

          <!-- Progress Bar showing progress to block 200 -->
          <div class="space-y-2">
            <div class="flex justify-between text-xs font-medium">
              <span class="text-slate-500 dark:text-slate-400">{{ t('bootstrapProgress') }}</span>
              <span class="text-brand-blue font-semibold">{{ result.block.height }} / 200 Blocks</span>
            </div>
            <div class="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-full h-2 overflow-hidden">
              <div
                class="bg-gradient-to-r from-brand-blue to-purple-500 h-full rounded-full transition-all duration-500"
                :style="{ width: `${Math.min((result.block.height / 200) * 100, 100)}%` }"
              ></div>
            </div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400 italic">
              {{ 200 - result.block.height }} {{ t('blocksRemaining') }}
            </div>
          </div>
        </div>

        <!-- Bootstrap Block Reward Breakdown (Treasury / Faucet / Miner) -->
        <div v-if="result.block.rewardOutputs?.length > 0" class="border-t border-slate-200/60 dark:border-white/5 pt-4 space-y-3 relative z-10">
          <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <UIcon name="i-heroicons-chart-pie" class="w-4 h-4 text-brand-blue" />
            {{ t('rewardBreakdown') }}
          </h4>
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

      <!-- Transactions in Block -->
      <div class="space-y-4">
        <h3 class="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <UIcon name="i-heroicons-document-text" class="w-5 h-5 text-brand-blue" />
          {{ t('txsInBlock') }} ({{ result.transactions.length }})
        </h3>

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
                <tr v-for="tx in result.transactions" :key="tx.txid" class="hover:bg-slate-100/50 dark:hover:bg-white/5 transition-colors group">
                  <td class="p-4 font-mono text-brand-blue">
                    <div class="flex items-center gap-2 flex-wrap">
                      <NuxtLink :to="`/tx/${tx.txid}`" class="hover:text-brand-salmon transition-colors break-all">{{ tx.txid }}</NuxtLink>
                      <span v-if="tx.isCoinbase" class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-sans font-semibold">
                        COINBASE
                      </span>
                      <span v-else-if="tx.isCoinstake" class="px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-300 text-[10px] font-sans font-semibold">
                        {{ t('coinstake') }}
                      </span>
                      <span v-else-if="tx.txType === 'coin_lock'" class="px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-300 text-[10px] font-sans font-semibold">
                        🔒 {{ t('coinLockBadge') }}
                      </span>
                      <span v-else-if="tx.txType === 'pow_lock'" class="px-2 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-300 text-[10px] font-sans font-semibold">
                        ⚡ {{ t('powLockBadge') }}
                      </span>
                      <span v-else-if="tx.txType === 'zerocoin_pow'" class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 text-[10px] font-sans font-semibold">
                        🌱 {{ t('trackZeroCoin') }}
                      </span>
                      <span v-else-if="tx.txType === 'burn'" class="px-2 py-0.5 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[10px] font-sans font-semibold">
                        🔥 {{ t('burnBadge') }}
                      </span>
                    </div>
                  </td>
                  <td class="p-4 font-semibold text-slate-800 dark:text-gray-200">{{ formatCoins(tx.value) }}</td>
                  <td class="p-4 text-slate-700 dark:text-gray-300">{{ formatCoins(tx.fee) }}</td>
                  <td class="p-4 text-slate-600 dark:text-gray-300 text-right">{{ formatDate(tx.time) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
