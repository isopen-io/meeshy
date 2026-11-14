/**
 * #18242 R2 — la citation d'un résumé d'appel dans `message:new`, sur les DEUX
 * transports (REST/ZMQ `MeeshySocketIOManager._broadcastNewMessage`, socket
 * `MessageHandler`), ne sert PAS la forme stockée des participants
 * `{ userId }` : la citation ne compose pas leurs noms, et le type servi
 * (`{ userId, displayName }`) la contredirait. Le retrait a UN site,
 * `servedQuotedMessage`, que `buildMessageNewPayload` répand APRÈS la forme
 * propre au transport ; ce témoin tombe s'il est remplacé par l'identité.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

import { getIoState } from './helpers/message-new-parity-mocks';
import { MeeshySocketIOManager } from '../MeeshySocketIOManager';
import { makeTranslationService, makePrisma, makeContractMessage, CONVERSATION_ID } from './helpers/message-new-parity-fixtures';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

type Emission = { readonly room: unknown; readonly event: unknown; readonly payload: { readonly replyTo?: { readonly metadata?: Record<string, unknown> } } };

const callSummary = {
  id: 'quoted-call-summary-01',
  senderId: 'author-participant',
  content: 'Appel audio · 00:42',
  originalLanguage: 'fr',
  messageType: 'system',
  effectFlags: 0,
  ephemeralDuration: null,
  expiresAt: null,
  deletedAt: null,
  createdAt: new Date('2026-11-14T09:00:00.000Z'),
  attachments: [],
  metadata: {
    kind: 'call', callId: 'call-1', initiatorId: 'user-author', callType: 'audio', outcome: 'completed', durationSeconds: 42,
    participants: [{ userId: 'user-author' }, { userId: 'user-awa' }],
  },
  sender: { id: 'author-participant', userId: 'user-author', displayName: 'Ada', user: { username: 'ada' } },
};

describe('message:new — la citation d’un résumé d’appel ne sert pas la liste stockée de ses participants (#18242)', () => {
  const ioState = getIoState();
  let emissions: Emission[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    emissions = [];
    ioState.to.mockImplementation((room: unknown) => {
      const chain: Record<string, unknown> = {};
      chain.except = () => chain;
      chain.to = () => chain;
      chain.emit = (event: unknown, payload: Emission['payload']) => {
        emissions.push({ room, event, payload });
        return true;
      };
      return chain;
    });
  });

  afterEach(() => {
    ioState.to.mockReturnValue(ioState.toChain);
  });

  type Transport = (manager: MeeshySocketIOManager, message: unknown) => Promise<unknown>;
  type WithSocketTransport = { readonly messageHandler: { broadcastNewMessage(message: unknown, conversationId: string): Promise<unknown> } };

  const transports: ReadonlyArray<readonly [string, Transport]> = [
    ['REST/ZMQ (`broadcastMessage`)', (manager, message) => manager.broadcastMessage(message as never, CONVERSATION_ID)],
    ['socket (`MessageHandler.broadcastNewMessage`)', (manager, message) =>
      (manager as unknown as WithSocketTransport).messageHandler.broadcastNewMessage(message, CONVERSATION_ID)],
  ];

  it.each(transports)('transport %s : `replyTo.metadata` garde l’avis d’appel, sans `participants`', async (_name, send) => {
    const manager = new MeeshySocketIOManager({} as never, makePrisma(), makeTranslationService() as never);
    await manager.initialize();

    await send(manager, makeContractMessage({ content: 'je réponds', replyToId: callSummary.id, replyTo: callSummary }));

    const toRoom = emissions.find((e) => e.event === SERVER_EVENTS.MESSAGE_NEW && e.room === ROOMS.conversation(CONVERSATION_ID));
    expect(toRoom?.payload.replyTo?.metadata).toMatchObject({ kind: 'call', callId: 'call-1', outcome: 'completed' });
    expect(toRoom?.payload.replyTo?.metadata).not.toHaveProperty('participants');
  });
});
