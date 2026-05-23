<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getToken } from "$lib/auth.svelte.js";

  let { projectId }: { projectId: string } = $props();

  let lines = $state<string[]>([]);
  let following = $state(true);
  let error = $state("");
  let connected = $state(false);
  let autoScroll = $state(true);
  let reconnecting = $state(false);
  let retryCount = $state(0);
  let nextRetryMs = $state(0);
  let givenUp = $state(false);

  let controller: AbortController | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let logBox: HTMLDivElement | null = $state(null);

  const MAX_LINES = 5000;
  const MAX_RETRIES = 10;
  const BASE_DELAY_MS = 1000;
  const MAX_DELAY_MS = 30_000;

  function appendLine(line: string): void {
    lines = [...lines.slice(-MAX_LINES + 1), line];
    if (autoScroll) queueMicrotask(scrollToBottom);
  }

  function scrollToBottom(): void {
    if (logBox) logBox.scrollTop = logBox.scrollHeight;
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, then capped at 30s.
  function backoffDelay(attempt: number): number {
    return Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  }

  function scheduleReconnect(): void {
    if (givenUp) return;
    if (retryCount >= MAX_RETRIES) {
      givenUp = true;
      reconnecting = false;
      error = "Disconnected — refresh to retry.";
      return;
    }
    const delay = backoffDelay(retryCount);
    nextRetryMs = delay;
    reconnecting = true;
    retryCount += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  }

  async function connect(): Promise<void> {
    clearReconnectTimer();
    error = "";
    connected = false;
    controller = new AbortController();

    const token = getToken();
    const params = new URLSearchParams();
    if (following) params.set("follow", "1");
    params.set("tail", "200");

    let receivedData = false;

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
        scheduleReconnect();
        return;
      }
      connected = true;
      reconnecting = false;
      nextRetryMs = 0;

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
          if (frame.startsWith("data: ")) {
            appendLine(frame.slice(6));
            receivedData = true;
          }
        }
      }
      // Stream ended cleanly. If we received data, reset the retry budget
      // before reconnecting — otherwise treat as a failed attempt.
      if (receivedData) retryCount = 0;
      connected = false;
      if (following) scheduleReconnect();
    } catch (err) {
      const e = err as Error;
      if (e.name === "AbortError") {
        connected = false;
        return;
      }
      error = e.message ?? "Connection error";
      connected = false;
      scheduleReconnect();
    }
  }

  function start(): void {
    givenUp = false;
    retryCount = 0;
    nextRetryMs = 0;
    lines = [];
    void connect();
  }

  function stopStream(): void {
    clearReconnectTimer();
    controller?.abort();
    controller = null;
    reconnecting = false;
  }

  function toggleFollow(): void {
    following = !following;
    stopStream();
    start();
  }

  function clearLogs(): void {
    lines = [];
  }

  function manualRetry(): void {
    stopStream();
    start();
  }

  onMount(() => {
    start();
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
    {#if givenUp}
      <button
        onclick={manualRetry}
        class="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/20"
      >
        Retry
      </button>
    {/if}
    <span class="text-xs text-slate-400 ml-2">
      {#if connected}
        <span class="inline-block h-2 w-2 rounded-full bg-emerald-500 mr-1.5"></span>
        Streaming
      {:else if reconnecting}
        <span class="inline-block h-2 w-2 rounded-full bg-amber-400 mr-1.5"></span>
        Reconnecting ({retryCount}/{MAX_RETRIES}) — next in {Math.round(nextRetryMs / 1000)}s
      {:else if givenUp}
        <span class="inline-block h-2 w-2 rounded-full bg-red-500 mr-1.5"></span>
        Disconnected
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
