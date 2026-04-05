<script lang="ts">
  let { status }: { status: string } = $props();

  const colors: Record<string, string> = {
    idle: "bg-gray-500/20 text-gray-400",
    building: "bg-amber-500/20 text-amber-400",
    running: "bg-green-500/20 text-green-400",
    stopped: "bg-red-500/20 text-red-400",
    error: "bg-red-500/20 text-red-400",
    queued: "bg-gray-500/20 text-gray-400",
    deploying: "bg-blue-500/20 text-blue-400",
    success: "bg-green-500/20 text-green-400",
    failed: "bg-red-500/20 text-red-400",
    cancelled: "bg-gray-500/20 text-gray-400",
    pending: "bg-amber-500/20 text-amber-400",
    active: "bg-green-500/20 text-green-400",
  };

  let colorClass = $derived(colors[status] ?? "bg-gray-500/20 text-gray-400");
</script>

<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {colorClass}">
  {status}
</span>
