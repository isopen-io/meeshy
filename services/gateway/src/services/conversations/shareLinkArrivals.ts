/**
 * LA LISTE COMPLÈTE DES ARRIVÉES D'UN LIEN D'INVITATION (#7813) — le contrat
 * `ShareLinkArrivalsPage` (`@meeshy/shared/types/share-link-stats`).
 *
 * Les statistiques (`shareLinkStats.ts`) ne rendent que les vingt dernières ;
 * cette lecture les rend TOUTES, page par page, dans le même ordre.
 *
 * - **Ordre total** : `joinedAt` puis identifiant, décroissants. Deux arrivées
 *   à la même milliseconde ne peuvent ni se doubler ni se perdre d'une page à
 *   l'autre, et une arrivée nouvelle pendant le défilement se range AVANT la
 *   première page : elle ne décale rien.
 * - **Curseur opaque** : la position de la dernière arrivée servie, que le
 *   client renvoie telle quelle. Un curseur illisible est refusé, jamais
 *   interprété.
 * - **Projection fermée** : la lecture ne charge que ce que la ligne affiche
 *   (nom, visage, type, langue, date, pays) et, pour son gestionnaire (#19283),
 *   le compte d'un inscrit et l'e-mail qu'un invité a laissé — servi MASQUÉ
 *   (`maskGuestEmail`), jamais en clair. La présence, l'IP et l'e-mail d'un
 *   COMPTE ne sont pas lus, donc ne peuvent pas partir. Le visage
 *   (#12571) est celui que les arrivées récentes servent déjà aux mêmes
 *   lecteurs, résolu par la loi partagée `resolveParticipantAvatar`.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';
import { resolveParticipantAvatar } from '@meeshy/shared/utils/participant-helpers';
import { maskGuestEmail, type ShareLinkArrivalEntry, type ShareLinkArrivalsPage } from '@meeshy/shared/types/share-link-stats';

export type ArrivalsCursor = { readonly joinedAt: Date; readonly id: string };

const CURSOR_SHAPE = /^(\d{1,15}):([0-9a-f]{24})$/;

export function encodeArrivalsCursor(position: ArrivalsCursor): string {
  return Buffer.from(`${position.joinedAt.getTime()}:${position.id}`).toString('base64url');
}

export function decodeArrivalsCursor(raw: string): ArrivalsCursor | null {
  const match = CURSOR_SHAPE.exec(Buffer.from(raw, 'base64url').toString('utf8'));
  if (!match) return null;
  return { joinedAt: new Date(Number(match[1])), id: match[2] };
}

/** Une langue canonique (`fr`, `pt`), ou `null` — la clé que les statistiques comptent. */
export const arrivalLanguageKey = (language: string | null | undefined): string | null => {
  const canonical = language ? normalizeLanguageForDedup(language) : '';
  return canonical === '' ? null : canonical;
};

/**
 * Un invité parle ce qu'il a choisi en entrant (`Participant.language`) ; un
 * compte parle sa langue d'interface (`User.systemLanguage`, rang 1 du Prisme).
 */
export const arrivalLanguage = (row: {
  readonly type: string;
  readonly language: string;
  readonly user: { readonly systemLanguage: string | null } | null;
}): string | null => arrivalLanguageKey(row.type === 'anonymous' ? row.language : row.user?.systemLanguage ?? row.language);

/**
 * Ce qu'une arrivée porte pour son gestionnaire (#19283), UNE fois pour les
 * statistiques et la liste : le compte d'un INSCRIT (« Voir la fiche », que la
 * loi des cercles garde ensuite), l'e-mail masqué d'un INVITÉ. Le type décide,
 * jamais la présence d'une colonne : un invité ne sert aucun compte, un
 * inscrit aucune adresse — même si sa ligne en garde une d'un autre temps.
 */
export const ARRIVAL_OWNER_SELECT = {
  userId: true,
  anonymousSession: { select: { profile: { select: { email: true } } } },
} as const;

export type ArrivalOwnerRow = {
  readonly type: string;
  readonly userId?: string | null;
  readonly anonymousSession?: { readonly profile?: { readonly email?: string | null } | null } | null;
};

export const arrivalOwnerFields = (row: ArrivalOwnerRow): { userId: string | null; emailMasked: string | null } =>
  row.type === 'anonymous'
    ? { userId: null, emailMasked: maskGuestEmail(row.anonymousSession?.profile?.email) }
    : { userId: row.userId ?? null, emailMasked: null };

const ARRIVAL_SELECT = {
  id: true,
  type: true,
  userId: true,
  displayName: true,
  avatar: true,
  language: true,
  joinedAt: true,
  joinCountry: true,
  anonymousSession: ARRIVAL_OWNER_SELECT.anonymousSession,
  user: { select: { systemLanguage: true, avatar: true } },
} as const;

type ArrivalRow = ArrivalOwnerRow & {
  readonly id: string;
  readonly type: string;
  readonly displayName: string;
  readonly avatar: string | null;
  readonly language: string;
  readonly joinedAt: Date;
  readonly joinCountry: string | null;
  readonly user: { readonly systemLanguage: string | null; readonly avatar: string | null } | null;
};

const toEntry = (row: ArrivalRow): ShareLinkArrivalEntry => ({
  displayName: row.displayName,
  avatar: resolveParticipantAvatar(row),
  isAnonymous: row.type === 'anonymous',
  country: row.joinCountry,
  language: arrivalLanguage(row),
  joinedAt: row.joinedAt.toISOString(),
  ...arrivalOwnerFields(row),
});

const after = (cursor: ArrivalsCursor | null) =>
  cursor === null
    ? {}
    : { OR: [{ joinedAt: { lt: cursor.joinedAt } }, { joinedAt: cursor.joinedAt, id: { lt: cursor.id } }] };

export async function listShareLinkArrivals(
  prisma: Pick<PrismaClient, 'participant'>,
  params: { readonly shareLinkId: string; readonly cursor: ArrivalsCursor | null; readonly limit: number },
): Promise<ShareLinkArrivalsPage> {
  const rows: readonly ArrivalRow[] = await prisma.participant.findMany({
    where: { shareLinkId: params.shareLinkId, ...after(params.cursor) },
    orderBy: [{ joinedAt: 'desc' }, { id: 'desc' }],
    take: params.limit + 1,
    select: ARRIVAL_SELECT,
  });

  const page = rows.slice(0, params.limit);
  const last = page.at(-1);
  const hasMore = rows.length > params.limit && last !== undefined;

  return {
    arrivals: page.map(toEntry),
    nextCursor: hasMore ? encodeArrivalsCursor({ joinedAt: last.joinedAt, id: last.id }) : null,
  };
}
