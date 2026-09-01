type PersistCliNotificationDismissal = (input: {
  notificationId: string;
  userId: string;
}) => Promise<unknown>;

export async function isCliNotificationExpired(
  interaction: {
    userId: string;
    firstSeenAt: Date;
    showCount: number;
    cliDismissedAt: Date | null;
  } | null,
  notification: {
    id: string;
    cliMaxDaysAfterFirstSeen: number | null;
    cliMaxShowCount: number | null;
  },
  persistDismissal: PersistCliNotificationDismissal
): Promise<boolean> {
  if (!interaction) return false;

  let expired = false;

  if (
    notification.cliMaxShowCount !== null &&
    interaction.showCount >= notification.cliMaxShowCount
  ) {
    expired = true;
  }

  if (!expired && notification.cliMaxDaysAfterFirstSeen !== null) {
    const daysSinceFirstSeen =
      (Date.now() - interaction.firstSeenAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceFirstSeen > notification.cliMaxDaysAfterFirstSeen) {
      expired = true;
    }
  }

  if (expired && !interaction.cliDismissedAt) {
    await persistDismissal({
      notificationId: notification.id,
      userId: interaction.userId,
    });
  }

  return expired;
}
