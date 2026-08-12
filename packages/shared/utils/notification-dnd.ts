/**
 * GW7 — timezone-aware Do-Not-Disturb window, SINGLE rule site.
 *
 * Historically duplicated (in UTC) in the gateway's NotificationService
 * (`isDNDActive`) and PushNotificationService (`isPushAllowed`) — both now
 * delegate here. The user's `dndUtcOffsetMinutes` preference shifts the
 * evaluation into their local wall-clock; 0 / absent preserves the legacy
 * UTC behavior for existing preference documents.
 */

export type DndDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type DndPreferences = {
  readonly dndEnabled: boolean;
  /** 'HH:MM' local wall-clock start of the window. */
  readonly dndStartTime: string;
  /** 'HH:MM' local wall-clock end of the window. */
  readonly dndEndTime: string;
  /** Empty = every day. Non-empty = only windows STARTING on these local days. */
  readonly dndDays?: readonly DndDay[];
  /** Minutes to add to UTC to obtain the user's local wall-clock (Tokyo = 540,
   *  New York summer = -240/-300). Absent/0 = evaluate in UTC (legacy). */
  readonly dndUtcOffsetMinutes?: number;
};

const DAY_MAP: readonly DndDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Zero-pad an `H:MM` / `HH:MM` wall-clock string so the lexicographic overnight
 * detection and membership comparisons below stay correct.
 *
 * The write boundaries (`NotificationPreferenceSchemas.update`, the gateway's
 * `notification-schemas`, `isValidDndTime`) all enforce the canonical
 * `HH:MM` form, but documents persisted through the historically-lax shared
 * update schema (single-digit hour, e.g. `"9:00"`) may still exist. Without
 * padding, `"9:00" > "17:00"` is `true` (char `'9'` > `'1'`), flipping a plain
 * daytime window into a spurious overnight block. Padding is local, pure and
 * idempotent on already-canonical values; a shape it cannot parse is returned
 * verbatim, preserving the prior behavior for genuinely malformed input.
 */
function padWallClock(value: string): string {
  const [hours, minutes] = value.split(':');
  if (hours === undefined || minutes === undefined) return value;
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
}

/**
 * True when `nowUtc` falls inside the user's DND window, evaluated in the
 * user's local wall-clock. The `dndDays` filter is tested against the local
 * day the window STARTED: the morning tail (00:00 → end) of an overnight
 * window belongs to the night that began the previous day.
 */
export function isWithinDnd(prefs: DndPreferences, nowUtc: Date = new Date()): boolean {
  if (!prefs.dndEnabled) return false;

  const offsetMinutes = prefs.dndUtcOffsetMinutes ?? 0;
  const local = new Date(nowUtc.getTime() + offsetMinutes * 60_000);
  const currentTime = `${local.getUTCHours().toString().padStart(2, '0')}:${local.getUTCMinutes().toString().padStart(2, '0')}`;

  const start = padWallClock(prefs.dndStartTime);
  const end = padWallClock(prefs.dndEndTime);
  const overnight = start > end;
  const inWindow = overnight
    ? currentTime >= start || currentTime < end
    : currentTime >= start && currentTime < end;

  if (!inWindow) return false;

  if (prefs.dndDays && prefs.dndDays.length > 0) {
    const inMorningTail = overnight && currentTime < end;
    const dayIndex = (inMorningTail ? local.getUTCDay() + 6 : local.getUTCDay()) % 7;
    const windowStartDay = DAY_MAP[dayIndex] ?? 'sun';
    if (!prefs.dndDays.includes(windowStartDay)) return false;
  }

  return true;
}
