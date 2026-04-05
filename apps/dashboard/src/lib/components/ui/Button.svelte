<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    variant = "primary",
    loading = false,
    disabled = false,
    type = "button",
    onclick,
    children,
  }: {
    variant?: "primary" | "secondary" | "danger";
    loading?: boolean;
    disabled?: boolean;
    type?: "button" | "submit";
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  } = $props();

  const variants: Record<string, string> = {
    primary: "bg-brand-600 hover:bg-brand-700 text-white",
    secondary: "bg-surface-lighter hover:bg-gray-600 text-gray-200",
    danger: "bg-red-600 hover:bg-red-700 text-white",
  };

  let classes = $derived(
    `inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]}`
  );
</script>

<button {type} class={classes} disabled={disabled || loading} {onclick}>
  {#if loading}
    <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" class="opacity-25" />
      <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" class="opacity-75" />
    </svg>
  {/if}
  {@render children()}
</button>
