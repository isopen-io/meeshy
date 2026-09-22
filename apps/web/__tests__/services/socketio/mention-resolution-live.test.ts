/**
 * Pendant du test REST (`conversations/mention-resolution-arrival.test.ts`) pour
 * le chemin TEMPS RÉEL : `MessageHandler` pose `mentionedUsers` sur le message
 * diffusé par `message:new`, et le convertisseur socket doit le reporter — sinon
 * la bulle live affiche le handle et la même bulle, rechargée, affiche le nom
 * (#7458). Même défaut de forme que `translations` au #3644.
 */
jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: jest.fn(() => null),
    getAnonymousSession: jest.fn(() => null),
    logout: jest.fn(),
    registerOnTokensUpdated: jest.fn(() => jest.fn()),
    registerOnClear: jest.fn(),
  },
}));

jest.mock('@/lib/config', () => ({
  getWebSocketUrl: jest.fn(() => 'wss://test.meeshy.me'),
}));

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    connected: false,
  })),
}));

import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import type { Message } from '@meeshy/shared/types';

/**
 * Le convertisseur est `private` : il n'est pas appelé du dehors en production
 * mais remis à l'orchestrateur (`setMessageConverter`), qui l'exécute sur chaque
 * `message:new`. L'exercer directement est la façon la plus proche du réel sans
 * monter un socket — la suite voisine `meeshy-socketio.service.test.ts` procède
 * de même.
 */
const convert = (payload: object): Message =>
  (meeshySocketIOService as unknown as {
    convertSocketMessageToMessage: (m: unknown) => Message;
  }).convertSocketMessageToMessage(payload);

const basePayload = {
  id: 'msg-live-1',
  conversationId: 'conv-1',
  senderId: 'user-1',
  content: 'salut @jdupont42',
  originalLanguage: 'fr',
  messageType: 'text',
  createdAt: '2026-09-22T10:00:00.000Z',
  updatedAt: '2026-09-22T10:00:00.000Z',
  validatedMentions: ['jdupont42'],
} as never;

describe('chemin socket — la résolution de mention du broadcast atteint le message', () => {
  it('reporte les personnes résolues posées par le gateway', () => {
    const jean = { userId: 'u1', username: 'jdupont42', displayName: 'Jean Dupont', avatar: null };
    const converted = convert({ ...(basePayload as object), mentionedUsers: [jean] });

    expect(converted.mentionedUsers).toEqual([jean]);
  });

  it('laisse le champ absent quand le broadcast ne résout personne', () => {
    const converted = convert({ ...(basePayload as object) });
    expect(converted.mentionedUsers).toBeUndefined();
  });
});
