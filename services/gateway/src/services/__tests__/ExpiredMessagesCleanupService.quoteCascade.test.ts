/**
 * #8630 — la destruction GLOBALE d'un éphémère emporte les réponses qui le
 * citent, transitivement : c'est la règle de l'EXPÉDITEUR d'une flamme-œil,
 * à qui aucune échéance n'est servie et qui garde donc la réponse jusqu'ici.
 * La réponse est détruite par le MÊME chemin que l'original (clair effacé,
 * `deletedAt`, annonce `message:expired` à la room).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { ExpiredMessagesCleanupService } from '../ExpiredMessagesCleanupService';

const NOW = new Date('2026-09-29T12:00:00.000Z');
const LAPSED = new Date('2026-09-29T11:00:00.000Z');
const AFTER_READ = MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ;

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  conversationId: 'conv-1',
  senderId: `p-${id}`,
  sender: { id: `p-${id}`, userId: `u-${id}` },
  content: `contenu ${id}`,
  metadata: null,
  messageType: 'text',
  expiresAt: null,
  attachments: [],
  createdAt: LAPSED,
  isViewOnce: false,
  ephemeralDuration: null,
  effectFlags: 0,
  ...over,
});

const flamme = row('flamme', { effectFlags: AFTER_READ, expiresAt: LAPSED });
const reponse = row('reponse');
const petiteReponse = row('petite-reponse');

const replyOf: Record<string, string> = { reponse: 'flamme', 'petite-reponse': 'reponse' };

function buildPrisma() {
  const byId = new Map([flamme, reponse, petiteReponse].map((r) => [r.id, r]));
  const message = {
    findMany: jest.fn(async ({ where }: any) => {
      if (where?.replyToId?.in) {
        return [...byId.values()]
          .filter((r) => where.replyToId.in.includes(replyOf[r.id]))
          .map((r) => ({ id: r.id, conversationId: r.conversationId }));
      }
      if (where?.id?.in) return where.id.in.map((id: string) => byId.get(id)).filter(Boolean);
      if (JSON.stringify(where).includes('viewOnceBurnAt')) return [];
      return [flamme];
    }),
    findFirst: jest.fn(async () => null),
    update: jest.fn(async () => ({})),
  };
  return {
    message,
    conversation: {
      findUnique: jest.fn(async () => ({ lastMessageAt: NOW, createdAt: NOW })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    notification: { findMany: jest.fn(async () => []), deleteMany: jest.fn(async () => ({ count: 0 })) },
    trackingLink: { updateMany: jest.fn(async () => ({ count: 0 })), findMany: jest.fn(async () => []) },
    conversationMessageStats: { findUnique: jest.fn(async () => null), update: jest.fn(async () => ({})) },
    $runCommandRaw: jest.fn(async () => ({ cursor: { firstBatch: [] } })),
  };
}

function buildManager() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return {
    emit,
    getIO: () => ({ to }),
    enqueueOfflineMessageMutation: jest.fn(async () => undefined),
    emitUnreadCountsToRecipients: jest.fn(async () => undefined),
  };
}

describe('ExpiredMessagesCleanupService — la destruction emporte les réponses (#8630)', () => {
  it('détruit chaque réponse, transitivement, par le même chemin que l’original', async () => {
    const prisma = buildPrisma();
    const manager = buildManager();
    const service = new ExpiredMessagesCleanupService(prisma as never, {
      attachmentRemover: { deleteAttachment: async () => undefined },
      now: () => NOW,
      resolveManager: () => manager as never,
    });

    const result = await service.cleanup(undefined);

    const erased = prisma.message.update.mock.calls.map(([args]: any) => args.where.id);
    expect(erased).toEqual(['flamme', 'reponse', 'petite-reponse']);
    for (const [args] of prisma.message.update.mock.calls as any[]) {
      expect(args.data).toMatchObject({ content: '', deletedAt: NOW });
    }
    expect(result).toEqual({ burned: 3 });
    const announced = manager.emit.mock.calls
      .filter(([event]: any) => event === 'message:expired')
      .map(([, payload]: any) => payload.messageId);
    expect(announced).toEqual(['flamme', 'reponse', 'petite-reponse']);
  });
});
