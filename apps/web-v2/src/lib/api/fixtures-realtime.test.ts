import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { createFixturesSocketClient } from './fixtures-realtime';

describe('createFixturesSocketClient (#5793) — le bouchon de fixtures', () => {
  test('`connect()` émet `authenticated` SYNCHRONEMENT, avec l’identité du POC', () => {
    const client = createFixturesSocketClient({ base: '', auth: { token: 't', sessionToken: 's' } });
    let received: unknown = null;
    client.on(SERVER_EVENTS.AUTHENTICATED, (payload) => {
      received = payload;
    });

    client.connect();

    expect(client.connected).toBe(true);
    expect(received).toEqual({
      success: true,
      user: { id: 'u-viewer', language: 'fr', isAnonymous: false },
      version: 'fixtures',
    });
  });

  test('`disconnect()` coupe le keepalive de frappe — aucun `typing:start` après', async () => {
    const client = createFixturesSocketClient({ base: '', auth: { token: 't', sessionToken: 's' } });
    let count = 0;
    client.on(SERVER_EVENTS.TYPING_START, () => (count += 1));
    client.connect();
    client.disconnect();

    await new Promise((r) => setTimeout(r, 20));
    expect(client.connected).toBe(false);
    expect(count).toBe(0);
  });

  test('`emit` est un no-op — jamais d’exception, aucune boucle vers soi-même', () => {
    const client = createFixturesSocketClient({ base: '', auth: { token: 't', sessionToken: 's' } });
    expect(() => client.emit('typing:start', { conversationId: 'c-deploiement' })).not.toThrow();
  });

  test('`off` retire l’écouteur — plus reçu après', () => {
    const client = createFixturesSocketClient({ base: '', auth: { token: 't', sessionToken: 's' } });
    let count = 0;
    const handler = () => (count += 1);
    client.on(SERVER_EVENTS.AUTHENTICATED, handler);
    client.off(SERVER_EVENTS.AUTHENTICATED, handler);
    client.connect();
    expect(count).toBe(0);
  });
});
