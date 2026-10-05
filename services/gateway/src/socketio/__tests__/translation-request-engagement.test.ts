/**
 * `translation:request` (socket) crédite `tool.translation_request` (#8959) —
 * sur une traduction SERVIE (cache) ou DEMANDÉE (à la volée), jamais sur un
 * refus, et jamais pour un anonyme.
 *
 * Le handler est exercé sur un manager nu (`Object.create`) : seul ce qu'il
 * lit est posé, le vrai code de `_handleTranslationRequest` tourne tel quel.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { MeeshySocketIOManager } from '../MeeshySocketIOManager';

const MESSAGE_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const USER_ID = '507f1f77bcf86cd799439013';

function build(options: { cached?: boolean; member?: boolean; anonymous?: boolean; onDemandFails?: boolean } = {}) {
  const manager = Object.create(MeeshySocketIOManager.prototype) as Record<string, unknown>;
  const engagement = { recordActivity: jest.fn<any>().mockResolvedValue(undefined) };
  const socket = { id: 'sock-1', emit: jest.fn() };
  manager.prisma = {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: MESSAGE_ID,
        conversationId: CONV_ID,
        content: 'Hello',
        originalLanguage: 'en',
        senderId: 'p-1',
        encryptionMode: null,
      }),
    },
    participant: { findFirst: jest.fn<any>().mockResolvedValue(options.member === false ? null : { id: 'p-2' }) },
  };
  manager.socketToUser = new Map([['sock-1', USER_ID]]);
  manager.connectedUsers = new Map([
    [USER_ID, { id: USER_ID, isAnonymous: Boolean(options.anonymous), participantId: 'p-2' }],
  ]);
  manager.stats = { translations_sent: 0, errors: 0 };
  manager.translationService = {
    getTranslation: jest.fn<any>().mockResolvedValue(
      options.cached ? { translatedText: 'Bonjour', sourceLanguage: 'en', confidenceScore: 0.9 } : null,
    ),
    handleNewMessage: options.onDemandFails
      ? jest.fn<any>().mockRejectedValue(new Error('zmq down'))
      : jest.fn<any>().mockResolvedValue({ messageId: MESSAGE_ID }),
  };
  manager.translationRequestEngagement = engagement;
  const handle = () =>
    (manager as unknown as { _handleTranslationRequest: (s: unknown, d: unknown) => Promise<void> })._handleTranslationRequest(
      socket,
      { messageId: MESSAGE_ID, targetLanguage: 'fr' },
    );
  return { handle, engagement, socket };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('translation:request — tool.translation_request', () => {
  it('crédite une traduction servie depuis le cache, dans la conversation du message', async () => {
    const { handle, engagement, socket } = build({ cached: true });
    await handle();
    await flush();

    expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_TRANSLATION, expect.any(Object));
    expect(engagement.recordActivity).toHaveBeenCalledWith(USER_ID, 'tool.translation_request', { conversationId: CONV_ID });
  });

  it('crédite une traduction demandée à la volée', async () => {
    const { handle, engagement } = build({ cached: false });
    await handle();
    await flush();

    expect(engagement.recordActivity).toHaveBeenCalledTimes(1);
  });

  it('ne crédite pas une demande à la volée qui échoue', async () => {
    const { handle, engagement } = build({ cached: false, onDemandFails: true });
    await handle();
    await flush();

    expect(engagement.recordActivity).not.toHaveBeenCalled();
  });

  it('ne crédite rien à un non-membre', async () => {
    const { handle, engagement } = build({ cached: true, member: false });
    await handle();
    await flush();

    expect(engagement.recordActivity).not.toHaveBeenCalled();
  });

  it('ne crédite rien à un anonyme', async () => {
    const { handle, engagement } = build({ cached: true, anonymous: true });
    await handle();
    await flush();

    expect(engagement.recordActivity).not.toHaveBeenCalled();
  });
});
