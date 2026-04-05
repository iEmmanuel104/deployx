<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  $effect(() => {
    if (page.data?.user) {
      goto("/projects");
    } else {
      goto("/login");
    }
  });
</script>

<p class="text-slate-400">Redirecting...</p>
