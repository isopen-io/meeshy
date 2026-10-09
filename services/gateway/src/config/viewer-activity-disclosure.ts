/**
 * La date de mise en service de la liste des vues ENRICHIE des posts et des
 * réels (#9727, décision porteur 2026-10-09 : « seulement à partir de
 * maintenant »).
 *
 * Avant elle, voir un post ou un réel et en partager le lien étaient des gestes
 * dont l'auteur n'apprenait rien : ils ne lui sont jamais montrés. Les stories
 * gardent tout leur historique — leur liste « Vu par » existait déjà.
 *
 * Elle se lit dans `VIEWER_ACTIVITY_DISCLOSED_SINCE` (ISO 8601), qu'on fixe à
 * la date de PROMOTION EN PRODUCTION. Absente ou vide ⇒ la date par défaut.
 * Illisible ⇒ une date FUTURE : rien du passé n'est montré (fail-closed) — une
 * faute de frappe ne doit jamais ouvrir l'historique.
 *
 * Mémoïsée sur la valeur BRUTE (même patron que `read-exactness-config.ts`) :
 * l'hôte déplace la date sans redémarrer de code.
 */

import { enhancedLogger } from '../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'viewer-activity-disclosure' });

export const VIEWER_ACTIVITY_DISCLOSED_SINCE_ENV = 'VIEWER_ACTIVITY_DISCLOSED_SINCE';

export const DEFAULT_VIEWER_ACTIVITY_DISCLOSED_SINCE = new Date('2026-10-10T00:00:00.000Z');

/** Ce qu'une valeur illisible sert : aucune activité passée n'est postérieure. */
export const NOTHING_DISCLOSED_SINCE = new Date('9999-12-31T23:59:59.999Z');

const ISO_8601 = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/;

export function parseViewerActivityDisclosedSince(raw: string | undefined): Date {
  const value = raw?.trim() ?? '';
  if (value === '') return DEFAULT_VIEWER_ACTIVITY_DISCLOSED_SINCE;
  const parsed = ISO_8601.test(value) ? new Date(value) : null;
  if (parsed === null || Number.isNaN(parsed.getTime())) {
    logger.warn(
      `[viewer-activity] ${VIEWER_ACTIVITY_DISCLOSED_SINCE_ENV} illisible ("${value}") — aucune vue ni aucun partage passés ne sont montrés`,
    );
    return NOTHING_DISCLOSED_SINCE;
  }
  return parsed;
}

let cachedRaw: string | undefined;
let cachedSince: Date = DEFAULT_VIEWER_ACTIVITY_DISCLOSED_SINCE;
let cached = false;

export function viewerActivityDisclosedSince(): Date {
  const raw = process.env[VIEWER_ACTIVITY_DISCLOSED_SINCE_ENV];
  if (cached && raw === cachedRaw) return cachedSince;
  cachedRaw = raw;
  cachedSince = parseViewerActivityDisclosedSince(raw);
  cached = true;
  return cachedSince;
}

/**
 * Les types dont la liste des vues garde tout son historique. Tout autre type —
 * POST, REEL, et un type que ce code ne connaîtrait pas encore — est borné.
 */
const HISTORY_KEPT_TYPES: ReadonlySet<string> = new Set(['STORY', 'STATUS']);

/**
 * La borne à appliquer aux vues et aux partages par lien d'un contenu, ou
 * `null` quand son historique entier se montre (story, statut).
 */
export function activityDisclosureFloor(postType: string | null | undefined, since: Date): Date | null {
  return typeof postType === 'string' && HISTORY_KEPT_TYPES.has(postType) ? null : since;
}
