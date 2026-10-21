/**
 * `POST /conversations/:id/shared-translations` — ce que la conversation admet
 * d'un partageur, et ce que son COMPTE a le droit de ranger (#9899).
 *
 * Un partage écrit une ligne et la fait afficher sous le message d'un autre :
 * qui ne peut pas écrire ici ne partage pas. La loi est celle de l'envoi
 * (`conversationWriteAdmission.ts`), dans sa forme PURE pour un acte dérivé d'un
 * message : l'état terminal, le rang d'écriture et le mineur en Global
 * s'appliquent ; les deux débits — mode lent et nouveaux comptes — mesurent des
 * MESSAGES, et un partage n'en est pas un. Le droit personnel d'écrire
 * (`canSendMessages`) s'applique comme à l'envoi.
 *
 * Le budget compte ce qu'un compte RANGE, en caractères d'enveloppe, par heure
 * et par jour : le plafond par minute compte des requêtes, et une requête porte
 * jusqu'à 40 Kio.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { ErrorCode, ErrorMessages } from '@meeshy/shared/types/errors';
import { SHARED_TRANSLATION_ERROR_CODES } from '@meeshy/shared/types/shared-translation';
import { GLOBAL_ADULTS_ONLY_CODE } from '../../../services/messaging/conversationWriteAdmission';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

import {
  GUEST,
  MSG_OTHER_CONVERSATION,
  PAYLOAD,
  PEER,
  SHARER,
  UNKNOWN_MESSAGE,
  buildApp,
  envelope,
  guestAs,
  message,
  post,
  registeredAs,
  scene,
  sceneWithTwoConversations,
  shareBody,
  type Harness,
  type Row,
} from './conversation-shared-translations-harness';
import { CONV_A, CONV_B, HARNESS_NOW, OTHER_USER_ID, USER_ID, conversationRow, participantRow } from './me/starred-messages-harness';

const ALL_RIGHTS = {
  canSendMessages: true,
  canSendFiles: true,
  canSendImages: true,
  canSendVideos: true,
  canSendAudios: true,
  canSendLocations: true,
  canSendLinks: true,
};

const MINOR_BIRTH = new Date('2011-03-01T00:00:00.000Z');
const ADULT_BIRTH = new Date('1990-03-01T00:00:00.000Z');

/** La conversation du partage, réglée par le témoin ; le partageur et un pair. */
const sceneWith = (params: { conversation?: Row; sharer?: Row } = {}) =>
  scene({
    conversations: [conversationRow({ id: CONV_A, encryptionMode: 'server', ...params.conversation })],
    participants: [
      participantRow({ id: SHARER, userId: USER_ID, ...params.sharer }),
      participantRow({ id: PEER, userId: OTHER_USER_ID }),
    ],
  });

const refusedWithoutTrace = (h: Harness) => {
  expect(h.shares).toEqual([]);
  expect(h.emitted).toEqual([]);
};

describe('POST /conversations/:id/shared-translations — ce que la conversation admet', () => {
  describe('une conversation fermée ne reçoit plus rien', () => {
    it.each([
      ['désactivée', { isActive: false }],
      ['close', { closedAt: new Date('2026-09-21T00:00:00.000Z') }],
    ])('refuse 410 dans une conversation %s, sans rien ranger ni diffuser', async (_label, conversation) => {
      const h = await buildApp({ store: sceneWith({ conversation }) });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(410);
      expect(res.json()).toMatchObject({ success: false });
      refusedWithoutTrace(h);
    });

    it('ne connaît aucune dispense : ni le créateur, ni le staff plateforme', async () => {
      const h = await buildApp({
        store: sceneWith({ conversation: { isActive: false }, sharer: { role: 'creator', user: { role: 'BIGBOSS' } } }),
      });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(410);
    });

    it('juge la conversation avant le message : fermée, elle répond 410 même pour un message inconnu', async () => {
      const h = await buildApp({ store: sceneWith({ conversation: { isActive: false } }) });

      const res = await post(h, shareBody({ messageId: UNKNOWN_MESSAGE }));

      expect(res.statusCode).toBe(410);
    });
  });

  describe('le rang d’écriture', () => {
    it('refuse 403 au simple membre d’un canal d’annonces : qui n’y écrit pas n’y fait rien afficher', async () => {
      const h = await buildApp({ store: sceneWith({ conversation: { isAnnouncementChannel: true, defaultWriteRole: 'admin' } }) });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ success: false });
      refusedWithoutTrace(h);
    });

    // Le canal d'annonces exige le rang `admin` quel que soit `defaultWriteRole`
    // (`requiredWriteRank`) : seul le drapeau, sans plancher qui le double, dit s'il
    // est lu. Avec `defaultWriteRole: 'admin'` — le réglage qu'écrit la création —,
    // le plancher refuse à sa place et le drapeau peut manquer au `select`.
    it.each([
      ['ouvert à tous', 'everyone'],
      ['absent', null],
      ['réservé aux membres', 'member'],
    ])('refuse 403 au simple membre d’un canal d’annonces dont le plancher d’écriture est %s : le drapeau PRIME', async (_label, defaultWriteRole) => {
      const h = await buildApp({ store: sceneWith({ conversation: { isAnnouncementChannel: true, defaultWriteRole } }) });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ success: false });
      refusedWithoutTrace(h);
    });

    it('refuse 403 au membre d’un groupe dont l’écriture est réservée aux modérateurs', async () => {
      const h = await buildApp({ store: sceneWith({ conversation: { defaultWriteRole: 'moderator' } }) });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(403);
      refusedWithoutTrace(h);
    });

    it.each([
      ['l’administrateur du canal', { role: 'admin' }],
      ['le staff plateforme, membre ordinaire du canal', { role: 'member', user: { role: 'MODERATOR' } }],
    ])('laisse partager %s', async (_label, sharer) => {
      const h = await buildApp({
        store: sceneWith({ conversation: { isAnnouncementChannel: true, defaultWriteRole: 'admin' }, sharer }),
      });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(201);
    });

    it('n’applique aucun rang dans un tête-à-tête, même marqué canal d’annonces', async () => {
      const h = await buildApp({
        store: sceneWith({ conversation: { type: 'direct', isAnnouncementChannel: true, defaultWriteRole: 'admin' } }),
      });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(201);
    });
  });

  describe('Global se lit sans s’écrire avant 18 ans', () => {
    const globalConversation = { type: 'global', encryptionMode: null };

    it('refuse 403 `GLOBAL_ADULTS_ONLY` à un mineur déclaré, sans dispense de rôle', async () => {
      const h = await buildApp({
        store: sceneWith({
          conversation: globalConversation,
          sharer: { role: 'moderator', user: { role: 'ADMIN', birthDate: MINOR_BIRTH, createdAt: new Date('2025-01-01T00:00:00.000Z') } },
        }),
      });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ success: false, code: GLOBAL_ADULTS_ONLY_CODE });
      refusedWithoutTrace(h);
    });

    it('laisse partager un adulte, et un mineur hors de Global', async () => {
      const adultInGlobal = await buildApp({
        store: sceneWith({ conversation: globalConversation, sharer: { user: { role: 'USER', birthDate: ADULT_BIRTH } } }),
      });
      const minorInGroup = await buildApp({
        store: sceneWith({ sharer: { user: { role: 'USER', birthDate: MINOR_BIRTH } } }),
      });

      const statuses = [(await post(adultInGlobal, shareBody())).statusCode, (await post(minorInGroup, shareBody())).statusCode];

      expect(statuses).toEqual([201, 201]);
    });
  });

  describe('les débits mesurent des MESSAGES, et un partage n’en est pas un', () => {
    const justNow = new Date(HARNESS_NOW.getTime() - 5_000);

    it('ne ralentit pas un compte créé il y a une minute dans Global', async () => {
      const h = await buildApp({
        store: sceneWith({
          conversation: { type: 'global', encryptionMode: null },
          sharer: { user: { role: 'USER', createdAt: new Date(HARNESS_NOW.getTime() - 60_000), birthDate: ADULT_BIRTH } },
        }),
        prismaOverrides: (prisma) => ({
          ...prisma,
          message: { ...prisma.message, findFirst: async () => ({ createdAt: justNow }) },
        }),
      });

      const statuses = [(await post(h, shareBody())).statusCode, (await post(h, shareBody({ targetLanguage: 'es' }))).statusCode];

      expect(statuses).toEqual([201, 201]);
    });

    it('ne subit pas le mode lent de la conversation', async () => {
      const h = await buildApp({
        store: sceneWith({ conversation: { slowModeSeconds: 30 } }),
        prismaOverrides: (prisma) => ({
          ...prisma,
          message: { ...prisma.message, findFirst: async () => ({ createdAt: justNow }) },
        }),
      });

      const statuses = [(await post(h, shareBody())).statusCode, (await post(h, shareBody({ targetLanguage: 'es' }))).statusCode];

      expect(statuses).toEqual([201, 201]);
    });
  });

  describe('le droit personnel d’écrire', () => {
    it('refuse 403 `WRITE_NOT_PERMITTED` au membre privé du droit d’écrire', async () => {
      const h = await buildApp({ store: sceneWith({ sharer: { permissions: { ...ALL_RIGHTS, canSendMessages: false } } }) });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ success: false, code: 'WRITE_NOT_PERMITTED' });
      refusedWithoutTrace(h);
    });

    const guestScene = (guest: Row) =>
      scene({
        participants: [
          participantRow({ id: SHARER, userId: USER_ID }),
          participantRow({ id: GUEST, userId: null, user: null, ...guest }),
        ],
      });

    it('refuse 403 à l’invité dont l’hôte a retiré le droit d’écrire après son arrivée', async () => {
      const h = await buildApp({
        store: guestScene({ permissions: ALL_RIGHTS, anonymousSession: { rights: { canSendMessages: false } } }),
        authContext: guestAs(GUEST),
      });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('WRITE_NOT_PERMITTED');
      refusedWithoutTrace(h);
    });

    it('laisse partager l’invité à qui l’hôte a rouvert le droit que son lien ne donnait pas', async () => {
      const h = await buildApp({
        store: guestScene({
          permissions: { ...ALL_RIGHTS, canSendMessages: false },
          anonymousSession: { rights: { canSendMessages: true } },
        }),
        authContext: guestAs(GUEST),
      });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(201);
    });

    it('ne refuse pas un droit ABSENT : seule une interdiction explicite bloque', async () => {
      const h = await buildApp({ store: sceneWith({ sharer: { permissions: null } }) });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(201);
    });
  });

  // Un partage fait afficher une ligne sous le message de l'autre, et la diffusion
  // nomme qui partage : à deux, c'est écrire à quelqu'un. L'envoi refuse entre deux
  // membres qui se sont bloqués (`messages-send.ts`, `USER_BLOCKED`) ; le partage, qui
  // en est un acte dérivé, ne contourne pas ce que l'envoi refuse.
  describe('un blocage entre les deux membres d’une conversation directe', () => {
    const THIRD_USER = '68b000000000000000000004';
    const directScene = (conversation: Row = {}, sharer: Row = {}) => sceneWith({ conversation: { type: 'direct', ...conversation }, sharer });

    it.each([
      ['direct', 'le pair a bloqué le partageur', { [OTHER_USER_ID]: [USER_ID] }],
      ['direct', 'le partageur a bloqué le pair', { [USER_ID]: [OTHER_USER_ID] }],
      ['dm', 'le pair a bloqué le partageur', { [OTHER_USER_ID]: [USER_ID] }],
      ['dm', 'le partageur a bloqué le pair', { [USER_ID]: [OTHER_USER_ID] }],
    ])('refuse 403 `USER_BLOCKED` dans une conversation %s quand %s, sans rien ranger ni diffuser', async (type, _who, blocks) => {
      const h = await buildApp({ store: directScene({ type }), blocks });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ success: false, code: ErrorCode.USER_BLOCKED, error: ErrorMessages[ErrorCode.USER_BLOCKED].en });
      refusedWithoutTrace(h);
    });

    it('nomme le code que l’envoi nomme : les clients n’ont qu’un blocage à reconnaître', async () => {
      const h = await buildApp({ store: directScene(), blocks: { [OTHER_USER_ID]: [USER_ID] } });

      const res = await post(h, shareBody());

      expect(res.json().code).toBe('USER_BLOCKED');
    });

    it('laisse partager quand personne n’a bloqué personne — et a posé la question', async () => {
      const h = await buildApp({ store: directScene(), blocks: { [OTHER_USER_ID]: [THIRD_USER] } });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(201);
      expect(h.blockLookups).toHaveLength(1);
    });

    it.each(['group', 'public'])('ne juge jamais un blocage dans une conversation %s, et ne lit rien pour cela', async (type) => {
      const h = await buildApp({ store: sceneWith({ conversation: { type } }), blocks: { [OTHER_USER_ID]: [USER_ID] } });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(201);
      expect(h.blockLookups).toEqual([]);
    });

    it('ne juge pas un invité de lien partagé : il n’a pas de compte à bloquer, et son identifiant n’est pas celui d’un compte', async () => {
      const h = await buildApp({
        store: scene({
          conversations: [conversationRow({ id: CONV_A, type: 'direct', encryptionMode: 'server' })],
          participants: [participantRow({ id: SHARER, userId: USER_ID }), participantRow({ id: GUEST, userId: null, user: null })],
        }),
        authContext: guestAs(GUEST),
        blocks: { [GUEST]: [USER_ID], [USER_ID]: [GUEST] },
      });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(201);
      expect(h.blockLookups).toEqual([]);
    });

    it('ne juge pas l’autre membre quand il n’a pas de compte : rien à bloquer, rien à demander à la base', async () => {
      const store = scene({
        conversations: [conversationRow({ id: CONV_A, type: 'direct', encryptionMode: 'server' })],
        participants: [participantRow({ id: SHARER, userId: USER_ID }), participantRow({ id: GUEST, userId: null, user: null })],
      });
      const h = await buildApp({ store, blocks: { [GUEST]: [USER_ID], [USER_ID]: [GUEST] } });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(201);
      expect(h.blockLookups).toEqual([]);
    });

    it('ne juge que les membres ACTIFS : celui qui est parti ne retient personne', async () => {
      const store = scene({
        conversations: [conversationRow({ id: CONV_A, type: 'direct', encryptionMode: 'server' })],
        participants: [participantRow({ id: SHARER, userId: USER_ID }), participantRow({ id: PEER, userId: OTHER_USER_ID, isActive: false })],
      });
      const h = await buildApp({ store, blocks: { [OTHER_USER_ID]: [USER_ID] } });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(201);
    });

    it('répond 500 et ne range rien quand le blocage ne se lit pas — jamais « il n’est pas bloqué »', async () => {
      const h = await buildApp({
        store: directScene(),
        prismaOverrides: (prisma) => ({
          ...prisma,
          user: {
            findFirst: async () => {
              throw new Error('mongo down');
            },
          },
        }),
      });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(500);
      refusedWithoutTrace(h);
    });

    it('répond 500 et ne range rien quand les membres de la conversation ne se lisent pas — jamais « il n’y a personne à qui se heurter »', async () => {
      const h = await buildApp({
        store: directScene(),
        prismaOverrides: (prisma) => ({
          ...prisma,
          participant: {
            ...prisma.participant,
            findMany: async (args: Parameters<typeof prisma.participant.findMany>[0]) => {
              if (Object.keys(args.select ?? {}).join() === 'userId') throw new Error('mongo down');
              return prisma.participant.findMany(args);
            },
          },
        }),
      });

      const res = await post(h, shareBody());

      expect(res.statusCode).toBe(500);
      refusedWithoutTrace(h);
    });

    describe('l’ordre des refus', () => {
      const blocked = { [OTHER_USER_ID]: [USER_ID] };

      it('vient APRÈS ce que la conversation admet : fermée, elle répond 410 même à un membre bloqué', async () => {
        const h = await buildApp({ store: directScene({ isActive: false }), blocks: blocked });

        const res = await post(h, shareBody());

        expect(res.statusCode).toBe(410);
      });

      it('vient APRÈS le droit personnel d’écrire : privé de ce droit, le membre bloqué reçoit `WRITE_NOT_PERMITTED`', async () => {
        const h = await buildApp({
          store: directScene({}, { permissions: { ...ALL_RIGHTS, canSendMessages: false } }),
          blocks: blocked,
        });

        const res = await post(h, shareBody());

        expect(res.json()).toMatchObject({ code: 'WRITE_NOT_PERMITTED' });
      });

      it('vient AVANT les accusés de lecture : le membre bloqué qui les a coupés reçoit `USER_BLOCKED`', async () => {
        const h = await buildApp({
          store: directScene(),
          blocks: blocked,
          privacy: { documents: { [USER_ID]: { showReadReceipts: false } } },
        });

        const res = await post(h, shareBody());

        expect(res.json()).toMatchObject({ code: ErrorCode.USER_BLOCKED });
      });
    });
  });
});

describe('POST /conversations/:id/shared-translations — le budget d’octets compte ce que le COMPTE range', () => {
  const weight = PAYLOAD.length;
  const account = (headers: Record<string, unknown>) => registeredAs(headers['x-account'] === 'peer' ? OTHER_USER_ID : USER_ID);
  const postAs = (h: Harness, who: 'sharer' | 'peer', body: Row) =>
    h.app.inject({
      method: 'POST',
      url: `/conversations/${CONV_A}/shared-translations`,
      payload: body,
      headers: { 'x-account': who },
    });

  it('refuse 429 `SHARED_TRANSLATION_BUDGET_EXCEEDED` au-delà du budget horaire, avec `Retry-After`, sans ranger ni diffuser', async () => {
    const h = await buildApp({ shareBudget: { perHour: 2 * weight, perDay: 100 * weight } });

    const accepted = [(await post(h, shareBody())).statusCode, (await post(h, shareBody({ targetLanguage: 'es' }))).statusCode];
    const beyond = await post(h, shareBody({ targetLanguage: 'de' }));

    expect(accepted).toEqual([201, 201]);
    expect(beyond.statusCode).toBe(429);
    expect(beyond.json()).toMatchObject({ success: false, code: SHARED_TRANSLATION_ERROR_CODES.budgetExceeded });
    expect(Number(beyond.headers['retry-after'])).toBeGreaterThan(0);
    expect(h.shares).toHaveLength(2);
    expect(h.emitted).toHaveLength(2);
  });

  it('tient la journée quand l’heure laisse passer', async () => {
    const h = await buildApp({ shareBudget: { perHour: 100 * weight, perDay: weight } });

    const statuses = [(await post(h, shareBody())).statusCode, (await post(h, shareBody({ targetLanguage: 'es' }))).statusCode];

    expect(statuses).toEqual([201, 429]);
  });

  it('compte ce que l’enveloppe PÈSE, pas le nombre de partages', async () => {
    const heavy = 'A'.repeat(4 * weight);
    const h = await buildApp({ shareBudget: { perHour: 3 * weight, perDay: 100 * weight } });

    const res = await post(h, shareBody({ envelope: envelope({ payload: heavy }) }));

    expect(res.statusCode).toBe(429);
    expect(h.shares).toEqual([]);
  });

  it('ne débite que ce qui serait rangé : un partage refusé avant n’entame rien', async () => {
    const h = await buildApp({
      store: scene({ messages: [message()] }),
      shareBudget: { perHour: weight, perDay: 100 * weight },
    });

    const stale = await post(h, shareBody({ sourceVersion: '2026-09-20T10:05:00.000Z' }));
    const accepted = await post(h, shareBody());

    expect([stale.statusCode, accepted.statusCode]).toEqual([409, 201]);
  });

  it('compte le COMPTE : le budget épuisé d’un membre n’entame pas celui d’un autre', async () => {
    const h = await buildApp({ authContextFor: account, shareBudget: { perHour: weight, perDay: 100 * weight } });

    const first = await postAs(h, 'sharer', shareBody());
    const beyond = await postAs(h, 'sharer', shareBody({ targetLanguage: 'es' }));
    const otherMember = await postAs(h, 'peer', shareBody({ targetLanguage: 'de' }));

    expect([first.statusCode, beyond.statusCode, otherMember.statusCode]).toEqual([201, 429, 201]);
  });

  // Un compte a UNE ligne de participant par conversation : keyer le budget sur elle
  // (`Participant.id`) donnerait à un seul compte autant de budgets que de conversations.
  it('compte le COMPTE, pas sa ligne de participant : un même compte qui partage dans deux conversations n’a qu’un budget', async () => {
    const h = await buildApp({ store: sceneWithTwoConversations(), shareBudget: { perHour: weight, perDay: 100 * weight } });

    const inFirst = await post(h, shareBody());
    const inSecond = await post(h, shareBody({ messageId: MSG_OTHER_CONVERSATION }), CONV_B);

    expect([inFirst.statusCode, inSecond.statusCode]).toEqual([201, 429]);
    expect(inSecond.json()).toMatchObject({ success: false, code: SHARED_TRANSLATION_ERROR_CODES.budgetExceeded });
    expect(h.shares).toHaveLength(1);
  });
});
