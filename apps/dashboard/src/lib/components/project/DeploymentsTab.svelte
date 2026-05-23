<script lang="ts">
  import StatusBadge from "$lib/components/ui/StatusBadge.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import { api } from "$lib/api-client.js";
  import type { Deployment } from "$lib/api.js";

  let {
    deployments,
    projectId,
  }: {
    deployments: Deployment[];
    projectId: string;
  } = $props();

  let expandedId = $state<string | null>(null);
  let rollingBackVersion = $state<number | null>(null);
  let rollbackError = $state<string | null>(null);
  let rollbackNotice = $state<string | null>(null);

  function toggleExpand(id: string) {
    expandedId = expandedId === id ? null : id;
  }

  // Rollback target candidates: only successful, non-latest deployments.
  let latestSuccessVersion = $derived(
    deployments.find((d) => d.status === "success")?.version ?? null,
  );

  function canRollback(d: Deployment): boolean {
    return (
      d.status === "success" &&
      latestSuccessVersion !== null &&
      d.version !== latestSuccessVersion
    );
  }

  async function handleRollback(d: Deployment) {
    if (rollingBackVersion !== null) return;
    rollbackError = null;
    rollbackNotice = null;
    rollingBackVersion = d.version;
    try {
      const res = await api.rollback(projectId, d.version);
      if (res.ok) {
        rollbackNotice = `Rollback to v${d.version} queued.`;
      } else {
        rollbackError = res.error?.message ?? `Failed to roll back to v${d.version}`;
      }
    } catch {
      rollbackError = `Failed to roll back to v${d.version}. Please try again.`;
    } finally {
      rollingBackVersion = null;
    }
  }
</script>

{#if rollbackError}
  <div class="mb-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
    {rollbackError}
  </div>
{/if}
{#if rollbackNotice}
  <div class="mb-4 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
    {rollbackNotice}
  </div>
{/if}

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
              <div class="inline-flex items-center gap-2">
                {#if canRollback(deployment)}
                  <button
                    onclick={() => handleRollback(deployment)}
                    disabled={rollingBackVersion !== null}
                    class="rounded-lg px-3 py-1 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {rollingBackVersion === deployment.version ? "Rolling back..." : "Rollback"}
                  </button>
                {/if}
                <button
                  onclick={() => toggleExpand(deployment.id)}
                  class="rounded-lg px-3 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-surface-lighter hover:text-slate-200"
                >
                  {expandedId === deployment.id ? "Hide logs" : "View logs"}
                </button>
              </div>
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
