<script lang="ts">
  let {
    title,
    description,
    actionHref,
    actionLabel,
  }: {
    title: string;
    description: string;
    actionHref?: string;
    actionLabel?: string;
  } = $props();
</script>

<div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-700 px-6 py-16 text-center">
  <svg
    class="mb-4 h-12 w-12 text-gray-600"
    fill="none"
    viewBox="0 0 24 24"
    stroke-width="1.5"
    stroke="currentColor"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25-2.25M12 13.875V7.5M3.75 7.5h16.5"
    />
  </svg>
  <h3 class="mb-1 text-base font-semibold text-gray-200">{title}</h3>
  <p class="mb-6 max-w-sm text-sm text-gray-400">{description}</p>
  {#if actionHref && actionLabel}
    <a
      href={actionHref}
      class="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      {actionLabel}
    </a>
  {/if}
</div>
