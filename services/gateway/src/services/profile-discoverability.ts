/**
 * « Ne pas être trouvé » — la loi UNIQUE de découvrabilité d'un compte (#8104).
 *
 * `hideProfileFromSearch` (`packages/shared/types/preferences/privacy.ts`) est
 * écrit par l'écran Confidentialité dans le document `UserPreferences.privacy`,
 * relu par ce même écran, et n'était lu par AUCUNE porte : un compte qui
 * demandait à ne pas être trouvé l'était par numéro, par e-mail, par carnet
 * d'adresses et par nom.
 *
 * La loi : un compte caché est INTROUVABLE par toute résolution
 * identifiant → compte (numéro, e-mail, pseudo, nom, carnet) — sauf pour
 * lui-même et pour ses amis ACCEPTÉS. Une amitié en attente n'est pas une
 * amitié (`amitieAcceptee`, même critère).
 *
 * Elle ne gouverne PAS l'adresse d'un profil (`/u/:username`, `/users/:id`) :
 * suivre un lien qu'on vous a donné n'est pas chercher quelqu'un.
 *
 * ## Le repli est RESTRICTIF
 *
 * Le tableau de `preferences/privacy-cache.ts` départage les appelants selon ce
 * que la préférence décide. Celle-ci décide si une IDENTITÉ sort, pas si un
 * champ décore une charge qui part de toute façon : une lecture des
 * préférences ou des amitiés qui échoue écarte donc tous les candidats autres
 * que le lecteur. Une recherche appauvrie se relance ; un compte révélé ne se
 * cache plus.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { loadPrivacyPreferencesCached } from './preferences/privacy-cache';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'ProfileDiscoverability' });

export type DiscoverabilityFacts = {
  readonly hidesFromSearch: boolean;
  readonly isSelf: boolean;
  readonly areFriends: boolean;
};

export function isDiscoverableBy(facts: DiscoverabilityFacts): boolean {
  return facts.isSelf || facts.areFriends || !facts.hidesFromSearch;
}

type DiscoverabilityPrisma = Pick<PrismaClient, 'userPreferences' | 'userPreference' | 'friendRequest'>;

async function acceptedFriendsAmong(
  prisma: DiscoverabilityPrisma,
  viewerId: string,
  candidateIds: readonly string[]
): Promise<ReadonlySet<string>> {
  if (!viewerId || candidateIds.length === 0) return new Set();
  const rows = await prisma.friendRequest.findMany({
    where: {
      status: 'accepted',
      OR: [
        { senderId: viewerId, receiverId: { in: [...candidateIds] } },
        { senderId: { in: [...candidateIds] }, receiverId: viewerId },
      ],
    },
    select: { senderId: true, receiverId: true },
  });
  return new Set(rows.map((row) => (row.senderId === viewerId ? row.receiverId : row.senderId)));
}

/**
 * Les candidats que `viewerId` n'a PAS le droit de trouver.
 *
 * `viewerId` vide = lecteur anonyme : il n'a ni soi parmi les candidats ni amis.
 */
export async function undiscoverableAmong(
  prisma: DiscoverabilityPrisma,
  viewerId: string,
  candidateIds: readonly string[]
): Promise<ReadonlySet<string>> {
  const others = [...new Set(candidateIds)].filter((id) => id && id !== viewerId);
  if (others.length === 0) return new Set();

  try {
    const stored = await loadPrivacyPreferencesCached(prisma as PrismaClient, others);
    const hiding = others.filter((id) => stored.get(id)?.hideProfileFromSearch === true);
    if (hiding.length === 0) return new Set();

    const friends = await acceptedFriendsAmong(prisma, viewerId, hiding);
    return new Set(
      hiding.filter((id) => !isDiscoverableBy({ hidesFromSearch: true, isSelf: false, areFriends: friends.has(id) }))
    );
  } catch (error) {
    logger.error('discoverability resolution failed — failing closed', { count: others.length, error });
    return new Set(others);
  }
}

/** Filtre une liste de lignes portant un `id` de compte. */
export async function keepDiscoverable<T extends { readonly id: string }>(
  prisma: DiscoverabilityPrisma,
  viewerId: string,
  rows: readonly T[]
): Promise<T[]> {
  const hidden = await undiscoverableAmong(prisma, viewerId, rows.map((row) => row.id));
  return hidden.size === 0 ? [...rows] : rows.filter((row) => !hidden.has(row.id));
}
