<script lang="ts">
  import StatusBadge from "$lib/components/ui/StatusBadge.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { getToken } from "$lib/auth.svelte.js";
  import type { Project, Deployment } from "$lib/api.js";

  let {
    project,
    deployments,
  }: {
    project: Project;
    deployments: Deployment[];
  } = $props();

  let deploying = $state(false);
  let stopping = $state(false);
  let restarting = $state(false);
  let actionError = $state<string | null>(null);

  let latestDeployment = $derived(deployments.length > 0 ? deployments[0] : null);
  let isRunning = $derived(project.status === "running");

  async function apiAction(endpoint: string, setLoading: (v: boolean) => void) {
    actionError = null;
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/v1/projects/${project.id}/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
      });
      const data = await res.json();
      if (!data.ok) {
        actionError = data.error?.message ?? `Failed to ${endpoint}`;
      }
    } catch (err) {
      actionError = `Failed to ${endpoint}. Please try again.`;
    } finally {
      setLoading(false);
    }
  }

  function handleDeploy() {
    apiAction("deploy", (v) => (deploying = v));
  }

  function handleStop() {
    apiAction("stop", (v) => (stopping = v));
  }

  function handleRestart() {
    apiAction("restart", (v) => (restarting = v));
  }
</script>

<div class="grid gap-6 lg:grid-cols-2">
  <!-- Project info card -->
  <div class="rounded-xl border border-surface-lighter bg-surface-light p-6">
    <h2 class="mb-4 text-lg font-semibold text-slate-100">Project Info</h2>
    <dl class="space-y-3">
      <div class="flex justify-between">
        <dt class="text-sm text-slate-400">Name</dt>
        <dd class="text-sm font-medium text-slate-200">{project.name}</dd>
      </div>
      <div class="flex justify-between">
        <dt class="text-sm text-slate-400">Slug</dt>
        <dd class="text-sm font-mono text-slate-200">{project.slug}</dd>
      </div>
      <div class="flex justify-between">
        <dt class="text-sm text-slate-400">Status</dt>
        <dd><StatusBadge status={project.status} /></dd>
      </div>
      <div class="flex justify-between">
        <dt class="text-sm text-slate-400">Build Type</dt>
        <dd class="text-sm font-medium text-slate-200">{project.buildType}</dd>
      </div>
      {#if project.gitRepo}
        <div class="flex justify-between">
          <dt class="text-sm text-slate-400">Git Repo</dt>
          <dd class="max-w-[60%] truncate text-sm font-mono text-slate-200">{project.gitRepo}</dd>
        </div>
      {/if}
      {#if project.gitBranch}
        <div class="flex justify-between">
          <dt class="text-sm text-slate-400">Branch</dt>
          <dd class="text-sm font-mono text-slate-200">{project.gitBranch}</dd>
        </div>
      {/if}
      {#if project.port}
        <div class="flex justify-between">
          <dt class="text-sm text-slate-400">Port</dt>
          <dd class="text-sm font-mono text-slate-200">{project.port}</dd>
        </div>
      {/if}
      <div class="flex justify-between">
        <dt class="text-sm text-slate-400">Created</dt>
        <dd class="text-sm text-slate-200">{new Date(project.createdAt).toLocaleDateString()}</dd>
      </div>
    </dl>
  </div>

  <!-- Actions card -->
  <div class="space-y-6">
    <div class="rounded-xl border border-surface-lighter bg-surface-light p-6">
      <h2 class="mb-4 text-lg font-semibold text-slate-100">Actions</h2>
      {#if actionError}
        <div class="mb-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {actionError}
        </div>
      {/if}
      <div class="flex flex-wrap gap-3">
        <Button variant="primary" loading={deploying} onclick={handleDeploy}>
          Deploy
        </Button>
        {#if isRunning}
          <Button variant="danger" loading={stopping} onclick={handleStop}>
            Stop
          </Button>
          <Button variant="secondary" loading={restarting} onclick={handleRestart}>
            Restart
          </Button>
        {/if}
      </div>
    </div>

    <!-- Latest deployment card -->
    {#if latestDeployment}
      <div class="rounded-xl border border-surface-lighter bg-surface-light p-6">
        <h2 class="mb-4 text-lg font-semibold text-slate-100">Latest Deployment</h2>
        <dl class="space-y-3">
          <div class="flex justify-between">
            <dt class="text-sm text-slate-400">Version</dt>
            <dd class="text-sm font-mono text-slate-200">{latestDeployment.version}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-sm text-slate-400">Status</dt>
            <dd><StatusBadge status={latestDeployment.status} /></dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-sm text-slate-400">Created</dt>
            <dd class="text-sm text-slate-200">{new Date(latestDeployment.createdAt).toLocaleString()}</dd>
          </div>
        </dl>
      </div>
    {/if}
  </div>
</div>
