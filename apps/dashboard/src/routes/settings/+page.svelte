<script lang="ts">
  import type { PageData } from "./$types";
  import StatusBadge from "$lib/components/ui/StatusBadge.svelte";

  let { data }: { data: PageData } = $props();

  let user = $derived(data.user);

  let initials = $derived(
    user
      ? user.name
          .split(" ")
          .map((n: string) => n.charAt(0).toUpperCase())
          .slice(0, 2)
          .join("")
      : "U"
  );
</script>

<div class="p-8">
  <div class="mb-8">
    <h1 class="text-2xl font-bold text-slate-100">Settings</h1>
    <p class="mt-1 text-sm text-slate-400">Manage your account and platform settings</p>
  </div>

  <div class="max-w-2xl space-y-6">
    <!-- Profile Card -->
    <div class="rounded-xl border border-surface-lighter bg-surface-light p-6">
      <h2 class="mb-4 text-base font-semibold text-slate-200">Profile</h2>
      {#if user}
        <div class="flex items-center gap-4">
          <div class="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-lg font-semibold text-white">
            {initials}
          </div>
          <div class="flex-1">
            <p class="text-base font-medium text-slate-100">{user.name}</p>
            <p class="text-sm text-slate-400">{user.email}</p>
            <div class="mt-1.5">
              <StatusBadge status={user.role} />
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Account Section -->
    <div class="rounded-xl border border-surface-lighter bg-surface-light p-6">
      <h2 class="mb-2 text-base font-semibold text-slate-200">Account</h2>
      <p class="text-sm text-slate-400">Manage your email, password, and authentication settings.</p>
      <div class="mt-4 rounded-lg border border-dashed border-gray-700 px-4 py-6 text-center">
        <p class="text-sm text-slate-500">Account settings coming soon</p>
      </div>
    </div>

    <!-- API Tokens Section -->
    <div class="rounded-xl border border-surface-lighter bg-surface-light p-6">
      <h2 class="mb-2 text-base font-semibold text-slate-200">API Tokens</h2>
      <p class="text-sm text-slate-400">Create and manage API tokens for CLI and programmatic access.</p>
      <div class="mt-4 rounded-lg border border-dashed border-gray-700 px-4 py-6 text-center">
        <p class="text-sm text-slate-500">API token management coming soon</p>
      </div>
    </div>

    <!-- Platform Section -->
    <div class="rounded-xl border border-surface-lighter bg-surface-light p-6">
      <h2 class="mb-2 text-base font-semibold text-slate-200">Platform</h2>
      <p class="text-sm text-slate-400">Global platform configuration and system settings.</p>
      <div class="mt-4 rounded-lg border border-dashed border-gray-700 px-4 py-6 text-center">
        <p class="text-sm text-slate-500">Platform settings coming soon</p>
      </div>
    </div>
  </div>
</div>
