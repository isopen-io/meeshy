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
 * Un troisième chemin débite les MÊMES seaux (#20464) : créer un salon dans une
 * communauté y fait entrer ses participants (`planCommunityAdmission`, jusqu'à
 * 250 personnes par requête). L'acteur y paie au nombre de personnes qui
 * ENTRENT, et la cible une unité — `spendCommunityAdmissionBatch`.
 *
 * Le seau de la cible compte des COMMUNAUTÉS DISTINCTES dans la fenêtre, pas des
 * ajouts : un administrateur qui ajoute puis retire dix fois la même personne
 * ne lui ferme pas la porte des autres communautés pendant 24 h. La paire
 * (communauté, cible) a son propre plafond, 3 entrées par jour : la première
 * débite la cible, les deux suivantes sont gratuites pour elle, la quatrième est
 * refusée — sans quoi les membres d'une communauté publique pourraient
 * réinviter sans fin une personne qui en est partie, chaque ajout lui poussant
 * une notification. Un ajout refusé, ou un lot qui n'écrit finalement rien,
 * rend ce qu'il a pris.
 *
 * Ce que le module ne compte PAS encore, suivi par #20663 : rattacher une
 * conversation à une communauté, ajouter quelqu'un à un salon existant, lever
 * un bannissement qui réintègre. Limite connue : deux requêtes concurrentes sur
 * la même paire peuvent laisser passer une entrée sans débit de la cible si
 * l'une d'elles est ensuite refusée et rend la paire.
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
  pairPerDay: 3,
} as const;

export const COMMUNITY_ADDITION_BUDGET_CODE = 'COMMUNITY_ADDITION_BUDGET_EXCEEDED';

const HEURE_MS = 60 * 60 * 1000;
const JOUR_MS = 24 * HEURE_MS;

type Seaux = {
  readonly acteurHeure: RateLimiter;
  readonly acteurJour: RateLimiter;
  readonly cibleJour: RateLimiter;
  readonly paireJour: RateLimiter;
};

/**
 * UN jeu de seaux par SERVEUR (même raison que `contact-identifier-budget.ts`) :
 * sans Redis, chaque limiteur a son magasin mémoire, et les deux routes vivent
 * dans deux modules enregistrés séparément.
 */
const SEAUX = new WeakMap<object, Seaux>();

function seaux(fastify: FastifyInstance): Seaux {
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
      { max: COMMUNITY_ADDITION_BUDGET.pairPerDay, windowMs: JOUR_MS, keyPrefix: 'communities:additions:pair:d' },
      redis
    ),
  };
  SEAUX.set(porteur, crees);
  return crees;
}

/** `retryAfter` vaut 0 quand le geste passe (le gateway compile sans `strictNullChecks`). */
export type CommunityAdditionVerdict = { readonly allowed: boolean; readonly retryAfter: number };

/** Le débit des cibles d'un lot, et de quoi le RENDRE si le lot n'écrit finalement rien. */
export type CommunityTargetsDebit = CommunityAdditionVerdict & { refund(): Promise<void> };

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

const canonique = (id: string): string => id.trim().toLowerCase();

type DebitCible = { readonly verdict: CommunityAdditionVerdict; rendre(): Promise<void> };

/**
 * Débite UNE entrée dans une communauté sur le seau de la personne AJOUTÉE, tous
 * acteurs confondus, une fois par communauté et par jour. Les clés sont des
 * ObjectId CANONIQUES (minuscules) : la base décode l'hexadécimal sans tenir
 * compte de la casse, et une clé brute laissait chaque variante de casse ouvrir
 * un seau neuf pour la même personne.
 */
async function debiterCible(fastify: FastifyInstance, communityId: string, targetId: string): Promise<DebitCible> {
  const { cibleJour, paireJour } = seaux(fastify);
  const cleCible = `user:${canonique(targetId)}`;
  const clePaire = `${canonique(communityId)}:${canonique(targetId)}`;
  const rendrePaire = async () => paireJour.release(clePaire, 1);
  const paire = await paireJour.consume(clePaire, 1);
  if (paire?.retryAfter !== undefined) {
    await rendrePaire();
    return { verdict: { allowed: false, retryAfter: paire.retryAfter }, rendre: async () => undefined };
  }
  if (paire && paire.remaining < COMMUNITY_ADDITION_BUDGET.pairPerDay - 1) {
    return { verdict: { allowed: true, retryAfter: 0 }, rendre: rendrePaire };
  }
  const cible = await cibleJour.consume(cleCible, 1);
  const rendre = async () => {
    await Promise.all([rendrePaire(), cibleJour.release(cleCible, 1)]);
  };
  const verdict = verdictOf([cible]);
  if (!verdict.allowed) await rendre();
  return { verdict, rendre };
}

/** Débite UN ajout qui va écrire, pour les deux routes d'ajout unitaire. */
export async function spendCommunityAdditionOfTarget(
  fastify: FastifyInstance,
  communityId: string,
  targetId: string
): Promise<CommunityAdditionVerdict> {
  return (await debiterCible(fastify, communityId, targetId)).verdict;
}

/**
 * Le budget d'un LOT d'entrées (#20464), en deux temps, parce que la porte
 * `isAddableUser` se tient entre les deux :
 *  · `byActor` débite l'acteur au nombre de personnes qui entrent, AVANT la
 *    porte (même raison que l'ajout unitaire : pas de sondage gratuit) ;
 *  · `ofTargets` débite chaque cible pour un lot qui va écrire. Si une seule
 *    est saturée, le lot est refusé ENTIER et les autres cibles sont rendues :
 *    une personne saturée ne doit rien coûter à ses voisines du lot.
 */
export function communityAdmissionBudget(fastify: FastifyInstance, actorId: string, communityId: string) {
  return {
    async byActor(count: number): Promise<CommunityAdditionVerdict> {
      if (count <= 0) return { allowed: true, retryAfter: 0 };
      const { acteurHeure, acteurJour } = seaux(fastify);
      const cle = `user:${actorId}`;
      return verdictOf(await Promise.all([acteurHeure.consume(cle, count), acteurJour.consume(cle, count)]));
    },
    async ofTargets(targetIds: readonly string[]): Promise<CommunityTargetsDebit> {
      const debits = await Promise.all(targetIds.map((id) => debiterCible(fastify, communityId, id)));
      const rendreTout = async () => {
        await Promise.all(debits.filter((d) => d.verdict.allowed).map((d) => d.rendre()));
      };
      const refus = debits.filter((d) => !d.verdict.allowed).map((d) => d.verdict.retryAfter);
      if (refus.length === 0) return { allowed: true, retryAfter: 0, refund: rendreTout };
      await rendreTout();
      return { allowed: false, retryAfter: Math.max(...refus), refund: async () => undefined };
    },
  };
}

export type CommunityAdmissionBudget = ReturnType<typeof communityAdmissionBudget>;

export function refuseCommunityAddition(reply: FastifyReply, retryAfter: number): void {
  reply.header('Retry-After', String(retryAfter));
  sendError(reply, 429, 'Trop d’ajouts à une communauté. Réessayez plus tard.', {
    code: COMMUNITY_ADDITION_BUDGET_CODE,
  });
}
