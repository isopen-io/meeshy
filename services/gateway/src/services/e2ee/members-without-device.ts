/**
 * #20073 — un tête-à-tête chiffré de bout en bout dont un membre n'a aucun
 * appareil chiffré actif est MORT : rien ne peut y partir, et il ne se quitte
 * pas (#12949). L'activation comme la naissance en `e2ee` demandent donc ce
 * site UNIQUE qui, parmi des membres, n'a aucun appareil actif.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

export type DeviceHolders = { readonly e2EEDevice: Pick<PrismaClient['e2EEDevice'], 'findMany'> };

export async function membersWithoutEndToEndDevice(prisma: DeviceHolders, userIds: readonly string[]): Promise<readonly string[]> {
  const equipped = await prisma.e2EEDevice.findMany({
    where: { userId: { in: [...userIds] }, retiredAt: null },
    select: { userId: true },
  });
  const holders = new Set(equipped.map((device) => device.userId));
  return [...new Set(userIds)].filter((userId) => !holders.has(userId));
}
