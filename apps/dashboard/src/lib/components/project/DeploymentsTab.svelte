<script lang="ts">
  import StatusBadge from "$lib/components/ui/StatusBadge.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import type { Deployment } from "$lib/api.js";

  let {
    deployments,
    projectId,
  }: {
    deployments: Deployment[];
    projectId: string;
  } = $props();

  let expandedId = $state<string | null>(null);

  function toggleExpand(id: string) {
    expandedId = expandedId === id ? null : id;
  }
</script>

{#if deployments.length === 0}
  <EmptyState
    title="No deployments yet"
    description="Deploy your project to see deployment history here."
  />
{:else}
  <div class="overflow-hidden rounded-xl border border-surface-lighter">
    <table class="w-full">
      <thead>
        <tr class="border-b border-surface-lighter bg-surface-light">
          <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Version</th>
          <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
          <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Created</th>
          <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
            <span class="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-surface-lighter">
        {#each deployments as deployment (deployment.id)}
          <tr class="bg-surface-light/50 transition-colors hover:bg-surface-light">
            <td class="px-4 py-3 text-sm font-mono text-slate-200">{deployment.version}</td>
            <td class="px-4 py-3">
              <StatusBadge status={deployment.status} />
            </td>
            <td class="px-4 py-3 text-sm text-slate-300">{new Date(deployment.createdAt).toLocaleString()}</td>
            <td class="px-4 py-3 text-right">
              <button
                onclick={() => toggleExpand(deployment.id)}
                class="rounded-lg px-3 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-surface-lighter hover:text-slate-200"
              >
                {expandedId === deployment.id ? "Hide logs" : "View logs"}
              </button>
            </td>
          </tr>
          {#if expandedId === deployment.id}
            <tr>
              <td colspan="4" class="bg-surface px-4 py-4">
                {#if deployment.buildLog}
                  <pre class="max-h-64 overflow-auto rounded-lg bg-gray-950 p-4 text-xs text-slate-300 font-mono">{deployment.buildLog}</pre>
                {:else}
                  <p class="max-h-64 overflow-auto rounded-lg bg-gray-950 p-4 text-xs text-slate-300 font-mono">No build logs available for this deployment.</p>
                {/if}
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
{/if}
