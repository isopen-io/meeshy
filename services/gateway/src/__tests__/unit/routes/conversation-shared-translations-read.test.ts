/**
 * `GET /conversations/:id/shared-translations` — les traductions que les
 * membres ont partagées, scellées, lues par un autre membre (#9899).
 *
 * Même base en mémoire que l'écriture (`conversation-shared-translations-harness.ts`) :
 * elle évalue les `where`, trie selon `orderBy` et ne rend que les colonnes d'un
 * `select`, donc ces témoins tombent quand la requête cesse de restreindre aux
 * versions courantes, aux messages lisibles et aux langues demandées — ou quand
 * la route sert une enveloppe qu'elle n'a pas lue.
 *
 * `languages` est le prisme du lecteur, dans son ordre, et il est obligatoire :
 * la route rend au plus UNE traduction par message, la première de ces langues
 * qu'un membre a partagée. Elle lit d'abord QUI a partagé quoi, sans les
 * enveloppes, puis les seules enveloppes qu'elle sert.
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

import { SHARED_TRANSLATION_READ_RATE_LIMIT } from '../../../routes/conversations/shared-translations';
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
  type Harness,
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

const idsOf = (res: { json: () => { data: { sharedTranslations: Array<{ messageId: string; targetLanguage: string }> } } }) =>
  res.json().data.sharedTranslations.map((entry) => `${entry.messageId}:${entry.targetLanguage}`).sort();

describe('GET /conversations/:id/shared-translations', () => {
  it('sert la traduction partagée à tout membre qui lit le message, sous le contrat de fil', async () => {
    const h = await buildApp({ shares: [share({ sharedById: PEER })] });

    const res = await get(h, { messageIds: MSG_1, languages: 'fr' });

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

    const res = await get(h, { messageIds: `${MSG_1},${MSG_2}`, languages: 'fr,es' });

    expect(idsOf(res)).toEqual([`${MSG_1}:fr`, `${MSG_2}:es`]);
  });

  it('ne sert pas la version d’AVANT une édition faite depuis le partage', async () => {
    const store = scene({ messages: [message({ editedAt: EDITED_AT })] });
    const h = await buildApp({ store, shares: [share({ sourceVersion: 'original' })] });

    const res = await get(h, { messageIds: MSG_1, languages: 'fr' });

    expect(res.json().data.sharedTranslations).toEqual([]);
  });

  describe('le prisme du lecteur : UNE traduction par message, la première de ses langues partagée', () => {
    const shares = () => [
      share({ id: '68d000000000000000000001', targetLanguage: 'fr', createdAt: new Date('2026-09-20T12:00:00.000Z') }),
      share({ id: '68d000000000000000000002', targetLanguage: 'es', createdAt: new Date('2026-09-20T11:00:00.000Z') }),
      share({ id: '68d000000000000000000003', targetLanguage: 'de', createdAt: new Date('2026-09-20T11:30:00.000Z') }),
    ];

    it.each([
      ['la langue demandée', 'fr', [`${MSG_1}:fr`]],
      ['la PREMIÈRE langue du prisme, même partagée après une autre', 'fr,es', [`${MSG_1}:fr`]],
      ['la première langue du prisme, dans l’ordre du lecteur', 'es,fr', [`${MSG_1}:es`]],
      ['la langue suivante du prisme quand la première n’a rien', 'ja,de', [`${MSG_1}:de`]],
      ['une langue étiquetée avec sa région', 'es-MX', [`${MSG_1}:es`]],
      ['une langue en majuscules', 'DE', [`${MSG_1}:de`]],
      ['rien quand aucune langue du prisme n’a été partagée', 'ja', []],
    ])('sert %s', async (_label, languages, expected) => {
      const h = await buildApp({ shares: shares() });

      const res = await get(h, { messageIds: MSG_1, languages });

      expect(res.statusCode).toBe(200);
      expect(idsOf(res)).toEqual(expected);
    });

    it.each([
      ['absent', { messageIds: MSG_1 }],
      ['vide', { messageIds: MSG_1, languages: '' }],
      ['fait de séparateurs', { messageIds: MSG_1, languages: ' , ,' }],
    ])('refuse 400 un prisme %s, sans rien lire : le lecteur dit ce qu’il lit', async (_label, query) => {
      const h = await buildApp({ shares: shares() });

      const res = await get(h, query);

      expect(res.statusCode).toBe(400);
      expect(h.reads).toEqual([]);
    });

    it('garde une traduction par MESSAGE : la même langue sur deux messages reste deux', async () => {
      const store = scene({ messages: [message(), message({ id: MSG_2 })] });
      const h = await buildApp({ store, shares: [share(), share({ id: '68d000000000000000000003', messageId: MSG_2 })] });

      const res = await get(h, { messageIds: `${MSG_1},${MSG_2}`, languages: 'fr' });

      expect(idsOf(res)).toEqual([`${MSG_1}:fr`, `${MSG_2}:fr`]);
    });
  });

  describe('ne sert que ce que l’appelant a le droit de lire', () => {
    const everywhere = (): Row[] => [
      share({ id: '68d000000000000000000001', messageId: MSG_1 }),
      share({ id: '68d000000000000000000002', messageId: MSG_2 }),
      share({ id: '68d000000000000000000003', messageId: MSG_3 }),
      share({ id: '68d000000000000000000004', messageId: MSG_OTHER_CONVERSATION, conversationId: CONV_B }),
    ];
    const ask = { messageIds: `${MSG_1},${MSG_2},${MSG_3},${MSG_OTHER_CONVERSATION},${UNKNOWN_MESSAGE}`, languages: 'fr' };

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

      const res = await get(h, ask);

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

      const res = await get(h, ask);

      expect(idsOf(res)).toEqual([`${MSG_2}:fr`, `${MSG_3}:fr`]);
    });

    it('ne sert jamais une traduction partagée d’une AUTRE conversation, ni d’un message inconnu', async () => {
      const store = scene({
        messages: [message(), message({ id: MSG_OTHER_CONVERSATION, conversationId: CONV_B })],
      });
      const h = await buildApp({ store, shares: everywhere() });

      const res = await get(h, ask);

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

      const res = await get(h, { messageIds: MSG_1, languages: 'fr' });

      expect(res.json().data.sharedTranslations).toEqual([]);
    });

    it('répond 500 et ne sert rien quand le masquage personnel de l’appelant ne répond pas — jamais « il ne masque rien »', async () => {
      const h = await buildApp({ shares: [share()], prismaOverrides: personalHidingLookupDown });

      const res = await get(h, { messageIds: MSG_1, languages: 'fr' });

      expect(res.statusCode).toBe(500);
      expect(res.json().data).toBeUndefined();
    });

    it('sert un invité de lien partagé qui lit le message', async () => {
      const store = scene({
        participants: [participantRow({ id: SHARER, userId: USER_ID }), participantRow({ id: GUEST, userId: null, user: null })],
      });
      const h = await buildApp({ store, authContext: guestAs(GUEST), shares: [share()] });

      const res = await get(h, { messageIds: MSG_1, languages: 'fr' });

      expect(idsOf(res)).toEqual([`${MSG_1}:fr`]);
    });
  });

  describe('le coût de la lecture', () => {
    it('lit d’abord QUI a partagé quoi, sans les enveloppes, en une requête BORNÉE et ORDONNÉE', async () => {
      const h = await buildApp({ shares: [share()] });

      await get(h, { messageIds: MSG_1, languages: 'fr' });

      const [inventory] = h.reads;
      expect(inventory.take).toBe(SHARED_TRANSLATION_LIMITS.messageIdsMaxCount * SHARED_TRANSLATION_LIMITS.languagesMaxCount);
      expect(inventory.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
      expect(inventory.where).toMatchObject({
        conversationId: CONV_A,
        OR: [{ messageId: MSG_1, sourceVersion: 'original' }],
        targetLanguage: { in: ['fr'] },
      });
      expect(inventory.select).toBeDefined();
      expect(inventory.select?.payload).not.toBe(true);
    });

    it('ne lit ensuite que les enveloppes qu’elle SERT — jamais celles d’une langue que le prisme écarte', async () => {
      const shares = [
        share({ id: '68d000000000000000000001', targetLanguage: 'fr' }),
        share({ id: '68d000000000000000000002', targetLanguage: 'es' }),
      ];
      const h = await buildApp({ shares });

      await get(h, { messageIds: MSG_1, languages: 'fr,es' });

      expect(h.reads).toHaveLength(2);
      expect(h.reads[1].where).toEqual({ id: { in: ['68d000000000000000000001'] }, conversationId: CONV_A });
    });

    it('ne lit aucune enveloppe quand rien n’a été partagé', async () => {
      const h = await buildApp({ shares: [] });

      const res = await get(h, { messageIds: MSG_1, languages: 'fr' });

      expect(res.json().data.sharedTranslations).toEqual([]);
      expect(h.reads).toHaveLength(1);
    });

    it('ne lit aucune traduction quand aucun message demandé n’est lisible', async () => {
      const h = await buildApp({ store: scene({ messages: [message({ isViewOnce: true })] }), shares: [share()] });

      const res = await get(h, { messageIds: MSG_1, languages: 'fr' });

      expect(res.json().data.sharedTranslations).toEqual([]);
      expect(h.reads).toEqual([]);
    });

    it('sert dans un ordre stable : la première partagée d’abord', async () => {
      const store = scene({ messages: [message(), message({ id: MSG_2 })] });
      const shares = [
        share({ id: '68d000000000000000000002', messageId: MSG_1, createdAt: new Date('2026-09-20T12:00:00.000Z') }),
        share({ id: '68d000000000000000000001', messageId: MSG_2, createdAt: new Date('2026-09-20T11:00:00.000Z') }),
      ];
      const h = await buildApp({ store, shares });

      const res = await get(h, { messageIds: `${MSG_1},${MSG_2}`, languages: 'fr' });

      expect(res.json().data.sharedTranslations.map((entry: { messageId: string }) => entry.messageId)).toEqual([MSG_2, MSG_1]);
    });
  });

  describe('une seule traduction par message et par langue', () => {
    const twoShares = () => [
      share({ id: '68d000000000000000000002', sharedById: SHARER, payload: OTHER_PAYLOAD, createdAt: new Date('2026-09-20T12:00:00.000Z') }),
      share({ id: '68d000000000000000000001', sharedById: PEER, createdAt: new Date('2026-09-20T11:00:00.000Z') }),
    ];

    it('sert la PREMIÈRE partagée quand deux lignes portent la même clé — l’index unique se pose à la main et peut manquer', async () => {
      const h = await buildApp({ shares: twoShares() });

      const res = await get(h, { messageIds: MSG_1, languages: 'fr' });

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

      const res = await get(h, { messageIds: MSG_1, languages: 'fr' });

      expect(res.json().data.sharedTranslations.map((entry: { id: string }) => entry.id)).toEqual(['68d000000000000000000004']);
    });
  });

  describe('les refus', () => {
    it('refuse 403 à qui ne participe pas à la conversation', async () => {
      const h = await buildApp({ authContext: registeredAs(OUTSIDER_USER), shares: [share()] });

      const res = await get(h, { messageIds: MSG_1, languages: 'fr' });

      expect(res.statusCode).toBe(403);
      expect(h.reads).toEqual([]);
    });

    it('refuse 404 quand la conversation n’existe pas', async () => {
      const h = await buildApp();

      const res = await get(h, { messageIds: MSG_1, languages: 'fr' }, UNKNOWN_CONVERSATION);

      expect(res.statusCode).toBe(404);
    });

    it.each([
      ['sans identifiant de message', { languages: 'fr' }],
      ['avec un identifiant de message vide', { messageIds: '', languages: 'fr' }],
      ['avec un identifiant qui n’est pas un ObjectId', { messageIds: 'not-an-object-id', languages: 'fr' }],
      [
        `avec plus de ${SHARED_TRANSLATION_LIMITS.messageIdsMaxCount} messages`,
        {
          messageIds: Array.from(
            { length: SHARED_TRANSLATION_LIMITS.messageIdsMaxCount + 1 },
            (_, index) => `68b0000000000000000003${index.toString(16).padStart(2, '0')}`,
          ).join(','),
          languages: 'fr',
        },
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

describe('GET /conversations/:id/shared-translations — le débit de lecture compte le COMPTE', () => {
  const account = (headers: Record<string, unknown>) =>
    registeredAs(headers['x-account'] === 'peer' ? OTHER_USER_ID : USER_ID);
  const getAs = (h: Harness, who: 'reader' | 'peer') =>
    h.app.inject({
      method: 'GET',
      url: `/conversations/${CONV_A}/shared-translations`,
      query: { messageIds: MSG_1, languages: 'fr' },
      headers: { 'x-account': who },
    });

  it('refuse 429 au-delà du plafond par minute, sans entamer le crédit d’un autre membre venu de la même adresse', async () => {
    const h = await buildApp({ authContextFor: account, rateLimit: { skipOnError: true }, shares: [share()] });

    const statuses = [];
    for (let sent = 0; sent < SHARED_TRANSLATION_READ_RATE_LIMIT.max; sent += 1) {
      statuses.push((await getAs(h, 'reader')).statusCode);
    }
    const beyond = await getAs(h, 'reader');
    const otherMember = await getAs(h, 'peer');

    expect(statuses.every((status) => status === 200)).toBe(true);
    expect(beyond.statusCode).toBe(429);
    expect(beyond.json()).toMatchObject({ success: false });
    expect(otherMember.statusCode).toBe(200);
  });

  it('répond 500 quand le magasin de compteurs tombe, même sous un limiteur global qui laisserait passer', async () => {
    class StoreDown {
      child(): StoreDown {
        return new StoreDown();
      }
      incr(_key: string, callback: (error: Error) => void): void {
        callback(new Error('Redis indisponible'));
      }
    }
    const h = await buildApp({ authContextFor: account, rateLimit: { skipOnError: true, store: StoreDown }, shares: [share()] });

    const res = await getAs(h, 'reader');

    expect(res.statusCode).toBe(500);
    expect(h.reads).toEqual([]);
  });
});
