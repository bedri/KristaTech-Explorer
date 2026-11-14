<script setup>
import { ref, computed } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { calculateModelDSplits } from '~/utils/protocol'
import { formatBytes, formatCoins, formatHashrate, formatNumber } from '~/utils/formatters'

const { locale, t } = useI18n()
const { data: net, refresh } = await useFetch('/api/network')

const simHeight = ref(2200)
const simSplits = computed(() => calculateModelDSplits(Math.max(0, Number(simHeight.value) || 0)))

// Pure-SVG chart geometry for Block Intervals (Δt)
const intervalBars = computed(() => {
  const series = net.value?.blockSeries || []
  if (!series.length) return { bars: [], maxDt: 60, targetY: 90 }
  const maxDt = Math.max(60, ...series.map((b) => Math.min(180, b.deltaTime || 0)))
  const width = 600
  const height = 160
  const step = width / series.length
  const barW = Math.max(3, step - 2)
  const bars = series.map((b, idx) => {
    const clamped = Math.min(maxDt, b.deltaTime || 0)
    const h = Math.max(3, (clamped / maxDt) * (height - 20))
    return {
      heightNum: b.height,
      dt: b.deltaTime,
      isPos: b.isPos,
      x: idx * step + 1,
      y: height - h,
      w: barW,
      h
    }
  })
  const targetY = height - (30 / maxDt) * (height - 20)
  return { bars, maxDt, targetY }
})

// Pure-SVG chart geometry for Block Size & Tx Count
const volumeBars = computed(() => {
  const series = net.value?.blockSeries || []
  if (!series.length) return []
  const maxSize = Math.max(1024, ...series.map((b) => b.size || 0))
  const width = 600
  const height = 160
  const step = width / series.length
  const barW = Math.max(3, step - 2)
  return series.map((b, idx) => {
    const h = Math.max(3, ((b.size || 0) / maxSize) * (height - 20))
    return {
      heightNum: b.height,
      txCount: b.txCount,
      size: b.size,
      x: idx * step + 1,
      y: height - h,
      w: barW,
      h
    }
  })
})
</script>

<template>
  <div class="space-y-6">
    <AppBreadcrumbs :items="[{ label: t('navDashboard'), to: '/' }, { label: t('navNetwork'), to: '/network' }]" />

    <!-- Header -->
    <div class="glass-card rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div class="space-y-1">
        <h1 class="text-2xl font-extrabold text-slate-800 dark:text-white flex items-center gap-2">
          <UIcon name="i-heroicons-chart-bar-square" class="w-6 h-6 text-brand-blue" aria-hidden="true" />
          {{ t('networkTitle') }}
        </h1>
        <p class="text-sm text-slate-600 dark:text-slate-300">{{ t('networkDesc') }}</p>
      </div>
      <button
        type="button"
        @click="refresh()"
        class="self-start md:self-center h-9 px-3.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
      >
        <UIcon name="i-heroicons-arrow-path" class="w-4 h-4" aria-hidden="true" />
        <span>#{{ formatNumber(net?.height || 0, 0) }}</span>
      </button>
    </div>

    <!-- Top Telemetry Cards -->
    <div v-if="net?.success" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      <div class="glass-card rounded-xl p-5">
        <p class="text-xs text-slate-500">{{ t('avgBlockTime') }}</p>
        <p class="text-2xl font-extrabold text-slate-800 dark:text-white mt-1">{{ net.avgBlockTime }}s <span class="text-xs font-normal text-slate-400">/ 30s target</span></p>
      </div>
      <div class="glass-card rounded-xl p-5">
        <p class="text-xs text-slate-500">{{ t('networkHashrate') }}</p>
        <p class="text-2xl font-extrabold text-brand-salmon mt-1">{{ formatHashrate(net.hashrate) }}</p>
      </div>
      <div class="glass-card rounded-xl p-5">
        <p class="text-xs text-slate-500">{{ t('posVsPowRatio') }} (Last 20)</p>
        <p class="text-2xl font-extrabold text-slate-800 dark:text-white mt-1">
          <span class="text-brand-salmon">{{ net.powBlocksRecent }} PoW</span> •
          <span class="text-purple-500">{{ net.posBlocksRecent }} PoS</span>
        </p>
      </div>
      <div class="glass-card rounded-xl p-5">
        <p class="text-xs text-slate-500">{{ t('connectedPeers') }}</p>
        <p class="text-2xl font-extrabold text-brand-blue mt-1">{{ net.peers?.length || 0 }} {{ t('peers') }}</p>
      </div>
    </div>

    <!-- SVG Analytics Charts -->
    <div v-if="net?.success" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Chart 1: Block Intervals Δt -->
      <div class="glass-card rounded-2xl p-6 space-y-3 data-panel-contain">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-base font-bold text-slate-800 dark:text-white">{{ t('blockTimeChart') }}</h2>
          <div class="flex items-center gap-3 text-[11px]">
            <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-brand-salmon"></span> PoW</span>
            <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-purple-500"></span> PoS</span>
          </div>
        </div>
        <svg viewBox="0 0 600 165" class="w-full h-44 rounded-xl bg-slate-100/70 dark:bg-slate-900/70 p-2" role="img" aria-label="Recent block intervals chart">
          <line
            x1="0"
            :y1="intervalBars.targetY"
            x2="600"
            :y2="intervalBars.targetY"
            stroke="#10b981"
            stroke-dasharray="4 4"
            stroke-width="1.2"
          />
          <text x="6" :y="Math.max(12, intervalBars.targetY - 4)" fill="#10b981" font-size="10" font-family="monospace">
            30s target
          </text>
          <rect
            v-for="bar in intervalBars.bars"
            :key="bar.heightNum"
            :x="bar.x"
            :y="bar.y"
            :width="bar.w"
            :height="bar.h"
            rx="1.5"
            :fill="bar.isPos ? '#a855f7' : '#F5897C'"
          >
            <title>Block #{{ bar.heightNum }}: {{ bar.dt }}s ({{ bar.isPos ? 'PoS' : 'PoW' }})</title>
          </rect>
        </svg>
      </div>

      <!-- Chart 2: Block Size & Volume -->
      <div class="glass-card rounded-2xl p-6 space-y-3 data-panel-contain">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-base font-bold text-slate-800 dark:text-white">{{ t('blockTxSizeChart') }}</h2>
          <span class="text-[11px] font-mono text-slate-500">Last {{ volumeBars.length }} blocks</span>
        </div>
        <svg viewBox="0 0 600 165" class="w-full h-44 rounded-xl bg-slate-100/70 dark:bg-slate-900/70 p-2" role="img" aria-label="Recent block size trend chart">
          <rect
            v-for="bar in volumeBars"
            :key="bar.heightNum"
            :x="bar.x"
            :y="bar.y"
            :width="bar.w"
            :height="bar.h"
            rx="1.5"
            fill="#7695CD"
          >
            <title>Block #{{ bar.heightNum }}: {{ bar.txCount }} tx • {{ formatBytes(bar.size) }}</title>
          </rect>
        </svg>
      </div>
    </div>

    <!-- Protocol Upgrade Roadmap -->
    <div v-if="net?.roadmap" class="glass-card rounded-2xl p-6 space-y-4">
      <h2 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
        <UIcon name="i-heroicons-rocket-launch" class="w-5 h-5 text-brand-salmon" aria-hidden="true" />
        {{ t('consensusRoadmap') }}
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div
          v-for="m in net.roadmap"
          :key="m.id"
          class="p-4 rounded-xl border space-y-2"
          :class="m.activated ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-slate-100/70 dark:bg-white/5 border-slate-200 dark:border-white/10'"
        >
          <div class="flex items-center justify-between text-xs">
            <span class="font-mono font-bold" :class="m.activated ? 'text-emerald-600 dark:text-emerald-400' : 'text-brand-blue'">
              #{{ formatNumber(m.height, 0) }}
            </span>
            <span
              class="px-2 py-0.5 rounded text-[10px] font-bold"
              :class="m.activated ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'"
            >
              {{ m.activated ? 'ACTIVE' : `${m.progressPct}%` }}
            </span>
          </div>
          <h3 class="text-sm font-bold text-slate-800 dark:text-white">
            {{ locale === 'tr' ? m.titleTr : m.title }}
          </h3>
          <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {{ locale === 'tr' ? m.descTr : m.desc }}
          </p>
        </div>
      </div>
    </div>

    <!-- Interactive Model D Block Reward Breakdown Simulator -->
    <div class="glass-card rounded-2xl p-6 space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-bold text-slate-800 dark:text-white">{{ t('modelDSimulator') }}</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Inspect exact consensus block subsidy & Model D payouts at any Mainnet height.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <label for="sim-height-input" class="text-xs font-semibold text-slate-600 dark:text-slate-300">{{ t('height') }}:</label>
          <input
            id="sim-height-input"
            v-model.number="simHeight"
            type="number"
            min="2"
            max="10000000"
            step="100"
            class="w-32 h-9 px-3 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10 font-mono text-xs font-bold"
          />
          <button
            v-for="preset in [100, 500, 2200, 3000, 6000, 10000]"
            :key="preset"
            type="button"
            @click="simHeight = preset"
            class="hidden md:inline-flex px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-white/5 text-[11px] font-mono cursor-pointer"
          >
            #{{ preset }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
        <div class="p-3.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
          <div class="text-slate-500">Gross Subsidy</div>
          <div class="text-base font-extrabold text-slate-800 dark:text-white mt-0.5">{{ formatCoins(simSplits.subsidy, 4) }}</div>
        </div>
        <div class="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <div class="text-amber-700 dark:text-amber-300 font-semibold">Treasury (7%)</div>
          <div class="text-base font-extrabold text-slate-800 dark:text-white mt-0.5">{{ formatCoins(simSplits.treasury, 4) }}</div>
        </div>
        <div class="p-3.5 rounded-xl bg-brand-blue/10 border border-brand-blue/20">
          <div class="text-brand-blue font-semibold">Passive MN (35%)</div>
          <div class="text-base font-extrabold text-slate-800 dark:text-white mt-0.5">{{ formatCoins(simSplits.passiveMn, 4) }}</div>
        </div>
        <div class="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
          <div class="text-purple-700 dark:text-purple-300 font-semibold">Producer / Coord</div>
          <div class="text-base font-extrabold text-slate-800 dark:text-white mt-0.5">{{ formatCoins(simSplits.producer, 4) }}</div>
        </div>
        <div class="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div class="text-emerald-700 dark:text-emerald-300 font-semibold">LLMQ (5 × 2%)</div>
          <div class="text-base font-extrabold text-slate-800 dark:text-white mt-0.5">{{ formatCoins(simSplits.llmqTotal, 4) }}</div>
        </div>
        <div class="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/20">
          <div class="text-sky-700 dark:text-sky-300 font-semibold">11 Seat Pool (40%)</div>
          <div class="text-base font-extrabold text-slate-800 dark:text-white mt-0.5">{{ formatCoins(simSplits.committeeTotal, 4) }}</div>
          <div class="text-[10px] text-slate-500 mt-0.5">
            MN: {{ simSplits.mnSeatEach }} • CL: {{ simSplits.coinLockSeat }} • PoW: {{ simSplits.openPowSeatEach }}
          </div>
        </div>
      </div>
    </div>

    <!-- Connected Peers (Privacy-Masked) & Active Sporks -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div class="glass-card rounded-2xl p-6 space-y-4 data-panel-contain">
        <h2 id="peers-table-caption" class="text-base font-bold text-slate-800 dark:text-white">
          {{ t('connectedPeers') }}
        </h2>
        <div tabindex="0" role="region" aria-labelledby="peers-table-caption" class="table-wrapper">
          <table class="text-left text-xs sm:text-sm">
            <thead class="bg-slate-100 dark:bg-slate-900/95 text-slate-700 dark:text-gray-300 font-semibold uppercase text-xs">
              <tr>
                <th scope="col" class="p-3">Endpoint</th>
                <th scope="col" class="p-3">Client</th>
                <th scope="col" class="p-3">Proto</th>
                <th scope="col" class="p-3 text-right">Ping</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200/60 dark:divide-white/5">
              <tr v-for="p in net?.peers || []" :key="p.id">
                <td class="p-3 font-mono text-xs text-brand-blue">{{ p.addrMasked }}</td>
                <td class="p-3 font-mono text-xs">{{ p.subver }}</td>
                <td class="p-3 font-mono text-xs font-semibold">{{ p.version }}</td>
                <td class="p-3 text-right font-mono text-xs">{{ p.pingMs !== null ? `${p.pingMs} ms` : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="glass-card rounded-2xl p-6 space-y-4 data-panel-contain">
        <h2 id="sporks-table-caption" class="text-base font-bold text-slate-800 dark:text-white">
          {{ t('sporkGovernance') }}
        </h2>
        <div tabindex="0" role="region" aria-labelledby="sporks-table-caption" class="table-wrapper">
          <table class="text-left text-xs sm:text-sm">
            <thead class="bg-slate-100 dark:bg-slate-900/95 text-slate-700 dark:text-gray-300 font-semibold uppercase text-xs">
              <tr>
                <th scope="col" class="p-3">Spork</th>
                <th scope="col" class="p-3">Value</th>
                <th scope="col" class="p-3 text-right">State</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200/60 dark:divide-white/5">
              <tr v-for="s in net?.sporks || []" :key="s.name">
                <td class="p-3 font-mono text-xs font-semibold">{{ s.name }}</td>
                <td class="p-3 font-mono text-xs text-slate-500">{{ s.value }}</td>
                <td class="p-3 text-right">
                  <span
                    class="px-2 py-0.5 rounded text-[11px] font-bold"
                    :class="s.active ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-slate-500/10 text-slate-500'"
                  >
                    {{ s.active ? 'ACTIVE' : 'DEFAULT' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
