/**
 * CE QU'UN LIEN D'INVITATION A PRODUIT (#7797) — le contrat
 * `ShareLinkStats` (`@meeshy/shared/types/share-link-stats`), calculé en six
 * lectures bornées et parallèles, sans une lecture par arrivant :
 *
 * - `visits` : le compteur que l'aperçu public incrémente
 *   (`shareLinkVisits.ts`) ; un lien né avant la colonne rend `0` ;
 * - `arrivals` / `anonymousArrivals` : les participants dont `shareLinkId`
 *   désigne ce lien — ceux qui sont partis depuis comptent : ils sont ARRIVÉS ;
 * - `arrivalsByLanguage` : un invité parle `Participant.language` (ce qu'il a
 *   choisi en entrant) ; un compte parle sa langue d'interface
 *   (`User.systemLanguage`, rang 1 du Prisme). Les deux se canonicalisent par
 *   la même source (`normalizeLanguageForDedup`) avant d'être fusionnées ;
 * - `arrivalsByCountry` : `Participant.joinCountry`, sans les inconnus ;
 * - `recentArrivals` : les vingt dernières, les plus récentes d'abord.
 *
 * Rien de la présence ni de l'IP d'un arrivant n'est lu : la projection est
 * fermée, elle ne peut pas servir ce qu'elle ne charge pas.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';
import {
  SHARE_LINK_RECENT_ARRIVALS_CAP,
  type ShareLinkArrival,
  type ShareLinkStats,
} from '@meeshy/shared/types/share-link-stats';

type Tally = ReadonlyArray<readonly [string, number]>;

const byCountDesc = (a: readonly [string, number], b: readonly [string, number]) => b[1] - a[1] || a[0].localeCompare(b[0]);

function mergeTallies(entries: Tally): Tally {
  const merged = entries.reduce<ReadonlyMap<string, number>>(
    (acc, [key, count]) => new Map(acc).set(key, (acc.get(key) ?? 0) + count),
    new Map(),
  );
  return [...merged.entries()].filter(([, count]) => count > 0).sort(byCountDesc);
}

const languageKey = (language: string | null | undefined): string | null => {
  const canonical = language ? normalizeLanguageForDedup(language) : '';
  return canonical === '' ? null : canonical;
};

type RecentArrivalRow = {
  readonly id: string;
  readonly type: string;
  readonly displayName: string;
  readonly avatar: string | null;
  readonly language: string;
  readonly joinedAt: Date;
  readonly joinCountry: string | null;
  readonly user: { readonly avatar: string | null; readonly systemLanguage: string | null } | null;
};

function toArrival(row: RecentArrivalRow): ShareLinkArrival {
  const isAnonymous = row.type === 'anonymous';
  return {
    participantId: row.id,
    displayName: row.displayName,
    avatar: row.avatar ?? row.user?.avatar ?? null,
    isAnonymous,
    country: row.joinCountry,
    language: languageKey(isAnonymous ? row.language : row.user?.systemLanguage ?? row.language),
    joinedAt: row.joinedAt.toISOString(),
  };
}

export async function computeShareLinkStats(
  prisma: Pick<PrismaClient, 'conversationShareLink' | 'participant' | 'user'>,
  shareLinkId: string,
): Promise<ShareLinkStats> {
  const fromLink = { shareLinkId };

  const [link, arrivals, anonymousArrivals, guestLanguages, accountLanguages, countries, recent] = await Promise.all([
    prisma.conversationShareLink.findUnique({ where: { id: shareLinkId }, select: { visitCount: true } }),
    prisma.participant.count({ where: fromLink }),
    prisma.participant.count({ where: { ...fromLink, type: 'anonymous' } }),
    prisma.participant.groupBy({ by: ['language'], where: { ...fromLink, type: 'anonymous' }, _count: { _all: true } }),
    prisma.user.groupBy({
      by: ['systemLanguage'],
      where: { participations: { some: { shareLinkId, type: 'user' } } },
      _count: { _all: true },
    }),
    prisma.participant.groupBy({ by: ['joinCountry'], where: fromLink, _count: { _all: true } }),
    prisma.participant.findMany({
      where: fromLink,
      orderBy: { joinedAt: 'desc' },
      take: SHARE_LINK_RECENT_ARRIVALS_CAP,
      select: {
        id: true,
        type: true,
        displayName: true,
        avatar: true,
        language: true,
        joinedAt: true,
        joinCountry: true,
        user: { select: { avatar: true, systemLanguage: true } },
      },
    }),
  ]);

  const languageTally = mergeTallies([
    ...guestLanguages.map((g) => [languageKey(g.language), g._count._all] as const),
    ...accountLanguages.map((u) => [languageKey(u.systemLanguage), u._count._all] as const),
  ].flatMap(([key, count]) => (key ? [[key, count] as const] : [])));

  const countryTally = mergeTallies(
    countries.flatMap((c) => (c.joinCountry ? [[c.joinCountry, c._count._all] as const] : [])),
  );

  return {
    visits: link?.visitCount ?? 0,
    arrivals,
    anonymousArrivals,
    arrivalsByLanguage: languageTally.map(([language, count]) => ({ language, count })),
    arrivalsByCountry: countryTally.map(([country, count]) => ({ country, count })),
    recentArrivals: recent.map(toArrival),
  };
}
