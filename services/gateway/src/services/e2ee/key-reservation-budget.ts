/**
 * LE BUDGET DES RÉSERVATIONS DE BUNDLES (constat GW-01 de la revue E2EE du
 * 2026-11-17, #18906) — `GET /e2ee/keys/:userId` seulement : les clients publiés
 * lisent encore `/signal/keys`, qui ne sert qu'un bundle statique, sans pré-clé
 * à épuiser (#9223).
 *
 * Chaque bundle réserve une pré-clé UNIQUE par appareil de la cible. La limite
 * de la route ne bornait que le COUPLE (demandeur, cible), et
 * `@fastify/rate-limit` la monte À LA PLACE du limiteur global : un seul compte,
 * d'une seule IP, réservait 330 bundles en une minute sur 11 cibles.
 *
 * | seau | fenêtre | plafond | au-delà |
 * |---|---|---|---|
 * | demandeur, toutes cibles | 1 minute | 60 | `429 E2EE_KEYS_BUDGET_EXCEEDED`, `Retry-After` |
 * | demandeur, toutes cibles | 24 heures | 600 | idem |
 * | cible, tous demandeurs | 1 heure | 30 | bundle de DERNIER RECOURS : aucune pré-clé unique consommée |
 *
 * Un appareil lit un bundle par appareil de son correspondant, au premier
 * message et après un écart Sesame : le cas nominal reste loin de ces plafonds.
 *
 * Le seau de la CIBLE ne refuse jamais : un refus ferait de quelques comptes
 * complices de quoi rendre une personne injoignable. Au-delà, PQXDH tient sur la
 * pré-clé signée et la Kyber de dernier recours, comme quand le stock est vide :
 * le stock cesse de fondre et la personne reste joignable. Jamais une pré-clé
 * déjà réservée n'est resservie : son destinataire l'efface au premier usage, et
 * un second message qui la citerait serait perdu.
 *
 * Soi-même (ses autres appareils) n'est compté dans aucun seau. Une panne du
 * magasin de compteurs laisse passer le DEMANDEUR, comme chaque limiteur de la
 * passerelle ; le seau de la CIBLE se replie alors sur le dernier recours (audit
 * de #19080, E4) : il ne refuse personne et ne consomme aucune pré-clé, là où
 * « laisser passer » laissait fondre le stock sans compter. La limitation
 * désactivée hors production (`RATE_LIMIT_DISABLED`) n'est pas une panne.
 */
import type { Redis } from 'ioredis';
import { createCustomRateLimiter, rateLimitDisabled, type RateLimitInfo } from '../../utils/rate-limiter';

export const E2EE_KEY_RESERVATION_BUDGET = {
  requesterPerMinute: 60,
  requesterPerDay: 600,
  targetPerHour: 30,
} as const;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * `requesterAllowed` faux : le demandeur patiente `retryAfter` secondes.
 * `spendOneTimeKeys` faux : le bundle est de dernier recours.
 */
export type KeyReservationVerdict = {
  readonly requesterAllowed: boolean;
  readonly retryAfter: number;
  readonly spendOneTimeKeys: boolean;
};

export type KeyReservationBudget = {
  spend(params: { readonly requesterUserId: string; readonly targetUserId: string }): Promise<KeyReservationVerdict>;
};

const exceededAfter = (infos: readonly (RateLimitInfo | null)[]): readonly number[] =>
  infos.flatMap((info) => (info?.retryAfter !== undefined ? [info.retryAfter] : []));

export function createKeyReservationBudget(redis?: Redis): KeyReservationBudget {
  const perMinute = createCustomRateLimiter(
    { max: E2EE_KEY_RESERVATION_BUDGET.requesterPerMinute, windowMs: MINUTE_MS, keyPrefix: 'e2ee:keys:requester:m' },
    redis,
  );
  const perDay = createCustomRateLimiter(
    { max: E2EE_KEY_RESERVATION_BUDGET.requesterPerDay, windowMs: DAY_MS, keyPrefix: 'e2ee:keys:requester:d' },
    redis,
  );
  const perTarget = createCustomRateLimiter(
    { max: E2EE_KEY_RESERVATION_BUDGET.targetPerHour, windowMs: HOUR_MS, keyPrefix: 'e2ee:keys:target:h' },
    redis,
  );
  return {
    async spend({ requesterUserId, targetUserId }) {
      if (requesterUserId === targetUserId) return { requesterAllowed: true, retryAfter: 0, spendOneTimeKeys: true };
      // Les deux fenêtres sont débitées même quand la première refuse : un balayage
      // obstiné ne devient pas gratuit sur l'autre fenêtre.
      const requester = `user:${requesterUserId}`;
      const exceeded = exceededAfter(await Promise.all([perMinute.consume(requester, 1), perDay.consume(requester, 1)]));
      if (exceeded.length > 0) return { requesterAllowed: false, retryAfter: Math.max(...exceeded), spendOneTimeKeys: false };
      const target = await perTarget.consume(`user:${targetUserId}`, 1);
      const spendOneTimeKeys = target === null ? rateLimitDisabled() : target.retryAfter === undefined;
      return { requesterAllowed: true, retryAfter: 0, spendOneTimeKeys };
    },
  };
}
