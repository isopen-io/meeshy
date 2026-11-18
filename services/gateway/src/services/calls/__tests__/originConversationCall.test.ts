import { describe, it, expect, jest } from '@jest/globals';
import { finishOriginConversation, originConversationActiveCallId } from '../originConversationCall';

const CALL = '64b7f0c2a1b2c3d4e5f60718';
const DIRECT = '64b7f0c2a1b2c3d4e5f60719';
const GROUP = '64b7f0c2a1b2c3d4e5f6071a';

describe('originConversationActiveCallId — le tête-à-tête d’origine sert l’appel parti dans son groupe (#19650)', () => {
  const prisma = (options: { activeCallId?: string | null; origin?: string | null; status?: string } = {}) => ({
    conversation: { findUnique: jest.fn(async () => ({ activeCallId: options.activeCallId === undefined ? CALL : options.activeCallId })) },
    callSession: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.id === CALL && where.originConversationId === (options.origin === undefined ? DIRECT : options.origin) && !where.status.notIn.includes(options.status ?? 'active')
          ? { id: CALL }
          : null
      ),
    },
  });

  it('rend l’appel vivant qui tient la réservation du tête-à-tête et en est parti', async () => {
    expect(await originConversationActiveCallId(prisma() as never, DIRECT)).toBe(CALL);
  });

  it('rien sans réservation, pour un appel qui n’en vient pas, ou pour un appel fini', async () => {
    expect(await originConversationActiveCallId(prisma({ activeCallId: null }) as never, DIRECT)).toBeNull();
    expect(await originConversationActiveCallId(prisma({ origin: 'elsewhere' }) as never, DIRECT)).toBeNull();
    expect(await originConversationActiveCallId(prisma({ status: 'ended' }) as never, DIRECT)).toBeNull();
  });
});

describe('finishOriginConversation — le tête-à-tête d’origine finit avec l’appel', () => {
  const terminal = { id: 'm-g', conversationId: GROUP, clientMessageId: `call-summary:${CALL}`, content: 'Appel vidéo · 2:10', metadata: { kind: 'call-summary', callId: CALL, outcome: 'completed' } };

  const prisma = (options: { origin?: string | null; originMessage?: { id: string; metadata: unknown } | null } = {}) => ({
    callSession: { findUnique: jest.fn(async () => ({ originConversationId: options.origin === undefined ? DIRECT : options.origin })) },
    conversation: {
      updateMany: jest.fn(async ({ where }: any) => ({ count: where.id === DIRECT && where.activeCallId === CALL ? 1 : 0 })),
    },
    message: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.conversationId === DIRECT && where.clientMessageId === `call-summary:${CALL}`
          ? (options.originMessage === undefined ? { id: 'm-d', metadata: { kind: 'call-live', callId: CALL } } : options.originMessage)
          : null
      ),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, conversationId: DIRECT, ...data })),
    },
  });

  it('rend la réservation du tête-à-tête, PUIS édite sa bulle « en cours » avec le même état terminal, sans en créer', async () => {
    const p = prisma();
    const mirrored = await finishOriginConversation(p as never, terminal);

    expect(p.conversation.updateMany).toHaveBeenCalledWith({ where: { id: DIRECT, activeCallId: CALL }, data: { activeCallId: null } });
    expect(mirrored).toMatchObject({ conversationId: DIRECT, message: { id: 'm-d', content: 'Appel vidéo · 2:10', metadata: terminal.metadata } });
    expect(p.message.update).toHaveBeenCalledTimes(1);
    expect(p.message.update.mock.calls[0][0]).toMatchObject({ where: { id: 'm-d' }, data: { content: 'Appel vidéo · 2:10', metadata: terminal.metadata } });
  });

  it('ne touche rien pour la bulle « en cours » elle-même, ni pour un appel sans origine', async () => {
    const live = { ...terminal, metadata: { kind: 'call-live', callId: CALL } };
    const p = prisma();
    expect(await finishOriginConversation(p as never, live)).toBeNull();
    expect(p.conversation.updateMany).not.toHaveBeenCalled();
    expect(await finishOriginConversation(prisma({ origin: null }) as never, terminal)).toBeNull();
  });

  it('une bulle d’origine déjà terminale ou absente n’est pas réécrite, mais la réservation est rendue', async () => {
    const done = prisma({ originMessage: { id: 'm-d', metadata: { kind: 'call-summary' } } });
    expect(await finishOriginConversation(done as never, terminal)).toEqual({ conversationId: DIRECT, message: null });
    expect(done.message.update).not.toHaveBeenCalled();
    expect(done.conversation.updateMany).toHaveBeenCalledTimes(1);
    expect(await finishOriginConversation(prisma({ originMessage: null }) as never, terminal)).toEqual({ conversationId: DIRECT, message: null });
  });

  it('ignore ce qui n’est pas un message d’appel', async () => {
    expect(await finishOriginConversation(prisma() as never, { id: 'x', content: 'salut', metadata: null })).toBeNull();
    expect(await finishOriginConversation(prisma() as never, null)).toBeNull();
  });
});
