import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Server as SocketIOServer } from 'socket.io';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

export class CleanupExpiredMessagesJob {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly intervalMs = 60_000;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly io?: SocketIOServer
  ) {}

  start(): void {
    if (this.intervalId) return;
    this.cleanup();
    this.intervalId = setInterval(() => this.cleanup(), this.intervalMs);
    console.log('[CleanupExpiredMessages] Job started (interval: 60s)');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async runNow(): Promise<void> {
    await this.cleanup();
  }

  private async cleanup(): Promise<void> {
    try {
      const now = new Date();

      const expired = await this.prisma.message.findMany({
        where: { expiresAt: { lte: now }, deletedAt: null },
        select: { id: true, conversationId: true },
        take: 500,
      });

      if (expired.length === 0) return;

      const ids = expired.map((m) => m.id);
      await this.prisma.message.updateMany({
        where: { id: { in: ids } },
        data: { deletedAt: now },
      });

      if (this.io) {
        const byConversation = new Map<string, string[]>();
        for (const { id, conversationId } of expired) {
          const list = byConversation.get(conversationId) ?? [];
          list.push(id);
          byConversation.set(conversationId, list);
        }
        for (const [conversationId, messageIds] of byConversation) {
          for (const messageId of messageIds) {
            this.io
              .to(ROOMS.conversation(conversationId))
              .emit(SERVER_EVENTS.MESSAGE_EXPIRED, { messageId, conversationId });
          }
        }
      }

      console.log(`[CleanupExpiredMessages] ✅ Purged ${expired.length} ephemeral message(s)`);
    } catch (error) {
      console.error('[CleanupExpiredMessages] Error:', error);
    }
  }
}
