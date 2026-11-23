<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'

const props = defineProps<{
  txType?: string | null
  isCoinbase?: boolean
  isCoinstake?: boolean
}>()

const { t } = useI18n()
</script>

<template>
  <span
    v-if="props.isCoinbase || props.txType === 'coinbase'"
    class="inline-flex items-center px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-[10px] font-sans font-semibold whitespace-nowrap"
  >
    COINBASE
  </span>
  <span
    v-else-if="props.isCoinstake || props.txType === 'coinstake'"
    class="inline-flex items-center px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/25 text-purple-700 dark:text-purple-300 text-[10px] font-sans font-semibold whitespace-nowrap"
  >
    {{ t('coinstake') }}
  </span>
  <span
    v-else-if="props.txType === 'coin_lock'"
    class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-[10px] font-sans font-semibold whitespace-nowrap"
  >
    🔒 {{ t('coinLockBadge') }}
  </span>
  <span
    v-else-if="props.txType === 'pow_lock'"
    class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/25 text-sky-700 dark:text-sky-300 text-[10px] font-sans font-semibold whitespace-nowrap"
  >
    ⚡ {{ t('powLockBadge') }}
  </span>
  <span
    v-else-if="props.txType === 'zerocoin_pow'"
    class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-[10px] font-sans font-semibold whitespace-nowrap"
  >
    🌱 {{ t('trackZeroCoin') }}
  </span>
  <span
    v-else-if="props.txType === 'protx'"
    class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/25 text-cyan-700 dark:text-cyan-300 text-[10px] font-sans font-semibold whitespace-nowrap"
  >
    🛡️ {{ t('proTxBadge') }}
  </span>
  <span
    v-else-if="props.txType === 'burn'"
    class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-500/10 border border-orange-500/25 text-orange-700 dark:text-orange-300 text-[10px] font-sans font-semibold whitespace-nowrap"
  >
    🔥 {{ t('burnBadge') }}
  </span>
  <span
    v-else-if="props.txType === 'contract'"
    class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/25 text-indigo-700 dark:text-indigo-300 text-[10px] font-sans font-semibold whitespace-nowrap"
  >
    📜 {{ t('taprootContract') }}
  </span>
  <span
    v-else
    class="inline-flex items-center px-2 py-0.5 rounded bg-slate-500/10 border border-slate-500/20 text-slate-600 dark:text-slate-300 text-[10px] font-sans font-semibold whitespace-nowrap"
  >
    TX
  </span>
</template>
