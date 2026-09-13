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

  /**
   * LA CHRONOLOGIE `c-live` (#6171, G6) — `disconnect()` annule AUSSI les
   * minuteurs À UN COUP (`atMs`), pas seulement l'intervalle répété
   * d'Amina : sans cette extension, un `disconnect()` survenu entre deux
   * événements laissait le suivant partir dans le vide.
   */
  test('`disconnect()` coupe AUSSI la chronologie `c-live` (minuteurs à un coup)', async () => {
    const client = createFixturesSocketClient({ base: '', auth: { token: 't', sessionToken: 's' } });
    let translations = 0;
    client.on(SERVER_EVENTS.MESSAGE_TRANSLATION, () => (translations += 1));
    client.connect();
    client.disconnect();

    await new Promise((r) => setTimeout(r, 2100));
    expect(translations).toBe(0);
  });

  test('la chronologie `c-live` greffe la traduction anglaise à 2 s puis française à 3,5 s', async () => {
    const client = createFixturesSocketClient({ base: '', auth: { token: 't', sessionToken: 's' } });
    const received: unknown[] = [];
    client.on(SERVER_EVENTS.MESSAGE_TRANSLATION, (payload) => received.push(payload));
    client.connect();

    await new Promise((r) => setTimeout(r, 2200));
    expect(received).toHaveLength(1);
    expect((received[0] as { translations: readonly { targetLanguage: string }[] }).translations[0]?.targetLanguage).toBe('en');

    await new Promise((r) => setTimeout(r, 1500));
    expect(received).toHaveLength(2);
    expect((received[1] as { translations: readonly { targetLanguage: string }[] }).translations[0]?.targetLanguage).toBe('fr');

    client.disconnect();
  });
});
