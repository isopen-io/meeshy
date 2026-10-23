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

/** Retire l'appareil de cette session si elle n'est plus vivante. */
export async function retireDevicesOfSession(
  prisma: RetirementPrisma,
  params: { readonly sessionId: string; readonly now: Date },
): Promise<number> {
  const devices = await prisma.e2EEDevice.findMany({ where: { sessionId: params.sessionId, retiredAt: null }, select: ACTIVE_ROW });
  return retireOrphans(prisma, devices, params.now);
}

const SWEEP_BATCH = 500;

/**
 * Le filet : retire, sur tous les comptes, l'appareil de toute session finie
 * par un chemin qui ne l'a pas fait lui-même (expiration, clôture d'équipe,
 * session effacée). Parcours par lots, curseur sur `id`.
 */
export async function sweepDevicesOfEndedSessions(
  prisma: RetirementPrisma,
  params: { readonly now: Date; readonly batchSize?: number },
): Promise<number> {
  const take = params.batchSize ?? SWEEP_BATCH;
  let retired = 0;
  let after: string | null = null;
  for (;;) {
    const batch: ActiveRow[] = await prisma.e2EEDevice.findMany({
      where: { retiredAt: null, ...(after ? { id: { gt: after } } : {}) },
      select: ACTIVE_ROW,
      orderBy: { id: 'asc' },
      take,
    });
    if (batch.length === 0) return retired;
    retired += await retireOrphans(prisma, batch, params.now);
    after = batch[batch.length - 1].id;
  }
}

/** La purge du compte : ses appareils, ses pré-clés et les enveloppes qui lui sont adressées disparaissent. */
export async function eraseE2EEDataOfUser(
  prisma: RowsPrisma,
  userId: string,
): Promise<{ devices: number; preKeys: number; envelopes: number }> {
  const [devices, preKeys, envelopes] = await Promise.all([
    prisma.e2EEDevice.deleteMany({ where: { userId } }),
    prisma.e2EEOneTimePreKey.deleteMany({ where: { userId } }),
    prisma.messageEnvelope.deleteMany({ where: { recipientUserId: userId } }),
  ]);
  return { devices: devices.count, preKeys: preKeys.count, envelopes: envelopes.count };
}

/** `sessionToken` : le condensat stocké dans `UserSession.sessionToken`, jamais le jeton. */
export type SessionEndScope = { readonly userId: string } | { readonly sessionId: string } | { readonly sessionToken: string };

async function sessionIdsOf(prisma: RetirementPrisma, scope: SessionEndScope): Promise<readonly string[]> {
  if ('sessionId' in scope) return [scope.sessionId];
  if (!('sessionToken' in scope)) return [];
  const sessions = await prisma.userSession.findMany({ where: { sessionToken: scope.sessionToken }, select: { id: true } });
  return sessions.map((session) => session.id);
}

/**
 * Pour les sites qui FERMENT une session : le retrait suit, sans jamais faire
 * échouer la fermeture — un retrait manqué est rattrapé par le balayage et par
 * le prochain enrôlement du compte.
 */
export async function retireDevicesAfterSessionEnd(
  prisma: RetirementPrisma,
  scope: SessionEndScope,
  onError: (error: unknown) => void,
): Promise<void> {
  const now = new Date();
  try {
    if ('userId' in scope) {
      await retireDevicesOfEndedSessions(prisma, { userId: scope.userId, now });
      return;
    }
    for (const sessionId of await sessionIdsOf(prisma, scope)) await retireDevicesOfSession(prisma, { sessionId, now });
  } catch (error) {
    onError(error);
  }
}
