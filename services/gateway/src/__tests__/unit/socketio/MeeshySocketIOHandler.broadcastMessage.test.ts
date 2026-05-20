/**
 * Régression temps réel — MeeshySocketIOHandler.broadcastMessage
 *
 * Bug : un message envoyé via la route REST `POST /conversations/:id/messages`
 * n'atteignait jamais les autres participants en temps réel. La route appelle
 * `socketIOHandler.broadcastMessage(message, conversationId)`, mais
 * l'implémentation du handler ignorait `conversationId` et émettait
 * `system:message` à TOUS les sockets connectés au lieu de `message:new` dans
 * la room de la conversation. Les clients (iOS, web) n'écoutent que
 * `message:new` — le message n'apparaissait donc qu'après un rechargement
 * manuel (quitter puis revenir dans la conversation).
 *
 * Le handler DOIT déléguer à `MeeshySocketIOManager.broadcastMessage(message,
 * conversationId)`, le broadcast par-conversation prévu à cet effet, qui émet
 * `message:new` vers `ROOMS.conversation(id)`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../socketio/MeeshySocketIOManager', () => ({
  MeeshySocketIOManager: jest.fn(),
}));
jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn(),
}));

import { MeeshySocketIOHandler } from '../../../socketio/MeeshySocketIOHandler';

function makeHandler() {
  const handler = new MeeshySocketIOHandler({} as any, 'test-secret', {} as any);
  const managerBroadcastMessage = jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined);
  const managerBroadcast = jest.fn();
  // `socketIOManager` est privé et n'est instancié que dans `setupSocketIO`
  // (qui exige un vrai serveur HTTP) — on injecte un manager mocké pour
  // tester la délégation de `broadcastMessage` de façon isolée.
  (handler as any).socketIOManager = {
    broadcastMessage: managerBroadcastMessage,
    broadcast: managerBroadcast,
  };
  return { handler, managerBroadcastMessage, managerBroadcast };
}

describe('MeeshySocketIOHandler.broadcastMessage', () => {
  const message = { id: 'm_1', conversationId: 'c_1', content: 'hello' };

  it('délègue au broadcast par-conversation du manager (message:new dans la room)', async () => {
    const { handler, managerBroadcastMessage } = makeHandler();

    // La route REST accède au handler en `any` et l'appelle avec deux
    // arguments — on reproduit ce site d'appel.
    await (handler as any).broadcastMessage(message, 'c_1');

    expect(managerBroadcastMessage).toHaveBeenCalledTimes(1);
    expect(managerBroadcastMessage).toHaveBeenCalledWith(message, 'c_1');
  });

  it('ne retombe PAS sur un broadcast global system:message', async () => {
    const { handler, managerBroadcast } = makeHandler();

    await (handler as any).broadcastMessage(message, 'c_1');

    expect(managerBroadcast).not.toHaveBeenCalled();
  });
});
