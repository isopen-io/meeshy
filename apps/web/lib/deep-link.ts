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

import type { PostType } from '@meeshy/shared/types/post';

/**
 * #4809 — `PostType` (packages/shared/types/post.ts) porte les quatre valeurs
 * de contenu (POST/REEL/STORY/STATUS) ; CONVERSATION/PROFILE/EXTERNAL n'ont
 * pas d'équivalent amont — un lien de tracking peut aussi cibler une
 * conversation, un profil, ou une URL externe.
 */
export type TrackingTargetType =
  | PostType
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

/**
 * Témoin de dérive (#4809) : `satisfies Record<PostType, true>` exige TOUTES
 * les valeurs de `PostType` — un membre ajouté à la source sans entrée ici
 * fait échouer la compilation À CETTE LIGNE. Coïncide aujourd'hui avec
 * `PostType` en entier (post-family : POST, REEL, STORY, STATUS).
 */
const POST_FAMILY_TARGETS = {
  POST: true,
  REEL: true,
  STORY: true,
  STATUS: true,
} as const satisfies Record<PostType, true>;

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
    case 'STATUS':
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
 * fallback (post-family content — every `PostType`: POST, REEL, STORY, STATUS).
 */
export function isAppOpenTarget(targetType: TrackingTargetType): boolean {
  return targetType in POST_FAMILY_TARGETS;
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
    case 'STATUS':
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
    // Real v1 page per type.
    case 'POST':
      return targetId ? `/post/${encodeURIComponent(targetId)}` : null;
    case 'REEL':
      return targetId ? `/reel/${encodeURIComponent(targetId)}` : null;
    case 'STORY':
      return targetId ? `/story/${encodeURIComponent(targetId)}` : null;
    case 'STATUS':
      return targetId ? `/mood/${encodeURIComponent(targetId)}` : null;
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
