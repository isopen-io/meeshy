/**
 * Une réaction de pièce jointe PERSISTÉE est accusée, quoi qu'il arrive ensuite.
 *
 * `ReactionHandler` — la jumelle — écrit la règle en toutes lettres : « The
 * reaction is now PERSISTED. ACK immediately: everything below … is a
 * post-success side-effect. A transient failure in those reads must NOT flip
 * the ACK to failure — that would make the client roll back a reaction already
 * committed to the DB ».
 *
 * `AttachmentReactionHandler` accusait en DERNIÈRE instruction du `try` dont le
 * `catch` répond `{ success: false }`. Une levée de la lecture du résumé ou de
 * l'émission de room produisait donc trois choses d'un coup :
 *
 *  - un accusé d'ÉCHEC sur une écriture réussie — le client annule son
 *    optimiste et ré-affiche l'absence d'une réaction qui EST en base ;
 *  - aucune diffusion de room ;
 *  - aucune entrée de file hors ligne, la seule garantie DURABLE du chemin.
 *
 * Le dépôt écrit lui-même qu'`io.to(room).emit(...)` LÈVE quand l'adaptateur ou
 * l'encodeur est en défaut. C'est la forme littérale du cycle 130 bis, rejouée
 * sur la famille jumelle.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { AttachmentReactionHandler } from '../../../socketio/handlers/AttachmentReactionHandler';

const CONV = '507f1f77bcf86cd799450011';
const MESSAGE = '507f1f77bcf86cd799450021';
const ATTACHMENT = '507f1f77bcf86cd799450031';
const PARTICIPANT = '507f1f77bcf86cd799450041';
const USER = '507f1f77bcf86cd799450051';

jest.mock('../../../socketio/utils/participant-resolver', () => ({
  resolveParticipantFromMessage: async () => ({
    participantId: PARTICIPANT,
    userId: USER,
    isAnonymous: false,
    displayName: 'Ana',
  }),
}));

jest.mock('../../../utils/socket-rate-limiter.js', () => ({
  ...(jest.requireActual('../../../utils/socket-rate-limiter.js') as object),
  getSocketRateLimiter: () => ({ checkLimit: async () => true }),
}));

function harness(options: { readonly summaryThrows?: boolean; readonly emitThrows?: boolean } = {}) {
  const deps = {
    io: {
      to: () => ({
        emit: () => {
          if (options.emitThrows) throw new Error('adapter down');
        },
      }),
    },
    prisma: {
      messageAttachment: { findUnique: async () => ({ messageId: MESSAGE }) },
      participant: { findMany: async () => [] },
      conversation: { findUnique: async () => null },
    },
    service: {
      resolveConversationId: async () => CONV,
      addAttachmentReaction: async () => ({ changed: true, at: new Date('2026-11-08T12:00:00.000Z') }),
      removeAttachmentReaction: async () => true,
      getReactionSummary: async () => {
        if (options.summaryThrows) throw new Error('mongo down');
        return { '❤️': 1 };
      },
    },
    socketToUser: new Map([['socket-1', USER]]),
    connectedUsers: new Map(),
    deliveryQueue: null,
  };
  const handler = new AttachmentReactionHandler(deps as never);
  return { handler };
}

const ack = () => {
  const calls: Array<{ success: boolean }> = [];
  return { calls, fn: (response: { success: boolean }) => calls.push(response) };
};

describe('l’accusé d’une réaction de pièce jointe suit la PERSISTANCE, pas les effets d’après', () => {
  it('nominal : un seul accusé, et il dit succès', async () => {
    const { handler } = harness();
    const a = ack();
    await handler.handleAdd({ id: 'socket-1' } as never, { attachmentId: ATTACHMENT, messageId: MESSAGE, emoji: '❤️' }, a.fn as never);
    expect(a.calls).toEqual([{ success: true }]);
  });

  it('la lecture du résumé LÈVE : la réaction est écrite, donc l’accusé reste un SUCCÈS', async () => {
    const { handler } = harness({ summaryThrows: true });
    const a = ack();
    await handler.handleAdd({ id: 'socket-1' } as never, { attachmentId: ATTACHMENT, messageId: MESSAGE, emoji: '❤️' }, a.fn as never);
    expect(a.calls).toEqual([{ success: true }]);
  });

  it('l’émission de room LÈVE : l’accusé reste un succès, et il n’est appelé QU’UNE fois', async () => {
    const { handler } = harness({ emitThrows: true });
    const a = ack();
    await handler.handleAdd({ id: 'socket-1' } as never, { attachmentId: ATTACHMENT, messageId: MESSAGE, emoji: '❤️' }, a.fn as never);
    // Le double appel est l'autre moitié du défaut : sans `try` propre aux
    // effets d'après, la levée atteindrait le `catch` extérieur, qui rappellerait
    // le callback avec un ÉCHEC après le succès déjà envoyé.
    expect(a.calls).toEqual([{ success: true }]);
  });

  it('un refus AVANT la persistance reste un échec — la règle ne couvre que ce qui est écrit', async () => {
    const { handler } = harness();
    const a = ack();
    await handler.handleAdd({ id: 'socket-1' } as never, { attachmentId: 'pas-un-objectid', messageId: MESSAGE, emoji: '❤️' }, a.fn as never);
    expect(a.calls).toHaveLength(1);
    expect(a.calls[0].success).toBe(false);
  });
});
