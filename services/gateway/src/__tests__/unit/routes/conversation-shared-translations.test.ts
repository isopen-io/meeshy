/**
 * `POST /conversations/:id/shared-translations` — un membre partage la
 * traduction qu'il a faite sur son appareil, scellée (#9899).
 *
 * Les témoins traversent le VRAI sérialiseur (`app.inject`) et une base en
 * mémoire qui ÉVALUE les `where` (celle du favori de message, augmentée dans
 * `conversation-shared-translations-harness.ts`) : ils tombent quand la requête
 * cesse de garder, pas seulement quand le handler cesse d'appeler. Le contrat
 * de fil est confronté au schéma partagé (`sharedTranslationSchema`), pas à une
 * copie locale.
 *
 * Le serveur n'ouvre jamais ce qu'on lui confie : plusieurs témoins vérifient
 * que l'enveloppe est gardée et relayée octet pour octet. La lecture de ce qui
 * est partagé a sa suite (`conversation-shared-translations-read.test.ts`), ce
 * que la conversation admet et le budget du compte la leur
 * (`conversation-shared-translations-admission.test.ts`).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import {
  SHARED_TRANSLATION_ERROR_CODES,
  SHARED_TRANSLATION_LIMITS,
  sharedTranslationSchema,
} from '@meeshy/shared/types/shared-translation';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  SHARED_TRANSLATION_BROADCAST_MAX_PAYLOAD,
  SHARED_TRANSLATION_SHARE_RATE_LIMIT,
} from '../../../routes/conversations/shared-translations';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

import {
  AFTER_THE_MESSAGE,
  EDITED_AT,
  GUEST,
  LATE,
  LATE_USER,
  MSG_OTHER_CONVERSATION,
  OTHER_PAYLOAD,
  OUTSIDER_USER,
  PAYLOAD,
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
  post,
  privacyLookupDown,
  registeredAs,
  scene,
  share,
  shareBody,
  type HarnessPrisma,
  type Row,
} from './conversation-shared-translations-harness';
import {
  CONV_A,
  CONV_B,
  MSG_1,
  MSG_2,
  OTHER_USER_ID,
  USER_ID,
  conversationRow,
  participantRow,
  type Store,
} from './me/starred-messages-harness';

describe('POST /conversations/:id/shared-translations', () => {
  describe('le premier partage gagne', () => {
    it('range l’enveloppe, rend 201 avec la traduction partagée et dit qu’elle est créée', async () => {
      const h = await buildApp();
      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(201);
      const { data } = res.json();
      expect(data.created).toBe(true);
      expect(sharedTranslationSchema.parse(data.sharedTranslation)).toEqual({
        id: expect.any(String),
        conversationId: CONV_A,
        messageId: MSG_1,
        targetLanguage: 'fr',
        envelope: envelope(),
        sharedBy: SHARER,
        sharedAt: '2026-09-21T12:00:00.000Z',
      });
      expect(h.shares).toEqual([
        expect.objectContaining({
          conversationId: CONV_A,
          messageId: MSG_1,
          targetLanguage: 'fr',
          sourceVersion: 'original',
          kdf: 'message-content',
          payload: PAYLOAD,
          sharedById: SHARER,
        }),
      ]);
    });

    it('ne sert que le contrat de fil : ni `sourceVersion`, ni colonne de la base', async () => {
      const h = await buildApp();
      const res = await post(h, shareBody());

      expect(Object.keys(res.json().data.sharedTranslation).sort()).toEqual(WIRE_KEYS);
      expect(Object.keys(res.json().data).sort()).toEqual(['created', 'sharedTranslation']);
    });

    it('garde l’enveloppe et la relaie OCTET POUR OCTET, sans jamais l’ouvrir', async () => {
      const h = await buildApp();
      const res = await post(h, shareBody({ envelope: envelope({ payload: PAYLOAD }) }));

      expect(res.json().data.sharedTranslation.envelope.payload).toBe(PAYLOAD);
      expect(h.shares[0].payload).toBe(PAYLOAD);
      expect(h.emitted[0].payload.envelope).toEqual(envelope());
    });

    it('rend 200 `created: false` avec la traduction DÉJÀ partagée quand un autre l’a posée avant', async () => {
      const first = share({ payload: PAYLOAD, sharedById: PEER });
      const h = await buildApp({ shares: [first] });

      const res = await post(h, shareBody({ envelope: envelope({ payload: OTHER_PAYLOAD }) }));

      expect(res.statusCode).toBe(200);
      const { data } = res.json();
      expect(data.created).toBe(false);
      expect(data.sharedTranslation).toMatchObject({ id: first.id, sharedBy: PEER, envelope: envelope({ payload: PAYLOAD }) });
      expect(h.shares).toHaveLength(1);
      expect(h.shares[0].payload).toBe(PAYLOAD);
      expect(h.emitted).toEqual([]);
    });

    it('tranche la course sur l’index unique : elle écrit d’abord, et ne relit que sur la violation', async () => {
      const winner = share({ payload: PAYLOAD });
      const order: string[] = [];
      const h = await buildApp({
        shares: [],
        prismaOverrides: (prisma) => ({
          ...prisma,
          sharedTranslation: {
            ...prisma.sharedTranslation,
            create: async () => {
              order.push('create');
              throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
            },
            findUnique: async () => {
              order.push('findUnique');
              return winner;
            },
          },
        }),
      });

      const res = await post(h, shareBody({ envelope: envelope({ payload: OTHER_PAYLOAD }) }));

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ created: false, sharedTranslation: { id: winner.id } });
      expect(order).toEqual(['create', 'findUnique']);
    });

    it('range sous la version COURANTE : une édition ouvre un nouveau partage, sans effacer l’ancien', async () => {
      const stale = share({ sourceVersion: 'original' });
      const store = scene({ messages: [message({ editedAt: EDITED_AT })] });
      const h = await buildApp({ store, shares: [stale] });

      const res = await post(
        h,
        shareBody({ sourceVersion: EDITED_AT.toISOString(), envelope: envelope({ payload: OTHER_PAYLOAD }) }),
      );

      expect(res.statusCode).toBe(201);
      expect(h.shares).toHaveLength(2);
      expect(h.shares[1]).toMatchObject({ sourceVersion: EDITED_AT.toISOString(), payload: OTHER_PAYLOAD });
      expect(h.shares[0]).toBe(stale);
    });

    it('partage une même langue pour deux messages, et deux langues pour un même message', async () => {
      const store = scene({ messages: [message(), message({ id: MSG_2 })] });
      const h = await buildApp({ store });

      const statuses = [
        (await post(h, shareBody())).statusCode,
        (await post(h, shareBody({ messageId: MSG_2 }))).statusCode,
        (await post(h, shareBody({ targetLanguage: 'es' }))).statusCode,
      ];

      expect(statuses).toEqual([201, 201, 201]);
      expect(h.shares).toHaveLength(3);
    });

    it('accepte un invité de lien partagé, adressé par sa seule ligne', async () => {
      const store = scene({
        participants: [participantRow({ id: SHARER, userId: USER_ID }), participantRow({ id: GUEST, userId: null, user: null })],
      });
      const h = await buildApp({ store, authContext: guestAs(GUEST) });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(201);
      expect(res.json().data.sharedTranslation.sharedBy).toBe(GUEST);
    });
  });

  describe('la diffusion', () => {
    it('émet `message:translation-shared` à la room de la conversation quand tous peuvent lire le message', async () => {
      const h = await buildApp();
      const res = await post(h, shareBody());

      expect(h.emitted).toEqual([
        {
          room: ROOMS.conversation(CONV_A),
          event: SERVER_EVENTS.MESSAGE_TRANSLATION_SHARED,
          payload: res.json().data.sharedTranslation,
        },
      ]);
    });

    it('n’émet qu’aux rooms PERSONNELLES des lecteurs quand un membre arrivé après le message ne peut pas le lire', async () => {
      const store = scene({
        participants: [
          participantRow({ id: SHARER, userId: USER_ID }),
          participantRow({ id: PEER, userId: OTHER_USER_ID }),
          participantRow({ id: LATE, userId: LATE_USER, historyVisibleFrom: AFTER_THE_MESSAGE }),
        ],
      });
      const h = await buildApp({ store });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(201);
      expect(h.emitted).toEqual([
        {
          room: [ROOMS.user(USER_ID), ROOMS.user(OTHER_USER_ID)],
          event: SERVER_EVENTS.MESSAGE_TRANSLATION_SHARED,
          payload: res.json().data.sharedTranslation,
        },
      ]);
    });

    it('émet la MÊME forme que celle que le REST sert à la lecture', async () => {
      const h = await buildApp();
      await post(h, shareBody());

      const served = await get(h, { messageIds: MSG_1, languages: 'fr' });

      expect(served.json().data.sharedTranslations).toEqual([h.emitted[0].payload]);
    });

    it(`diffuse une enveloppe jusqu’à ${SHARED_TRANSLATION_BROADCAST_MAX_PAYLOAD} caractères`, async () => {
      const atTheThreshold = 'A'.repeat(SHARED_TRANSLATION_BROADCAST_MAX_PAYLOAD);
      const h = await buildApp();

      await post(h, shareBody({ envelope: envelope({ payload: atTheThreshold }) }));

      expect(h.emitted.map((emission) => emission.payload.envelope)).toEqual([envelope({ payload: atTheThreshold })]);
    });

    it('range une enveloppe plus lourde sans la diffuser : la room ne porte pas ce que le GET sert à qui le demande', async () => {
      const beyond = 'A'.repeat(SHARED_TRANSLATION_BROADCAST_MAX_PAYLOAD + 4);
      const h = await buildApp();

      const res = await post(h, shareBody({ envelope: envelope({ payload: beyond }) }));
      const served = await get(h, { messageIds: MSG_1, languages: 'fr' });

      expect(res.statusCode).toBe(201);
      expect(h.emitted).toEqual([]);
      expect(served.json().data.sharedTranslations.map((entry: { envelope: { payload: string } }) => entry.envelope.payload)).toEqual([beyond]);
    });

    it('n’émet rien quand la traduction existait déjà', async () => {
      const h = await buildApp({ shares: [share()] });
      await post(h, shareBody());

      expect(h.emitted).toEqual([]);
    });

    it.each([
      ['le serveur Socket.IO lève', 'throwing' as const],
      ['aucun serveur Socket.IO n’est monté', 'absent' as const],
    ])('range et répond 201 quand %s — la diffusion ne fait jamais échouer le partage', async (_label, io) => {
      const h = await buildApp({ io });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(201);
      expect(h.shares).toHaveLength(1);
    });

    it('n’émet rien quand le rangement échoue', async () => {
      const h = await buildApp({
        prismaOverrides: (prisma) => ({
          ...prisma,
          sharedTranslation: {
            ...prisma.sharedTranslation,
            create: async () => {
              throw new Error('mongo down');
            },
          },
        }),
      });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(500);
      expect(res.json()).toMatchObject({ success: false });
      expect(h.emitted).toEqual([]);
    });
  });

  describe('qui peut partager, et sur quoi', () => {
    it('refuse 403 à qui ne participe pas à la conversation', async () => {
      const h = await buildApp({ authContext: registeredAs(OUTSIDER_USER) });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(403);
      expect(h.shares).toEqual([]);
      expect(h.emitted).toEqual([]);
    });

    it('résout l’identifiant lisible de la conversation, comme les autres routes de conversation', async () => {
      const h = await buildApp();

      const res = await post(h, shareBody(), 'mshy_equipe');

      expect(res.statusCode).toBe(201);
      expect(res.json().data.sharedTranslation.conversationId).toBe(CONV_A);
    });

    it('refuse 404 quand la conversation n’existe pas', async () => {
      const h = await buildApp();

      const res = await post(h, shareBody(), UNKNOWN_CONVERSATION);

      expect(res.statusCode).toBe(404);
      expect(h.shares).toEqual([]);
    });

    it.each([
      ['un message qui n’existe pas', () => shareBody({ messageId: UNKNOWN_MESSAGE }), () => scene()],
      [
        'un message d’une AUTRE conversation',
        () => shareBody({ messageId: MSG_OTHER_CONVERSATION }),
        () => scene({ messages: [message(), message({ id: MSG_OTHER_CONVERSATION, conversationId: CONV_B })] }),
      ],
      [
        'un message supprimé pour tous',
        () => shareBody(),
        () => scene({ messages: [message({ deletedAt: new Date('2026-09-20T10:10:00.000Z') })] }),
      ],
      [
        'un message antérieur au plancher d’historique de l’appelant',
        () => shareBody(),
        () =>
          scene({
            participants: [
              participantRow({ id: SHARER, userId: USER_ID, historyVisibleFrom: AFTER_THE_MESSAGE }),
              participantRow({ id: PEER, userId: OTHER_USER_ID }),
            ],
          }),
      ],
      [
        'un message que l’appelant a retiré de sa vue',
        () => shareBody(),
        () => scene({ deletions: [{ userId: USER_ID, messageId: MSG_1 }] }),
      ],
      [
        'un message d’une conversation dont l’appelant est banni',
        () => shareBody(),
        () =>
          scene({
            participants: [
              participantRow({ id: SHARER, userId: USER_ID, bannedAt: new Date('2026-09-10T00:00:00.000Z') }),
              participantRow({ id: PEER, userId: OTHER_USER_ID }),
            ],
          }),
      ],
    ])('refuse 404 pour %s — le même refus pour tous', async (_label, body, storeOf) => {
      const h = await buildApp({ store: storeOf() });

      const res = await post(h, body());

      expect(res.statusCode).toBe(404);
      expect(h.shares).toEqual([]);
      expect(h.emitted).toEqual([]);
    });

    it('juge le droit de LIRE avant la protection : un message protégé qu’on ne lit pas est un 404, jamais un 422', async () => {
      const store = scene({
        messages: [message({ isViewOnce: true })],
        participants: [
          participantRow({ id: SHARER, userId: USER_ID, historyVisibleFrom: AFTER_THE_MESSAGE }),
          participantRow({ id: PEER, userId: OTHER_USER_ID }),
        ],
      });
      const h = await buildApp({ store });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBeUndefined();
    });

    it('répond 500 et ne range rien quand le masquage personnel de l’appelant ne répond pas — jamais « il ne masque rien »', async () => {
      const h = await buildApp({ prismaOverrides: personalHidingLookupDown });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(500);
      expect(h.shares).toEqual([]);
      expect(h.emitted).toEqual([]);
    });
  });

  describe('un partage est un accusé de lecture', () => {
    // L'appareil traduit ce qu'il AFFICHE, et la diffusion nomme qui partage et
    // quand : partager dit aux autres « X a ce message sous les yeux ». Qui a
    // coupé ses accusés de lecture ne partage donc pas — sa traduction reste sur
    // son appareil, et les autres traduisent sur le leur.
    const receiptsOff = { documents: { [USER_ID]: { showReadReceipts: false } } };

    it('refuse 403 `SHARED_TRANSLATION_READ_RECEIPTS_OFF` à qui a coupé ses accusés de lecture, sans rien ranger ni diffuser', async () => {
      const h = await buildApp({ privacy: receiptsOff });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ success: false, code: SHARED_TRANSLATION_ERROR_CODES.readReceiptsOff });
      expect(h.shares).toEqual([]);
      expect(h.emitted).toEqual([]);
    });

    it('lit le réglage HÉRITÉ de janvier quand le document n’en porte pas — la loi des préférences, pas une seconde lecture', async () => {
      const h = await buildApp({
        privacy: { legacyRows: [{ userId: USER_ID, key: 'show-read-receipts', value: 'false' }] },
      });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe(SHARED_TRANSLATION_ERROR_CODES.readReceiptsOff);
    });

    it('refuse sans regarder le message : le refus dit ce que fait le COMPTE, pas ce qu’est le message', async () => {
      const h = await buildApp({ privacy: receiptsOff });

      const res = await post(h, shareBody({ messageId: UNKNOWN_MESSAGE }));

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe(SHARED_TRANSLATION_ERROR_CODES.readReceiptsOff);
    });

    it('ne doit son refus qu’aux accusés : un autre réglage coupé laisse partager', async () => {
      const h = await buildApp({
        privacy: { documents: { [USER_ID]: { showOnlineStatus: false, showLastSeen: false, showReadReceipts: true } } },
      });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(201);
      expect(h.shares).toHaveLength(1);
    });

    it('ne retient pas le partage d’un AUTRE membre qui, lui, a coupé ses accusés', async () => {
      const h = await buildApp({ privacy: { documents: { [OTHER_USER_ID]: { showReadReceipts: false } } } });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(201);
    });

    it('répond 500 et ne range rien quand le réglage ne se lit pas — jamais « il n’a rien réglé »', async () => {
      const h = await buildApp({ prismaOverrides: privacyLookupDown });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(500);
      expect(h.shares).toEqual([]);
      expect(h.emitted).toEqual([]);
    });

    it('sert un invité de lien partagé par les défauts, sans interroger la base sous son identifiant de participant', async () => {
      const store = scene({
        participants: [participantRow({ id: SHARER, userId: USER_ID }), participantRow({ id: GUEST, userId: null, user: null })],
      });
      const h = await buildApp({ store, authContext: guestAs(GUEST), prismaOverrides: privacyLookupDown });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(201);
    });
  });

  describe('un message protégé ne porte pas de traduction partagée', () => {
    it.each([
      ['vue unique', { isViewOnce: true }],
      ['vue unique (bitfield seul)', { effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE }],
      ['flouté', { isBlurred: true }],
      ['flouté (bitfield seul)', { effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED }],
      ['éphémère (durée)', { ephemeralDuration: 60 }],
      ['éphémère (échéance)', { expiresAt: new Date('2026-09-22T10:00:00.000Z') }],
      ['éphémère (bitfield)', { effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL }],
      ['éphémère après lecture (bitfield)', { effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ }],
    ])('refuse 422 pour un message %s', async (_label, protection) => {
      const h = await buildApp({ store: scene({ messages: [message(protection)] }) });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(422);
      expect(res.json()).toMatchObject({ success: false, code: SHARED_TRANSLATION_ERROR_CODES.protectedMessage });
      expect(h.shares).toEqual([]);
      expect(h.emitted).toEqual([]);
    });
  });

  describe('la langue', () => {
    it.each(['en-US', 'FR', 'fra', 'pt_BR', 'Fr-ca'])('refuse 400 la langue non normalisée %s', async (targetLanguage) => {
      const h = await buildApp();

      const res = await post(h, shareBody({ targetLanguage }));

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ success: false, code: SHARED_TRANSLATION_ERROR_CODES.unnormalizedLanguage });
      expect(h.shares).toEqual([]);
    });

    it.each(['xx', 'zz', 'qaa'])('refuse 400 la langue %s, hors du catalogue : un message ne range pas une enveloppe par code inventé', async (targetLanguage) => {
      const h = await buildApp();

      const res = await post(h, shareBody({ targetLanguage }));

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ success: false, code: SHARED_TRANSLATION_ERROR_CODES.unnormalizedLanguage });
      expect(h.shares).toEqual([]);
    });

    it('juge le droit de LIRE avant la langue : un message qu’on ne lit pas reste un 404, même pour une langue mal formée', async () => {
      const h = await buildApp({ store: scene({ messages: [message({ deletedAt: new Date('2026-09-20T10:10:00.000Z') })] }) });

      const res = await post(h, shareBody({ targetLanguage: 'en-US' }));

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBeUndefined();
    });

    it('juge la protection avant la langue : un message protégé reste un 422, même pour une langue mal formée', async () => {
      const h = await buildApp({ store: scene({ messages: [message({ isViewOnce: true })] }) });

      const res = await post(h, shareBody({ targetLanguage: 'en-US' }));

      expect(res.statusCode).toBe(422);
      expect(res.json()).toMatchObject({ code: SHARED_TRANSLATION_ERROR_CODES.protectedMessage });
    });

    it.each([
      ['la langue d’origine, telle quelle', 'en', 'en'],
      ['la langue d’origine, étiquetée avec sa région', 'en-US', 'en'],
      ['la langue d’origine, en trois lettres', 'eng', 'en'],
    ])('refuse 422 de traduire vers %s', async (_label, originalLanguage, targetLanguage) => {
      const h = await buildApp({ store: scene({ messages: [message({ originalLanguage })] }) });

      const res = await post(h, shareBody({ targetLanguage }));

      expect(res.statusCode).toBe(422);
      expect(res.json()).toMatchObject({ success: false, code: SHARED_TRANSLATION_ERROR_CODES.sameLanguage });
      expect(h.shares).toEqual([]);
    });
  });

  describe('la dérivation de la clé', () => {
    // `message-content` dérive la clé du texte du message : là seulement où le
    // serveur lit DÉJÀ ce texte. Ailleurs, il pourrait deviner un message court
    // en essayant d'ouvrir l'enveloppe. La règle se lit sur la PROPRIÉTÉ — le
    // serveur lit-il ce message ? —, pas sur une étiquette exacte.
    const refusedContentKey = async (store: Store) => {
      const h = await buildApp({ store });
      const res = await post(h, shareBody({ envelope: envelope({ kdf: 'message-content' }) }));
      return { h, res };
    };

    it.each([
      ['e2ee', 'e2ee'],
      ['écrite en majuscules', 'E2EE'],
      ['entourée de blancs', ' e2ee '],
      ['inconnue', 'signal-v2'],
    ])('refuse 422 `message-content` dans une conversation dont l’étiquette de chiffrement est %s', async (_label, encryptionMode) => {
      const { h, res } = await refusedContentKey(scene({ conversations: [conversationRow({ id: CONV_A, encryptionMode })] }));

      expect(res.statusCode).toBe(422);
      expect(res.json()).toMatchObject({ success: false, code: SHARED_TRANSLATION_ERROR_CODES.kdfRefused });
      expect(h.shares).toEqual([]);
      expect(h.emitted).toEqual([]);
    });

    it.each([
      ['e2ee', 'e2ee'],
      ['écrit en majuscules', 'E2EE'],
      ['absent', null],
      ['inconnu', 'x'],
    ])('refuse 422 `message-content` pour un message chiffré dont le mode est %s, même dans une conversation que le serveur lit', async (_label, encryptionMode) => {
      const { h, res } = await refusedContentKey(scene({ messages: [message({ isEncrypted: true, encryptionMode })] }));

      expect(res.statusCode).toBe(422);
      expect(res.json()).toMatchObject({ success: false, code: SHARED_TRANSLATION_ERROR_CODES.kdfRefused });
      expect(h.shares).toEqual([]);
    });

    it.each([
      ['sans mode de chiffrement', null],
      ['chiffrée côté serveur', 'server'],
      ['hybride', 'hybrid'],
    ])('accepte `message-content` dans une conversation %s', async (_label, encryptionMode) => {
      const h = await buildApp({ store: scene({ conversations: [conversationRow({ id: CONV_A, encryptionMode })] }) });

      const res = await post(h, shareBody({ envelope: envelope({ kdf: 'message-content' }) }));

      expect(res.statusCode).toBe(201);
    });

    it.each([['server'], ['hybrid']])('accepte `message-content` pour un message chiffré PAR le serveur (%s)', async (encryptionMode) => {
      const h = await buildApp({ store: scene({ messages: [message({ isEncrypted: true, encryptionMode })] }) });

      const res = await post(h, shareBody({ envelope: envelope({ kdf: 'message-content' }) }));

      expect(res.statusCode).toBe(201);
    });

    it.each([
      ['une conversation chiffrée de bout en bout', () => scene({ conversations: [conversationRow({ id: CONV_A, encryptionMode: 'e2ee' })] })],
      ['un message chiffré de bout en bout', () => scene({ messages: [message({ isEncrypted: true, encryptionMode: 'e2ee' })] })],
      ['une conversation que le serveur lit', () => scene()],
    ])('refuse 422 `message-secret` dans %s, tant que le message chiffré qui le transporte n’existe pas (#9959)', async (_label, storeOf) => {
      const h = await buildApp({ store: storeOf() });

      const res = await post(h, shareBody({ envelope: envelope({ kdf: 'message-secret' }) }));

      expect(res.statusCode).toBe(422);
      expect(res.json()).toMatchObject({ success: false, code: SHARED_TRANSLATION_ERROR_CODES.kdfRefused });
      expect(h.shares).toEqual([]);
      expect(h.emitted).toEqual([]);
    });
  });

  describe('la version traduite', () => {
    // L'appareil scelle la traduction d'un texte, puis la poste plus tard : si
    // le message a été modifié entre-temps, elle ne traduit plus ce que les
    // autres lisent — et rangée sous la version courante, elle ne s'ouvrirait
    // jamais et prendrait la place de la bonne.
    it('refuse 409 `SHARED_TRANSLATION_STALE_SOURCE` la traduction d’une version que le message a quittée', async () => {
      const h = await buildApp({ store: scene({ messages: [message({ editedAt: EDITED_AT })] }) });

      const res = await post(h, shareBody({ sourceVersion: 'original' }));

      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ success: false, code: SHARED_TRANSLATION_ERROR_CODES.staleSource });
      expect(h.shares).toEqual([]);
      expect(h.emitted).toEqual([]);
    });

    it('refuse 409 une version que le message n’a jamais eue', async () => {
      const h = await buildApp();

      const res = await post(h, shareBody({ sourceVersion: EDITED_AT.toISOString() }));

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe(SHARED_TRANSLATION_ERROR_CODES.staleSource);
    });

    // Un appareil qui garde ses dates en virgule flottante, et les range dans une
    // colonne texte à la milliseconde (GRDB, iOS), peut relire `…05:00.000` en
    // `…04:59.999`. Deux modifications réelles ne tombent pas dans la même
    // milliseconde, et l'enveloppe lie de toute façon l'empreinte du texte source.
    it('admet la milliseconde d’écart d’un appareil, et range la version du SERVEUR', async () => {
      const h = await buildApp({ store: scene({ messages: [message({ editedAt: EDITED_AT })] }) });

      const res = await post(h, shareBody({ sourceVersion: new Date(EDITED_AT.getTime() - 1).toISOString() }));

      expect(res.statusCode).toBe(201);
      expect(h.shares.map((row) => row.sourceVersion)).toEqual([EDITED_AT.toISOString()]);
    });

    it('refuse 409 au-delà de la milliseconde, dans les deux sens', async () => {
      const h = await buildApp({ store: scene({ messages: [message({ editedAt: EDITED_AT })] }) });

      const statuses = [];
      for (const offset of [-2, 2]) {
        const res = await post(h, shareBody({ sourceVersion: new Date(EDITED_AT.getTime() + offset).toISOString() }));
        statuses.push(res.statusCode);
      }

      expect(statuses).toEqual([409, 409]);
      expect(h.shares).toEqual([]);
    });

    it('juge le droit de LIRE avant la version : un message qu’on ne lit pas reste un 404', async () => {
      const store = scene({
        messages: [message({ editedAt: EDITED_AT })],
        participants: [
          participantRow({ id: SHARER, userId: USER_ID, historyVisibleFrom: AFTER_THE_MESSAGE }),
          participantRow({ id: PEER, userId: OTHER_USER_ID }),
        ],
      });
      const h = await buildApp({ store });

      const res = await post(h, shareBody({ sourceVersion: 'original' }));

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBeUndefined();
    });
  });

  describe('la course avec les écrivains', () => {
    // Un écrivain efface les traductions partagées APRÈS avoir écrit
    // (`sharedTranslationErasure`). Un partage validé avant son écriture, et rangé
    // après son effacement, lui survivrait : la ligne d'un message supprimé
    // resterait en base pour toujours.
    const committedDuringPlacement =
      (store: Store, change: Row, withdrawal: 'up' | 'down' = 'up') =>
      (prisma: HarnessPrisma) => ({
        ...prisma,
        sharedTranslation: {
          ...prisma.sharedTranslation,
          create: async (args: { data: Row }) => {
            Object.assign(store.messages[0], change);
            return prisma.sharedTranslation.create(args);
          },
          deleteMany: async (args: { where: Row }) => {
            if (withdrawal === 'down') throw new Error('mongo down');
            return prisma.sharedTranslation.deleteMany(args);
          },
        },
      });

    it.each([
      ['une édition', { editedAt: EDITED_AT }, 409, SHARED_TRANSLATION_ERROR_CODES.staleSource],
      ['une suppression', { deletedAt: AFTER_THE_MESSAGE }, 404, undefined],
      ['une protection', { isBlurred: true }, 422, SHARED_TRANSLATION_ERROR_CODES.protectedMessage],
    ])('retire SA ligne et ne diffuse rien quand %s se glisse entre la validation et le rangement', async (_label, change, status, code) => {
      const store = scene();
      const anotherLanguage = share({ targetLanguage: 'de' });
      const h = await buildApp({ store, shares: [anotherLanguage], prismaOverrides: committedDuringPlacement(store, change) });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(status);
      expect(res.json().code).toBe(code);
      expect(h.shares).toEqual([anotherLanguage]);
      expect(h.emitted).toEqual([]);
    });

    it('refuse quand même si le retrait échoue : la ligne d’une version quittée n’est jamais servie', async () => {
      const store = scene();
      const h = await buildApp({ store, prismaOverrides: committedDuringPlacement(store, { editedAt: EDITED_AT }, 'down') });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(409);
      expect(h.shares.map((row) => row.sourceVersion)).toEqual(['original']);
      expect(h.emitted).toEqual([]);
    });
  });

  describe('le corps de la demande', () => {
    it.each([
      ['sans enveloppe', { messageId: MSG_1, targetLanguage: 'fr' }],
      ['sans langue cible', { messageId: MSG_1, envelope: envelope() }],
      ['avec un identifiant de message qui n’est pas un ObjectId', shareBody({ messageId: 'not-an-object-id' })],
      ['avec une langue cible malformée', shareBody({ targetLanguage: '12' })],
      ['avec une version d’enveloppe inconnue', shareBody({ envelope: envelope({ v: 2 }) })],
      ['avec un algorithme inconnu', shareBody({ envelope: envelope({ alg: 'A128GCM' }) })],
      ['avec une dérivation inconnue', shareBody({ envelope: envelope({ kdf: 'password' }) })],
      ['sans version traduite', { messageId: MSG_1, targetLanguage: 'fr', envelope: envelope() }],
      ['avec une version traduite qui n’est ni `original` ni un instant ISO', shareBody({ sourceVersion: '2026-09-20' })],
      ['avec une charge qui n’est pas du base64', shareBody({ envelope: envelope({ payload: `${'!'.repeat(60)}` }) })],
      [
        'avec une charge base64 privée de son remplissage',
        shareBody({ envelope: envelope({ payload: Buffer.from(Array.from({ length: 61 }, (_, index) => index)).toString('base64').replace(/=+$/, '') }) }),
      ],
      ['avec une charge trop courte pour contenir un nonce et un tag', shareBody({ envelope: envelope({ payload: 'QUJD' }) })],
      [
        'avec une charge au-delà de la borne',
        shareBody({ envelope: envelope({ payload: 'A'.repeat(SHARED_TRANSLATION_LIMITS.payloadMaxLength + 4) }) }),
      ],
    ])('refuse 400 une demande %s', async (_label, body) => {
      const h = await buildApp();

      const res = await post(h, body);

      expect(res.statusCode).toBe(400);
      expect(h.shares).toEqual([]);
      expect(h.emitted).toEqual([]);
    });
  });
});

describe('POST /conversations/:id/shared-translations — le débit compte le COMPTE', () => {
  const account = (headers: Record<string, unknown>) =>
    registeredAs(headers['x-account'] === 'peer' ? OTHER_USER_ID : USER_ID);
  const postAs = (h: Awaited<ReturnType<typeof buildApp>>, who: 'sharer' | 'peer') =>
    h.app.inject({
      method: 'POST',
      url: `/conversations/${CONV_A}/shared-translations`,
      payload: shareBody(),
      headers: { 'x-account': who },
    });

  it('refuse 429 au-delà du plafond par minute, sans entamer le crédit d’un autre membre venu de la même adresse', async () => {
    const h = await buildApp({ authContextFor: account, rateLimit: { skipOnError: true } });

    const statuses = [];
    for (let sent = 0; sent < SHARED_TRANSLATION_SHARE_RATE_LIMIT.max; sent += 1) {
      statuses.push((await postAs(h, 'sharer')).statusCode);
    }
    const beyond = await postAs(h, 'sharer');
    const otherMember = await postAs(h, 'peer');

    expect(statuses.every((status) => status === 200 || status === 201)).toBe(true);
    expect(beyond.statusCode).toBe(429);
    expect(beyond.json()).toMatchObject({ success: false });
    expect(otherMember.statusCode).not.toBe(429);
    expect(h.shares).toHaveLength(1);
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
    const h = await buildApp({ authContextFor: account, rateLimit: { skipOnError: true, store: StoreDown } });

    const res = await postAs(h, 'sharer');

    expect(res.statusCode).toBe(500);
    expect(h.shares).toEqual([]);
    expect(h.emitted).toEqual([]);
  });
});
