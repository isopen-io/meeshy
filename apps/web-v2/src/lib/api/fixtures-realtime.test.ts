import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { CONVERSATIONS } from './fixtures';
import { createFixturesSocketClient, LIVE_SCHEDULE } from './fixtures-realtime';

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

  /**
   * `conversation:new` (#6807, suite de #6799) — LE BOUCHON DOIT SAVOIR LE
   * DIRE. Le correctif de #6799 abonne `socket.ts` à cet évènement ; sans une
   * source capable de l'émettre, aucun gate navigateur ne peut prouver que
   * l'abonnement sert à quelque chose — et un correctif que rien n'exerce est
   * indistinguable d'un correctif absent.
   *
   * La charge suit `ConversationNewEventData` MOT POUR MOT
   * (`packages/shared/types/socketio-events/conversation.ts:67-74`) : le
   * bouchon rejoue « aux MÊMES noms et aux MÊMES formes que la passerelle
   * réelle » (doc-comment de ce module), donc une forme approximative ferait
   * passer un gate que la vraie passerelle ferait tomber.
   *
   * `atMs: 500` — AVANT la chronologie `c-live` (qui démarre à 2 s) : placé
   * après, un témoin devrait attendre 14 s, et placé au milieu il décalerait
   * les comptes des assertions existantes.
   */
  test('la chronologie porte un `conversation:new`, à la forme EXACTE du contrat', () => {
    const entry = LIVE_SCHEDULE.find((e) => e.event === SERVER_EVENTS.CONVERSATION_NEW);

    expect(entry).toBeDefined();
    expect(entry?.kind).toBe('once');

    const payload = entry?.payload as Record<string, unknown>;
    /* Les SIX champs de `ConversationNewEventData`, ni plus ni moins : le
       bouchon rejoue « aux MÊMES formes que la passerelle réelle », donc une
       charge trop riche ferait passer un gate que la vraie passerelle ferait
       tomber — et une charge trop pauvre ferait l'inverse. */
    expect(Object.keys(payload).sort()).toEqual([
      'conversationId',
      'conversationType',
      'createdAt',
      'creatorId',
      'participantIds',
      'title',
    ]);
    expect(typeof payload.conversationId).toBe('string');
    expect(typeof payload.createdAt).toBe('string');
    expect(Array.isArray(payload.participantIds)).toBe(true);
  });

  /**
   * LA CONVERSATION DOIT ÊTRE ABSENTE DU CORPUS — c'est tout le point de
   * #6799 : `patchConversation` ne touche qu'une page portant déjà l'id, donc
   * une conversation déjà présente ne prouverait RIEN (le `message:new`
   * suivant l'aurait patchée de toute façon). Ce témoin garde la prémisse du
   * scénario, que le gate navigateur exercera.
   */
  test('la conversation qui surgit est ABSENTE du corpus de fixtures', () => {
    const entry = LIVE_SCHEDULE.find((e) => e.event === SERVER_EVENTS.CONVERSATION_NEW);
    const id = (entry?.payload as { readonly conversationId: string }).conversationId;

    expect(CONVERSATIONS.some((c) => c.id === id)).toBe(false);
  });
});
