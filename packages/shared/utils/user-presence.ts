/**
 * Présence utilisateur — SOURCE DE VÉRITÉ cross-platform (web + gateway).
 * Miroirs plateforme : iOS `UserPresence.state(now:)` (PresenceModels.swift),
 * Android `UserPresence.state(nowEpochMillis)` (Presence.kt). Toute évolution
 * de la règle doit toucher les trois sites.
 *
 * Règle produit (1/3/5 — 2026-07-20) :
 *   isOnline === true  -> 'online'  (vert, pulse) — le backend maintient ce flag
 *                          pour toute session connectée ; il est autoritatif,
 *                          gardé contre les données périmées via la fenêtre idle
 *                          (un isOnline=true avec lastActiveAt > 5 min est
 *                          incohérent -> décroissance temporelle)
 *   delta <= 60s       -> 'online'  (vert, pulse)
 *   delta <= 3min      -> 'away'    (orange)
 *   delta <= 5min      -> 'idle'    (gris AFFICHÉ)
 *   delta > 5min       -> 'offline' (AUCUN dot — rien n'est rendu)
 *
 * Le gateway gèle lastActiveAt à la déconnexion, donc la décroissance
 * vert -> orange -> gris démarre au dernier instant d'activité réelle.
 * Un typing:start reçu vaut activité immédiate : les clients doivent forcer
 * localement isOnline=true + lastActiveAt=now pour l'émetteur.
 */

export type UserPresenceStatus = 'online' | 'away' | 'idle' | 'offline';

/** Ton sémantique unique dérivé du statut — vert / orange / gris. */
export type PresenceTone = 'success' | 'warning' | 'muted';

export type UserPresenceSource = {
  isOnline?: boolean | null;
  lastActiveAt?: Date | string | number | null;
};

export const PRESENCE_ONLINE_WINDOW_MS = 60 * 1000; // 1 min
export const PRESENCE_AWAY_WINDOW_MS = 3 * 60 * 1000; // 3 min
export const PRESENCE_IDLE_WINDOW_MS = 5 * 60 * 1000; // 5 min

/**
 * Couleurs de référence, identiques sur les trois plateformes :
 * iOS MeeshyColors.success/.warning/.neutral400, Android MeeshyPalette
 * Success/Warning/Neutral400, web emerald-400/amber-400/gray-400.
 */
export const PRESENCE_HEX = {
  success: '#34D399',
  warning: '#FBBF24',
  muted: '#9CA3AF',
} as const;

const PRESENCE_TONE: Record<UserPresenceStatus, PresenceTone> = {
  online: 'success',
  away: 'warning',
  idle: 'muted',
  offline: 'muted',
};

export function getUserPresenceStatus(
  source: UserPresenceSource | null | undefined,
  now: number = Date.now(),
): UserPresenceStatus {
  if (!source) return 'offline';

  const { isOnline, lastActiveAt } = source;
  const parsedElapsed =
    lastActiveAt === null || lastActiveAt === undefined
      ? null
      : now - new Date(lastActiveAt).getTime();
  // Un timestamp illisible (NaN) est traité comme absent, pas comme une
  // distance infinie — sinon `elapsed <= X` vaut toujours false pour NaN et la
  // fonction retombe sur 'offline' même si isOnline=true, contrairement à
  // Android (isoToEpochMillisOrNull retourne null sur parse-échec).
  const elapsed = parsedElapsed === null || Number.isNaN(parsedElapsed) ? null : parsedElapsed;

  if (isOnline === true && (elapsed === null || elapsed <= PRESENCE_IDLE_WINDOW_MS)) {
    return 'online';
  }
  if (elapsed === null) return 'offline';
  if (elapsed <= PRESENCE_ONLINE_WINDOW_MS) return 'online';
  if (elapsed <= PRESENCE_AWAY_WINDOW_MS) return 'away';
  if (elapsed <= PRESENCE_IDLE_WINDOW_MS) return 'idle';
  return 'offline';
}

export function presenceTone(status: UserPresenceStatus): PresenceTone {
  return PRESENCE_TONE[status];
}

/** États "actifs" (< 5 min, un dot est rendu) : online + away + idle. */
export function isPresenceActive(status: UserPresenceStatus): boolean {
  return status !== 'offline';
}

/** Seul 'online' (connecté ou actif <= 60s) pulse. */
export function isPresencePulsing(status: UserPresenceStatus): boolean {
  return status === 'online';
}
