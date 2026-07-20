import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, type SocketIOResponse } from '@meeshy/shared/types/socketio-events';
import { logger } from '../../utils/logger';

const ADMIN_ROLES = ['BIGBOSS', 'ADMIN'] as const;

export interface AdminAgentHandlerDeps {
  prisma: PrismaClient;
  socketToUser: Map<string, string>;
}

/**
 * Souscription des dashboards admin agent à la room `admin:agent`.
 * Le rôle (BIGBOSS|ADMIN) est vérifié côté serveur au join — mêmes rôles que
 * `requireAgentAdmin` sur les routes REST admin/agent.
 */
export class AdminAgentHandler {
  constructor(private deps: AdminAgentHandlerDeps) {}

  async handleSubscribe(socket: Socket, callback?: (response: SocketIOResponse) => void): Promise<void> {
    const userId = this.deps.socketToUser.get(socket.id);
    if (!userId) {
      callback?.({ success: false, error: 'Not authenticated' });
      return;
    }

    const user = await this.deps.prisma.user
      .findUnique({ where: { id: userId }, select: { role: true } })
      .catch(() => null);

    const isAdmin = !!user && (ADMIN_ROLES as readonly string[]).includes(user.role);
    if (!isAdmin) {
      callback?.({ success: false, error: 'Forbidden' });
      return;
    }

    Promise.resolve(socket.join(ROOMS.adminAgent())).catch(() => { /* best-effort */ });
    logger.debug('admin agent room joined', { socketId: socket.id, userId });
    callback?.({ success: true });
  }

  handleUnsubscribe(socket: Socket, callback?: (response: SocketIOResponse) => void): void {
    Promise.resolve(socket.leave(ROOMS.adminAgent())).catch(() => { /* best-effort */ });
    callback?.({ success: true });
  }
}
