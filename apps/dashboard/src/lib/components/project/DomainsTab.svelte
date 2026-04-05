<script lang="ts">
  import StatusBadge from "$lib/components/ui/StatusBadge.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Modal from "$lib/components/ui/Modal.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import { getToken } from "$lib/auth.svelte.js";
  import type { Domain } from "$lib/api.js";

  let {
    domains: initialDomains,
    projectId,
  }: {
    domains: Domain[];
    projectId: string;
  } = $props();

  let domains = $state<Domain[]>([...initialDomains]);
  let newDomain = $state("");
  let adding = $state(false);
  let addError = $state<string | null>(null);
  let deleteModalOpen = $state(false);
  let domainToDelete = $state<Domain | null>(null);
  let deleting = $state(false);

  async function handleAddDomain(e: Event) {
    e.preventDefault();
    if (!newDomain.trim()) return;

    addError = null;
    adding = true;
    try {
      const token = getToken();
      const res = await fetch(`/api/v1/projects/${projectId}/domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ domain: newDomain.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        domains = [...domains, data.data];
        newDomain = "";
      } else {
        addError = data.error?.message ?? "Failed to add domain";
      }
    } catch {
      addError = "Failed to add domain. Please try again.";
    } finally {
      adding = false;
    }
  }

  function confirmDelete(domain: Domain) {
    domainToDelete = domain;
    deleteModalOpen = true;
  }

  async function handleDelete() {
    if (!domainToDelete) return;

    deleting = true;
    try {
      const token = getToken();
      const res = await fetch(`/api/v1/projects/${projectId}/domains/${domainToDelete.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        domains = domains.filter((d) => d.id !== domainToDelete!.id);
      }
    } catch {
      // Silently fail - user can retry
    } finally {
      deleting = false;
      deleteModalOpen = false;
      domainToDelete = null;
    }
  }
</script>

<div class="space-y-6">
  <!-- Add domain form -->
  <form onsubmit={handleAddDomain} class="flex gap-3">
    <input
      type="text"
      bind:value={newDomain}
      placeholder="example.com"
      class="flex-1 rounded-lg border border-surface-lighter bg-surface px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
    />
    <Button variant="primary" type="submit" loading={adding} disabled={!newDomain.trim()}>
      Add Domain
    </Button>
  </form>

  {#if addError}
    <div class="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
      {addError}
    </div>
  {/if}

  <!-- Domains list -->
  {#if domains.length === 0}
    <EmptyState
      title="No domains configured"
      description="Add a custom domain to access your project via a friendly URL."
    />
  {:else}
    <div class="space-y-3">
      {#each domains as domain (domain.id)}
        <div class="flex items-center justify-between rounded-xl border border-surface-lighter bg-surface-light p-4">
          <div class="flex items-center gap-4">
            <div>
              <p class="text-sm font-medium text-slate-200">{domain.domain}</p>
              <p class="text-xs text-slate-400">Added {new Date(domain.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <StatusBadge status={domain.sslStatus} />
            <button
              onclick={() => confirmDelete(domain)}
              class="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
              aria-label="Delete domain"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Delete confirmation modal -->
<Modal bind:open={deleteModalOpen} title="Delete Domain">
  <p class="mb-6 text-sm text-slate-300">
    Are you sure you want to remove <span class="font-medium text-slate-100">{domainToDelete?.domain}</span>? This action cannot be undone.
  </p>
  <div class="flex justify-end gap-3">
    <Button variant="secondary" onclick={() => (deleteModalOpen = false)}>
      Cancel
    </Button>
    <Button variant="danger" loading={deleting} onclick={handleDelete}>
      Delete
    </Button>
  </div>
</Modal>
