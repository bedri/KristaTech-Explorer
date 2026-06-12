<script setup>
import { computed, watch } from 'vue'
import { useI18n } from '~/composables/useI18n'

const { t } = useI18n()
const route = useRoute()
const blockId = computed(() => route.params.id)
const toast = useToast()

const { data: result, error, refresh } = await useFetch(() => `/api/block/${blockId.value}`)



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
          <div class="flex items-center gap-3">
            <!-- Consensus Type Badge -->
            <span 
              v-if="result.block.is_pos" 
              class="inline-flex items-center gap-1 px-3 py-1 rounded bg-purple-500/10 border border-purple-500/25 text-purple-600 dark:text-purple-300 text-xs font-semibold shadow-sm shadow-purple-500/5 animate-pulse"
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
            <p class="text-slate-800 dark:text-gray-200 font-semibold">{{ result.block.difficulty.toFixed(6) }}</p>
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

      <!-- ADAM Hybrid Consensus Details (Only for PoS Blocks / Blocks with ADAM info) -->
      <div v-if="result.block.is_pos || (result.block.vAdamMiners && result.block.vAdamMiners.length > 0)" class="glass-card rounded-2xl p-6 md:p-8 space-y-6 border border-purple-500/10">
        <div class="border-b border-slate-200/60 dark:border-white/5 pb-4 flex items-center justify-between">
          <h3 class="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <UIcon name="i-heroicons-cpu-chip" class="w-5 h-5 text-purple-400" />
            ADAM Hybrid Consensus Details
          </h3>
          <span class="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-semibold">
            Active Consensus
          </span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <!-- Elected ADAM Miners List -->
          <div class="space-y-3">
            <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <UIcon name="i-heroicons-users" class="w-4 h-4 text-purple-400" />
              {{ t('adamMiners') }} ({{ result.block.vAdamMiners?.length || 0 }})
            </h4>
            <div v-if="result.block.vAdamMiners && result.block.vAdamMiners.length > 0" class="space-y-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
              <div 
                v-for="(miner, idx) in result.block.vAdamMiners" 
                :key="miner" 
                class="flex items-center justify-between p-3 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 hover:border-purple-500/30 transition-all group"
              >
                <div class="flex items-center gap-2.5">
                  <span class="w-5 h-5 rounded-md bg-purple-500/15 text-purple-600 dark:text-purple-400 font-mono text-xs flex items-center justify-center font-bold">
                    {{ idx + 1 }}
                  </span>
                  <NuxtLink :to="`/address/${miner}`" class="font-mono text-sm text-purple-600 dark:text-purple-300 hover:text-purple-700 dark:hover:text-purple-200 transition-colors break-all">
                    {{ miner }}
                  </NuxtLink>
                </div>
                <!-- Copy Button -->
                <button 
                  @click="copyToClipboard(miner, 'Address')" 
                  class="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white transition-opacity duration-200"
                  title="Copy Address"
                >
                  <UIcon name="i-heroicons-document-duplicate" class="w-4 h-4" />
                </button>
              </div>
            </div>
            <div v-else class="p-4 bg-slate-100 dark:bg-white/5 rounded-lg text-center text-slate-500 dark:text-slate-400 text-sm">
              {{ t('noAdamMiners') }}
            </div>
          </div>

          <!-- Signature & VRF Proofs -->
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
          </div>
        </div>

        <!-- Accordion/Details for ADAM Solutions -->
        <div class="border-t border-slate-200/60 dark:border-white/5 pt-4">
          <details class="group select-none">
            <summary class="flex items-center justify-between cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors py-2">
              <span class="flex items-center gap-1.5">
                <UIcon name="i-heroicons-key" class="w-4 h-4 text-purple-400" />
                {{ t('adamSolutions') }} ({{ result.block.vAdamSolutions.length }})
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
                  <span>SOLUTION #{{ idx + 1 }}</span>
                  <button @click="copyToClipboard(sol, 'Solution')" class="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 flex items-center gap-1 font-semibold">
                    <UIcon name="i-heroicons-document-duplicate" class="w-3 h-3" />
                    Copy
                  </button>
                </div>
                <div class="p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-md font-mono text-xs text-slate-700 dark:text-slate-300 break-all max-h-[60px] overflow-y-auto custom-scrollbar">
                  {{ sol }}
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>

      <!-- ADAM Consensus Pending Activation Card (Only for blocks < 200) -->
      <div v-else-if="result.block.height < 200" class="glass-card rounded-2xl p-6 md:p-8 space-y-6 border border-brand-blue/10 relative overflow-hidden group">
        <!-- Radial gradient background for visual premium depth -->
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
                    <NuxtLink :to="`/tx/${tx.txid}`" class="hover:text-brand-salmon transition-colors">{{ tx.txid }}</NuxtLink>
                  </td>
                  <td class="p-4 font-semibold text-slate-800 dark:text-gray-200">{{ formatCoins(tx.value) }}</td>
                  <td class="p-4 text-slate-700 dark:text-gray-300">{{ formatCoins(tx.fee) }}</td>
                  <td class="p-4 text-slate-650 dark:text-gray-300 text-right">{{ formatDate(tx.time) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
