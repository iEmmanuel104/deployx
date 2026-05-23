<script lang="ts">
  import OverviewTab from "$lib/components/project/OverviewTab.svelte";
  import DeploymentsTab from "$lib/components/project/DeploymentsTab.svelte";
  import DomainsTab from "$lib/components/project/DomainsTab.svelte";
  import EnvVarsTab from "$lib/components/project/EnvVarsTab.svelte";
  import LogsTab from "$lib/components/project/LogsTab.svelte";
  import SettingsTab from "$lib/components/project/SettingsTab.svelte";
  import StatusBadge from "$lib/components/ui/StatusBadge.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  let activeTab = $state("overview");

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "deployments", label: "Deployments" },
    { id: "logs", label: "Logs" },
    { id: "domains", label: "Domains" },
    { id: "environment", label: "Environment" },
    { id: "settings", label: "Settings" },
  ] as const;
</script>

<div class="p-6 lg:p-8">
  <!-- Page header -->
  <div class="mb-6">
    <div class="flex items-center gap-2 text-sm text-slate-400">
      <a href="/projects" class="hover:text-slate-200 transition-colors">Projects</a>
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
      <span class="text-slate-200">{data.project.name}</span>
    </div>
    <div class="mt-2 flex items-center gap-3">
      <h1 class="text-2xl font-bold text-slate-100">{data.project.name}</h1>
      <StatusBadge status={data.project.status} />
    </div>
  </div>

  <!-- Tab navigation -->
  <div class="mb-6 border-b border-surface-lighter">
    <nav class="-mb-px flex gap-1" aria-label="Tabs">
      {#each tabs as tab}
        <button
          onclick={() => (activeTab = tab.id)}
          class="rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors {activeTab === tab.id
            ? 'border-b-2 border-brand-500 text-brand-500 bg-brand-600/10'
            : 'text-slate-400 hover:text-slate-200 hover:bg-surface-lighter/50'}"
        >
          {tab.label}
        </button>
      {/each}
    </nav>
  </div>

  <!-- Tab content. Each tab is wrapped in a Svelte 5 <svelte:boundary> so an
       error in one tab (render or onMount) cannot kill the rest of the page —
       the user can still switch tabs and recover. -->
  <div>
    {#if activeTab === "overview"}
      <svelte:boundary>
        <OverviewTab project={data.project} deployments={data.deployments} />
        {#snippet failed(error, reset)}
          {@render tabFallback("Overview", error, reset)}
        {/snippet}
      </svelte:boundary>
    {:else if activeTab === "deployments"}
      <svelte:boundary>
        <DeploymentsTab deployments={data.deployments} projectId={data.project.id} />
        {#snippet failed(error, reset)}
          {@render tabFallback("Deployments", error, reset)}
        {/snippet}
      </svelte:boundary>
    {:else if activeTab === "logs"}
      <svelte:boundary>
        <LogsTab projectId={data.project.id} />
        {#snippet failed(error, reset)}
          {@render tabFallback("Logs", error, reset)}
        {/snippet}
      </svelte:boundary>
    {:else if activeTab === "domains"}
      <svelte:boundary>
        <DomainsTab domains={data.domains} projectId={data.project.id} />
        {#snippet failed(error, reset)}
          {@render tabFallback("Domains", error, reset)}
        {/snippet}
      </svelte:boundary>
    {:else if activeTab === "environment"}
      <svelte:boundary>
        <EnvVarsTab envVars={data.envVars} projectId={data.project.id} />
        {#snippet failed(error, reset)}
          {@render tabFallback("Environment", error, reset)}
        {/snippet}
      </svelte:boundary>
    {:else if activeTab === "settings"}
      <svelte:boundary>
        <SettingsTab project={data.project} />
        {#snippet failed(error, reset)}
          {@render tabFallback("Settings", error, reset)}
        {/snippet}
      </svelte:boundary>
    {/if}
  </div>

  {#snippet tabFallback(tabName: string, error: unknown, reset: () => void)}
    <div class="rounded-xl border border-red-500/30 bg-red-500/10 p-6">
      <h3 class="mb-2 text-base font-semibold text-red-300">
        {tabName} failed to render
      </h3>
      <p class="mb-4 text-sm text-red-300/80">
        {error instanceof Error ? error.message : "Unknown error"}
      </p>
      <button
        onclick={reset}
        class="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-200 transition-colors hover:bg-red-500/20"
      >
        Retry
      </button>
    </div>
  {/snippet}
</div>
