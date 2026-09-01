import { PassThrough, Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createHeapSnapshotResponse, waitTillGcFinishes } from "~/services/adminDiagnostics.server";

function performanceEntry(name: string): PerformanceEntry {
  return {
    name,
    entryType: name,
    startTime: 0,
    duration: 1,
    toJSON: () => ({}),
  };
}

function waitForClose(stream: Readable) {
  return new Promise<void>((resolve) => stream.once("close", resolve));
}

function observerHarness() {
  let callback: ((list: Pick<PerformanceObserverEntryList, "getEntries">) => void) | undefined;
  let disconnectCount = 0;

  return {
    createObserver(nextCallback: typeof callback) {
      callback = nextCallback;
      return {
        observe() {},
        disconnect() {
          disconnectCount++;
        },
      };
    },
    emit(...entries: PerformanceEntry[]) {
      callback?.({ getEntries: () => entries });
    },
    get disconnectCount() {
      return disconnectCount;
    },
  };
}

describe("waitTillGcFinishes", () => {
  it("disconnects after the first GC entry", async () => {
    const harness = observerHarness();
    const result = waitTillGcFinishes({
      createObserver: harness.createObserver,
      triggerGc() {},
    });

    harness.emit(performanceEntry("other"));
    expect(harness.disconnectCount).toBe(0);

    const gcEntry = performanceEntry("gc");
    harness.emit(gcEntry);
    await expect(result).resolves.toBe(gcEntry);
    expect(harness.disconnectCount).toBe(1);

    harness.emit(performanceEntry("gc"));
    expect(harness.disconnectCount).toBe(1);
  });

  it("times out and disconnects when no GC entry arrives", async () => {
    const harness = observerHarness();

    await expect(
      waitTillGcFinishes({
        timeoutMs: 5,
        createObserver: harness.createObserver,
        triggerGc() {},
      })
    ).rejects.toThrow("Timed out waiting for GC after 5ms");
    expect(harness.disconnectCount).toBe(1);
  });

  it("disconnects when the request is aborted", async () => {
    const harness = observerHarness();
    const abortController = new AbortController();
    const result = waitTillGcFinishes({
      signal: abortController.signal,
      createObserver: harness.createObserver,
      triggerGc() {},
    });

    abortController.abort();

    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(harness.disconnectCount).toBe(1);
  });

  it("disconnects when triggering GC fails", async () => {
    const harness = observerHarness();
    const failure = new Error("GC unavailable");

    await expect(
      waitTillGcFinishes({
        createObserver: harness.createObserver,
        triggerGc() {
          throw failure;
        },
      })
    ).rejects.toBe(failure);
    expect(harness.disconnectCount).toBe(1);
  });
});

describe("createHeapSnapshotResponse", () => {
  it("streams the snapshot without writing a temporary file", async () => {
    const response = createHeapSnapshotResponse({
      snapshot: Readable.from([Buffer.from("heap snapshot")]),
      filename: "test.heapsnapshot",
      abortSignal: new AbortController().signal,
    });

    await expect(response.text()).resolves.toBe("heap snapshot");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="test.heapsnapshot"'
    );
    expect(response.headers.has("Content-Length")).toBe(false);
  });

  it("destroys the snapshot stream when the request is aborted", async () => {
    const snapshot = new PassThrough();
    const closed = waitForClose(snapshot);
    const abortController = new AbortController();

    createHeapSnapshotResponse({
      snapshot,
      filename: "test.heapsnapshot",
      abortSignal: abortController.signal,
    });
    abortController.abort();

    await closed;
    expect(snapshot.destroyed).toBe(true);
  });

  it("destroys the snapshot stream when the response body is cancelled", async () => {
    const snapshot = new PassThrough();
    const closed = waitForClose(snapshot);
    const response = createHeapSnapshotResponse({
      snapshot,
      filename: "test.heapsnapshot",
      abortSignal: new AbortController().signal,
    });

    await response.body?.cancel().catch((error: unknown) => {
      expect(error).toMatchObject({ name: "AbortError" });
    });
    await closed;
    expect(snapshot.destroyed).toBe(true);
  });
});
