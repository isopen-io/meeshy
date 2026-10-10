import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * L'unique écriture de `User.birthDate` hors administration (#9927) —
 * conditionnée EN BASE à l'absence de date, sous ses deux formes Mongo
 * (`null` présent, clé absente) : deux déclarations simultanées n'en écrivent
 * qu'une, quel que soit le chemin (`PUT /me/birth-date`, consentement vocal).
 * Rend `false` quand une date était déjà posée.
 */
export async function writeBirthDateOnce(
  prisma: Pick<PrismaClient, 'user'>,
  userId: string,
  data: { birthDate: Date } & Record<string, unknown>,
): Promise<boolean> {
  const written = await prisma.user.updateMany({
    where: { id: userId, OR: [{ birthDate: null }, { birthDate: { isSet: false } }] },
    data,
  });
  return written.count > 0;
}
