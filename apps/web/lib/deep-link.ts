/**
 * Deep-link resolution for tracking redirects (`/l/[token]`).
 *
 * A tracking link resolves to a typed target (`targetType`) which dictates
 * where the visitor should land:
 *
 * - REEL / POST / STORY → try to open the native iOS app (Universal Link is
 *   automatic; custom scheme `meeshy://p/<id>` / `meeshy://s/<id>` is our
 *   explicit fallback), then fall back to the canonical web route after a
 *   short timeout if the app never takes over.
 * - CONVERSATION → in-app conversation route `/conversations/<id>`.
 * - PROFILE → public profile route `/u/<id>`.
 * - EXTERNAL → the arbitrary `originalUrl` chosen by the link owner.
 *
 * Custom-scheme paths mirror `DeepLinkRouter.swift` (iOS):
 *   meeshy://p/<id>   meeshy://s/<id>   meeshy://c/<id>   meeshy://u/<username>
 *
 * Web fallback routes mirror the Next.js App Router:
 *   /feeds/post/<id>   /conversations/<id>   /u/<id>
 */

export type TrackingTargetType =
  | 'REEL'
  | 'POST'
  | 'STORY'
  | 'CONVERSATION'
  | 'PROFILE'
  | 'EXTERNAL';

/**
 * Shape returned by `GET /tracking-links/:token/resolve`.
 * Contract per spec §21.2 — coded against ahead of the gateway route.
 */
export type TrackingLinkResolution = {
  readonly kind?: string;
  readonly targetType?: string;
  readonly targetId?: string | null;
  readonly originalUrl?: string | null;
  readonly sharerId?: string | null;
  readonly isActive?: boolean;
  readonly expiresAt?: string | null;
};

const APP_TARGET_TYPES: ReadonlySet<TrackingTargetType> = new Set<TrackingTargetType>([
  'REEL',
  'POST',
  'STORY',
]);

/**
 * Normalize a raw `targetType` string (case-insensitive) to a known
 * `TrackingTargetType`, or `null` when unrecognized.
 */
export function normalizeTargetType(raw: unknown): TrackingTargetType | null {
  if (typeof raw !== 'string') return null;
  const upper = raw.trim().toUpperCase();
  switch (upper) {
    case 'REEL':
    case 'POST':
    case 'STORY':
    case 'CONVERSATION':
    case 'PROFILE':
    case 'EXTERNAL':
      return upper;
    default:
      return null;
  }
}

/**
 * `true` when this target should attempt a native-app open before the web
 * fallback (post-family content: REEL, POST, STORY).
 */
export function isAppOpenTarget(targetType: TrackingTargetType): boolean {
  return APP_TARGET_TYPES.has(targetType);
}

/**
 * Build the custom-scheme URL that asks iOS to open the native app at the
 * given target. Returns `null` for targets that have no native shortcut or
 * lack a usable id.
 *
 * STORY → `meeshy://s/<id>`; POST & REEL → `meeshy://p/<id>`.
 */
export function buildAppOpenUrl(
  targetType: TrackingTargetType,
  targetId: string | null | undefined,
): string | null {
  if (!targetId) return null;
  const id = encodeURIComponent(targetId);
  switch (targetType) {
    case 'STORY':
      return `meeshy://s/${id}`;
    case 'POST':
    case 'REEL':
      return `meeshy://p/${id}`;
    default:
      return null;
  }
}

/**
 * Build the same-origin web path (or external URL) the visitor should land
 * on for the given target. Returns `null` when the data is insufficient
 * (e.g. EXTERNAL with no `originalUrl`, or a typed target with no id).
 *
 * The caller is responsible for validating EXTERNAL URLs via
 * `safeExternalUrl` before navigating — this helper does not sanitize.
 */
export function buildWebFallbackTarget(
  targetType: TrackingTargetType,
  targetId: string | null | undefined,
  originalUrl: string | null | undefined,
): string | null {
  switch (targetType) {
    case 'REEL':
    case 'POST':
    case 'STORY':
      return targetId ? `/feeds/post/${encodeURIComponent(targetId)}` : null;
    case 'CONVERSATION':
      return targetId ? `/conversations/${encodeURIComponent(targetId)}` : null;
    case 'PROFILE':
      return targetId ? `/u/${encodeURIComponent(targetId)}` : null;
    case 'EXTERNAL':
      return originalUrl && originalUrl.length > 0 ? originalUrl : null;
    default:
      return null;
  }
}

/**
 * `true` when the resolution describes an expired / deactivated link.
 * `isActive` defaults to active when absent (older payloads omit it).
 */
export function isResolutionExpired(resolution: TrackingLinkResolution): boolean {
  if (resolution.isActive === false) return true;
  if (typeof resolution.expiresAt === 'string' && resolution.expiresAt.length > 0) {
    const expires = Date.parse(resolution.expiresAt);
    if (!Number.isNaN(expires) && expires <= Date.now()) return true;
  }
  return false;
}
