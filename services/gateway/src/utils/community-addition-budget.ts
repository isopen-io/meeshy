/**
 * Le budget des AJOUTS SANS ACCORD à une communauté (#19812).
 *
 * Deux routes font entrer quelqu'un dans une communauté sans lui demander son
 * avis : `POST /communities/:id/invite` (tout membre d'une communauté publique,
 * un administrateur ou un modérateur d'une privée) et
 * `POST /communities/:id/members` (un administrateur). Chaque ajout réussi
 * écrit une ligne `CommunityMember`, élève la personne au niveau `COMMUNITY`
 * avec tous les membres, et pousse une notification `community_invite` qui
 * NOMME l'acteur. Seul le plafond global par IP les bornait : un compte pouvait
 * ajouter des centaines de personnes par heure à une communauté publique qu'il
 * ne dirige pas, et leur pousser autant de bannières à son nom.
 *
 * Ce module compte donc ce que le geste PRODUIT, des deux côtés :
 *
 * | seau | clé | fenêtre | plafond | ce qu'il laisse passer |
 * |---|---|---|---|---|
 * | acteur | qui ajoute | 1 heure | 30 | peupler une communauté qu'on vient de créer avec ses proches |
 * | acteur | qui ajoute | 24 heures | 100 | trois ou quatre communautés montées dans la journée |
 * | cible | qui est ajouté | 24 heures | 10 | être ajouté à dix communautés par jour, par n'importe qui |
 *
 * Les deux routes partagent les MÊMES seaux : passer de l'une à l'autre ne
 * rouvre aucun quota. La notification n'a pas de borne propre : elle part une
 * fois par ajout réussi, donc borner les ajouts la borne (décision écrite).
 *
 * L'ordre de débit est une décision :
 *  · le seau ACTEUR est débité AVANT la porte `isAddableUser`, une tentative
 *    vers un compte inconnu, bloqué ou mineur comptant autant qu'un ajout —
 *    sans quoi la porte deviendrait un sondage gratuit des comptes ajoutables ;
 *  · le seau CIBLE n'est débité que pour un ajout qui va ÉCRIRE, et jamais
 *    quand l'acteur est déjà refusé : un acteur obstiné ne doit pas pouvoir
 *    épuiser le quota d'une victime pour empêcher ses vrais proches de l'ajouter.
 *
 * Le refus est un 429 dans l'enveloppe `sendError`, `code`
 * `COMMUNITY_ADDITION_BUDGET_EXCEEDED`, avec `Retry-After`. Le même code sert
 * les deux seaux : dire à l'acteur que c'est la CIBLE qui est saturée lui
 * apprendrait que d'autres l'ajoutent.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { createCustomRateLimiter, type RateLimiter, type RateLimitInfo } from './rate-limiter';
import { sendError } from './response';

export const COMMUNITY_ADDITION_BUDGET = {
  actorPerHour: 30,
  actorPerDay: 100,
  targetPerDay: 10,
} as const;

export const COMMUNITY_ADDITION_BUDGET_CODE = 'COMMUNITY_ADDITION_BUDGET_EXCEEDED';

const HEURE_MS = 60 * 60 * 1000;
const JOUR_MS = 24 * HEURE_MS;

type Seaux = {
  readonly acteurHeure: RateLimiter;
  readonly acteurJour: RateLimiter;
  readonly cibleJour: RateLimiter;
};

/**
 * UN jeu de seaux par SERVEUR (même raison que `contact-identifier-budget.ts`) :
 * sans Redis, chaque limiteur a son magasin mémoire, et les deux routes vivent
 * dans deux modules enregistrés séparément.
 */
const SEAUX = new WeakMap<object, Seaux>();

function seaux(fastify: FastifyInstance): Seaux {
  const existants = SEAUX.get(fastify.server);
  if (existants) return existants;
  const redis = fastify.redis ?? undefined;
  const crees: Seaux = {
    acteurHeure: createCustomRateLimiter(
      { max: COMMUNITY_ADDITION_BUDGET.actorPerHour, windowMs: HEURE_MS, keyPrefix: 'communities:additions:actor:h' },
      redis
    ),
    acteurJour: createCustomRateLimiter(
      { max: COMMUNITY_ADDITION_BUDGET.actorPerDay, windowMs: JOUR_MS, keyPrefix: 'communities:additions:actor:d' },
      redis
    ),
    cibleJour: createCustomRateLimiter(
      { max: COMMUNITY_ADDITION_BUDGET.targetPerDay, windowMs: JOUR_MS, keyPrefix: 'communities:additions:target:d' },
      redis
    ),
  };
  SEAUX.set(fastify.server, crees);
  return crees;
}

/** `retryAfter` vaut 0 quand le geste passe (le gateway compile sans `strictNullChecks`). */
export type CommunityAdditionVerdict = { readonly allowed: boolean; readonly retryAfter: number };

function verdictOf(infos: ReadonlyArray<RateLimitInfo | null>): CommunityAdditionVerdict {
  const depasses = infos.flatMap((info) => (info?.retryAfter !== undefined ? [info.retryAfter] : []));
  if (depasses.length === 0) return { allowed: true, retryAfter: 0 };
  return { allowed: false, retryAfter: Math.max(...depasses) };
}

/**
 * Débite UNE tentative d'ajout sur les deux fenêtres de l'ACTEUR. Les deux sont
 * débitées même quand l'une refuse : une tentative refusée a été REÇUE.
 */
export async function spendCommunityAdditionByActor(
  fastify: FastifyInstance,
  actorId: string
): Promise<CommunityAdditionVerdict> {
  const { acteurHeure, acteurJour } = seaux(fastify);
  const cle = `user:${actorId}`;
  return verdictOf(await Promise.all([acteurHeure.consume(cle, 1), acteurJour.consume(cle, 1)]));
}

/** Débite UN ajout qui va écrire sur le seau de la personne AJOUTÉE, tous acteurs confondus. */
export async function spendCommunityAdditionOfTarget(
  fastify: FastifyInstance,
  targetId: string
): Promise<CommunityAdditionVerdict> {
  const { cibleJour } = seaux(fastify);
  return verdictOf([await cibleJour.consume(`user:${targetId}`, 1)]);
}

export function refuseCommunityAddition(reply: FastifyReply, retryAfter: number): void {
  reply.header('Retry-After', String(retryAfter));
  sendError(reply, 429, 'Trop d’ajouts à une communauté. Réessayez plus tard.', {
    code: COMMUNITY_ADDITION_BUDGET_CODE,
  });
}
