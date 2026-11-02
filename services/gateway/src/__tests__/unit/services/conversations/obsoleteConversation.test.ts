/**
 * #14643 — rendre une conversation OBSOLÈTE : le contenu illisible tout de
 * suite, la conversation hors de la liste de tous, `conversation:closed` pour
 * les anciens clients puis `conversation:obsoleted`, les notifications retirées.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  OBSOLETE_PURGE_DELAY_MS,
  obsoleteConversation,
} from '../../../../services/conversations/obsoleteConversation';

const CONV = '507f1f77bcf86cd799439011';
const ADMIN = '507f1f77bcf86cd799439022';
const ALICE = '507f1f77bcf86cd799439033';
const NOW = new Date('2026-11-02T10:00:00.000Z');

type Existing = { type?: string; identifier?: string; deletedAt: Date | null; purgeAfter: Date | null } | null;

function prismaDouble(existing: Existing = { deletedAt: null, purgeAfter: null }) {
  const participants = [
    { id: 'p-admin', userId: ADMIN, isActive: true },
    { id: 'p-alice', userId: ALICE, isActive: true },
    { id: 'p-gone', userId: '507f1f77bcf86cd799439044', isActive: false },
  ];
  const prisma = {
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue(existing),
      update: jest.fn<any>((args: any) => ({ op: 'conversation.update', args, participants })),
    },
    conversationShareLink: {
      updateMany: jest.fn<any>((args: any) => ({ op: 'shareLink.updateMany', args })),
    },
    message: {
      updateMany: jest.fn<any>((args: any) => ({ op: 'message.updateMany', args })),
    },
    notification: {
      findMany: jest.fn<any>().mockResolvedValue([
        { id: 'n-msg', userId: ALICE, type: 'new_message', context: { conversationId: CONV }, delivery: { pushSent: true } },
      ]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    $runCommandRaw: jest.fn<any>(async (cmd: any) => {
      if (cmd.find) {
        return {
          cursor: {
            firstBatch: [
              { _id: { $oid: 'n-invite' }, userId: { $oid: ALICE }, type: 'conversation_invite', context: { conversationId: CONV }, delivery: { pushSent: false } },
            ],
          },
        };
      }
      return { n: 1, ok: 1 };
    }),
    $transaction: jest.fn<any>(async (ops: any[]) => ops.map((op) => (op.op === 'conversation.update' ? { participants: op.participants } : { count: 3 }))),
  };
  return prisma;
}

function ioDouble() {
  const emitted: Array<{ rooms: string[]; event: string; payload: any }> = [];
  const chain = (rooms: string[]): any => ({
    to: (room: string) => chain([...rooms, room]),
    except: () => chain(rooms),
    emit: (event: string, payload: any) => emitted.push({ rooms, event, payload }),
  });
  return { io: { to: (room: string) => chain([room]) }, emitted };
}

async function rendreObsolete(existing?: Existing) {
  const prisma = prismaDouble(existing);
  const { io, emitted } = ioDouble();
  const manager = { endLiveLocationsForClosedConversation: jest.fn() };
  const announcer = { announceNotificationsRetracted: jest.fn<any>().mockResolvedValue(undefined) };
  const outcome = await obsoleteConversation(
    { prisma: prisma as never, io, manager, announcer },
    { conversationId: CONV, actorId: ADMIN, now: NOW },
  );
  return { prisma, emitted, manager, announcer, outcome };
}

describe('#14643 — rendre une conversation obsolète', () => {
  it('pose deletedAt et purgeAfter à 48 h, ET la clôture que lisent les anciens clients', async () => {
    const { prisma, outcome } = await rendreObsolete();
    const update = prisma.conversation.update.mock.calls[0][0] as any;
    expect(update.where).toEqual({ id: CONV });
    expect(update.data).toEqual({
      isActive: false,
      closedAt: NOW,
      closedBy: ADMIN,
      deletedAt: NOW,
      purgeAfter: new Date(NOW.getTime() + OBSOLETE_PURGE_DELAY_MS),
    });
    expect(OBSOLETE_PURGE_DELAY_MS).toBe(48 * 60 * 60 * 1000);
    expect(outcome).toEqual({
      kind: 'obsoleted',
      conversationId: CONV,
      obsoletedAt: NOW,
      purgeAfter: new Date(NOW.getTime() + OBSOLETE_PURGE_DELAY_MS),
    });
  });

  it('rend le contenu illisible tout de suite : tous les messages vivants reçoivent deletedAt, dans la même transaction', async () => {
    const { prisma } = await rendreObsolete();
    const ops = (prisma.$transaction.mock.calls[0][0] as any[]).map((op) => op.op);
    expect(ops).toEqual(['conversation.update', 'shareLink.updateMany', 'message.updateMany']);
    const erase = prisma.message.updateMany.mock.calls[0][0] as any;
    expect(erase.where).toEqual({ conversationId: CONV, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] });
    expect(erase.data).toEqual({ deletedAt: NOW });
    expect(prisma.conversationShareLink.updateMany.mock.calls[0][0]).toEqual({ where: { conversationId: CONV, isActive: true }, data: { isActive: false } });
  });

  it('annonce conversation:closed PUIS conversation:obsoleted aux seuls membres actifs', async () => {
    const { emitted, manager } = await rendreObsolete();
    expect(emitted.map((e) => e.event)).toEqual([SERVER_EVENTS.CONVERSATION_CLOSED, SERVER_EVENTS.CONVERSATION_OBSOLETED]);
    expect(emitted[0].payload).toEqual({ conversationId: CONV, closedBy: ADMIN, closedAt: NOW.toISOString() });
    expect(emitted[1].payload).toEqual({
      conversationId: CONV,
      obsoletedBy: ADMIN,
      obsoletedAt: NOW.toISOString(),
      purgeAfter: new Date(NOW.getTime() + OBSOLETE_PURGE_DELAY_MS).toISOString(),
    });
    for (const emission of emitted) {
      expect(emission.rooms).toEqual(expect.arrayContaining([`user:${ADMIN}`, `user:${ALICE}`]));
      expect(emission.rooms).not.toContain('user:507f1f77bcf86cd799439044');
    }
    expect(manager.endLiveLocationsForClosedConversation).toHaveBeenCalledWith(CONV);
  });

  it('retire les notifications de la conversation — par ses messages ET par leur contexte — puis les annonce', async () => {
    const { prisma, announcer } = await rendreObsolete();
    expect((prisma.notification.findMany.mock.calls[0][0] as any).where).toEqual({ message: { is: { conversationId: CONV } } });
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['n-msg'] } } });
    const deleteCmd = (prisma.$runCommandRaw.mock.calls as any[]).map((c) => c[0]).find((cmd) => cmd.delete);
    expect(deleteCmd).toEqual({ delete: 'Notification', deletes: [{ q: { 'context.conversationId': CONV }, limit: 0 }] });
    const retracted = (announcer.announceNotificationsRetracted.mock.calls[0][0] as any[]).map((r) => r.id).sort();
    expect(retracted).toEqual(['n-invite', 'n-msg']);
  });

  it('une conversation déjà obsolète ne se réécrit pas et ne repousse pas sa purge', async () => {
    const before = new Date('2026-11-01T10:00:00.000Z');
    const purgeAfter = new Date(before.getTime() + OBSOLETE_PURGE_DELAY_MS);
    const { prisma, emitted, outcome } = await rendreObsolete({ deletedAt: before, purgeAfter });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(emitted).toEqual([]);
    expect(outcome).toEqual({ kind: 'already-obsolete', conversationId: CONV, obsoletedAt: before, purgeAfter });
  });

  it('la conversation globale ne devient jamais obsolète, même désignée par son id', async () => {
    const { prisma, emitted, outcome } = await rendreObsolete({ type: 'global', identifier: 'meeshy', deletedAt: null, purgeAfter: null });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(emitted).toEqual([]);
    expect(outcome).toEqual({ kind: 'protected' });
  });

  it('une conversation introuvable ne s\'écrit pas', async () => {
    const { prisma, outcome } = await rendreObsolete(null);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: 'not-found' });
  });
});

describe('#14643 — un message admis avant l\'obsolescence mais écrit pendant sa transaction ne reste pas lisible', () => {
  function storeDouble() {
    const messages: Array<{ id: string; deletedAt: Date | null }> = [{ id: 'm-old', deletedAt: null }];
    const applyErase = (args: any) => {
      for (const message of messages) {
        if (message.deletedAt === null) message.deletedAt = args.data.deletedAt;
      }
      return { count: messages.length };
    };
    const prisma = {
      conversation: {
        findUnique: jest.fn<any>().mockResolvedValue({ deletedAt: null, purgeAfter: null }),
        update: jest.fn<any>((args: any) => ({ op: 'conversation.update', args })),
      },
      conversationShareLink: { updateMany: jest.fn<any>(() => ({ op: 'shareLink.updateMany' })) },
      message: {
        updateMany: jest.fn<any>((args: any) => ({
          op: 'message.updateMany',
          args,
          then: (resolve: (value: unknown) => void) => resolve(applyErase(args)),
        })),
      },
      notification: { findMany: jest.fn<any>().mockResolvedValue([]), deleteMany: jest.fn<any>() },
      $runCommandRaw: jest.fn<any>(async () => ({ cursor: { firstBatch: [] } })),
      $transaction: jest.fn<any>(async (ops: any[]) => {
        const results = ops.map((op) => (op.op === 'message.updateMany' ? applyErase(op.args) : op.op === 'conversation.update' ? { participants: [] } : { count: 0 }));
        messages.push({ id: 'm-late', deletedAt: null });
        return results;
      }),
    };
    return { prisma, messages };
  }

  it('rejoue l\'effacement après la transaction : le message écrit pendant elle naît lisible puis est effacé', async () => {
    const { prisma, messages } = storeDouble();
    await obsoleteConversation(
      { prisma: prisma as never, io: null, manager: null, announcer: null },
      { conversationId: CONV, actorId: ADMIN, now: NOW },
    );
    expect(messages).toEqual([
      { id: 'm-old', deletedAt: NOW },
      { id: 'm-late', deletedAt: NOW },
    ]);
  });
});
