/**
 * LE RETRAIT D'UN APPAREIL CHIFFRÉ (#3706, #12543) — un site unique.
 *
 * Un appareil est lié à la session (`UserSession`, claim `sid`) qui l'a enrôlé.
 * Quand cette session finit — déconnexion, révocation, expiration,
 * réinitialisation du mot de passe, purge du compte — l'appareil est retiré de
 * l'annuaire, ses pré-clés uniques sont effacées, et son numéro redevient libre.
 * Sans ce retrait, les appareils morts s'accumulaient jusqu'à rendre le compte
 * injoignable (Sesame exige une enveloppe par appareil actif) puis incapable
 * d'enrôler.
 *
 * Ses enveloppes en attente suivent la façon dont la session a fini (GW-13,
 * #19016) : une fin SANS geste de l'utilisateur — expiration, éviction au-delà de
 * `MAX_SESSIONS_PER_USER` — les GARDE pour la même installation, qui reprend sa
 * place à sa reconnexion (`takeSlot` ne vide que les enveloppes d'une AUTRE
 * génération) ; le balayage de 30 jours reste leur borne. Toute autre fin —
 * déconnexion, révocation, mot de passe changé, motif inconnu, session
 * disparue — les efface : fail-closed.
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
 * génération (#12592). `lapsedSessions` : les sessions finies SANS geste, dont
 * l'appareil garde ses enveloppes en attente (GW-13) ; absent, tout s'efface.
 */
export async function retireDeviceRows(
  prisma: RowsPrisma,
  params: { readonly devices: readonly RetirableDevice[]; readonly now: Date; readonly lapsedSessions?: ReadonlySet<string> },
): Promise<RetirableDevice[]> {
  const retired: RetirableDevice[] = [];
  for (const device of params.devices) {
    const { count } = await prisma.e2EEDevice.updateMany({
      where: { id: device.id, sessionId: device.sessionId, registrationId: device.registrationId, retiredAt: null },
      data: { retiredAt: params.now },
    });
    if (count === 0) continue;
    await eraseGeneration(prisma, device, { keepEnvelopes: params.lapsedSessions?.has(device.sessionId) ?? false });
    retired.push(device);
  }
  leaveDeviceRooms(currentE2EEIO(), retired);
  return retired;
}

/**
 * Les pré-clés et, sauf `keepEnvelopes`, les enveloppes d'UNE génération d'une
 * place, et d'elle seule.
 */
export async function eraseGeneration(
  prisma: RowsPrisma,
  device: Pick<RetirableDevice, 'userId' | 'deviceId' | 'registrationId'>,
  options: { readonly keepEnvelopes?: boolean } = {},
): Promise<void> {
  await prisma.e2EEOneTimePreKey.deleteMany({ where: { userId: device.userId, deviceId: device.deviceId, registrationId: device.registrationId } });
  if (options.keepEnvelopes) return;
  await prisma.messageEnvelope.deleteMany({
    where: { recipientUserId: device.userId, recipientDeviceId: device.deviceId, recipientRegistrationId: device.registrationId },
  });
}

/**
 * Les motifs d'une fin de session SANS geste de l'utilisateur, tels que
 * `SessionService` et le balayage d'échéance les écrivent
 * (`UserSession.invalidatedReason`, en minuscules ; le schéma en documente
 * d'anciens en majuscules) : l'échéance passée et l'éviction de la session la
 * moins récemment active. Toute autre fin est un geste, ou se lit comme tel.
 */
export const LAPSED_SESSION_REASONS: ReadonlySet<string> = new Set(['expired', 'session_limit_exceeded']);

type SessionFate = { readonly isValid: boolean; readonly expiresAt: Date; readonly invalidatedReason: string | null };

const isLive = (session: SessionFate, now: Date): boolean => session.isValid && session.expiresAt.getTime() > now.getTime();

/** Échue sans geste : échéance passée (encore marquée valide, pas encore balayée) ou close par un motif passif. */
const hasLapsed = (session: SessionFate, now: Date): boolean =>
  !isLive(session, now) && (session.isValid || LAPSED_SESSION_REASONS.has((session.invalidatedReason ?? '').toLowerCase()));

/** Les sessions encore vivantes, et celles qui ont fini sans geste ; une session disparue n'est ni l'une ni l'autre. */
async function sessionFates(
  prisma: RetirementPrisma,
  sessionIds: readonly string[],
  now: Date,
): Promise<{ readonly live: ReadonlySet<string>; readonly lapsed: ReadonlySet<string> }> {
  if (sessionIds.length === 0) return { live: new Set(), lapsed: new Set() };
  const sessions = await prisma.userSession.findMany({
    where: { id: { in: [...new Set(sessionIds)] } },
    select: { id: true, isValid: true, expiresAt: true, invalidatedReason: true },
  });
  return {
    live: new Set(sessions.filter((session) => isLive(session, now)).map((session) => session.id)),
    lapsed: new Set(sessions.filter((session) => hasLapsed(session, now)).map((session) => session.id)),
  };
}

async function retireOrphans(prisma: RetirementPrisma, devices: readonly RetirableDevice[], now: Date): Promise<number> {
  const { live, lapsed } = await sessionFates(prisma, devices.map((device) => device.sessionId), now);
  const ended = devices.filter((device) => !live.has(device.sessionId));
  const retired = await retireDeviceRows(prisma, { devices: ended, now, lapsedSessions: lapsed });
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

/**
 * La purge du compte : ses appareils, ses pré-clés, les enveloppes qui lui sont
 * adressées ET celles qu'il a émises (GWX-02, #12544 : ses messages sont
 * anonymisés pour tout le monde, un correspondant qui se reconnecte n'en reçoit
 * plus les enveloppes), et la trace de ses preuves de liaison disparaissent.
 */
export async function eraseE2EEDataOfUser(
  prisma: ErasurePrisma,
  userId: string,
): Promise<{ devices: number; preKeys: number; envelopes: number }> {
  const [devices, preKeys, envelopes] = await Promise.all([
    prisma.e2EEDevice.deleteMany({ where: { userId } }),
    prisma.e2EEOneTimePreKey.deleteMany({ where: { userId } }),
    prisma.messageEnvelope.deleteMany({ where: { OR: [{ recipientUserId: userId }, { senderUserId: userId }] } }),
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
