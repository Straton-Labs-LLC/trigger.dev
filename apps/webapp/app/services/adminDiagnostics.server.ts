import { trail } from "agentcrumbs"; // @crumbs
import { PerformanceObserver } from "node:perf_hooks";
import { Readable } from "node:stream";
import { runInNewContext } from "node:vm";
import v8 from "node:v8";

const crumb = trail("webapp"); // @crumbs

const DEFAULT_GC_TIMEOUT_MS = 10_000;

type GcPerformanceEntryList = Pick<PerformanceObserverEntryList, "getEntries">;

type GcObserver = {
  observe(options: Parameters<PerformanceObserver["observe"]>[0]): void;
  disconnect(): void;
};

type WaitTillGcFinishesOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
  createObserver?: (callback: (list: GcPerformanceEntryList) => void) => GcObserver;
  triggerGc?: () => void;
};

function triggerGarbageCollection() {
  v8.setFlagsFromString("--expose-gc");

  try {
    const gc = global.gc ?? runInNewContext("gc");
    gc();
  } finally {
    v8.setFlagsFromString("--noexpose-gc");
  }
}

function abortError() {
  const error = new Error("GC diagnostic request aborted");
  error.name = "AbortError";
  return error;
}

export function waitTillGcFinishes({
  timeoutMs = DEFAULT_GC_TIMEOUT_MS,
  signal,
  createObserver = (callback) => new PerformanceObserver((list) => callback(list)),
  triggerGc = triggerGarbageCollection,
}: WaitTillGcFinishesOptions = {}): Promise<PerformanceEntry> {
  return new Promise((resolve, reject) => {
    let observer: GcObserver | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const cleanup = () => {
      observer?.disconnect();
      signal?.removeEventListener("abort", onAbort);
      if (timeout) clearTimeout(timeout);
    };

    const settle = (complete: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      complete();
    };

    const onAbort = () => {
      crumb("GC diagnostic request aborted"); // @crumbs
      settle(() => reject(abortError()));
    };

    try {
      observer = createObserver((list) => {
        const entry = list.getEntries().find((candidate) => candidate.name === "gc");
        if (!entry) return;

        crumb("GC diagnostic event observed", { duration: entry.duration }); // @crumbs
        settle(() => resolve(entry));
      });

      observer.observe({ entryTypes: ["gc"] });
      if (settled) return;

      if (signal?.aborted) {
        onAbort();
        return;
      }

      signal?.addEventListener("abort", onAbort, { once: true });
      timeout = setTimeout(() => {
        crumb("GC diagnostic timed out", { timeoutMs }); // @crumbs
        settle(() => reject(new Error(`Timed out waiting for GC after ${timeoutMs}ms`)));
      }, timeoutMs);

      triggerGc();
    } catch (error) {
      settle(() => reject(error));
    }
  });
}

export function createHeapSnapshotResponse({
  snapshot,
  filename,
  abortSignal,
}: {
  snapshot: Readable;
  filename: string;
  abortSignal: AbortSignal;
}) {
  const body = Readable.toWeb(snapshot) as ReadableStream<Uint8Array>;

  const cleanup = () => {
    abortSignal.removeEventListener("abort", onAbort);
    snapshot.off("close", cleanup);
    snapshot.off("end", cleanup);
    snapshot.off("error", cleanup);
  };

  const onAbort = () => {
    crumb("heap snapshot download aborted"); // @crumbs
    snapshot.destroy();
    cleanup();
  };

  snapshot.once("close", cleanup);
  snapshot.once("end", cleanup);
  snapshot.once("error", cleanup);
  abortSignal.addEventListener("abort", onAbort, { once: true });

  if (abortSignal.aborted) {
    onAbort();
  }

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
