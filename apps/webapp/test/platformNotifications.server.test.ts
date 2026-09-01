import { describe, expect, it } from "vitest";
import { isCliNotificationExpired } from "~/utils/platformNotificationExpiration";

const notification = {
  id: "notification_1",
  cliMaxDaysAfterFirstSeen: null,
  cliMaxShowCount: 1,
};

const interaction = {
  userId: "user_1",
  firstSeenAt: new Date(),
  showCount: 1,
  cliDismissedAt: null,
};

describe("isCliNotificationExpired", () => {
  it("waits for dismissal persistence before reporting the notification as expired", async () => {
    let releasePersistence: (() => void) | undefined;
    let persistenceStarted = false;
    let settled = false;

    const result = isCliNotificationExpired(interaction, notification, () => {
      persistenceStarted = true;
      return new Promise<void>((resolve) => {
        releasePersistence = resolve;
      });
    });
    void result.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(persistenceStarted).toBe(true);
    expect(settled).toBe(false);

    releasePersistence?.();
    await expect(result).resolves.toBe(true);
  });

  it("propagates persistence failures through the awaited request path", async () => {
    const failure = new Error("database unavailable");

    await expect(
      isCliNotificationExpired(interaction, notification, async () => {
        throw failure;
      })
    ).rejects.toBe(failure);
  });

  it("does not persist a dismissal for an active notification", async () => {
    await expect(
      isCliNotificationExpired({ ...interaction, showCount: 0 }, notification, async () => {
        throw new Error("persistence should not run");
      })
    ).resolves.toBe(false);
  });
});
