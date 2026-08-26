/**
 * Le plancher d'historique d'un participant : l'instant avant lequel rien ne
 * lui est lisible dans la conversation.
 *
 * Qui intègre une conversation n'a accès qu'à ce qui a été écrit DEPUIS son
 * arrivée — sauf si (a) il en est administrateur, (b) le lien de partage qu'il a
 * emprunté ouvre l'historique, (c) un administrateur lui a accordé la vue depuis
 * une DATE. La règle est portée par la LIGNE PARTICIPANT, jamais par le type
 * d'identité : un inscrit ajouté après coup et un anonyme entré par lien sont
 * bornés par le même énoncé.
 *
 * Ce module succède à `shareLinkHistoryFloor` : le plancher ne dépend plus
 * seulement du lien — d'où le nom, et d'où `role` et `historyVisibleFrom` dans
 * ce qu'il faut lire d'une ligne. Trois propriétés que les appelants tiennent
 * pour acquises :
 *
 * - **Le plancher est un `createdAt`, jamais un watermark.** C'est la seule
 *   borne qui exclue un message ancien RÉÉDITÉ depuis : son `updatedAt` est
 *   d'aujourd'hui, donc remonter la fenêtre delta (`updatedAt > since`) le
 *   laisserait passer avec tout son contenu.
 *
 * - **ABSENT n'est pas « faux ».** Toute participation antérieure au droit figé
 *   ne le porte pas — et sur le connecteur MongoDB un champ absent ne matche ni
 *   `null` ni `NOT null`. Le lire comme un refus fermerait l'historique à toute
 *   la population existante d'un coup. Le repli sur le lien, puis sur « tout »,
 *   EST le comportement historique, préservé à l'identique.
 *
 * - **Qui se décide avant le lien ne paie rien.** Un admin, un octroi par date,
 *   un droit figé explicite, une participation sans lien : zéro requête. Seules
 *   les participations dont le LIEN décide en lisent la ligne.
 *
 * Posture d'échec : un plancher illisible est un CONTRÔLE D'ACCÈS illisible, et
 * la seule dégradation sûre est de ne rien servir — à la différence du masquage
 * personnel (`personalHistoryFilter`), une courtoisie dont l'échec dégrade en
 * « on sert ». Les formes unitaires PROPAGENT ; la forme `OrFail` RETIRE, et
 * elle ne retire QUE ce que la lecture ratée décidait : un plancher rendu sans
 * lire aucun lien (rangs i à iii) ne peut pas devenir illisible, donc il reste
 * APPLICABLE. Le vider avec le reste serait un fail-OPEN silencieux — la page
 * mixte perdrait la borne des conversations déjà réglées.
 *
 * Ce que ce module ne fait PAS : refuser (403) un lien expiré ou à quota
 * atteint. Ces contrôles ferment une PORTE d'entrée, celui-ci rétrécit une
 * LECTURE.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { hasMinimumMemberRole } from '@meeshy/shared/types/role-types';
import { logger } from '../utils/logger';
import type { ParticipantRightsOverride } from './participantRights';

/**
 * Ce qu'il faut d'une ligne `Participant` pour répondre à la question. Tout est
 * facultatif hors `joinedAt` : un appelant qui ne charge pas un champ obtient le
 * verdict qu'aurait rendu son absence — jamais un droit de plus.
 */
export type HistoryFloorJoin = {
  readonly role?: string | null;
  readonly joinedAt: Date;
  readonly shareLinkId?: string | null;
  /** Octroi par DATE d'un administrateur — voir `Participant.historyVisibleFrom`. */
  readonly historyVisibleFrom?: Date | null;
  readonly permissions?: ParticipantRightsOverride | null;
  readonly anonymousSession?: { readonly rights?: ParticipantRightsOverride | null } | null;
};

export type HistoryFloorParticipation = HistoryFloorJoin & {
  readonly conversationId: string;
};

/** Ce qu'il faut d'une ligne `ConversationShareLink`. `null` = introuvable. */
export type ShareLinkHistoryGrant = { readonly allowViewHistory: boolean } | null;

/**
 * La projection à demander à Prisma pour que `historyFloorFor` voie TOUT ce qui
 * décide. Les appelants l'étalent dans leur `select` plutôt que d'en tenir une
 * copie : c'est la projection trop étroite, pas l'appel manquant, qui rend une
 * règle inapplicable en aval sans qu'aucun témoin ne rougisse.
 *
 * `anonymousSession` est réduit à `rights` : le reste de la session (hash du
 * jeton, IP, empreinte) n'entre pas dans la question.
 */
export const HISTORY_FLOOR_PARTICIPANT_SELECT = {
  role: true,
  joinedAt: true,
  shareLinkId: true,
  historyVisibleFrom: true,
  permissions: true,
  anonymousSession: { select: { rights: true } },
} as const;

type FloorVerdict =
  | { readonly kind: 'settled'; readonly floor: Date | null }
  | { readonly kind: 'link-decides' };

/**
 * Tout ce qui se décide SANS lire le lien, dans l'ordre de la règle. Rendre le
 * verdict plutôt que le plancher permet aux chargeurs de ne demander à la base
 * que les liens dont un verdict dépend.
 */
function settleBeforeLink(join: HistoryFloorJoin): FloorVerdict {
  if (hasMinimumMemberRole(join.role ?? 'member', 'admin')) return { kind: 'settled', floor: null };
  if (join.historyVisibleFrom) return { kind: 'settled', floor: join.historyVisibleFrom };

  // Le droit figé au join, et la surcharge de l'hôte lue en premier — `??`
  // parce que `false` est une réponse et `undefined` une abstention.
  const granted = join.anonymousSession?.rights?.canViewHistory ?? join.permissions?.canViewHistory;
  if (typeof granted === 'boolean') return { kind: 'settled', floor: granted ? null : join.joinedAt };

  if (!join.shareLinkId) return { kind: 'settled', floor: null };
  return { kind: 'link-decides' };
}

/**
 * La règle, énoncée UNE fois. Pure, et volontairement séparée de la lecture de
 * la ligne : les appelants n'ont pas la même stratégie de chargement.
 *
 * Un lien INTROUVABLE (supprimé depuis la jointure) ne borne rien — posture
 * historique de `messages.ts` (`if (shareLink) { … }`), et deux lecteurs de la
 * même règle qui divergeraient sur ce cas seraient pires que le cas lui-même.
 */
export function historyFloorFor(join: HistoryFloorJoin, link: ShareLinkHistoryGrant): Date | null {
  const verdict = settleBeforeLink(join);
  if (verdict.kind === 'settled') return verdict.floor;
  if (!link || link.allowViewHistory) return null;
  return join.joinedAt;
}

/**
 * Forme UNITAIRE : le plancher d'UNE participation. `link` est le lien que
 * l'appelant tient déjà, s'il en tient un — il n'est emprunté que s'il est
 * celui de la participation, sans quoi la ligne est lue.
 *
 * Ne rattrape pas ses erreurs : le `try/catch` de la route en fait un 500.
 */
export async function loadHistoryFloor(
  prisma: Pick<PrismaClient, 'conversationShareLink'>,
  join: HistoryFloorJoin,
  options: { readonly link?: { readonly id: string; readonly allowViewHistory: boolean } | null } = {},
): Promise<Date | null> {
  const verdict = settleBeforeLink(join);
  if (verdict.kind === 'settled') return verdict.floor;

  const known = options.link && options.link.id === join.shareLinkId ? options.link : null;
  const link = known ?? await prisma.conversationShareLink.findUnique({
    where: { id: join.shareLinkId as string },
    select: { allowViewHistory: true },
  });
  return historyFloorFor(join, link);
}

/**
 * Forme ALIGNÉE : un plancher par participation, dans l'ordre reçu, en UNE
 * lecture des seuls liens dont un verdict dépend. C'est la brique des deux
 * formes ensemblistes — par conversation (`/sync`, la liste) et par
 * participant (l'aperçu poussé, où tous partagent la même conversation).
 */
export async function loadHistoryFloorsFor(
  prisma: Pick<PrismaClient, 'conversationShareLink'>,
  joins: readonly HistoryFloorJoin[],
): Promise<ReadonlyArray<Date | null>> {
  const verdicts = joins.map(settleBeforeLink);
  return alignFloors(joins, verdicts, await readLinkGrants(prisma, linkIdsDeciding(joins, verdicts)));
}

type LinkGrantsById = ReadonlyMap<string, { readonly allowViewHistory: boolean }>;

/** Les seuls liens dont un verdict dépend — les autres ne se lisent jamais. */
function linkIdsDeciding(
  joins: readonly HistoryFloorJoin[],
  verdicts: readonly FloorVerdict[],
): readonly string[] {
  return [...new Set(
    joins.flatMap((join, index) => (verdicts[index].kind === 'link-decides' ? [join.shareLinkId as string] : [])),
  )];
}

async function readLinkGrants(
  prisma: Pick<PrismaClient, 'conversationShareLink'>,
  linkIds: readonly string[],
): Promise<LinkGrantsById> {
  if (linkIds.length === 0) return new Map();
  const links = await prisma.conversationShareLink.findMany({
    where: { id: { in: [...linkIds] } },
    select: { id: true, allowViewHistory: true },
  });
  return new Map(links.map((link) => [link.id, link]));
}

function alignFloors(
  joins: readonly HistoryFloorJoin[],
  verdicts: readonly FloorVerdict[],
  byId: LinkGrantsById,
): ReadonlyArray<Date | null> {
  return joins.map((join, index) => {
    const verdict = verdicts[index];
    if (verdict.kind === 'settled') return verdict.floor;
    return historyFloorFor(join, byId.get(join.shareLinkId as string) ?? null);
  });
}

/**
 * Le noyau TOLÉRANT, aligné sur l'ordre reçu : les verdicts qui se rendent SANS
 * lien (rangs i à iii, purs) sont arrêtés AVANT la requête, donc une panne de
 * celle-ci ne peut rien leur retirer. Seuls les index dont le LIEN décidait
 * ressortent `unreadable` — ce sont les seuls sur lesquels la lecture ratée
 * avait quelque chose à apprendre.
 *
 * Vider la carte entière, comme le faisait le `catch` d'origine, faisait perdre
 * le plancher des participations déjà réglées : sur une page MIXTE, elles
 * redevenaient lisibles INTÉGRALEMENT (fail-OPEN) sans qu'aucun appelant ne
 * puisse s'en apercevoir — elles ne figuraient ni dans `floors`, ni dans les
 * illisibles.
 */
async function resolveFloorsTolerant(
  prisma: Pick<PrismaClient, 'conversationShareLink'>,
  joins: readonly HistoryFloorJoin[],
): Promise<{ readonly floors: ReadonlyArray<Date | null>; readonly unreadable: ReadonlySet<number> }> {
  const verdicts = joins.map(settleBeforeLink);
  try {
    return {
      floors: alignFloors(joins, verdicts, await readLinkGrants(prisma, linkIdsDeciding(joins, verdicts))),
      unreadable: new Set<number>(),
    };
  } catch (error) {
    logger.warn('[history-floor] lookup failed, dropping the participations whose link decides', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      floors: verdicts.map((verdict) => (verdict.kind === 'settled' ? verdict.floor : null)),
      unreadable: new Set(verdicts.flatMap((verdict, index) => (verdict.kind === 'link-decides' ? [index] : []))),
    };
  }
}

/**
 * Forme ALIGNÉE et TOLÉRANTE : même sortie que `loadHistoryFloorsFor`, plus
 * l'ensemble des INDEX dont le plancher n'a pas pu être lu. L'appelant qui sert
 * par destinataire (l'aperçu poussé) retire ceux-là et sert les autres — un
 * plancher rendu sans lire aucun lien reste applicable quoi qu'il arrive à la
 * requête. Le plancher rendu pour un index illisible vaut `null` : il ne se
 * sert PAS, il se saute.
 */
export async function loadHistoryFloorsForOrFail(
  prisma: Pick<PrismaClient, 'conversationShareLink'>,
  joins: readonly HistoryFloorJoin[],
): Promise<{ readonly floors: ReadonlyArray<Date | null>; readonly unreadable: ReadonlySet<number> }> {
  return resolveFloorsTolerant(prisma, joins);
}

/**
 * `conversationId` → instant avant lequel rien n'est lisible. Une conversation
 * absente n'a aucun plancher — même contrat d'absence que `personalHistoryFilter`.
 */
export async function loadHistoryFloors(
  prisma: Pick<PrismaClient, 'conversationShareLink'>,
  participations: readonly HistoryFloorParticipation[],
): Promise<ReadonlyMap<string, Date>> {
  return floorsByConversation(participations, await loadHistoryFloorsFor(prisma, participations));
}

/**
 * La projection ALIGNÉ → `conversationId`, énoncée UNE fois : les deux formes
 * par conversation la partagent plutôt que d'en tenir chacune une copie. Une
 * conversation que rien ne borne n'y figure pas — c'est le contrat d'absence
 * que les appelants lisent.
 */
function floorsByConversation(
  participations: readonly HistoryFloorParticipation[],
  floors: ReadonlyArray<Date | null>,
  skip: (index: number) => boolean = () => false,
): ReadonlyMap<string, Date> {
  return new Map(
    participations.flatMap((p, index) => {
      const floor = floors[index];
      return floor && !skip(index) ? [[p.conversationId, floor] as const] : [];
    }),
  );
}

/**
 * La clause Prisma qui restreint un ensemble de conversations à ce que chacune
 * autorise.
 *
 * Elle s'AJOUTE au `conversationId: { in: [...] }` de l'appelant plutôt que de
 * le remplacer : c'est ce filtre-là que l'index sert, et le sous-`OR` ne fait
 * que le rétrécir. Rendue sous `AND` et non à plat, parce que le `OR` de
 * premier niveau appartient déjà au keyset de pagination — deux `OR` frères
 * s'écraseraient, et le survivant serait celui écrit en dernier.
 *
 * Rend `{}` quand rien n'est borné : la requête d'un lecteur sans plancher
 * reste identique à l'octet près.
 */
export function historyFloorClause(
  conversationIds: readonly string[],
  floors: ReadonlyMap<string, Date>,
): Record<string, unknown> {
  if (floors.size === 0) return {};
  return {
    AND: [
      {
        OR: conversationIds.map((id) => {
          const floor = floors.get(id);
          return floor ? { conversationId: id, createdAt: { gte: floor } } : { conversationId: id };
        }),
      },
    ],
  };
}

/**
 * Pose le plancher sur une clause `where` de message, en se COMBINANT à toute
 * borne `createdAt` déjà présente (curseur `lt`, moitié `gt` du mode around).
 * Deux `gte` se départagent par la plus stricte : un plancher ne descend jamais
 * une borne que l'appelant avait déjà remontée.
 */
export function applyHistoryFloor<W extends Record<string, unknown>>(where: W, floor: Date | null): W {
  if (!floor) return where;
  const prior = (where.createdAt ?? {}) as Record<string, unknown>;
  const priorGte = prior.gte instanceof Date ? prior.gte : null;
  const gte = priorGte && priorGte > floor ? priorGte : floor;
  return { ...where, createdAt: { ...prior, gte } };
}

/**
 * Variante tolérante : un plancher que l'on ne peut pas LIRE ne doit pas se
 * traduire par « pas de plancher ». La seule dégradation sûre est de ne rien
 * servir des conversations concernées — celles dont le LIEN décidait, les
 * seules que la lecture touche — ce que l'appelant obtient en les retirant de
 * son ensemble.
 */
export async function loadHistoryFloorsOrFail(
  prisma: Pick<PrismaClient, 'conversationShareLink'>,
  participations: readonly HistoryFloorParticipation[],
): Promise<{ floors: ReadonlyMap<string, Date>; unreadableConversationIds: readonly string[] }> {
  const { floors, unreadable } = await resolveFloorsTolerant(prisma, participations);
  return {
    floors: floorsByConversation(participations, floors, (index) => unreadable.has(index)),
    unreadableConversationIds: participations.flatMap((p, index) => (unreadable.has(index) ? [p.conversationId] : [])),
  };
}

/**
 * Le lecteur, tel qu'une route le connaît. Un anonyme n'a pas de `User.id` : sa
 * ligne se trouve par `Participant.id`, jamais par la colonne `userId`.
 */
export type HistoryReader =
  | { readonly kind: 'user'; readonly userId: string }
  | { readonly kind: 'anonymous'; readonly participantId: string };

/**
 * Même précédence que `canAccessConversation` / `resolveCallerParticipant` :
 * `participantId` d'abord, `userId` ensuite — les deux réponses ne doivent pas
 * diverger sur qui est l'appelant. Pour un contexte anonyme, `userId` porte lui
 * aussi un `Participant.id` (branche anonyme d'`UnifiedAuthService`).
 */
export function historyReaderFromAuthContext(
  authContext:
    | {
        readonly type?: string;
        readonly isAnonymous?: boolean;
        readonly userId?: string | null;
        readonly participantId?: string | null;
      }
    | null
    | undefined,
): HistoryReader | null {
  if (!authContext) return null;
  if (authContext.participantId) return { kind: 'anonymous', participantId: authContext.participantId };

  const anonymous = authContext.type === 'anonymous' || authContext.isAnonymous === true;
  if (anonymous) return authContext.userId ? { kind: 'anonymous', participantId: authContext.userId } : null;
  return authContext.userId ? { kind: 'user', userId: authContext.userId } : null;
}

/**
 * Le plancher du LECTEUR dans UNE conversation, pour les routes qui n'ont pas
 * d'autre raison de lire sa ligne. Sans ligne (non-membre d'un salon public),
 * rien ne borne : rien ne précède une arrivée qui n'a pas eu lieu.
 *
 * Propage ses erreurs — fail-closed, comme `loadHistoryFloor`.
 */
export async function loadReaderHistoryFloor(
  prisma: Pick<PrismaClient, 'participant' | 'conversationShareLink'>,
  params: {
    readonly conversationId: string;
    readonly reader: HistoryReader | null;
    /** Le lien que l'appelant tient déjà — même contrat que `loadHistoryFloor`. */
    readonly link?: { readonly id: string; readonly allowViewHistory: boolean } | null;
  },
): Promise<Date | null> {
  const { conversationId, reader, link } = params;
  if (!reader) return null;

  const row = await prisma.participant.findFirst({
    where: reader.kind === 'anonymous'
      ? { id: reader.participantId, conversationId, isActive: true }
      : { userId: reader.userId, conversationId, isActive: true },
    select: HISTORY_FLOOR_PARTICIPANT_SELECT,
  });
  if (!row) return null;
  return loadHistoryFloor(prisma, row, { link });
}
