<script lang="ts">
  import type { PageData } from "./$types";
  import StatusBadge from "$lib/components/ui/StatusBadge.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";

  let { data }: { data: PageData } = $props();

  let projects = $derived(data.projects as Array<{
    id: string;
    name: string;
    slug: string;
    sourceType: string;
    buildType: string;
    status: string;
    updatedAt: string;
    createdAt: string;
  }>);

  function formatRelativeTime(dateStr: string): string {
    const now = Date.now();
    const date = new Date(dateStr).getTime();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }
</script>

<div class="p-8">
  <div class="mb-8 flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-slate-100">Projects</h1>
      <p class="mt-1 text-sm text-slate-400">Manage your deployed applications</p>
    </div>
    {#if projects.length > 0}
      <a
        href="/projects/new"
        class="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        New Project
      </a>
    {/if}
  </div>

  {#if projects.length === 0}
    <EmptyState
      title="No projects yet"
      description="Deploy your first application to get started. DeployX supports Git repos, Docker images, and more."
      actionHref="/projects/new"
      actionLabel="Create Project"
    />
  {:else}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {#each projects as project (project.id)}
        <a
          href="/projects/{project.slug}"
          class="group rounded-xl border border-surface-lighter bg-surface-light p-5 transition-colors hover:border-brand-500/50"
        >
          <div class="mb-3 flex items-start justify-between">
            <div class="min-w-0 flex-1">
              <h3 class="truncate text-base font-semibold text-slate-100 group-hover:text-brand-500">
                {project.name}
              </h3>
              <p class="mt-0.5 truncate text-sm text-slate-500">{project.slug}</p>
            </div>
            <StatusBadge status={project.status} />
          </div>

          <div class="flex items-center gap-4 text-xs text-slate-400">
            <span class="inline-flex items-center gap-1">
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
              </svg>
              {project.buildType}
            </span>
            <span class="inline-flex items-center gap-1">
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formatRelativeTime(project.updatedAt)}
            </span>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
