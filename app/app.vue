<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { detectSearchQueryType } from '~/utils/protocol'
import { formatNumber, formatHashrate } from '~/utils/formatters'

const { locale, setLocale, t } = useI18n()
const route = useRoute()

useHead({
  title: computed(() => `KristaTech (KRISTA) — ${t('explorer')}`)
})

const { data: liveStatus, refresh: refreshLiveStatus } = await useFetch('/api/status', {
  key: 'global-explorer-status'
})

const colorMode = useColorMode()
function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

const navItems = computed(() => [
  { to: '/', label: t('navDashboard'), match: (p) => p === '/' },
  { to: '/blocks', label: t('navBlocks'), match: (p) => p === '/blocks' || p.startsWith('/block/') },
  {
    to: '/transactions',
    label: t('navTransactions'),
    match: (p) => p === '/transactions' || p.startsWith('/tx/')
  },
  { to: '/validators', label: t('navValidators'), match: (p) => p.startsWith('/validators') },
  {
    to: '/mempool',
    label: t('navMempool'),
    badge: liveStatus.value?.mempool?.size || 0,
    match: (p) => p.startsWith('/mempool')
  },
  {
    to: '/richlist',
    label: t('navRichList'),
    match: (p) => p.startsWith('/richlist') || p.startsWith('/address/')
  },
  { to: '/network', label: t('navNetwork'), match: (p) => p.startsWith('/network') },
  { to: '/api-docs', label: t('navApi'), match: (p) => p.startsWith('/api-docs') }
])

const isMobileMenuOpen = ref(false)
watch(
  () => route.fullPath,
  () => {
    isMobileMenuOpen.value = false
  }
)

const searchQuery = ref('')
const isSearching = ref(false)
const searchError = ref('')
const searchInputEl = ref(null)

const detectedType = computed(() => detectSearchQueryType(searchQuery.value))
const detectedTypeLabel = computed(() => {
  switch (detectedType.value) {
    case 'height':
      return t('searchTypeHeight')
    case 'hash':
      return t('searchTypeHash')
    case 'address':
      return t('searchTypeAddress')
    case 'taproot':
      return t('searchTypeTaproot')
    case 'pubkey':
      return t('searchTypePubkey')
    default:
      return ''
  }
})

async function handleSearch() {
  const query = searchQuery.value.trim()
  if (!query) return

  isSearching.value = true
  searchError.value = ''

  try {
    const data = await $fetch(`/api/search?q=${encodeURIComponent(query)}`)
    if (data.success && data.target) {
      searchQuery.value = ''
      navigateTo(data.target)
    } else {
      searchError.value = t('searchNotFound')
      setTimeout(() => {
        searchError.value = ''
      }, 4000)
    }
  } catch (_) {
    searchError.value = t('searchError')
    setTimeout(() => {
      searchError.value = ''
    }, 4000)
  } finally {
    isSearching.value = false
  }
}

const languages = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'pl', name: 'Polski', flag: '🇵🇱' },
  { code: 'sv', name: 'Svenska', flag: '🇸🇪' },
  { code: 'no', name: 'Norsk', flag: '🇳🇴' },
  { code: 'da', name: 'Dansk', flag: '🇩🇰' }
]

const currentLanguage = computed(() => {
  return languages.find((l) => l.code === locale.value) || languages[0]
})

const isLangOpen = ref(false)
const dropdownRef = ref(null)

function selectLang(code) {
  setLocale(code)
  isLangOpen.value = false
}

function closeDropdown(e) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target)) {
    isLangOpen.value = false
  }
}

function handleGlobalKeydown(e) {
  if (e.key === 'Escape') {
    isLangOpen.value = false
    isMobileMenuOpen.value = false
    return
  }
  const activeTag = document.activeElement?.tagName?.toLowerCase()
  const isTyping = activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.isContentEditable
  if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (!isTyping && e.key === '/')) {
    e.preventDefault()
    searchInputEl.value?.focus()
  }
}

let tickerInterval = null
onMounted(() => {
  window.addEventListener('click', closeDropdown)
  window.addEventListener('keydown', handleGlobalKeydown)

  const localeCookie = useCookie('explorer_locale')
  if (!localeCookie.value) {
    const browserLang = navigator.language.slice(0, 2)
    if (languages.some((l) => l.code === browserLang)) {
      setLocale(browserLang)
    }
  }

  tickerInterval = setInterval(() => {
    refreshLiveStatus()
  }, 10000)
})

onUnmounted(() => {
  window.removeEventListener('click', closeDropdown)
  window.removeEventListener('keydown', handleGlobalKeydown)
  if (tickerInterval) clearInterval(tickerInterval)
})
</script>

<template>
  <UApp>
    <div class="min-h-screen flex flex-col text-slate-800 dark:text-gray-200">
      <!-- Keyboard Skip Link -->
      <a
        href="#main-content"
        class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-brand-blue focus:text-white focus:font-semibold focus:shadow-xl"
      >
        {{ t('skipToContent') }}
      </a>

      <!-- Sticky Glassmorphic Header -->
      <header class="sticky top-0 z-50 bg-white/85 dark:bg-slate-950/85 backdrop-blur-md border-b border-slate-200/70 dark:border-white/10 transition-colors">
        <UContainer class="max-w-none w-full px-4 sm:px-6 lg:px-8 xl:px-12 py-3 space-y-3">
          <!-- Top Row: Brand + Search + Theme/Language + Mobile Menu Trigger -->
          <div class="flex flex-wrap items-center justify-between gap-3">
            <!-- Brand Logo -->
            <NuxtLink to="/" class="flex items-center gap-2.5 group shrink-0">
              <div class="w-11 h-11 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-center shadow-md group-hover:scale-105 transition-transform duration-200 p-2 bg-gradient-to-b from-slate-100 to-white dark:from-slate-900 dark:to-slate-950">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 57 45" class="w-full h-full" aria-hidden="true">
                  <g transform="translate(-180.671875, -149.75)">
                    <path fill="#F5897C" fill-rule="nonzero" d="M 225.105469 194.265625 L 209.386719 172.542969 L 209.386719 194.265625 L 199.753906 194.265625 L 199.753906 170.3125 L 209.386719 170.3125 L 223.976562 149.75 L 235.203125 149.75 L 220.058594 171.078125 L 236.859375 194.265625 Z" />
                    <path fill="#7695CD" fill-rule="nonzero" d="M 190.210938 160.769531 L 199.753906 160.769531 L 199.753906 170.3125 L 190.210938 170.3125 Z" />
                    <path fill="#7695CD" fill-rule="nonzero" d="M 199.753906 151.226562 L 209.292969 151.226562 L 209.292969 160.769531 L 199.753906 160.769531 Z" />
                    <path fill="#7695CD" fill-rule="nonzero" d="M 180.671875 151.226562 L 190.210938 151.226562 L 190.210938 160.769531 L 180.671875 160.769531 Z" />
                  </g>
                </svg>
              </div>
              <div>
                <div class="font-extrabold text-lg sm:text-xl tracking-tight text-slate-800 dark:text-white group-hover:text-brand-blue transition-colors flex items-center gap-2">
                  <span>KristaTech</span>
                  <span class="text-[11px] font-bold px-2 py-0.5 rounded-md bg-brand-salmon/15 text-brand-salmon border border-brand-salmon/25">
                    {{ t('explorer') }}
                  </span>
                </div>
                <p class="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                  KRISTA Mainnet • Cooperative Hybrid PoW / PoS
                </p>
              </div>
            </NuxtLink>

            <!-- Smart Search + Controls -->
            <div class="flex items-center gap-2.5 w-full lg:w-auto order-3 lg:order-2 flex-grow lg:max-w-xl">
              <div class="relative flex-grow">
                <form @submit.prevent="handleSearch" class="flex items-center gap-2">
                  <div class="relative flex-grow">
                    <UIcon
                      name="i-heroicons-magnifying-glass"
                      aria-hidden="true"
                      class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    />
                    <input
                      ref="searchInputEl"
                      v-model="searchQuery"
                      type="search"
                      :placeholder="t('searchPlaceholder')"
                      :aria-label="t('searchPlaceholder')"
                      class="w-full h-10 pl-9 pr-24 rounded-lg bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200 dark:border-white/10 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/50 focus:border-brand-blue transition-all"
                    />
                    <span
                      v-if="detectedTypeLabel"
                      class="absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded text-[10px] font-semibold bg-brand-blue/15 text-brand-blue dark:text-cobalt-300 border border-brand-blue/25 pointer-events-none"
                    >
                      {{ detectedTypeLabel }}
                    </span>
                    <kbd
                      v-else
                      aria-hidden="true"
                      class="hidden sm:inline-flex items-center gap-0.5 absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/80 dark:bg-white/5 text-slate-400 border border-slate-200 dark:border-white/10 pointer-events-none"
                    >
                      /
                    </kbd>
                  </div>
                  <button
                    type="submit"
                    :disabled="isSearching"
                    class="h-10 px-4 rounded-lg font-semibold text-sm text-white bg-brand-blue hover:bg-brand-blue-hover disabled:opacity-50 shadow-sm shadow-brand-blue/20 transition-colors shrink-0 cursor-pointer"
                  >
                    {{ isSearching ? '...' : t('searchBtn') }}
                  </button>
                </form>

                <Transition name="fade">
                  <div
                    v-if="searchError"
                    role="alert"
                    class="absolute left-0 right-0 mt-1.5 p-2 bg-red-100 dark:bg-red-950/90 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 text-xs font-medium rounded-lg backdrop-blur-sm z-50"
                  >
                    {{ searchError }}
                  </div>
                </Transition>
              </div>
            </div>

            <!-- Utility Controls (Theme + Language + Mobile Nav Button) -->
            <div class="flex items-center gap-2 order-2 lg:order-3">
              <!-- Theme Toggle -->
              <button
                type="button"
                @click="toggleColorMode"
                class="flex items-center justify-center w-10 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-gray-200 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
                aria-label="Toggle color theme"
              >
                <UIcon :name="colorMode.value === 'dark' ? 'i-heroicons-sun' : 'i-heroicons-moon'" class="w-5 h-5" aria-hidden="true" />
              </button>

              <!-- Language Selector -->
              <div class="relative" ref="dropdownRef">
                <button
                  type="button"
                  @click.stop="isLangOpen = !isLangOpen"
                  :aria-expanded="isLangOpen ? 'true' : 'false'"
                  aria-controls="explorer-lang-menu"
                  class="flex items-center gap-1.5 px-2.5 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-200 text-xs sm:text-sm font-medium transition-all cursor-pointer"
                >
                  <span class="text-base leading-none" aria-hidden="true">{{ currentLanguage.flag }}</span>
                  <span class="hidden sm:inline">{{ currentLanguage.code.toUpperCase() }}</span>
                  <UIcon name="i-heroicons-chevron-down" aria-hidden="true" class="w-3.5 h-3.5 text-slate-400 transition-transform" :class="{ 'rotate-180': isLangOpen }" />
                </button>

                <Transition name="slide-up">
                  <div
                    v-if="isLangOpen"
                    id="explorer-lang-menu"
                    class="absolute right-0 mt-2 w-48 rounded-xl bg-white dark:bg-slate-900/95 border border-slate-200 dark:border-white/10 p-1.5 shadow-2xl backdrop-blur-md z-50 max-h-80 overflow-y-auto"
                  >
                    <button
                      v-for="lang in languages"
                      :key="lang.code"
                      type="button"
                      @click="selectLang(lang.code)"
                      class="flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                      :class="locale === lang.code ? 'bg-slate-100 dark:bg-white/5 text-brand-blue font-semibold' : 'text-slate-600 dark:text-gray-300'"
                    >
                      <span class="text-base leading-none" aria-hidden="true">{{ lang.flag }}</span>
                      <span>{{ lang.name }}</span>
                    </button>
                  </div>
                </Transition>
              </div>

              <!-- Mobile Primary Menu Toggle -->
              <button
                type="button"
                @click="isMobileMenuOpen = !isMobileMenuOpen"
                :aria-expanded="isMobileMenuOpen ? 'true' : 'false'"
                aria-controls="explorer-primary-menu"
                class="xl:hidden inline-flex items-center gap-1.5 px-3 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-200 text-xs font-semibold cursor-pointer"
              >
                <UIcon :name="isMobileMenuOpen ? 'i-heroicons-x-mark' : 'i-heroicons-bars-3'" aria-hidden="true" class="w-5 h-5" />
                <span>{{ t('navMenu') }}</span>
              </button>
            </div>
          </div>

          <!-- Single Semantic Primary Navigation Landmark -->
          <nav aria-label="Primary" class="pt-1 border-t border-slate-200/50 dark:border-white/5">
            <ul
              id="explorer-primary-menu"
              class="flex-col xl:flex-row xl:flex items-stretch xl:items-center gap-1 xl:gap-1.5 list-none m-0 p-0"
              :class="isMobileMenuOpen ? 'flex pt-2 pb-1' : 'hidden xl:flex'"
            >
              <li v-for="item in navItems" :key="item.to">
                <NuxtLink
                  :to="item.to"
                  :aria-current="item.match(route.path) ? 'page' : undefined"
                  class="primary-nav-link flex items-center justify-between xl:justify-start gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-white/5 transition-colors whitespace-nowrap"
                >
                  <span>{{ item.label }}</span>
                  <span
                    v-if="item.badge !== undefined && item.badge > 0"
                    class="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-brand-salmon/20 text-brand-salmon border border-brand-salmon/30"
                  >
                    {{ item.badge }}
                  </span>
                </NuxtLink>
              </li>
            </ul>
          </nav>
        </UContainer>

        <!-- Sub-header Live Telemetry Ribbon -->
        <div
          v-if="liveStatus?.success"
          class="bg-slate-100/85 dark:bg-slate-900/80 border-t border-slate-200/60 dark:border-white/5 text-[11px] sm:text-xs text-slate-600 dark:text-slate-300"
        >
          <UContainer class="max-w-none w-full px-4 sm:px-6 lg:px-8 xl:px-12 py-1.5 flex items-center gap-x-5 gap-y-1 overflow-x-auto whitespace-nowrap">
            <span class="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-white">
              <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true"></span>
              #{{ formatNumber(liveStatus.height, 0) }}
            </span>
            <span>
              {{ t('avgBlockTime') }}:
              <strong class="text-slate-800 dark:text-white">{{ liveStatus.avgBlockTime }}s</strong>
            </span>
            <span>
              {{ t('blockSubsidy') }}:
              <strong class="text-brand-salmon">{{ liveStatus.currentSubsidy }} KRISTA</strong>
            </span>
            <span v-if="liveStatus.hashrate > 0">
              {{ t('networkHashrate') }}:
              <strong class="text-slate-800 dark:text-white">{{ formatHashrate(liveStatus.hashrate) }}</strong>
            </span>
            <span>
              {{ t('circulatingSupply') }}:
              <strong class="text-slate-800 dark:text-white">{{ formatNumber(liveStatus.circulatingSupply, 2) }} KRISTA</strong>
            </span>
            <span>
              🔥 {{ t('burnedSupply') }}:
              <strong class="text-orange-600 dark:text-orange-400">{{ formatNumber(liveStatus.burnedSupply?.total || 0, 2) }}</strong>
            </span>
            <span>
              {{ t('validatorPool') }}:
              <strong class="text-purple-600 dark:text-purple-300">{{ liveStatus.validatorPool?.total || 0 }}</strong>
            </span>
            <span>
              {{ t('peers') }}:
              <strong class="text-brand-blue">{{ liveStatus.connections }}</strong>
            </span>
          </UContainer>
        </div>
      </header>

      <!-- Main View -->
      <main id="main-content" class="flex-grow py-6 sm:py-8">
        <UContainer class="max-w-none w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <NuxtPage />
        </UContainer>
      </main>

      <!-- Rich Professional Footer -->
      <footer class="bg-slate-100/90 dark:bg-slate-950/90 border-t border-slate-200/70 dark:border-white/10 py-8 mt-auto">
        <UContainer class="max-w-none w-full px-4 sm:px-6 lg:px-8 xl:px-12 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 text-sm text-slate-500 dark:text-slate-400">
          <div class="space-y-1">
            <div class="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <span>KristaTech Blockchain Explorer</span>
              <span class="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-200/80 dark:bg-slate-900 border border-slate-300/60 dark:border-white/10 text-slate-700 dark:text-slate-300">
                v1.5.9.0 • Proto 70983
              </span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              Fair Launch • Zero Premine • ADAM Dual-Track (7 MN / 1 Coin-Lock / 3 Open PoW) • 4,200:250:10 Fair VRF (≥75% MN Floor) • KTDIP3
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs sm:text-sm font-medium">
            <NuxtLink to="/blocks" class="hover:text-brand-blue transition-colors">{{ t('navBlocks') }}</NuxtLink>
            <NuxtLink to="/transactions" class="hover:text-brand-blue transition-colors">{{ t('navTransactions') }}</NuxtLink>
            <NuxtLink to="/validators" class="hover:text-brand-blue transition-colors">{{ t('navValidators') }}</NuxtLink>
            <NuxtLink to="/richlist" class="hover:text-brand-blue transition-colors">{{ t('navRichList') }}</NuxtLink>
            <NuxtLink to="/network" class="hover:text-brand-blue transition-colors">{{ t('navNetwork') }}</NuxtLink>
            <NuxtLink to="/api-docs" class="hover:text-brand-blue transition-colors">{{ t('navApi') }}</NuxtLink>
            <a
              href="https://krista.kristalteknoloji.com"
              target="_blank"
              rel="noopener noreferrer"
              class="hover:text-brand-salmon transition-colors"
            >
              Website ↗
            </a>
            <a
              href="https://github.com/bedri/KristaTech-KRISTA"
              target="_blank"
              rel="noopener noreferrer"
              class="hover:text-brand-salmon transition-colors"
            >
              GitHub ↗
            </a>
          </div>
        </UContainer>
      </footer>
    </div>
  </UApp>
</template>
