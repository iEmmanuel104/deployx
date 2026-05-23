<script lang="ts">
  import Button from "$lib/components/ui/Button.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import { api } from "$lib/api-client.js";
  import type { EnvVar } from "$lib/api.js";

  let {
    envVars: initialEnvVars,
    projectId,
  }: {
    envVars: EnvVar[];
    projectId: string;
  } = $props();

  let envVars = $state<EnvVar[]>([...initialEnvVars]);
  let newKey = $state("");
  let newValue = $state("");
  let isBuild = $state(false);
  let adding = $state(false);
  let addError = $state<string | null>(null);
  let deletingKey = $state<string | null>(null);
  let deleteError = $state<string | null>(null);

  async function handleAdd(e: Event) {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim() || adding) return;

    addError = null;
    adding = true;
    try {
      const res = await api.setEnvVar(projectId, newKey.trim(), newValue, isBuild);
      if (res.ok && res.data) {
        // Drop any existing entry with the same key, then append the new one.
        envVars = [...envVars.filter((v) => v.key !== res.data!.key), res.data];
        newKey = "";
        newValue = "";
        isBuild = false;
      } else {
        addError = res.error?.message ?? "Failed to add variable";
      }
    } catch {
      addError = "Failed to add variable. Please try again.";
    } finally {
      adding = false;
    }
  }

  async function handleDelete(key: string) {
    if (deletingKey) return;
    deletingKey = key;
    deleteError = null;
    try {
      const res = await api.deleteEnvVar(projectId, key);
      if (res.ok) {
        envVars = envVars.filter((v) => v.key !== key);
      } else {
        deleteError = res.error?.message ?? `Failed to delete ${key}`;
      }
    } catch {
      deleteError = `Failed to delete ${key}. Please try again.`;
    } finally {
      deletingKey = null;
    }
  }
</script>

<div class="space-y-6">
  <!-- Add env var form -->
  <form onsubmit={handleAdd} class="space-y-3 rounded-xl border border-surface-lighter bg-surface-light p-4">
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <input
        type="text"
        bind:value={newKey}
        placeholder="VARIABLE_NAME"
        pattern="[A-Z0-9_]+"
        disabled={adding}
        class="rounded-lg border border-surface-lighter bg-surface px-4 py-2 text-sm font-mono text-slate-200 placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
      />
      <input
        type="text"
        bind:value={newValue}
        placeholder="value"
        disabled={adding}
        class="rounded-lg border border-surface-lighter bg-surface px-4 py-2 text-sm font-mono text-slate-200 placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
      />
    </div>
    <div class="flex items-center justify-between">
      <label class="flex items-center gap-2 text-sm text-slate-400">
        <input type="checkbox" bind:checked={isBuild} disabled={adding} class="rounded border-surface-lighter bg-surface" />
        Build-time variable
      </label>
      <Button variant="primary" type="submit" loading={adding} disabled={!newKey.trim() || !newValue.trim() || adding}>
        {adding ? "Saving..." : "Add Variable"}
      </Button>
    </div>
  </form>

  {#if addError}
    <div class="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
      {addError}
    </div>
  {/if}

  {#if deleteError}
    <div class="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
      {deleteError}
    </div>
  {/if}

  <!-- Env vars list -->
  {#if envVars.length === 0}
    <EmptyState
      title="No environment variables"
      description="Add environment variables to configure your application at runtime."
    />
  {:else}
    <div class="overflow-hidden rounded-xl border border-surface-lighter">
      <table class="w-full">
        <thead>
          <tr class="border-b border-surface-lighter bg-surface-light">
            <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Key</th>
            <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Type</th>
            <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Added</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
              <span class="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-surface-lighter">
          {#each envVars as envVar (envVar.key)}
            <tr class="bg-surface-light/50 transition-colors hover:bg-surface-light">
              <td class="px-4 py-3 text-sm font-mono text-slate-200">{envVar.key}</td>
              <td class="px-4 py-3">
                <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {envVar.isBuild ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}">
                  {envVar.isBuild ? "build" : "runtime"}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-slate-300">{new Date(envVar.createdAt).toLocaleDateString()}</td>
              <td class="px-4 py-3 text-right">
                <button
                  onclick={() => handleDelete(envVar.key)}
                  disabled={deletingKey === envVar.key}
                  class="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Delete variable"
                >
                  {#if deletingKey === envVar.key}
                    <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" class="opacity-25" />
                      <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" class="opacity-75" />
                    </svg>
                  {:else}
                    <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  {/if}
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
