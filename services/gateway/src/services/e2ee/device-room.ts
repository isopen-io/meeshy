/**
 * La room socket d'un appareil E2EE (#3706) : `device:<userId>:<deviceId>`.
 * Une socket n'y entre que si l'appareil ACTIF lié à SA session (`sid` vérifié
 * du JWT) porte ce numéro — jamais sur la seule déclaration du client. C'est ce
 * qui garantit qu'une enveloppe ne part qu'à son appareil.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'E2EEDeviceRoom' });

type JoinableSocket = { join(room: string): unknown; readonly data?: unknown };

export async function joinE2EEDeviceRoom(
  socket: JoinableSocket,
  prisma: Pick<PrismaClient, 'e2EEDevice'>,
  params: { readonly userId: string; readonly sessionId?: string | null },
): Promise<number | null> {
  if (!params.sessionId) return null;
  try {
    const device = await prisma.e2EEDevice.findFirst({
      where: { userId: params.userId, sessionId: params.sessionId, retiredAt: null },
      select: { deviceId: true },
    });
    if (!device) return null;
    await socket.join(ROOMS.device(params.userId, device.deviceId));
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
  params: { readonly userId: string; readonly sessionId: string; readonly deviceId: number },
): Promise<void> {
  if (!io) return;
  const sockets = await io.in(ROOMS.user(params.userId)).fetchSockets();
  await Promise.all(
    sockets.filter((socket) => sessionOf(socket) === params.sessionId).map((socket) => socket.join(ROOMS.device(params.userId, params.deviceId))),
  );
}
