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
 * Redis en panne : `consume` rend `null` et le geste PASSE (fail-open), le même
 * choix que `middleware()` et `contact-identifier-budget.ts` — un débit est une
 * borne d'abus, pas une garde d'autorisation, et les refus d'accès restent en
 * amont.
 *
 * #20464 — deux autres portes font entrer quelqu'un sans son accord, et
 * débitent les MÊMES seaux : créer un salon dans une communauté
 * (`POST /conversations` avec `communityId`, jusqu'à 250 participants par
 * requête) et rattacher une conversation à une communauté privée
 * (`POST /communities/:id/conversations/:conversationId`). Un lot coûte à
 * l'acteur autant d'unités qu'il fait ENTRER de personnes (les membres actifs
 * ne coûtent rien) et une unité au seau de chacune. Un lot refusé n'écrit rien,
 * ne coûte à l'acteur qu'UNE tentative (sans quoi une requête trop grosse le
 * fermerait pour la journée) et rend ce qu'il avait pris aux cibles.
 *
 * Le seau d'une cible compte des PAIRES (communauté, personne) distinctes dans
 * la journée : être ajouté, retiré puis rajouté à la même communauté ne compte
 * qu'une fois. Sans quoi un administrateur qui ajoute et retire dix fois la même
 * personne épuisait son quota, et ses vrais proches recevaient 429 pendant 24 h.
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
  /** Une paire (communauté, cible) déjà comptée aujourd'hui : plafond 1, il ne sert qu'à SE SOUVENIR. */
  readonly paireJour: RateLimiter;
};

/**
 * UN jeu de seaux par SERVEUR (même raison que `contact-identifier-budget.ts`) :
 * sans Redis, chaque limiteur a son magasin mémoire, et les deux routes vivent
 * dans deux modules enregistrés séparément.
 */
const SEAUX = new WeakMap<object, Seaux>();

function seaux(fastify: FastifyInstance): Seaux {
  // Un double de test sans `server` garde ses seaux sur l'instance elle-même.
  const porteur: object = fastify.server ?? fastify;
  const existants = SEAUX.get(porteur);
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
    paireJour: createCustomRateLimiter(
      { max: 1, windowMs: JOUR_MS, keyPrefix: 'communities:additions:pair:d' },
      redis
    ),
  };
  SEAUX.set(porteur, crees);
  return crees;
}

/** `retryAfter` vaut 0 quand le geste passe (le gateway compile sans `strictNullChecks`). */
export type CommunityAdditionVerdict = { readonly allowed: boolean; readonly retryAfter: number };

function verdictOf(infos: ReadonlyArray<RateLimitInfo | null>): CommunityAdditionVerdict {
  const depasses = infos.flatMap((info) => (info?.retryAfter !== undefined ? [info.retryAfter] : []));
  if (depasses.length === 0) return { allowed: true, retryAfter: 0 };
  return { allowed: false, retryAfter: Math.max(...depasses) };
}

const canonique = (id: string): string => id.trim().toLowerCase();

/**
 * Débite `cost` tentatives d'ajout (une par défaut) sur les deux fenêtres de
 * l'ACTEUR. Les deux sont débitées même quand l'une refuse : une tentative
 * refusée a été REÇUE.
 */
export async function spendCommunityAdditionByActor(
  fastify: FastifyInstance,
  actorId: string,
  cost = 1
): Promise<CommunityAdditionVerdict> {
  const { acteurHeure, acteurJour } = seaux(fastify);
  const cle = `user:${actorId}`;
  return verdictOf(await Promise.all([acteurHeure.consume(cle, cost), acteurJour.consume(cle, cost)]));
}

async function releaseByActor(fastify: FastifyInstance, actorId: string, cost: number): Promise<void> {
  const { acteurHeure, acteurJour } = seaux(fastify);
  const cle = `user:${actorId}`;
  await Promise.all([acteurHeure.release(cle, cost), acteurJour.release(cle, cost)]);
}

/** Ce qu'une cible a coûté, pour le rendre si le lot qui la porte est refusé. */
type TargetSpend = { readonly verdict: CommunityAdditionVerdict; readonly undo: () => Promise<void> };

const NOTHING_TO_UNDO = async (): Promise<void> => undefined;

async function spendOneTarget(fastify: FastifyInstance, communityId: string, targetId: string): Promise<TargetSpend> {
  const { cibleJour, paireJour } = seaux(fastify);
  const clePaire = `${canonique(communityId)}:${canonique(targetId)}`;
  const cleCible = `user:${canonique(targetId)}`;
  const paire = await paireJour.consume(clePaire, 1);
  if (paire?.retryAfter !== undefined) {
    return { verdict: { allowed: true, retryAfter: 0 }, undo: NOTHING_TO_UNDO };
  }
  const undoPaire = async () => { if (paire) await paireJour.release(clePaire, 1); };
  const cible = await cibleJour.consume(cleCible, 1);
  const verdict = verdictOf([cible]);
  if (!verdict.allowed) {
    await undoPaire();
    return { verdict, undo: NOTHING_TO_UNDO };
  }
  return {
    verdict,
    undo: async () => {
      await undoPaire();
      if (cible) await cibleJour.release(cleCible, 1);
    },
  };
}

/**
 * Débite UN ajout qui va écrire sur le seau de la personne AJOUTÉE, tous acteurs
 * confondus, une fois par paire (communauté, personne) et par jour (#20464). Les
 * clés sont les ObjectId CANONIQUES (minuscules) : la base décode l'hexadécimal
 * sans tenir compte de la casse, et une clé brute laissait chaque variante de
 * casse ouvrir un seau neuf pour la même personne.
 */
export async function spendCommunityAdditionOfTarget(
  fastify: FastifyInstance,
  communityId: string,
  targetId: string
): Promise<CommunityAdditionVerdict> {
  return (await spendOneTarget(fastify, communityId, targetId)).verdict;
}

/**
 * Débite un LOT d'entrées sans accord (#20464) : `targetIds` sont les personnes
 * qui vont ENTRER (pas les membres actifs, pas l'acteur lui-même). Tout ou rien :
 * un refus rend ce que le lot a pris aux cibles et ne laisse à l'acteur qu'une
 * tentative.
 */
export async function spendCommunityAdditionBatch(
  fastify: FastifyInstance,
  batch: { readonly actorId: string; readonly communityId: string; readonly targetIds: readonly string[] }
): Promise<CommunityAdditionVerdict> {
  const targets = [...new Set(batch.targetIds.map(canonique))];
  if (targets.length === 0) return { allowed: true, retryAfter: 0 };
  const byActor = await spendCommunityAdditionByActor(fastify, batch.actorId, targets.length);
  if (!byActor.allowed) {
    await releaseByActor(fastify, batch.actorId, targets.length - 1);
    return byActor;
  }
  const spent: TargetSpend[] = [];
  for (const targetId of targets) {
    const spend = await spendOneTarget(fastify, batch.communityId, targetId);
    if (!spend.verdict.allowed) {
      await Promise.all(spent.map((s) => s.undo()));
      await releaseByActor(fastify, batch.actorId, targets.length - 1);
      return spend.verdict;
    }
    spent.push(spend);
  }
  return { allowed: true, retryAfter: 0 };
}

export function refuseCommunityAddition(reply: FastifyReply, retryAfter: number): void {
  reply.header('Retry-After', String(retryAfter));
  sendError(reply, 429, 'Trop d’ajouts à une communauté. Réessayez plus tard.', {
    code: COMMUNITY_ADDITION_BUDGET_CODE,
  });
}
