import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Le secret INTERNE partagé passerelle → agent (revue de sécurité de 795c747d98, #10234).
 *
 * Le service agent est publié par Traefik sur staging : une route qui déclenche un appel LLM payant
 * n'est ouverte qu'à qui présente `AGENT_INTERNAL_TOKEN` dans l'en-tête `x-meeshy-internal-token`.
 * - FERMÉE par défaut : un secret absent, vide ou trop court côté agent ⇒ `not-configured` pour TOUT
 *   appel (la route répond 503) — jamais ouverte faute de configuration ;
 * - comparaison à temps constant, sur les empreintes SHA-256 (longueur fixe : la longueur du secret
 *   ne fuit pas non plus) ;
 * - le secret ne vit que dans l'environnement (`${AGENT_INTERNAL_TOKEN}` des compose), jamais dans le dépôt.
 */

export const INTERNAL_TOKEN_HEADER = 'x-meeshy-internal-token';
export const INTERNAL_TOKEN_MIN_LENGTH = 32;

export type InternalAuthVerdict = 'ok' | 'not-configured' | 'refused';

const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

export function usableInternalToken(configured: string | undefined | null): string | null {
  const token = typeof configured === 'string' ? configured.trim() : '';
  return token.length >= INTERNAL_TOKEN_MIN_LENGTH ? token : null;
}

export function checkInternalToken(configured: string | undefined | null, presented: unknown): InternalAuthVerdict {
  const expected = usableInternalToken(configured);
  if (expected === null) return 'not-configured';
  if (typeof presented !== 'string' || presented.length === 0) return 'refused';
  return timingSafeEqual(digest(expected), digest(presented)) ? 'ok' : 'refused';
}

/** Une fenêtre glissante en mémoire : la passerelle est le seul appelant légitime, le plafond est global. */
export function slidingWindowLimiter(options: { readonly max: number; readonly windowMs: number; readonly now?: () => number }) {
  const hits: number[] = [];
  const now = options.now ?? Date.now;
  return {
    take(): boolean {
      const at = now();
      while (hits.length > 0 && at - hits[0]! >= options.windowMs) hits.shift();
      if (hits.length >= options.max) return false;
      hits.push(at);
      return true;
    },
  };
}
