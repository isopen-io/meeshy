/**
 * QUI PEUT JOUER LA LIGUE (#9384) — les FAITS qu'`leagueAccess` (loi partagée)
 * attend, lus côté SERVEUR. Aucun n'est jamais pris d'une valeur envoyée par le
 * client.
 *
 *  - le niveau RECORD (le score en poche ne suffit pas : la frappe le débite) ;
 *  - la majorité VÉRIFIÉE (conformité A-3) : calculée depuis `birthDate`, jamais
 *    déclarée. `ageVerifiedAt` ne la relève pas : cette colonne atteste l'âge
 *    pour le profil vocal, pas pour la protection des mineurs d'un classement
 *    public. Absente ou illisible, la majorité n'est pas prouvée (fail-closed) ;
 *  - le consentement DATÉ (`User.publicLeagueConsentAt`) ;
 *  - la SUSPENSION (conformité A-7) : couper sa présence en ligne, se cacher de
 *    la recherche ou passer en « Jeu masqué » suspend l'appartenance — la
 *    ligue montre un total qui bouge avec l'activité, ce que ces trois réglages
 *    refusent de montrer. Une lecture illisible suspend (fail-closed).
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isAdult } from '@meeshy/shared/utils/age';
import { levelForUnlocks } from '@meeshy/shared/utils/game/levels';
import { leagueAccess, type LeagueAccess } from '@meeshy/shared/utils/game/league';
import { loadPrivacyPreferencesCached } from '../preferences/privacy-cache';

export const adultVerifiedOf = (user: { readonly birthDate?: Date | null }, now: Date = new Date()): boolean =>
  isAdult(user.birthDate ?? null, now);

export type LeagueFacts = {
  readonly levelRecord: number;
  readonly adultVerified: boolean;
  readonly consented: boolean;
  readonly timezone: string | null;
};

export const LEAGUE_FACTS_SELECT = {
  engagementScore: true,
  levelRecord: true,
  birthDate: true,
  publicLeagueConsentAt: true,
  timezone: true,
} as const;

type LeagueFactsRow = {
  readonly engagementScore?: number | null;
  readonly levelRecord?: number | null;
  readonly birthDate?: Date | null;
  readonly publicLeagueConsentAt?: Date | null;
  readonly timezone?: string | null;
};

export function leagueFactsOf(row: LeagueFactsRow | null | undefined, now: Date = new Date()): LeagueFacts {
  return {
    levelRecord: Math.max(levelForUnlocks(row?.engagementScore ?? 0), row?.levelRecord ?? 0),
    adultVerified: adultVerifiedOf(row ?? {}, now),
    consented: row?.publicLeagueConsentAt != null,
    timezone: row?.timezone ?? null,
  };
}

export async function loadLeagueFacts(prisma: PrismaClient, userId: string, now: Date = new Date()): Promise<LeagueFacts> {
  return leagueFactsOf(await prisma.user.findUnique({ where: { id: userId }, select: LEAGUE_FACTS_SELECT }), now);
}

export const accessOf = (facts: LeagueFacts): LeagueAccess =>
  leagueAccess({ levelRecord: facts.levelRecord, adultVerified: facts.adultVerified, consented: facts.consented });

/**
 * Lesquels de ces comptes ont suspendu leur appartenance : « Jeu masqué »,
 * présence en ligne coupée, caché de la recherche — ou réglages illisibles.
 */
export async function suspendedAmong(prisma: PrismaClient, userIds: readonly string[]): Promise<ReadonlySet<string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Set();
  try {
    const [stored, profiles] = await Promise.all([
      loadPrivacyPreferencesCached(prisma, ids),
      prisma.gameProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true, gameHiddenAt: true }, take: ids.length }),
    ]);
    const hidden = new Set(profiles.filter((p) => p.gameHiddenAt != null).map((p) => p.userId));
    return new Set(
      ids.filter((id) => {
        const prefs = stored.get(id);
        return hidden.has(id) || prefs?.showOnlineStatus === false || prefs?.hideProfileFromSearch === true;
      }),
    );
  } catch {
    return new Set(ids);
  }
}

/** Lesquels de ces comptes ont coupé leur présence en ligne (le total se sert alors à la granularité du jour). */
export async function presenceCutAmong(prisma: PrismaClient, userIds: readonly string[]): Promise<ReadonlySet<string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Set();
  try {
    const stored = await loadPrivacyPreferencesCached(prisma, ids);
    return new Set(ids.filter((id) => stored.get(id)?.showOnlineStatus === false));
  } catch {
    return new Set(ids);
  }
}
