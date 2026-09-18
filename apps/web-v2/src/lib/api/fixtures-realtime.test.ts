import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { VIEWER_ID } from './fixtures-base';
import { CONVERSATIONS, conversationsWithSurged, resetSurgedConversationsForTests } from './fixtures';
import {
  LIVE_3_ATTACHMENT_ID,
  LIVE_3_AUDIO_URL,
  LIVE_3_ID,
  LIVE_CONVERSATION_ID,
  LIVE_MESSAGES,
} from './fixtures-live';
import { createFixturesSocketClient, LIVE_SCHEDULE, recordSurgedFromEntry } from './fixtures-realtime';

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

  /**
   * TIRER L'ENTRÉE ENREGISTRE LA SURVENUE (#6807) — la moitié qui manquait.
   * Le corpus sait SERVIR une conversation survenue (#6807, premier lot) et la
   * table sait DIRE qu'elle surgit ; sans ce pont, rien ne relie les deux et le
   * gate navigateur mesurerait une page inchangée.
   *
   * Testé par la LOI, pas par l'horloge : l'entrée est à `atMs: 14000`, et
   * l'attendre coûterait 14 s réelles à chaque exécution de la suite.
   */
  test('tirer l’entrée `conversation:new` enregistre la conversation comme SURVENUE', () => {
    resetSurgedConversationsForTests();
    const entry = LIVE_SCHEDULE.find((e) => e.event === SERVER_EVENTS.CONVERSATION_NEW)!;

    recordSurgedFromEntry(entry);

    const id = (entry.payload as { readonly conversationId: string }).conversationId;
    const surged = conversationsWithSurged().find((c) => c.id === id);
    expect(surged).toBeDefined();
    expect(surged?.type).toBe('direct');
    /* Le LECTEUR doit être participant, sinon la ligne serait servie à
       quelqu'un qui n'appartient pas à la conversation. */
    expect(surged?.participants.some((p) => p.userId === VIEWER_ID)).toBe(true);

    resetSurgedConversationsForTests();
  });

  /** UNE AUTRE entrée n'enregistre RIEN — la loi ne réagit qu'à son évènement. */
  test('tirer une entrée de frappe n’enregistre aucune conversation', () => {
    resetSurgedConversationsForTests();
    const typing = LIVE_SCHEDULE.find((e) => e.event === SERVER_EVENTS.TYPING_START)!;

    recordSurgedFromEntry(typing);

    expect(conversationsWithSurged()).toHaveLength(CONVERSATIONS.length);
    resetSurgedConversationsForTests();
  });

  /**
   * `message:attachment-updated` × 3 (#7017) — LE PIPELINE AUDIO, LU DANS LA
   * DONNÉE. Ce que ce témoin garde n'est pas visible au gate navigateur, qui
   * ne peut que constater l'ABSENCE de transcription : une charge qui
   * désignerait un autre `attachment.id` que celui du corpus serait un NO-OP
   * silencieux (`applyMessageAttachmentUpdated` n'AJOUTE jamais une pièce
   * inconnue), donc indistinguable d'un correctif absent.
   */
  test('la chronologie enrichit LA pièce de `live-3`, en trois temps, aux mêmes id', () => {
    const entries = LIVE_SCHEDULE.filter((e) => e.event === SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED);
    expect(entries).toHaveLength(3);

    for (const entry of entries) {
      const payload = entry.payload as {
        readonly conversationId: string;
        readonly messageId: string;
        readonly attachment: Record<string, unknown>;
      };
      expect(payload.conversationId).toBe(LIVE_CONVERSATION_ID);
      expect(payload.messageId).toBe(LIVE_3_ID);
      expect(payload.attachment.id).toBe(LIVE_3_ATTACHMENT_ID);
      /* La MÊME pièce que le corpus sert : un `fileUrl` divergent ferait
         rejouer la piste originale sous une transcription traduite. */
      expect(payload.attachment.fileUrl).toBe(LIVE_3_AUDIO_URL);
      /* LA FORME MESURÉE DE LA PASSERELLE, pas celle d'une branche annoncée.
         `serializeAttachmentForSocket` construit un objet littéral EXPLICITE
         dont `SocketAttachment` ne déclare AUCUN des trois drapeaux de
         protection, et `attachmentMediaSelect` — le seul `select` du chemin
         socket — ne les charge pas (ils vivent dans `attachmentFullSelect`,
         que `emitAttachmentUpdated` n'emprunte pas). Relevé sur `dev` au
         2026-09-18 : ni `attachmentSocketSelect` ni
         `ATTACHMENT_PROTECTION_FIELDS` n'existent — #7014 n'a PAS atterri.

         Ce témoin est donc le CLIQUET qui empêche la fixture de dériver vers
         une charge que la passerelle n'émet pas : un gate navigateur qui
         rejoue une charge impossible ne mesure pas le produit. Le jour où
         #7014 atterrit, c'est `serializeAttachmentForSocket` qui change en
         premier — et ce témoin est ce qui oblige à revenir ici. */
      expect('isViewOnce' in payload.attachment).toBe(false);
      expect('isBlurred' in payload.attachment).toBe(false);
      expect('effectFlags' in payload.attachment).toBe(false);
    }

    /* CUMULATIVE — le serveur relit la ligne après chaque enrichissement, donc
       l'évènement `fr` porte AUSSI `en` : « clients REPLACE the attachment's
       translation map with what this event carries » (`emitAttachmentUpdated.ts`). */
    const languagesOf = (index: number) =>
      Object.keys((entries[index]?.payload as { readonly attachment: { readonly translations: object } }).attachment.translations).sort();
    expect(languagesOf(0)).toEqual([]);
    expect(languagesOf(1)).toEqual(['en']);
    expect(languagesOf(2)).toEqual(['en', 'fr']);
  });

  /** La pièce du CORPUS part NUE — sans quoi l'état « aucune transcription »
   * n'existerait jamais et le gate mesurerait un texte qui était déjà là. */
  test('`live-3` part SANS transcription ni traduction', () => {
    const attachment = LIVE_MESSAGES.find((m) => m.id === LIVE_3_ID)?.attachments?.[0];
    expect(attachment?.id).toBe(LIVE_3_ATTACHMENT_ID);
    expect(attachment?.transcription).toBeUndefined();
    expect(attachment?.translations).toBeUndefined();
  });
});
