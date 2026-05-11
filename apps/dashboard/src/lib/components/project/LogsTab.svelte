<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getToken } from "$lib/auth.svelte.js";

  let { projectId }: { projectId: string } = $props();

  let lines = $state<string[]>([]);
  let following = $state(true);
  let error = $state("");
  let connected = $state(false);
  let autoScroll = $state(true);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let controller: AbortController | null = null;
  let logBox: HTMLDivElement | null = $state(null);
  const MAX_LINES = 5000;

  function appendLine(line: string): void {
    lines = [...lines.slice(-MAX_LINES + 1), line];
    if (autoScroll) queueMicrotask(scrollToBottom);
  }

  function scrollToBottom(): void {
    if (logBox) logBox.scrollTop = logBox.scrollHeight;
  }

  async function startStream(): Promise<void> {
    error = "";
    lines = [];
    connected = false;
    controller = new AbortController();

    const token = getToken();
    const params = new URLSearchParams();
    if (following) params.set("follow", "1");
    params.set("tail", "200");

    try {
      const res = await fetch(
        `/api/v1/projects/${projectId}/logs?${params.toString()}`,
        {
          headers: token
            ? { Authorization: `Bearer ${token}`, Accept: "text/event-stream" }
            : { Accept: "text/event-stream" },
          credentials: "include",
          signal: controller.signal,
        },
      );

      if (!res.ok || !res.body) {
        error = `Stream failed (${res.status}): ${res.statusText}`;
        return;
      }
      connected = true;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const frame = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (frame.startsWith("data: ")) appendLine(frame.slice(6));
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        error = (err as Error).message ?? "Connection error";
      }
    } finally {
      connected = false;
    }
  }

  function stopStream(): void {
    controller?.abort();
    controller = null;
  }

  function toggleFollow(): void {
    following = !following;
    stopStream();
    startStream();
  }

  function clearLogs(): void {
    lines = [];
  }

  onMount(() => {
    startStream();
  });

  onDestroy(() => {
    stopStream();
  });

  function onScroll(): void {
    if (!logBox) return;
    // If user scrolled away from the bottom, disable autoScroll. Re-enable when
    // they scroll back down within 10px of the bottom.
    const atBottom =
      logBox.scrollTop + logBox.clientHeight >= logBox.scrollHeight - 10;
    autoScroll = atBottom;
  }
</script>

<div class="flex flex-col h-[calc(100vh-220px)] min-h-[400px]">
  <div class="mb-3 flex items-center gap-2 flex-wrap">
    <button
      onclick={toggleFollow}
      class="rounded-md border border-surface-lighter bg-surface-light px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-surface-lighter"
    >
      {following ? "⏸ Pause" : "▶ Follow"}
    </button>
    <button
      onclick={clearLogs}
      class="rounded-md border border-surface-lighter bg-surface-light px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-surface-lighter"
    >
      Clear
    </button>
    <span class="text-xs text-slate-400 ml-2">
      {#if connected}
        <span class="inline-block h-2 w-2 rounded-full bg-emerald-500 mr-1.5"></span>
        Streaming
      {:else if error}
        <span class="inline-block h-2 w-2 rounded-full bg-red-500 mr-1.5"></span>
        Error
      {:else}
        <span class="inline-block h-2 w-2 rounded-full bg-slate-500 mr-1.5"></span>
        Idle
      {/if}
    </span>
    <span class="text-xs text-slate-500 ml-auto">
      {lines.length} {lines.length === 1 ? "line" : "lines"}
      {#if !autoScroll && following}
        <span class="ml-2 text-amber-400">· auto-scroll paused (scrolled up)</span>
      {/if}
    </span>
  </div>

  {#if error}
    <div class="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
      {error}
    </div>
  {/if}

  <div
    bind:this={logBox}
    onscroll={onScroll}
    class="flex-1 overflow-y-auto rounded-lg border border-surface-lighter bg-black/50 p-3 font-mono text-xs leading-relaxed text-slate-200"
  >
    {#if lines.length === 0 && !error}
      <p class="text-slate-500">Waiting for log lines…</p>
    {:else}
      {#each lines as line, i (i)}
        <div class="whitespace-pre-wrap break-all">{line || " "}</div>
      {/each}
    {/if}
  </div>
</div>
