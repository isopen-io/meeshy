/**
 * L'ANNONCE de mes appareils chiffrés (#19156, spec 2026-11-17 § 5.3, constats GW-04,
 * WEB-18, IOS-02 de l'audit du 2026-11-17).
 *
 * Une session volée enrôle un appareil sans que rien ne m'en prévienne, et un client modifié
 * ne se présentera jamais. L'annonce part donc de la PASSERELLE, à l'enrôlement, sans attendre
 * le nouvel appareil :
 *  - `e2ee:own-device-enrolled` vers les rooms de mes AUTRES appareils capables, à chaque
 *    génération neuve (`created`) et à chaque retour d'une génération retirée (`returning`) ;
 *  - `e2ee:own-device-retired` à chaque retrait ;
 *  - un push VISIBLE `e2ee_device_verification`, au titre et au corps génériques, sans libellé
 *    (texte choisi par un éventuel attaquant), sans clé, sans `tx`, dont aucun identifiant de
 *    regroupement ne porte le libellé (§ 7.6) ; soumis aux planchers de `push-type-routing.ts`
 *    (`null` tant qu'aucun client ne route ce type) ;
 *  - au plus 3 annonces individuelles par heure et par compte : au-delà, elles se regroupent
 *    (« N nouveaux appareils », push passif qui remplace le précédent) ;
 *  - une `request` ne repousse que si aucun push n'est parti pour sa génération depuis 10 min.
 *
 * Données du SERVEUR : elles déclenchent un affichage, jamais une approbation. Le serveur ne
 * sait pas quels appareils sont approuvés et ne devient jamais un tiers de confiance. Le
 * rapprochement de chaque appareil avec `GET /e2ee/devices` au démarrage et à chaque
 * reconnexion ne dépend ni de l'événement ni du push : ils n'en sont que l'accélération.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { readCapabilities, type E2EEOwnDevice } from '@meeshy/shared/types/e2ee-directory';
import {
  DEVICE_TRUST_CAPABILITY,
  E2EE_DEVICE_ANNOUNCEMENTS_PER_HOUR,
  E2EE_DEVICE_VERIFICATION_PUSH_TYPE,
  isComparablePlatform,
  type E2EEOwnDeviceEnrolledEventData,
} from '@meeshy/shared/types/e2ee-device-trust';
import { e2eePlatformSchema } from '@meeshy/shared/types/e2ee-directory';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';
import { enhancedLogger } from '../../utils/logger-enhanced';
import type { PushNotificationPayload } from '../PushNotificationService';
import { deviceRoomOf, type DeviceGeneration } from './device-room';
import { currentE2EEIO, type EnvelopeEmitter } from './envelope-delivery';
import type { SlidingWindowCounter } from './sliding-window';

const logger = enhancedLogger.child({ module: 'E2EEOwnDeviceAnnouncements' });

const HOUR_MS = 60 * 60 * 1000;
const PUSH_QUIET_MS = 10 * 60 * 1000;
/** Le regroupement des pushes d'annonce : une clé constante, qui ne porte jamais un libellé. */
export const E2EE_DEVICE_VERIFICATION_COLLAPSE_ID = 'e2ee-device-verification';

export type AnnouncementPrisma = Pick<PrismaClient, 'e2EEDevice' | 'user'>;

export type OwnDeviceAnnouncementsDeps = {
  readonly prisma: AnnouncementPrisma;
  readonly counters: SlidingWindowCounter;
  readonly now?: () => Date;
  readonly io?: () => EnvelopeEmitter | null | undefined;
  /** Le chokepoint `sendToUser` : vers les jetons du COMPTE (les jetons ne sont pas reliés à un appareil). */
  readonly push?: (params: { readonly userId: string; readonly payload: PushNotificationPayload }) => Promise<void>;
};

export type EnrolledGeneration = DeviceGeneration & { readonly returning: boolean };

export type OwnDeviceAnnouncements = {
  enrolled(generation: EnrolledGeneration): Promise<void>;
  requested(sender: DeviceGeneration): Promise<void>;
};

const ownPlatform = (raw: string): E2EEOwnDevice['platform'] => {
  const parsed = e2eePlatformSchema.safeParse(raw);
  return parsed.success ? parsed.data : 'unknown';
};

type ListedDevice = { readonly deviceId: number; readonly registrationId: number; readonly platform: string; readonly capabilities?: unknown };

const isCapable = (device: ListedDevice): boolean =>
  readCapabilities(device.capabilities).includes(DEVICE_TRUST_CAPABILITY) && isComparablePlatform(device.platform);

/** Mes autres appareils actifs et capables : ceux qui savent lire une annonce et agir. */
async function otherCapableRooms(
  prisma: Pick<PrismaClient, 'e2EEDevice'>,
  generation: DeviceGeneration,
): Promise<string[]> {
  const devices: ListedDevice[] = await prisma.e2EEDevice.findMany({
    where: { userId: generation.userId, retiredAt: null },
    select: { deviceId: true, registrationId: true, platform: true, capabilities: true },
  });
  return devices
    .filter((device) => !(device.deviceId === generation.deviceId && device.registrationId === generation.registrationId))
    .filter(isCapable)
    .map((device) => deviceRoomOf({ userId: generation.userId, deviceId: device.deviceId, registrationId: device.registrationId }));
}

/** La charge du push, valeur par valeur : ni libellé, ni clé, ni `tx` (§ 5.3, § 7.6). */
export function deviceVerificationPush(params: {
  readonly language: string;
  readonly fromDeviceId: number;
  readonly announcedInLastHour: number;
}): PushNotificationPayload {
  const grouped = params.announcedInLastHour > E2EE_DEVICE_ANNOUNCEMENTS_PER_HOUR;
  const data = { type: E2EE_DEVICE_VERIFICATION_PUSH_TYPE, fromDeviceId: String(params.fromDeviceId) };
  if (!grouped) {
    return {
      title: notificationString(params.language, 'e2ee.deviceVerification.title'),
      body: notificationString(params.language, 'e2ee.deviceVerification.body'),
      data,
    };
  }
  return {
    title: notificationString(params.language, 'e2ee.deviceVerification.groupedTitle', { count: params.announcedInLastHour }),
    body: notificationString(params.language, 'e2ee.deviceVerification.groupedBody'),
    data,
    collapseId: E2EE_DEVICE_VERIFICATION_COLLAPSE_ID,
    interruptionLevel: 'passive',
  };
}

export function createOwnDeviceAnnouncements(deps: OwnDeviceAnnouncementsDeps): OwnDeviceAnnouncements {
  const now = deps.now ?? (() => new Date());
  const io = deps.io ?? currentE2EEIO;

  const countAnnouncement = async (userId: string): Promise<number> =>
    (await deps.counters.hit(`announce:${userId}`, { max: Number.MAX_SAFE_INTEGER, windowMs: HOUR_MS, now: now().getTime() })).count;

  /** Un push au plus par génération et par 10 min : la `request` qui suit l'enrôlement ne repousse pas. */
  const mayPushFor = async (generation: DeviceGeneration): Promise<boolean> =>
    (await deps.counters.hit(`announce:push:${generation.userId}:${generation.deviceId}:${generation.registrationId}`, {
      max: 1,
      windowMs: PUSH_QUIET_MS,
      now: now().getTime(),
    })).allowed;

  const sendPush = async (generation: DeviceGeneration, announcedInLastHour: number): Promise<void> => {
    if (!deps.push) return;
    const user = await deps.prisma.user.findUnique({ where: { id: generation.userId }, select: RECIPIENT_LANG_SELECT });
    const payload = deviceVerificationPush({ language: recipientLanguage(user, 'fr'), fromDeviceId: generation.deviceId, announcedInLastHour });
    await deps.push({ userId: generation.userId, payload });
  };

  return {
    async enrolled(generation) {
      const device = await deps.prisma.e2EEDevice.findFirst({
        where: { userId: generation.userId, deviceId: generation.deviceId, registrationId: generation.registrationId, retiredAt: null },
        select: { platform: true, label: true, createdAt: true, capabilities: true },
      });
      if (!device) return;
      const announcedInLastHour = await countAnnouncement(generation.userId);
      const event: E2EEOwnDeviceEnrolledEventData = {
        deviceId: generation.deviceId,
        registrationId: generation.registrationId,
        platform: ownPlatform(device.platform),
        label: device.label ?? null,
        enrolledAt: device.createdAt.toISOString(),
        capabilities: readCapabilities(device.capabilities),
        returning: generation.returning,
        announcedInLastHour,
      };
      const server = io();
      (await otherCapableRooms(deps.prisma, generation)).forEach((room) => server?.to(room).emit(SERVER_EVENTS.E2EE_OWN_DEVICE_ENROLLED, event));
      if (await mayPushFor(generation)) await sendPush(generation, announcedInLastHour);
      logger.info('e2ee own device announced', { deviceId: generation.deviceId, returning: generation.returning, announcedInLastHour });
    },

    async requested(sender) {
      if (!(await mayPushFor(sender))) return;
      await sendPush(sender, await countAnnouncement(sender.userId));
    },
  };
}

/**
 * Au retrait : mes autres appareils capables apprennent qu'une génération n'est plus là. Ne
 * lève pas — une annonce perdue ne retient aucun retrait, et le rapprochement la rattrape.
 */
export async function announceRetiredGenerations(
  prisma: Pick<PrismaClient, 'e2EEDevice'>,
  retired: readonly DeviceGeneration[],
  io: () => EnvelopeEmitter | null | undefined = currentE2EEIO,
): Promise<void> {
  const server = io();
  if (!server || retired.length === 0) return;
  try {
    for (const generation of retired) {
      const rooms = await otherCapableRooms(prisma, generation);
      rooms.forEach((room) =>
        server.to(room).emit(SERVER_EVENTS.E2EE_OWN_DEVICE_RETIRED, { deviceId: generation.deviceId, registrationId: generation.registrationId }),
      );
    }
  } catch (error) {
    logger.warn('e2ee own device retirement not announced; reconciliation will catch up', { error });
  }
}
