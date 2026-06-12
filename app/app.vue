<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from '~/composables/useI18n'

const { locale, setLocale, t } = useI18n()

useHead({
  title: computed(() => `KristaTech (KRISTA) - ${t('explorer')}`)
})

const colorMode = useColorMode()
function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

const searchQuery = ref('')
const isSearching = ref(false)
const searchError = ref('')

async function handleSearch() {
  const query = searchQuery.value.trim()
  if (!query) return
  
  isSearching.value = true
  searchError.value = ''
  
  try {
    const data = await $fetch(`/api/search?q=${query}`)
    if (data.success && data.target) {
      searchQuery.value = ''
      navigateTo(data.target)
    } else {
      searchError.value = t('searchNotFound')
      setTimeout(() => { searchError.value = '' }, 4000)
    }
  } catch (err) {
    searchError.value = t('searchError')
    setTimeout(() => { searchError.value = '' }, 4000)
  } finally {
    isSearching.value = false
  }
}

// Available languages list for selector
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
  return languages.find(l => l.code === locale.value) || languages[0]
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

onMounted(() => {
  window.addEventListener('click', closeDropdown)

  // Client-side locale fallback detection after hydration completes
  const localeCookie = useCookie('explorer_locale')
  if (!localeCookie.value) {
    const browserLang = navigator.language.slice(0, 2)
    if (languages.some(l => l.code === browserLang)) {
      setLocale(browserLang)
    }
  }
})

onUnmounted(() => {
  window.removeEventListener('click', closeDropdown)
})
</script>

<template>
  <UApp>
    <div class="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-gray-200 transition-colors duration-300">
    <!-- Main Glassmorphic Header -->
    <header class="sticky top-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200/60 dark:border-white/5 py-4 transition-colors duration-300">
      <UContainer class="flex flex-col lg:flex-row items-center justify-between gap-4">
        <!-- Logo / Branding -->
        <NuxtLink to="/" class="flex items-center gap-2 group">
          <div class="w-12 h-12 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform duration-300 p-2 bg-gradient-to-b from-slate-100 to-white dark:from-slate-900 dark:to-slate-950">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 57 45" class="w-full h-full">
              <g transform="translate(-180.671875, -149.75)">
                <!-- Path 3: K body (Salmon #F5897C) -->
                <path fill="#F5897C" fill-rule="nonzero" d="M 225.105469 194.265625 L 209.386719 172.542969 L 209.386719 194.265625 L 199.753906 194.265625 L 199.753906 170.3125 L 209.386719 170.3125 L 223.976562 149.75 L 235.203125 149.75 L 220.058594 171.078125 L 236.859375 194.265625 Z" />
                <!-- Path 4: Middle Square (Slate-Blue #7695CD) -->
                <path fill="#7695CD" fill-rule="nonzero" d="M 190.210938 160.769531 L 199.753906 160.769531 L 199.753906 170.3125 L 190.210938 170.3125 Z" />
                <!-- Path 5: Right Square (Slate-Blue #7695CD) -->
                <path fill="#7695CD" fill-rule="nonzero" d="M 199.753906 151.226562 L 209.292969 151.226562 L 209.292969 160.769531 L 199.753906 160.769531 Z" />
                <!-- Path 6: Left Square (Slate-Blue #7695CD) -->
                <path fill="#7695CD" fill-rule="nonzero" d="M 180.671875 151.226562 L 190.210938 151.226562 L 190.210938 160.769531 L 180.671875 160.769531 Z" />
              </g>
            </svg>
          </div>
          <div>
            <h1 class="font-bold text-xl tracking-wider text-slate-800 dark:text-white group-hover:text-brand-blue transition-colors duration-300">
              KristaTech (KRISTA) <span class="text-xs font-semibold px-2 py-0.5 rounded bg-brand-salmon/10 text-brand-salmon ml-1">{{ t('explorer') }}</span>
            </h1>
          </div>
        </NuxtLink>

        <!-- Search & Lang Selector & Theme Toggle -->
        <div class="flex items-center gap-3 w-full lg:w-auto">
          <!-- Dynamic Search Bar -->
          <div class="flex-grow sm:w-[320px] md:w-[380px] relative">
            <form @submit.prevent="handleSearch" class="flex gap-2 w-full">
              <UInput
                v-model="searchQuery"
                icon="i-heroicons-magnifying-glass"
                size="lg"
                color="neutral"
                variant="outline"
                :placeholder="t('searchPlaceholder')"
                class="w-full bg-white dark:bg-slate-900 rounded-lg"
                :loading="isSearching"
              />
              <UButton
                type="submit"
                size="lg"
                :label="t('searchBtn')"
                :loading="isSearching"
                class="px-5 font-semibold text-white bg-brand-blue hover:bg-brand-blue-hover shadow-md shadow-brand-blue/20 transition-all border-0"
              />
            </form>
            
            <!-- Search Error Dropdown Banner -->
            <Transition name="fade">
              <div v-if="searchError" class="absolute left-0 right-0 mt-2 p-2 bg-red-100 dark:bg-red-950/85 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 text-sm rounded-lg backdrop-blur-sm z-50">
                {{ searchError }}
              </div>
            </Transition>
          </div>

          <!-- Theme Toggle Button -->
          <button 
            type="button"
            @click="toggleColorMode"
            class="flex items-center justify-center w-11 h-11 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 text-slate-600 dark:text-gray-200 hover:text-slate-900 dark:hover:text-white transition-all shadow-md shadow-slate-200/30 dark:shadow-slate-900/50 backdrop-blur-sm h-11 shrink-0"
            aria-label="Toggle Theme"
          >
            <UIcon :name="colorMode.value === 'dark' ? 'i-heroicons-sun' : 'i-heroicons-moon'" class="w-5 h-5" />
          </button>

          <!-- Premium Custom Language Selector -->
          <div class="relative shrink-0" ref="dropdownRef">
            <button 
              type="button"
              @click.stop="isLangOpen = !isLangOpen"
              class="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 text-slate-600 dark:text-gray-200 hover:text-slate-900 dark:hover:text-white transition-all text-sm font-medium shadow-md shadow-slate-200/30 dark:shadow-slate-900/50 backdrop-blur-sm h-11"
            >
              <span class="text-lg leading-none">{{ currentLanguage.flag }}</span>
              <span class="hidden md:inline">{{ currentLanguage.name }}</span>
              <UIcon name="i-heroicons-chevron-down" class="w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform duration-200" :class="{ 'rotate-180': isLangOpen }" />
            </button>

            <!-- Dropdown Options -->
            <Transition name="slide-up">
              <div 
                v-if="isLangOpen"
                class="absolute right-0 mt-2 w-48 rounded-xl bg-white dark:bg-slate-900/95 border border-slate-200 dark:border-white/10 p-1.5 shadow-2xl backdrop-blur-md z-50 max-h-80 overflow-y-auto custom-scrollbar"
              >
                <div class="py-1 space-y-0.5">
                  <button
                    v-for="lang in languages"
                    :key="lang.code"
                    type="button"
                    @click="selectLang(lang.code)"
                    class="flex items-center gap-3 w-full px-3 py-2 text-left text-sm rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors"
                    :class="locale === lang.code ? 'bg-slate-100 dark:bg-white/5 text-brand-blue font-semibold' : 'text-slate-600 dark:text-gray-300'"
                  >
                    <span class="text-lg leading-none">{{ lang.flag }}</span>
                    <span>{{ lang.name }}</span>
                  </button>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </UContainer>
    </header>

    <!-- Main Content View -->
    <main class="flex-grow py-8">
      <UContainer>
        <NuxtPage />
      </UContainer>
    </main>

    <!-- Footer -->
    <footer class="bg-slate-100/80 dark:bg-slate-950/90 border-t border-slate-200/60 dark:border-white/5 py-8 mt-auto transition-colors duration-300">
      <UContainer class="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500 dark:text-slate-400">
        <div>
          <span class="font-semibold text-slate-700 dark:text-slate-300">KristaTech Blockchain Explorer</span> &copy; 2026. All rights reserved.
        </div>
        <div class="flex items-center gap-6">
          <a href="https://krista.kristalteknoloji.com" target="_blank" class="hover:text-brand-blue transition-colors">Website</a>
          <a href="https://explorer.kristalteknoloji.com" target="_blank" class="hover:text-brand-blue transition-colors">Explorer</a>
          <span class="text-xs px-2 py-1 rounded bg-slate-200/50 dark:bg-slate-900 border border-slate-300/50 dark:border-white/5 text-slate-600 dark:text-slate-300">v1.0.0</span>
        </div>
      </UContainer>
    </footer>
  </div>
  </UApp>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* Custom Scrollbar for Dropdown */
.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 9999px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>
