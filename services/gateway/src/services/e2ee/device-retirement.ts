/**
 * LE RETRAIT D'UN APPAREIL CHIFFRÉ (#3706, #12543) — un site unique.
 *
 * Un appareil est lié à la session (`UserSession`, claim `sid`) qui l'a enrôlé.
 * Quand cette session finit — déconnexion, révocation, expiration,
 * réinitialisation du mot de passe, purge du compte — l'appareil ne lira plus
 * jamais rien : il est retiré, ses pré-clés uniques et ses enveloppes en attente
 * sont effacées, et son numéro redevient libre. Sans ce retrait, les appareils
 * morts s'accumulaient jusqu'à rendre le compte injoignable (Sesame exige une
 * enveloppe par appareil actif) puis incapable d'enrôler.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

export type RetirementPrisma = Pick<PrismaClient, 'e2EEDevice' | 'e2EEOneTimePreKey' | 'messageEnvelope' | 'userSession'>;

type RowsPrisma = Pick<PrismaClient, 'e2EEDevice' | 'e2EEOneTimePreKey' | 'messageEnvelope'>;

/** Retire ces appareils du compte et efface ce qu'ils ne liront jamais. */
export async function retireDeviceRows(
  prisma: RowsPrisma,
  params: { readonly userId: string; readonly deviceIds: readonly number[]; readonly now: Date },
): Promise<void> {
  if (params.deviceIds.length === 0) return;
  const deviceId = { in: [...params.deviceIds] };
  await prisma.e2EEDevice.updateMany({ where: { userId: params.userId, deviceId, retiredAt: null }, data: { retiredAt: params.now } });
  await prisma.e2EEOneTimePreKey.deleteMany({ where: { userId: params.userId, deviceId } });
  await prisma.messageEnvelope.deleteMany({ where: { recipientUserId: params.userId, recipientDeviceId: deviceId } });
}

type ActiveRow = { id: string; userId: string; deviceId: number; sessionId: string };

async function liveSessionIds(prisma: RetirementPrisma, sessionIds: readonly string[], now: Date): Promise<Set<string>> {
  if (sessionIds.length === 0) return new Set();
  const live = await prisma.userSession.findMany({
    where: { id: { in: [...new Set(sessionIds)] }, isValid: true, expiresAt: { gt: now } },
    select: { id: true },
  });
  return new Set(live.map((session) => session.id));
}

async function retireOrphans(prisma: RetirementPrisma, devices: readonly ActiveRow[], now: Date): Promise<number> {
  const live = await liveSessionIds(prisma, devices.map((device) => device.sessionId), now);
  const orphans = devices.filter((device) => !live.has(device.sessionId));
  const byUser = orphans.reduce<Map<string, number[]>>(
    (groups, device) => groups.set(device.userId, [...(groups.get(device.userId) ?? []), device.deviceId]),
    new Map(),
  );
  for (const [userId, deviceIds] of byUser) await retireDeviceRows(prisma, { userId, deviceIds, now });
  return orphans.length;
}

const ACTIVE_ROW = { id: true, userId: true, deviceId: true, sessionId: true } as const;

/** Retire chaque appareil ACTIF de ce compte dont la session n'est plus vivante. */
export async function retireDevicesOfEndedSessions(
  prisma: RetirementPrisma,
  params: { readonly userId: string; readonly now: Date },
): Promise<number> {
  const devices = await prisma.e2EEDevice.findMany({ where: { userId: params.userId, retiredAt: null }, select: ACTIVE_ROW });
  return retireOrphans(prisma, devices, params.now);
}
