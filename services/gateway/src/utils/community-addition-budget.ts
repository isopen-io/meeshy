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
 * Un TROISIÈME chemin partage ces seaux depuis #20464 : créer un salon dans une
 * communauté (`POST /conversations` avec `communityId`) y fait entrer ses
 * participants — jusqu'à 250 par requête. L'acteur y paie le nombre d'ENTRANTS
 * (un membre déjà actif ne coûte rien), et chaque entrant débite son seau.
 *
 * Deux autres chemins s'y ajoutent depuis #20694, au même prix : RATTACHER
 * une conversation existante à une communauté privée, et PASSER une
 * communauté en privée (ses occupants de salons y entrent). La bascule par
 * l'équipe de la plateforme en est dispensée (rang d'administration, motif
 * écrit, journal d'audit) : ce n'est pas un ajout entre utilisateurs.
 *
 * Les entrées UNE PAR UNE dans un salon d'une communauté privée s'y ajoutent
 * depuis #20703, au même prix : `POST /conversations/:id/participants` (un
 * verdict `throttled` par personne refusée dans un lot, 429 pour la forme
 * historique `userId`) et `POST /conversations/:id/invite`. Un membre déjà
 * actif de la communauté n'y entre pas : il ne coûte rien ; un identifiant
 * sans compte coûte une unité, comme un compte non ajoutable.
 *
 * L'invitation dans un appel (`call:invite-participant`) s'y ajoute depuis
 * #20740 : le transport socket atteint ces seaux par le serveur posé au
 * montage de Socket.IO (`setCommunityAdmissionBudgetHost`). Et un débit
 * accepté pour une écriture qui n'a PAS lieu — course de bannissement, ligne
 * disparue, écriture qui lève — se REND ; une tentative vers un compte non
 * ajoutable, jamais. Le débannissement et l'entrée par lien en sont dispensés
 * par décision écrite (`decisions/2026-11-28-…-20740.md`).
 *
 * Le seau d'une cible ne se remplit plus par ajout/retrait (#20464) : un
 * sous-plafond par PAIRE (acteur, cible), 3 par jour, est débité AVANT le seau
 * de la cible, et son refus ne touche pas ce dernier. Un administrateur qui
 * ajoute et retire dix fois la même personne n'en consomme donc que trois
 * unités, et ses vrais proches peuvent encore l'ajouter.
 *
 * Redis en panne : `consume` rend `null` et le geste PASSE (fail-open), le même
 * choix que `middleware()` et `contact-identifier-budget.ts` — un débit est une
 * borne d'abus, pas une garde d'autorisation, et les refus d'accès restent en
 * amont.
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
  const hote: object = fastify.server ?? fastify;
  const existants = SEAUX.get(hote);
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
  SEAUX.set(hote, crees);
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
 * Débite une tentative d'ajout sur les deux fenêtres de l'ACTEUR. Les deux sont
 * débitées même quand l'une refuse : une tentative refusée a été REÇUE. Mais un
 * geste refusé ne coûte qu'UNE unité, quel que soit son poids (#20464) : un
 * salon de 250 personnes refusé ne ferme pas la porte à l'acteur pour 24 h, et
 * un ajout d'une seule personne reste possible dès que l'heure se rouvre.
 */
export async function spendCommunityAdditionByActor(
  fastify: FastifyInstance,
  actorId: string,
  attempts: number = 1
): Promise<CommunityAdditionVerdict> {
  const { acteurHeure, acteurJour } = seaux(fastify);
  const cle = `user:${actorId}`;
  const verdict = verdictOf(await Promise.all([acteurHeure.consume(cle, attempts), acteurJour.consume(cle, attempts)]));
  if (!verdict.allowed && attempts > 1) {
    await Promise.all([acteurHeure.release(cle, attempts - 1), acteurJour.release(cle, attempts - 1)]);
  }
  return verdict;
}

/** Rend `units` débits pris sur l'acteur par un geste que la suite a refusé (#20464). */
export async function refundCommunityAdditionByActor(
  fastify: FastifyInstance,
  actorId: string,
  units: number
): Promise<void> {
  const { acteurHeure, acteurJour } = seaux(fastify);
  const cle = `user:${actorId}`;
  await Promise.all([acteurHeure.release(cle, units), acteurJour.release(cle, units)]);
}

const canonique = (id: string) => id.trim().toLowerCase();

type DebitCible = { readonly verdict: CommunityAdditionVerdict; rendre(): Promise<void> };

/**
 * Le seau d'une cible ne compte que des ajouts qui vont ÉCRIRE : tout débit
 * refusé est rendu sur-le-champ, et `rendre()` défait un débit accepté quand le
 * geste qui l'a pris est refusé plus loin (#20464).
 */
async function debiterCible(fastify: FastifyInstance, targetId: string, actorId: string): Promise<DebitCible> {
  const { cibleJour, paireJour } = seaux(fastify);
  const cible = canonique(targetId);
  const clePaire = `pair:${canonique(actorId)}:${cible}`;
  const cleCible = `user:${cible}`;
  const paire = verdictOf([await paireJour.consume(clePaire, 1)]);
  if (!paire.allowed) {
    await paireJour.release(clePaire, 1);
    return { verdict: paire, rendre: async () => undefined };
  }
  const deCible = verdictOf([await cibleJour.consume(cleCible, 1)]);
  if (!deCible.allowed) {
    await Promise.all([paireJour.release(clePaire, 1), cibleJour.release(cleCible, 1)]);
    return { verdict: deCible, rendre: async () => undefined };
  }
  return {
    verdict: deCible,
    rendre: async () => {
      await Promise.all([paireJour.release(clePaire, 1), cibleJour.release(cleCible, 1)]);
    },
  };
}

/**
 * Débite UN ajout qui va écrire sur le seau de la personne AJOUTÉE, tous acteurs
 * confondus. La clé est l'ObjectId CANONIQUE (minuscules) : la base décode
 * l'hexadécimal sans tenir compte de la casse, et une clé brute laissait chaque
 * variante de casse ouvrir un seau neuf pour la même personne. Un sous-plafond
 * par paire (acteur, cible) passe d'abord : un même acteur n'entame le seau
 * d'une cible que `pairPerDay` fois par jour.
 */
export async function spendCommunityAdditionOfTarget(
  fastify: FastifyInstance,
  targetId: string,
  actorId: string
): Promise<CommunityAdditionVerdict> {
  return (await debiterCible(fastify, targetId, actorId)).verdict;
}

/**
 * Débite chaque personne qu'un même geste fait entrer (un salon créé avec ses
 * participants). Au premier refus, rien ne sera écrit : les débits déjà pris sur
 * les personnes précédentes sont RENDUS — sans quoi glisser une cible saturée
 * derrière une victime entamerait le quota de la victime sans jamais l'ajouter.
 */
export async function spendCommunityAdditionOfTargets(
  fastify: FastifyInstance,
  targetIds: readonly string[],
  actorId: string
): Promise<CommunityAdditionVerdict> {
  return (await spendCommunityAdditionOfTargetsUndoable(fastify, targetIds, actorId)).verdict;
}

/** Un débit accepté que le geste peut encore RENDRE s'il n'écrit rien (#20740). */
export type UndoableCommunityAddition = { readonly verdict: CommunityAdditionVerdict; rendre(): Promise<void> };

/**
 * `spendCommunityAdditionOfTargets`, dont le débit accepté se REND quand
 * l'écriture qui le justifiait n'a pas lieu (#20740) : une course de
 * bannissement, une ligne disparue, une écriture qui lève. Sans quoi le seau de
 * la cible compterait un ajout qui n'a jamais eu lieu.
 */
export async function spendCommunityAdditionOfTargetsUndoable(
  fastify: FastifyInstance,
  targetIds: readonly string[],
  actorId: string
): Promise<UndoableCommunityAddition> {
  const pris: DebitCible[] = [];
  for (const targetId of targetIds) {
    const debit = await debiterCible(fastify, targetId, actorId);
    if (!debit.verdict.allowed) {
      await Promise.all(pris.map((p) => p.rendre()));
      return { verdict: debit.verdict, rendre: async () => undefined };
    }
    pris.push(debit);
  }
  return {
    verdict: { allowed: true, retryAfter: 0 },
    rendre: async () => {
      await Promise.all(pris.map((p) => p.rendre()));
    },
  };
}

export function refuseCommunityAddition(reply: FastifyReply, retryAfter: number): void {
  reply.header('Retry-After', String(retryAfter));
  sendError(reply, 429, 'Trop d’ajouts à une communauté. Réessayez plus tard.', {
    code: COMMUNITY_ADDITION_BUDGET_CODE,
  });
}
