<script lang="ts">
  import type { Snippet } from "svelte";
  let { children }: { children: Snippet } = $props();
</script>

<div class="app">
  <nav>
    <a href="/">DeployX</a>
  </nav>
  <main>
    {@render children()}
  </main>
</div>
