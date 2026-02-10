const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8787";

export type ReminderFrequency = "daily" | "weekly";

export interface ReminderSubscriptionRequest {
  email: string;
  reminderTime: string;
  timezoneOffsetMinutes: number;
  frequency: ReminderFrequency;
  language: "en" | "es";
}

let reminderTimeout: number | null = null;

const REMINDER_TAG = "anglicus-reminder";

async function showReminderNotification(): Promise<void> {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  const title = "Hora de practicar";
  const options = {
    body: "Abre Anglicus y practica unos minutos.",
    tag: REMINDER_TAG,
  };

  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, options);
    return;
  }

  new Notification(title, options);
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

export function stopBrowserReminder(): void {
  if (reminderTimeout !== null) {
    window.clearTimeout(reminderTimeout);
    reminderTimeout = null;
  }
}

function scheduleNextReminder(reminderTime: string): void {
  stopBrowserReminder();

  const [hours, minutes] = reminderTime.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return;

  const now = new Date();
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);

  const delay = next.getTime() - now.getTime();
  reminderTimeout = window.setTimeout(() => {
    void showReminderNotification();
    scheduleNextReminder(reminderTime);
  }, delay);
}

export function startBrowserReminder(reminderTime: string): void {
  if (typeof window === "undefined") return;
  if (!reminderTime) return;
  scheduleNextReminder(reminderTime);
}

export async function showBrowserReminderNow(): Promise<void> {
  await showReminderNotification();
}

export async function subscribeReminders(
  payload: ReminderSubscriptionRequest,
): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/reminders/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function unsubscribeReminders(email: string): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/reminders/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function sendReminderTest(payload: {
  email: string;
  language: "en" | "es";
}): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/reminders/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    return response.ok;
  } catch {
    return false;
  }
}
