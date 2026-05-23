<script lang="ts">
  import { enhance } from "$app/forms";
  import Button from "$lib/components/ui/Button.svelte";
  import type { ActionData } from "./$types";

  let { form }: { form: ActionData } = $props();

  // Use the RegExp constructor instead of a `/v`-flagged literal. The `/v`
  // flag is rejected by some toolchains; the constructor compiles at runtime.
  const SLUG_REGEX = new RegExp("^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$");

  let name = $state("");
  let slug = $state("");
  let slugManuallyEdited = $state(false);
  let sourceType = $state("git");
  let gitRepo = $state("");
  let gitBranch = $state("main");
  let buildType = $state("nixpacks");
  let port = $state<number>(3000);
  let submitting = $state(false);

  let autoSlug = $derived(
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48),
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
  let slugInvalid = $derived(slug !== "" && !SLUG_REGEX.test(slug));
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

  <form
    method="POST"
    use:enhance={() => {
      submitting = true;
      return async ({ update }) => {
        await update();
        submitting = false;
      };
    }}
    class="max-w-2xl space-y-6 rounded-xl border border-surface-lighter bg-surface-light p-8"
  >
    {#if form?.error}
      <div class="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
        {form.error}
      </div>
    {/if}

    <!-- Name -->
    <div class="space-y-2">
      <label for="name" class="block text-sm font-medium text-slate-300">Project Name</label>
      <input
        id="name"
        name="name"
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
        name="slug"
        type="text"
        bind:value={slug}
        oninput={handleSlugInput}
        required
        maxlength={48}
        placeholder="my-awesome-app"
        aria-invalid={slugInvalid}
        class="w-full rounded-lg border bg-surface px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors focus:ring-1 {slugInvalid
          ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500'
          : 'border-surface-lighter focus:border-brand-500 focus:ring-brand-500'}"
      />
      <p class="text-xs {slugInvalid ? 'text-red-400' : 'text-slate-500'}">
        {#if slugInvalid}
          Slug must start and end with an alphanumeric character, contain only lowercase letters/numbers/hyphens, and be 1-48 characters.
        {:else}
          Lowercase letters, numbers, and hyphens only. Max 48 characters.
        {/if}
      </p>
    </div>

    <!-- Source Type -->
    <div class="space-y-2">
      <label for="sourceType" class="block text-sm font-medium text-slate-300">Source Type</label>
      <select
        id="sourceType"
        name="sourceType"
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
            name="gitRepo"
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
            name="gitBranch"
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
        name="buildType"
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
        name="port"
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
      <Button type="submit" variant="primary" loading={submitting} disabled={slugInvalid}>
        {submitting ? "Creating..." : "Create Project"}
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
