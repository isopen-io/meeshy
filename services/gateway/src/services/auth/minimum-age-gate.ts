/**
 * La porte de l'âge minimal (#9927) — un compte dont la date de naissance
 * DÉCLARÉE donne moins de 13 ans révolus n'ouvre aucune session et n'en
 * rafraîchit aucune. Calculée à chaque passage depuis `User.birthDate` : aucun
 * état stocké, la porte se rouvre d'elle-même le jour des 13 ans.
 *
 * Une lecture d'une colonne, posée là où une session NAÎT (`createSession`,
 * qu'empruntent toutes les connexions) et là où elle se PROLONGE
 * (`POST /auth/refresh`). La date ne sort jamais de cette unité : ni journal,
 * ni charge.
 */

import { isBelowMinimumAge } from '@meeshy/shared/utils/age';
import { AgeBelowMinimumError } from '../../errors/custom-errors';

export interface MinimumAgeReader {
  user: {
    findUnique(args: { where: { id: string }; select: { birthDate: true } }): Promise<{ birthDate?: Date | null } | null>;
  };
}

export async function accountIsBelowMinimumAge(prisma: MinimumAgeReader, userId: string, now: Date): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { birthDate: true } });
  return isBelowMinimumAge(user?.birthDate, now);
}

/** Lève `AgeBelowMinimumError` (403 `AGE_BELOW_MINIMUM`) pour un compte de moins de 13 ans. */
export async function assertAccountMeetsMinimumAge(prisma: MinimumAgeReader, userId: string, now: Date): Promise<void> {
  if (await accountIsBelowMinimumAge(prisma, userId, now)) throw new AgeBelowMinimumError();
}
