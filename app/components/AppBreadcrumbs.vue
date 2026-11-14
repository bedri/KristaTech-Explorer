<script setup lang="ts">
export interface BreadcrumbItem {
  label: string
  to: string
}

defineProps<{
  items: BreadcrumbItem[]
}>()
</script>

<template>
  <nav aria-label="Breadcrumbs" class="breadcrumb text-xs sm:text-sm">
    <ol>
      <li v-for="(item, idx) in items" :key="`${item.to}-${idx}`">
        <NuxtLink
          :to="item.to"
          :aria-current="idx === items.length - 1 ? 'page' : undefined"
          class="transition-colors underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-blue rounded px-1 py-0.5"
          :class="
            idx === items.length - 1
              ? 'font-bold text-slate-800 dark:text-white'
              : 'text-slate-600 dark:text-slate-300 hover:text-brand-blue dark:hover:text-brand-salmon underline decoration-slate-300 dark:decoration-white/25 hover:decoration-current'
          "
        >
          {{ item.label }}
        </NuxtLink>
      </li>
    </ol>
  </nav>
</template>
