<script lang="ts">
  import { page } from "$app/state";
  const slug = $derived(page.params.slug);
</script>

<h1>Project: {slug}</h1>
<p>Project details coming soon.</p>
