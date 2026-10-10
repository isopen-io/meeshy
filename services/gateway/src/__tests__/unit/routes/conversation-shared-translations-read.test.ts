/**
 * `GET /conversations/:id/shared-translations` — les traductions que les
 * membres ont partagées, scellées, lues par un autre membre (#9899).
 *
 * Même base en mémoire que l'écriture (`conversation-shared-translations-harness.ts`) :
 * elle évalue les `where`, donc ces témoins tombent quand la requête cesse de
 * restreindre aux versions courantes, aux messages lisibles et aux langues
 * demandées — pas seulement quand le handler cesse d'appeler.
 *
 * Ce qui ne doit JAMAIS partir : la traduction d'un message qu'on ne lit pas
 * (supprimé, protégé, antérieur au plancher d'historique, retiré de sa vue,
 * d'une autre conversation), et celle d'une version que le message a quittée
 * par une édition. L'écriture a sa suite : `conversation-shared-translations.test.ts`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { SHARED_TRANSLATION_LIMITS, sharedTranslationSchema } from '@meeshy/shared/types/shared-translation';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

import {
  EDITED_AT,
  GUEST,
  MSG_OTHER_CONVERSATION,
  OTHER_PAYLOAD,
  OUTSIDER_USER,
  PEER,
  SHARER,
  UNKNOWN_CONVERSATION,
  UNKNOWN_MESSAGE,
  WIRE_KEYS,
  buildApp,
  envelope,
  get,
  guestAs,
  message,
  personalHidingLookupDown,
  registeredAs,
  scene,
  share,
  type Row,
} from './conversation-shared-translations-harness';
import {
  CONV_A,
  CONV_B,
  MSG_1,
  MSG_2,
  MSG_3,
  OTHER_USER_ID,
  USER_ID,
  participantRow,
} from './me/starred-messages-harness';

describe('GET /conversations/:id/shared-translations', () => {
  const idsOf = (res: { json: () => { data: { sharedTranslations: Array<{ messageId: string; targetLanguage: string }> } } }) =>
    res.json().data.sharedTranslations.map((entry) => `${entry.messageId}:${entry.targetLanguage}`).sort();

  it('sert la traduction partagée à tout membre qui lit le message, sous le contrat de fil', async () => {
    const h = await buildApp({ shares: [share({ sharedById: PEER })] });

    const res = await get(h, { messageIds: MSG_1 });

    expect(res.statusCode).toBe(200);
    const { sharedTranslations } = res.json().data;
    expect(sharedTranslations).toHaveLength(1);
    expect(sharedTranslationSchema.parse(sharedTranslations[0])).toEqual({
      id: '68d000000000000000000001',
      conversationId: CONV_A,
      messageId: MSG_1,
      targetLanguage: 'fr',
      envelope: envelope(),
      sharedBy: PEER,
      sharedAt: '2026-09-20T11:00:00.000Z',
    });
    expect(Object.keys(sharedTranslations[0]).sort()).toEqual(WIRE_KEYS);
  });

  it('ne sert que les traductions de la version COURANTE du message', async () => {
    const store = scene({ messages: [message(), message({ id: MSG_2, editedAt: EDITED_AT })] });
    const shares = [
      share({ id: '68d000000000000000000001', messageId: MSG_1, sourceVersion: 'original' }),
      share({ id: '68d000000000000000000002', messageId: MSG_2, sourceVersion: 'original', targetLanguage: 'fr' }),
      share({ id: '68d000000000000000000003', messageId: MSG_2, sourceVersion: EDITED_AT.toISOString(), targetLanguage: 'es' }),
    ];
    const h = await buildApp({ store, shares });

    const res = await get(h, { messageIds: `${MSG_1},${MSG_2}` });

    expect(idsOf(res)).toEqual([`${MSG_1}:fr`, `${MSG_2}:es`]);
  });

  it('ne sert pas la version d’AVANT une édition faite depuis le partage', async () => {
    const store = scene({ messages: [message({ editedAt: EDITED_AT })] });
    const h = await buildApp({ store, shares: [share({ sourceVersion: 'original' })] });

    const res = await get(h, { messageIds: MSG_1 });

    expect(res.json().data.sharedTranslations).toEqual([]);
  });

  describe('le filtre par langues', () => {
    const shares = () => [
      share({ id: '68d000000000000000000001', targetLanguage: 'fr' }),
      share({ id: '68d000000000000000000002', targetLanguage: 'es' }),
      share({ id: '68d000000000000000000003', targetLanguage: 'de' }),
    ];

    it.each([
      ['une langue', 'fr', [`${MSG_1}:fr`]],
      ['deux langues', 'fr,es', [`${MSG_1}:es`, `${MSG_1}:fr`]],
      ['une langue étiquetée avec sa région', 'es-MX', [`${MSG_1}:es`]],
      ['une langue en majuscules', 'DE', [`${MSG_1}:de`]],
      ['une langue sans traduction partagée', 'ja', []],
    ])('ne sert que %s demandée', async (_label, languages, expected) => {
      const h = await buildApp({ shares: shares() });

      const res = await get(h, { messageIds: MSG_1, languages });

      expect(idsOf(res)).toEqual(expected);
    });

    it.each([
      ['absent', undefined],
      ['vide', ''],
    ])('sert toutes les langues quand le filtre est %s', async (_label, languages) => {
      const h = await buildApp({ shares: shares() });

      const res = await get(h, languages === undefined ? { messageIds: MSG_1 } : { messageIds: MSG_1, languages });

      expect(idsOf(res)).toEqual([`${MSG_1}:de`, `${MSG_1}:es`, `${MSG_1}:fr`]);
    });
  });

  describe('ne sert que ce que l’appelant a le droit de lire', () => {
    const everywhere = (): Row[] => [
      share({ id: '68d000000000000000000001', messageId: MSG_1 }),
      share({ id: '68d000000000000000000002', messageId: MSG_2 }),
      share({ id: '68d000000000000000000003', messageId: MSG_3 }),
      share({ id: '68d000000000000000000004', messageId: MSG_OTHER_CONVERSATION, conversationId: CONV_B }),
    ];
    const ask = `${MSG_1},${MSG_2},${MSG_3},${MSG_OTHER_CONVERSATION},${UNKNOWN_MESSAGE}`;

    it.each([
      [
        'un message supprimé pour tous',
        () => scene({ messages: [message(), message({ id: MSG_2, deletedAt: new Date('2026-09-20T10:10:00.000Z') }), message({ id: MSG_3 })] }),
      ],
      ['un message à vue unique', () => scene({ messages: [message(), message({ id: MSG_2, isViewOnce: true }), message({ id: MSG_3 })] })],
      ['un message flouté', () => scene({ messages: [message(), message({ id: MSG_2, isBlurred: true }), message({ id: MSG_3 })] })],
      [
        'un message éphémère',
        () => scene({ messages: [message(), message({ id: MSG_2, ephemeralDuration: 30 }), message({ id: MSG_3 })] }),
      ],
      [
        'un message que l’appelant a retiré de sa vue',
        () => scene({ messages: [message(), message({ id: MSG_2 }), message({ id: MSG_3 })], deletions: [{ userId: USER_ID, messageId: MSG_2 }] }),
      ],
    ])('écarte %s', async (_label, storeOf) => {
      const h = await buildApp({ store: storeOf(), shares: everywhere() });

      const res = await get(h, { messageIds: ask });

      expect(res.statusCode).toBe(200);
      expect(idsOf(res)).toEqual([`${MSG_1}:fr`, `${MSG_3}:fr`]);
    });

    it('applique le plancher d’historique MESSAGE PAR MESSAGE', async () => {
      const store = scene({
        messages: [
          message({ createdAt: new Date('2026-09-20T09:00:00.000Z') }),
          message({ id: MSG_2, createdAt: new Date('2026-09-20T11:00:00.000Z') }),
          message({ id: MSG_3, createdAt: new Date('2026-09-20T12:00:00.000Z') }),
        ],
        participants: [
          participantRow({ id: SHARER, userId: USER_ID, historyVisibleFrom: new Date('2026-09-20T10:00:00.000Z') }),
          participantRow({ id: PEER, userId: OTHER_USER_ID }),
        ],
      });
      const h = await buildApp({ store, shares: everywhere() });

      const res = await get(h, { messageIds: ask });

      expect(idsOf(res)).toEqual([`${MSG_2}:fr`, `${MSG_3}:fr`]);
    });

    it('ne sert jamais une traduction partagée d’une AUTRE conversation, ni d’un message inconnu', async () => {
      const store = scene({
        messages: [message(), message({ id: MSG_OTHER_CONVERSATION, conversationId: CONV_B })],
      });
      const h = await buildApp({ store, shares: everywhere() });

      const res = await get(h, { messageIds: ask });

      expect(idsOf(res)).toEqual([`${MSG_1}:fr`]);
    });

    it('ne sert rien à qui est banni, sa ligne restée active', async () => {
      const store = scene({
        participants: [
          participantRow({ id: SHARER, userId: USER_ID, bannedAt: new Date('2026-09-10T00:00:00.000Z') }),
          participantRow({ id: PEER, userId: OTHER_USER_ID }),
        ],
      });
      const h = await buildApp({ store, shares: [share()] });

      const res = await get(h, { messageIds: MSG_1 });

      expect(res.json().data.sharedTranslations).toEqual([]);
    });

    it('répond 500 et ne sert rien quand le masquage personnel de l’appelant ne répond pas — jamais « il ne masque rien »', async () => {
      const h = await buildApp({ shares: [share()], prismaOverrides: personalHidingLookupDown });

      const res = await get(h, { messageIds: MSG_1 });

      expect(res.statusCode).toBe(500);
      expect(res.json().data).toBeUndefined();
    });

    it('sert un invité de lien partagé qui lit le message', async () => {
      const store = scene({
        participants: [participantRow({ id: SHARER, userId: USER_ID }), participantRow({ id: GUEST, userId: null, user: null })],
      });
      const h = await buildApp({ store, authContext: guestAs(GUEST), shares: [share()] });

      const res = await get(h, { messageIds: MSG_1 });

      expect(idsOf(res)).toEqual([`${MSG_1}:fr`]);
    });
  });

  describe('le coût de la lecture', () => {
    it('lit les traductions en une requête BORNÉE, restreinte à la conversation et aux versions courantes', async () => {
      const h = await buildApp({ shares: [share()] });

      await get(h, { messageIds: MSG_1, languages: 'fr' });

      expect(h.reads).toHaveLength(1);
      expect(h.reads[0].take).toBe(SHARED_TRANSLATION_LIMITS.messageIdsMaxCount * SHARED_TRANSLATION_LIMITS.languagesMaxCount);
      expect(h.reads[0].where).toMatchObject({
        conversationId: CONV_A,
        OR: [{ messageId: MSG_1, sourceVersion: 'original' }],
        targetLanguage: { in: ['fr'] },
      });
    });

    it('ne lit aucune traduction quand aucun message demandé n’est lisible', async () => {
      const h = await buildApp({ store: scene({ messages: [message({ isViewOnce: true })] }), shares: [share()] });

      const res = await get(h, { messageIds: MSG_1 });

      expect(res.json().data.sharedTranslations).toEqual([]);
      expect(h.reads).toEqual([]);
    });

    it('sert dans un ordre stable : la première partagée d’abord', async () => {
      const shares = [
        share({ id: '68d000000000000000000002', targetLanguage: 'es', createdAt: new Date('2026-09-20T12:00:00.000Z') }),
        share({ id: '68d000000000000000000001', targetLanguage: 'fr', createdAt: new Date('2026-09-20T11:00:00.000Z') }),
      ];
      const h = await buildApp({ shares });

      const res = await get(h, { messageIds: MSG_1 });

      expect(res.json().data.sharedTranslations.map((entry: { targetLanguage: string }) => entry.targetLanguage)).toEqual(['fr', 'es']);
    });
  });

  describe('une seule traduction par message et par langue', () => {
    const twoShares = () => [
      share({ id: '68d000000000000000000002', sharedById: SHARER, payload: OTHER_PAYLOAD, createdAt: new Date('2026-09-20T12:00:00.000Z') }),
      share({ id: '68d000000000000000000001', sharedById: PEER, createdAt: new Date('2026-09-20T11:00:00.000Z') }),
    ];

    it('sert la PREMIÈRE partagée quand deux lignes portent la même clé — l’index unique se pose à la main et peut manquer', async () => {
      const h = await buildApp({ shares: twoShares() });

      const res = await get(h, { messageIds: MSG_1 });

      const { sharedTranslations } = res.json().data;
      expect(sharedTranslations).toHaveLength(1);
      expect(sharedTranslations[0]).toMatchObject({ id: '68d000000000000000000001', sharedBy: PEER, envelope: envelope() });
    });

    it('départage deux lignes de même instant par leur identifiant', async () => {
      const sameInstant = new Date('2026-09-20T11:00:00.000Z');
      const shares = [
        share({ id: '68d000000000000000000009', payload: OTHER_PAYLOAD, createdAt: sameInstant }),
        share({ id: '68d000000000000000000004', createdAt: sameInstant }),
      ];
      const h = await buildApp({ shares });

      const res = await get(h, { messageIds: MSG_1 });

      expect(res.json().data.sharedTranslations.map((entry: { id: string }) => entry.id)).toEqual(['68d000000000000000000004']);
    });

    it('garde une traduction par LANGUE : deux langues d’un même message restent deux', async () => {
      const shares = [...twoShares(), share({ id: '68d000000000000000000003', targetLanguage: 'es' })];
      const h = await buildApp({ shares });

      const res = await get(h, { messageIds: MSG_1 });

      expect(idsOf(res)).toEqual([`${MSG_1}:es`, `${MSG_1}:fr`]);
    });

    it('garde une traduction par MESSAGE : la même langue sur deux messages reste deux', async () => {
      const store = scene({ messages: [message(), message({ id: MSG_2 })] });
      const shares = [...twoShares(), share({ id: '68d000000000000000000003', messageId: MSG_2 })];
      const h = await buildApp({ store, shares });

      const res = await get(h, { messageIds: `${MSG_1},${MSG_2}` });

      expect(idsOf(res)).toEqual([`${MSG_1}:fr`, `${MSG_2}:fr`]);
    });
  });

  describe('les refus', () => {
    it('refuse 403 à qui ne participe pas à la conversation', async () => {
      const h = await buildApp({ authContext: registeredAs(OUTSIDER_USER), shares: [share()] });

      const res = await get(h, { messageIds: MSG_1 });

      expect(res.statusCode).toBe(403);
      expect(h.reads).toEqual([]);
    });

    it('refuse 404 quand la conversation n’existe pas', async () => {
      const h = await buildApp();

      const res = await get(h, { messageIds: MSG_1 }, UNKNOWN_CONVERSATION);

      expect(res.statusCode).toBe(404);
    });

    it.each([
      ['sans identifiant de message', {}],
      ['avec un identifiant de message vide', { messageIds: '' }],
      ['avec un identifiant qui n’est pas un ObjectId', { messageIds: 'not-an-object-id' }],
      [
        `avec plus de ${SHARED_TRANSLATION_LIMITS.messageIdsMaxCount} messages`,
        { messageIds: Array.from({ length: SHARED_TRANSLATION_LIMITS.messageIdsMaxCount + 1 }, (_, index) => `68b0000000000000000003${index.toString(16).padStart(2, '0')}`).join(',') },
      ],
      [
        `avec plus de ${SHARED_TRANSLATION_LIMITS.languagesMaxCount} langues`,
        { messageIds: MSG_1, languages: 'fr,es,de,it,pt,ja,ko,ar,ru' },
      ],
      ['avec une langue malformée', { messageIds: MSG_1, languages: 'fr,12' }],
    ])('refuse 400 une requête %s', async (_label, query) => {
      const h = await buildApp({ shares: [share()] });

      const res = await get(h, query);

      expect(res.statusCode).toBe(400);
      expect(h.reads).toEqual([]);
    });
  });
});
