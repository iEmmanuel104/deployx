<script lang="ts">
  import Button from "$lib/components/ui/Button.svelte";
  import Modal from "$lib/components/ui/Modal.svelte";
  import { goto } from "$app/navigation";
  import { getToken } from "$lib/auth.svelte.js";
  import type { Project } from "$lib/api.js";

  let { project }: { project: Project } = $props();

  let deleteModalOpen = $state(false);
  let deleting = $state(false);
  let deleteError = $state<string | null>(null);
  let confirmSlug = $state("");

  let canDelete = $derived(confirmSlug === project.slug);

  async function handleDelete() {
    if (!canDelete) return;

    deleteError = null;
    deleting = true;
    try {
      const token = getToken();
      const res = await fetch(`/api/v1/projects/${project.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        await goto("/projects");
      } else {
        deleteError = data.error?.message ?? "Failed to delete project";
      }
    } catch {
      deleteError = "Failed to delete project. Please try again.";
    } finally {
      deleting = false;
    }
  }
</script>

<div class="max-w-2xl space-y-6">
  <!-- Project info (read-only for now) -->
  <div class="rounded-xl border border-surface-lighter bg-surface-light p-6">
    <h2 class="mb-4 text-base font-semibold text-slate-200">General</h2>
    <dl class="space-y-3">
      <div class="flex justify-between">
        <dt class="text-sm text-slate-400">Project Name</dt>
        <dd class="text-sm font-medium text-slate-200">{project.name}</dd>
      </div>
      <div class="flex justify-between">
        <dt class="text-sm text-slate-400">Slug</dt>
        <dd class="text-sm font-mono text-slate-200">{project.slug}</dd>
      </div>
      <div class="flex justify-between">
        <dt class="text-sm text-slate-400">Source Type</dt>
        <dd class="text-sm font-medium text-slate-200">{project.sourceType}</dd>
      </div>
      <div class="flex justify-between">
        <dt class="text-sm text-slate-400">Build Type</dt>
        <dd class="text-sm font-medium text-slate-200">{project.buildType}</dd>
      </div>
      <div class="flex justify-between">
        <dt class="text-sm text-slate-400">Created</dt>
        <dd class="text-sm text-slate-200">{new Date(project.createdAt).toLocaleDateString()}</dd>
      </div>
    </dl>
    <div class="mt-4 rounded-lg border border-dashed border-gray-700 px-4 py-4 text-center">
      <p class="text-sm text-slate-500">Project editing coming soon</p>
    </div>
  </div>

  <!-- Danger Zone -->
  <div class="rounded-xl border border-red-500/30 bg-surface-light p-6">
    <h2 class="mb-2 text-base font-semibold text-red-400">Danger Zone</h2>
    <p class="mb-4 text-sm text-slate-400">
      Deleting this project will permanently remove all deployments, domains, and environment variables.
    </p>
    <Button variant="danger" onclick={() => (deleteModalOpen = true)}>
      Delete Project
    </Button>
  </div>
</div>

<!-- Delete confirmation modal -->
<Modal bind:open={deleteModalOpen} title="Delete Project">
  <div class="space-y-4">
    {#if deleteError}
      <div class="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
        {deleteError}
      </div>
    {/if}
    <p class="text-sm text-slate-300">
      This action is irreversible. Type <span class="font-mono font-medium text-slate-100">{project.slug}</span> to confirm.
    </p>
    <input
      type="text"
      bind:value={confirmSlug}
      placeholder={project.slug}
      class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-2 text-sm font-mono text-slate-200 placeholder-slate-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
    />
    <div class="flex justify-end gap-3">
      <Button variant="secondary" onclick={() => (deleteModalOpen = false)}>
        Cancel
      </Button>
      <Button variant="danger" loading={deleting} disabled={!canDelete} onclick={handleDelete}>
        Delete Project
      </Button>
    </div>
  </div>
</Modal>
