/**
 * La room socket d'un appareil E2EE (#3706) : `device:<userId>:<deviceId>:<registrationId>`.
 * Une socket n'y entre que si l'appareil ACTIF lié à SA session (`sid` vérifié
 * du JWT) porte ce numéro — jamais sur la seule déclaration du client. C'est ce
 * qui garantit qu'une enveloppe ne part qu'à son appareil.
 *
 * La room nomme la GÉNÉRATION, pas la place : une place se reprend par une autre
 * installation, et la socket restée d'un appareil retiré ne reçoit rien de
 * celle qui lui succède (#12592). Le retrait l'en fait sortir de toute façon
 * (`leaveDeviceRooms`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'E2EEDeviceRoom' });

type JoinableSocket = { join(room: string): unknown; readonly data?: unknown };

/** Une génération d'appareil : la place et la `registrationId` qui l'occupe. */
export type DeviceGeneration = { readonly userId: string; readonly deviceId: number; readonly registrationId: number };

export const deviceRoomOf = (generation: DeviceGeneration): string =>
  ROOMS.device(generation.userId, generation.deviceId, generation.registrationId);

export async function joinE2EEDeviceRoom(
  socket: JoinableSocket,
  prisma: Pick<PrismaClient, 'e2EEDevice'>,
  params: { readonly userId: string; readonly sessionId?: string | null },
): Promise<number | null> {
  if (!params.sessionId) return null;
  try {
    const device = await prisma.e2EEDevice.findFirst({
      where: { userId: params.userId, sessionId: params.sessionId, retiredAt: null },
      select: { deviceId: true, registrationId: true },
    });
    if (!device) return null;
    await socket.join(deviceRoomOf({ userId: params.userId, ...device }));
    return device.deviceId;
  } catch (error) {
    logger.warn('e2ee device room not joined; envelopes stay readable by GET /e2ee/envelopes', { userId: params.userId, error });
    return null;
  }
}

type SocketsOfRoom = { in(room: string): { fetchSockets(): Promise<readonly JoinableSocket[]> } };

const sessionOf = (socket: JoinableSocket): unknown => (socket.data as { sessionId?: unknown } | undefined)?.sessionId;

/** À l'enrôlement : les sockets DÉJÀ ouvertes de cette session rejoignent la room de leur appareil. */
export async function joinSessionSocketsToDeviceRoom(
  io: SocketsOfRoom | null | undefined,
  params: DeviceGeneration & { readonly sessionId: string },
): Promise<void> {
  if (!io) return;
  const sockets = await io.in(ROOMS.user(params.userId)).fetchSockets();
  await Promise.all(sockets.filter((socket) => sessionOf(socket) === params.sessionId).map((socket) => socket.join(deviceRoomOf(params))));
}

type RoomLeaver = { in(room: string): { socketsLeave(room: string): unknown } };

/** Au retrait : plus aucune socket ne reste dans la room des générations retirées. */
export function leaveDeviceRooms(io: RoomLeaver | null | undefined, generations: readonly DeviceGeneration[]): void {
  if (!io) return;
  generations.forEach((generation) => {
    const room = deviceRoomOf(generation);
    try {
      io.in(room).socketsLeave(room);
    } catch (error) {
      logger.warn('e2ee device room not left after retirement', { userId: generation.userId, error });
    }
  });
}
