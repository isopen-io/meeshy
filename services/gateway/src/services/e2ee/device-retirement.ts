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
import { leaveDeviceRooms } from './device-room';
import { currentE2EEIO } from './envelope-delivery';

export type RetirementPrisma = Pick<PrismaClient, 'e2EEDevice' | 'e2EEOneTimePreKey' | 'messageEnvelope' | 'userSession'>;

type RowsPrisma = Pick<PrismaClient, 'e2EEDevice' | 'e2EEOneTimePreKey' | 'messageEnvelope'>;

type ErasurePrisma = RowsPrisma & Pick<PrismaClient, 'e2EERevokedIdentity' | 'e2EEBindingProof'>;

/**
 * Un appareil tel qu'un retrait l'a LU. Une place `(userId, deviceId)` se
 * reprend : le retrait ne vise que la génération lue (sa `registrationId`) liée
 * à la session lue, jamais la place (#12592).
 */
export type RetirableDevice = {
  readonly id: string;
  readonly userId: string;
  readonly deviceId: number;
  readonly registrationId: number;
  readonly sessionId: string;
};

export const RETIRABLE_DEVICE = { id: true, userId: true, deviceId: true, registrationId: true, sessionId: true } as const;

/**
 * Retire chaque appareil lu, s'il est toujours celui qu'on a lu, et efface ce
 * que SA génération ne lira jamais ; ses sockets quittent la room de sa
 * génération (#12592).
 */
export async function retireDeviceRows(
  prisma: RowsPrisma,
  params: { readonly devices: readonly RetirableDevice[]; readonly now: Date },
): Promise<RetirableDevice[]> {
  const retired: RetirableDevice[] = [];
  for (const device of params.devices) {
    const { count } = await prisma.e2EEDevice.updateMany({
      where: { id: device.id, sessionId: device.sessionId, registrationId: device.registrationId, retiredAt: null },
      data: { retiredAt: params.now },
    });
    if (count === 0) continue;
    await eraseGeneration(prisma, device);
    retired.push(device);
  }
  leaveDeviceRooms(currentE2EEIO(), retired);
  return retired;
}

/** Les pré-clés et les enveloppes d'UNE génération d'une place, et d'elle seule. */
export async function eraseGeneration(
  prisma: RowsPrisma,
  device: Pick<RetirableDevice, 'userId' | 'deviceId' | 'registrationId'>,
): Promise<void> {
  await prisma.e2EEOneTimePreKey.deleteMany({ where: { userId: device.userId, deviceId: device.deviceId, registrationId: device.registrationId } });
  await prisma.messageEnvelope.deleteMany({
    where: { recipientUserId: device.userId, recipientDeviceId: device.deviceId, recipientRegistrationId: device.registrationId },
  });
}

async function liveSessionIds(prisma: RetirementPrisma, sessionIds: readonly string[], now: Date): Promise<Set<string>> {
  if (sessionIds.length === 0) return new Set();
  const live = await prisma.userSession.findMany({
    where: { id: { in: [...new Set(sessionIds)] }, isValid: true, expiresAt: { gt: now } },
    select: { id: true },
  });
  return new Set(live.map((session) => session.id));
}

async function retireOrphans(prisma: RetirementPrisma, devices: readonly RetirableDevice[], now: Date): Promise<number> {
  const live = await liveSessionIds(prisma, devices.map((device) => device.sessionId), now);
  const retired = await retireDeviceRows(prisma, { devices: devices.filter((device) => !live.has(device.sessionId)), now });
  return retired.length;
}

/** Retire chaque appareil ACTIF de ce compte dont la session n'est plus vivante. */
export async function retireDevicesOfEndedSessions(
  prisma: RetirementPrisma,
  params: { readonly userId: string; readonly now: Date },
): Promise<number> {
  const devices = await prisma.e2EEDevice.findMany({ where: { userId: params.userId, retiredAt: null }, select: RETIRABLE_DEVICE });
  return retireOrphans(prisma, devices, params.now);
}

/** Retire l'appareil de cette session si elle n'est plus vivante. */
export async function retireDevicesOfSession(
  prisma: RetirementPrisma,
  params: { readonly sessionId: string; readonly now: Date },
): Promise<number> {
  const devices = await prisma.e2EEDevice.findMany({ where: { sessionId: params.sessionId, retiredAt: null }, select: RETIRABLE_DEVICE });
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
    const batch: RetirableDevice[] = await prisma.e2EEDevice.findMany({
      where: { retiredAt: null, ...(after ? { id: { gt: after } } : {}) },
      select: RETIRABLE_DEVICE,
      orderBy: { id: 'asc' },
      take,
    });
    if (batch.length === 0) return retired;
    retired += await retireOrphans(prisma, batch, params.now);
    after = batch[batch.length - 1].id;
  }
}

/** La purge du compte : ses appareils, ses pré-clés, les enveloppes qui lui sont adressées et la trace de ses preuves de liaison disparaissent. */
export async function eraseE2EEDataOfUser(
  prisma: ErasurePrisma,
  userId: string,
): Promise<{ devices: number; preKeys: number; envelopes: number }> {
  const [devices, preKeys, envelopes] = await Promise.all([
    prisma.e2EEDevice.deleteMany({ where: { userId } }),
    prisma.e2EEOneTimePreKey.deleteMany({ where: { userId } }),
    prisma.messageEnvelope.deleteMany({ where: { recipientUserId: userId } }),
    prisma.e2EERevokedIdentity.deleteMany({ where: { userId } }),
    prisma.e2EEBindingProof.deleteMany({ where: { userId } }),
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
