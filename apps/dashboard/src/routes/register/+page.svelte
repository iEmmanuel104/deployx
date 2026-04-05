<script lang="ts">
  import { register } from "$lib/auth.svelte.js";
  import { goto } from "$app/navigation";

  let name = $state("");
  let email = $state("");
  let password = $state("");
  let error = $state("");
  let loading = $state(false);

  async function handleRegister(e: Event) {
    e.preventDefault();
    error = "";
    loading = true;
    try {
      await register(name, email, password);
      await goto("/projects");
    } catch (err) {
      error = err instanceof Error ? err.message : "Registration failed";
    } finally {
      loading = false;
    }
  }
</script>

<div class="w-full max-w-md space-y-8 px-6">
  <div class="text-center">
    <h1 class="text-3xl font-bold text-brand-500">DeployX</h1>
    <p class="mt-2 text-sm text-slate-400">Create your account</p>
  </div>

  <form onsubmit={handleRegister} class="space-y-6 rounded-xl border border-surface-lighter bg-surface-light p-8">
    {#if error}
      <div class="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
        {error}
      </div>
    {/if}

    <div class="space-y-2">
      <label for="name" class="block text-sm font-medium text-slate-300">Name</label>
      <input
        id="name"
        type="text"
        bind:value={name}
        required
        placeholder="Your name"
        class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
      />
    </div>

    <div class="space-y-2">
      <label for="email" class="block text-sm font-medium text-slate-300">Email</label>
      <input
        id="email"
        type="email"
        bind:value={email}
        required
        placeholder="you@example.com"
        class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
      />
    </div>

    <div class="space-y-2">
      <label for="password" class="block text-sm font-medium text-slate-300">Password</label>
      <input
        id="password"
        type="password"
        bind:value={password}
        required
        minlength={8}
        placeholder="At least 8 characters"
        class="w-full rounded-lg border border-surface-lighter bg-surface px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
      />
    </div>

    <button
      type="submit"
      disabled={loading}
      class="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {#if loading}
        Creating account...
      {:else}
        Create account
      {/if}
    </button>
  </form>

  <p class="text-center text-sm text-slate-400">
    Already have an account?
    <a href="/login" class="font-medium text-brand-500 hover:text-brand-600">Sign in</a>
  </p>
</div>
