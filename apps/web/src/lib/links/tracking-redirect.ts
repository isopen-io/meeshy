import type { ApiResult } from '@/lib/api/http';
import { isUnreachable } from '@/lib/api/link-failure';

/**
 * **OÙ MÈNE UN LIEN SUIVI `/l/:token`** (#6714) — une loi PURE : les deux
 * réponses que la page legacy attendait en parallèle
 * (`apps/web/app/l/[token]/page.tsx`) entrent, une issue sort.
 *
 * - `POST /tracking-links/:token/click` COMPTE le clic et rend la cible ;
 * - `GET /tracking-links/:token/resolve` dit la nature du lien (suivi, ou
 *   invitation de conversation) et s'il est encore actif.
 *
 * **Une cible qui n'est pas une adresse web ne sort JAMAIS.** La destination
 * d'un lien suivi est choisie par la personne qui l'a créé, c'est-à-dire par
 * un AUTRE utilisateur : un `javascript:` remis à `location.replace`
 * s'exécuterait sur l'origine de Meeshy, contre la session du lecteur. Le
 * parseur WHATWG décide du schéma, jamais un préfixe de chaîne : il retire
 * tabulations, retours et espaces de bord AVANT de lire le schéma, et
 * `java\tscript:` est un `javascript:` pour lui. Une cible refusée est un lien
 * MORT — la page ne propose aucun « continuer quand même ».
 *
 * **Un lien désactivé ne rouvre pas sa destination.** Le legacy offrait
 * « Continuer vers la destination » sur un lien expiré. Or la passerelle
 * désactive elle-même des liens dont le contenu a été retiré
 * (`messageRemovalEffects.ts`, `deactivateOrphanedTrackingLinks`) : rouvrir la
 * cible contournerait la modération. La page le DIT, et c'est tout.
 *
 * **Une passerelle en échec n'est pas un lien mort.** Un lecteur hors ligne
 * qui atterrirait sur « ce lien n'existe plus » croirait le lien cassé et ne
 * réessaierait jamais. Seul un refus qui RÉPOND sur le lien lui-même (400,
 * 404, 410, ou une résolution inactive) le déclare mort.
 *
 * **Le clic en panne ne retient pas le lecteur.** Si la résolution sert une
 * cible sûre alors que le comptage a échoué, le lecteur part : un clic non
 * compté coûte une ligne de statistique, un lecteur bloqué coûte le lien.
 */

export type TrackingClick = { readonly originalUrl: string | null };

export type TrackingResolution = {
  readonly kind: 'tracking' | 'conversation';
  readonly originalUrl: string | null;
  readonly isActive: boolean;
};

export type TrackingOutcome =
  | { readonly kind: 'leave'; readonly target: string }
  | { readonly kind: 'join'; readonly linkId: string }
  | { readonly kind: 'dead' }
  | { readonly kind: 'offline' }
  | { readonly kind: 'unavailable' };

/** La forme que la passerelle accepte (`routes/tracking-links/tracking.ts`, `pattern`). */
const TRACKING_TOKEN = /^[a-zA-Z0-9_-]{2,50}$/;

export const isTrackingToken = (token: string): boolean => TRACKING_TOKEN.test(token);

const WEB_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

export function safeExternalTarget(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const parsed = new URL(raw);
    return WEB_PROTOCOLS.has(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

const DEAD: TrackingOutcome = { kind: 'dead' };

/** Les refus qui répondent sur le LIEN, et non sur le chemin qui y mène. */
const DEAD_STATUSES: ReadonlySet<number> = new Set([400, 404, 410]);

const targetOf = (result: ApiResult<{ readonly originalUrl: string | null }>): string | null =>
  result.ok ? safeExternalTarget(result.data.originalUrl) : null;

export function decideTrackingRedirect(input: {
  readonly token: string;
  readonly click: ApiResult<TrackingClick>;
  readonly resolution: ApiResult<TrackingResolution>;
}): TrackingOutcome {
  const { token, click, resolution } = input;
  if (!isTrackingToken(token)) return DEAD;
  if (resolution.ok && !resolution.data.isActive) return DEAD;

  const target = targetOf(click) ?? targetOf(resolution);
  if (target !== null) return { kind: 'leave', target };
  if (resolution.ok && resolution.data.kind === 'conversation') return { kind: 'join', linkId: token };
  if (click.ok || resolution.ok) return DEAD;

  if (DEAD_STATUSES.has(click.status) || DEAD_STATUSES.has(resolution.status)) return DEAD;
  return isUnreachable(click) && isUnreachable(resolution) ? { kind: 'offline' } : { kind: 'unavailable' };
}
