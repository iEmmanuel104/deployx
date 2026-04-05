<script lang="ts">
  import "../app.css";
  import type { Snippet } from "svelte";
  import type { LayoutData } from "./$types";
  import { setInitialAuth, logout, getUser } from "$lib/auth.svelte.js";
  import { page } from "$app/state";

  let { children, data }: { children: Snippet; data: LayoutData } = $props();

  // Sync server user data to client auth state
  $effect(() => {
    setInitialAuth(data.user);
  });

  let currentUser = $derived(getUser());
  let currentPath = $derived(page.url.pathname);

  let isAuthPage = $derived(
    currentPath.startsWith("/login") || currentPath.startsWith("/register")
  );

  async function handleLogout() {
    await logout();
  }
</script>

{#if currentUser && !isAuthPage}
  <div class="flex h-screen bg-surface text-slate-200">
    <!-- Sidebar -->
    <aside class="flex w-64 flex-col border-r border-surface-lighter bg-surface-light">
      <div class="flex h-16 items-center border-b border-surface-lighter px-6">
        <a href="/projects" class="text-xl font-bold text-brand-500">DeployX</a>
      </div>
      <nav class="flex-1 space-y-1 px-3 py-4">
        <a
          href="/projects"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors {currentPath.startsWith('/projects')
            ? 'bg-brand-600/20 text-brand-500'
            : 'text-slate-400 hover:bg-surface-lighter hover:text-slate-200'}"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          Projects
        </a>
        <a
          href="/settings"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors {currentPath.startsWith('/settings')
            ? 'bg-brand-600/20 text-brand-500'
            : 'text-slate-400 hover:bg-surface-lighter hover:text-slate-200'}"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </a>
      </nav>
      <div class="border-t border-surface-lighter px-3 py-4">
        <div class="flex items-center gap-3 px-3 py-2">
          <div class="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-medium text-white">
            {currentUser.name?.charAt(0).toUpperCase() ?? "U"}
          </div>
          <div class="flex-1 truncate">
            <p class="truncate text-sm font-medium text-slate-200">{currentUser.name}</p>
            <p class="truncate text-xs text-slate-400">{currentUser.email}</p>
          </div>
        </div>
        <button
          onclick={handleLogout}
          class="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-surface-lighter hover:text-red-400"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>
    </aside>

    <!-- Main content -->
    <main class="flex-1 overflow-auto">
      {@render children()}
    </main>
  </div>
{:else}
  <div class="flex min-h-screen items-center justify-center bg-surface">
    {@render children()}
  </div>
{/if}
