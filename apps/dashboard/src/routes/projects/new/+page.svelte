<script lang="ts">
  import { goto } from "$app/navigation";
  import { getToken } from "$lib/auth.svelte.js";
  import Button from "$lib/components/ui/Button.svelte";

  let name = $state("");
  let slug = $state("");
  let slugManuallyEdited = $state(false);
  let sourceType = $state("git");
  let gitRepo = $state("");
  let gitBranch = $state("main");
  let buildType = $state("nixpacks");
  let port = $state(3000);
  let error = $state("");
  let loading = $state(false);

  let autoSlug = $derived(
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48)
  );

  $effect(() => {
    if (!slugManuallyEdited) {
      slug = autoSlug;
    }
  });

  function handleSlugInput() {
    slugManuallyEdited = true;
  }

  let showGitFields = $derived(sourceType === "git");

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = "";
    loading = true;

    try {
      const body: Record<string, unknown> = {
        name,
        slug,
        source_type: sourceType,
        build_type: buildType,
        port,
      };

      if (sourceType === "git") {
        body.git_repo = gitRepo;
        body.git_branch = gitBranch;
      }

      const token = getToken();
      const res = await fetch("/api/v1/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        credentials: "include",
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error?.message ?? "Failed to create project");
      }

      await goto(`/projects/${slug}`);
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to create project";
    } finally {
      loading = false;
    }
  }
</script>

<div class="p-8">
  <div class="mb-8">
    <a href="/projects" class="inline-flex items-center gap-1 text-sm text-slate-400 transition-colors hover:text-slate-200">
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
      Back to Projects
    </a>
    <h1 class="mt-4 text-2xl font-bold text-slate-100">Create New Project</h1>
    <p class="mt-1 text-sm text-slate-400">Configure and deploy a new application</p>
  </div>

  <form onsubmit={handleSubmit} class="max-w-2xl space-y-6 rounded-xl border border-surface-lighter bg-surface-light p-8">
    {#if error}
      <div class="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
        {error}
      </div>
    {/if}

    <!-- Name -->
    <div class="space-y-2">
      <label for="name" class="block text-sm font-medium text-slate-300">Project Name</label>
      <input
        id="name"
        type="text"
        bind:value={name}
        required
        placeholder="My Awesome App"
        class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
      />
    </div>

    <!-- Slug -->
    <div class="space-y-2">
      <label for="slug" class="block text-sm font-medium text-slate-300">Slug</label>
      <input
        id="slug"
        type="text"
        bind:value={slug}
        oninput={handleSlugInput}
        required
        maxlength={48}
        pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
        placeholder="my-awesome-app"
        class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
      />
      <p class="text-xs text-slate-500">Lowercase letters, numbers, and hyphens only. Max 48 characters.</p>
    </div>

    <!-- Source Type -->
    <div class="space-y-2">
      <label for="sourceType" class="block text-sm font-medium text-slate-300">Source Type</label>
      <select
        id="sourceType"
        bind:value={sourceType}
        class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
      >
        <option value="git">Git Repository</option>
        <option value="zip">ZIP Upload</option>
        <option value="image">Docker Image</option>
        <option value="cli">CLI Push</option>
      </select>
    </div>

    <!-- Git Fields -->
    {#if showGitFields}
      <div class="space-y-4 rounded-lg border border-surface-lighter bg-surface/50 p-4">
        <div class="space-y-2">
          <label for="gitRepo" class="block text-sm font-medium text-slate-300">Git Repository URL</label>
          <input
            id="gitRepo"
            type="url"
            bind:value={gitRepo}
            required
            placeholder="https://github.com/user/repo.git"
            class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div class="space-y-2">
          <label for="gitBranch" class="block text-sm font-medium text-slate-300">Branch</label>
          <input
            id="gitBranch"
            type="text"
            bind:value={gitBranch}
            placeholder="main"
            class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>
    {/if}

    <!-- Build Type -->
    <div class="space-y-2">
      <label for="buildType" class="block text-sm font-medium text-slate-300">Build Type</label>
      <select
        id="buildType"
        bind:value={buildType}
        class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
      >
        <option value="nixpacks">Nixpacks</option>
        <option value="railpack">Railpack</option>
        <option value="dockerfile">Dockerfile</option>
      </select>
      <p class="text-xs text-slate-500">
        {#if buildType === "nixpacks"}
          Auto-detects language and builds with Nixpacks. Works with most frameworks.
        {:else if buildType === "railpack"}
          Optimized build system for fast, reproducible builds.
        {:else}
          Uses the Dockerfile in your repository root.
        {/if}
      </p>
    </div>

    <!-- Port -->
    <div class="space-y-2">
      <label for="port" class="block text-sm font-medium text-slate-300">Application Port</label>
      <input
        id="port"
        type="number"
        bind:value={port}
        min={1}
        max={65535}
        class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
      />
      <p class="text-xs text-slate-500">The port your application listens on inside the container.</p>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-3 pt-2">
      <Button type="submit" variant="primary" {loading}>
        {#if loading}
          Creating...
        {:else}
          Create Project
        {/if}
      </Button>
      <a
        href="/projects"
        class="inline-flex items-center justify-center rounded-lg bg-surface-lighter px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-600"
      >
        Cancel
      </a>
    </div>
  </form>
</div>
