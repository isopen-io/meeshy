/**
 * #16590 — `GET /users/me/dashboard-stats` servait le TEXTE du dernier message
 * sans son bloc de protection, sous aucun plancher d'historique et sans le
 * masquage personnel de son lecteur.
 *
 * CINQUIÈME porte de l'énumération ouverte par #16558, après #16578
 * (épingles), #16581 (message par identifiant), #16583 (`/mentions/me`) et
 * #16586 (`/sync`). C'est celle dont le défaut est le plus LARGE : elle ne
 * manquait pas une loi, elle en manquait cinq — parce qu'elle réécrivait à la
 * main, en QUATRE champs, une projection d'aperçu qui en porte vingt-cinq et
 * dont le doc-comment disait déjà pourquoi il avait été extrait : « Deux copies
 * auraient dérivé ». C'était la troisième.
 *
 * ─── CE QUE CHAQUE TÉMOIN GARDE ────────────────────────────────────────────
 *
 *  1. le TEXTE d'une vue unique, d'un flouté, et d'un éphémère dont l'échéance
 *     de CE lecteur est passée, est RETENU — la retenue est serveur
 *     (`content: ''`), et les drapeaux qui QUALIFIENT le placeholder partent
 *     avec elle, sans quoi le client ne peut pas le composer (#6111) ;
 *  2. l'échéance servie est celle DU LECTEUR (#7451), jamais la colonne interne
 *     de destruction — témoin de RANG, écrit sur un rang AUTRE que le premier ;
 *  3. un éphémère encore vivant et un message ordinaire gardent leur texte : la
 *     retenue ne déborde pas ;
 *  4. le PLANCHER d'historique retire l'aperçu écrit avant l'arrivée du
 *     lecteur, et sert le message visible suivant s'il y en a un ;
 *  5. un plancher ILLISIBLE retire l'aperçu — fail-CLOSED, c'est un contrôle
 *     d'accès ;
 *  6. une conversation où le lecteur n'a AUCUNE participation lisible n'a pas
 *     d'aperçu : l'absence ne vaut pas autorisation ;
 *  7. le masquage PERSONNEL (`delete-for-me`) retire l'aperçu masqué et sert le
 *     message visible précédent — jamais une ligne vide.
 *
 * Tous traversent `app.inject`, donc la sérialisation par SCHÉMA : c'est la
 * couche où le bloc de protection était STRIPPÉ en silence, et un témoin posé
 * sur l'objet du gestionnaire ne l'aurait jamais vu.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn(), logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import { getDashboardStats } from '../../../../routes/users/preferences';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439a01';
const READER_PART_ID = '507f1f77bcf86cd799439b01';

const JOINED_AT = new Date('2026-06-01T00:00:00Z');
const BEFORE_FLOOR = new Date('2026-05-01T10:00:00Z');
const AFTER_FLOOR = new Date('2026-06-02T10:00:00Z');

/** La participation du LECTEUR, telle que `HISTORY_FLOOR_PARTICIPANT_SELECT` la demande. */
const membership = (over: Record<string, unknown> = {}) => ({
  id: READER_PART_ID,
  conversationId: CONV_ID,
  role: 'member',
  joinedAt: JOINED_AT,
  shareLinkId: null,
  historyVisibleFrom: null,
  permissions: null,
  anonymousSession: null,
  user: { role: 'USER' },
  ...over,
});

/** Un dernier message d'aperçu, à la forme de `conversationLastMessagePreviewSelect`. */
const preview = (over: Record<string, unknown> = {}) => ({
  id: 'm-preview',
  content: 'le code du coffre est 4242',
  createdAt: AFTER_FLOOR,
  senderId: 'p-sender',
  messageType: 'text',
  isBlurred: false,
  isViewOnce: false,
  effectFlags: 0,
  expiresAt: null,
  ephemeralDuration: null,
  replyToId: null,
  isEncrypted: false,
  conversationId: CONV_ID,
  encryptionMode: null,
  encryptedContent: null,
  encryptionMetadata: null,
  messageSource: 'user',
  forwardedFromId: null,
  translations: null,
  originalLanguage: 'fr',
  metadata: null,
  sender: {
    id: 'p-sender',
    userId: 'u-sender',
    displayName: 'Alice',
    avatar: null,
    type: 'user',
    user: { id: 'u-sender', username: 'alice', displayName: 'Alice', avatar: null },
  },
  ...over,
});

const conversationRow = (messages: ReadonlyArray<Record<string, unknown>>) => ({
  id: CONV_ID,
  identifier: 'conv-identifier',
  title: 'Groupe',
  type: 'group',
  avatar: null,
  updatedAt: AFTER_FLOOR,
  messages,
  participants: [{ user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null } }],
});

async function buildApp(over: Record<string, any> = {}, conversations?: ReadonlyArray<Record<string, unknown>>) {
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const prisma = {
    participant: {
      count: jest.fn<any>().mockResolvedValue(1),
      findMany: jest.fn<any>().mockResolvedValue([membership()]),
    },
    conversation: {
      findMany: jest.fn<any>().mockResolvedValue(conversations ?? [conversationRow([preview()])]),
    },
    communityMember: { count: jest.fn<any>().mockResolvedValue(0) },
    community: { findMany: jest.fn<any>().mockResolvedValue([]) },
    message: {
      count: jest.fn<any>().mockResolvedValue(0),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    // #7451 / #8630 — les échéances de lecteur et la chaîne citée. Vides par
    // défaut : « aucun décompte démarré », la posture fermée de la loi.
    messageStatusEntry: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversationShareLink: {
      count: jest.fn<any>().mockResolvedValue(0),
      findMany: jest.fn<any>().mockResolvedValue([]),
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    ...over,
  };
  app.decorate('prisma', prisma as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } };
  });
  await getDashboardStats(app);
  await app.ready();
  return { app, prisma };
}

async function servedPreview(over: Record<string, any> = {}, conversations?: ReadonlyArray<Record<string, unknown>>) {
  const { app } = await buildApp(over, conversations);
  const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
  await app.close();
  expect(res.statusCode).toBe(200);
  return { body: res.json(), payload: res.payload, row: res.json().data.recentConversations[0] };
}

describe('GET /users/me/dashboard-stats — l’aperçu obéit aux lois de la ligne de liste (#16590)', () => {
  it('RETIENT le texte d’un dernier message à VUE UNIQUE, et garde ses drapeaux', async () => {
    const { row, payload } = await servedPreview({}, [
      conversationRow([preview({ isViewOnce: true, effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE })]),
    ]);

    // La retenue est SERVEUR (`projectListLastMessageBody` : `content: ''`),
    // pas une invitation faite au client de masquer lui-même.
    expect(row.lastMessage.content).toBe('');
    expect(payload).not.toContain('le code du coffre');
    // Et ce qui part avec elle, ce sont les drapeaux qui QUALIFIENT le
    // placeholder : sans leur DÉCLARATION, fast-json-stringify les retirait en
    // silence et le client ne pouvait pas le composer (#6111).
    expect(row.lastMessage.isViewOnce).toBe(true);
    expect(row.lastMessage.effectFlags).toBe(MESSAGE_EFFECT_FLAGS.VIEW_ONCE);
    expect(row.lastMessage.viewOnceConsumed).toBe(false);
  });

  it('RETIENT le texte d’un dernier message FLOUTÉ', async () => {
    const { row, payload } = await servedPreview({}, [
      conversationRow([preview({ isBlurred: true, effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED })]),
    ]);

    expect(row.lastMessage.content).toBe('');
    expect(payload).not.toContain('le code du coffre');
    expect(row.lastMessage.isBlurred).toBe(true);
  });

  it('RETIENT le texte d’un éphémère dont l’échéance de CE lecteur est passée', async () => {
    const readerDeadline = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const { row, payload } = await servedPreview(
      {
        // `Message.expiresAt` est l'heure INTERNE de destruction : sept jours
        // devant. L'échéance du LECTEUR, elle, est passée — et c'est elle que
        // la loi lit.
        messageStatusEntry: {
          findMany: jest.fn<any>().mockResolvedValue([
            { messageId: 'm-preview', participantId: READER_PART_ID, ephemeralExpiresAt: readerDeadline },
          ]),
          findFirst: jest.fn<any>().mockResolvedValue(null),
        },
      },
      [
        conversationRow([
          preview({
            effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL,
            ephemeralDuration: 30,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          }),
        ]),
      ],
    );

    expect(payload).not.toContain('le code du coffre');
    expect(row.lastMessage.content).toBe('');
    // L'échéance servie est celle du lecteur, jamais la colonne interne — un
    // témoin de RANG écrit sur un rang AUTRE que le premier.
    expect(row.lastMessage.expiresAt).toBe(readerDeadline.toISOString());
  });

  it('sert le texte d’un éphémère encore VIVANT pour ce lecteur, avec SON échéance', async () => {
    const readerDeadline = new Date(Date.now() + 10 * 60 * 1000);
    const { row } = await servedPreview(
      {
        messageStatusEntry: {
          findMany: jest.fn<any>().mockResolvedValue([
            { messageId: 'm-preview', participantId: READER_PART_ID, ephemeralExpiresAt: readerDeadline },
          ]),
          findFirst: jest.fn<any>().mockResolvedValue(null),
        },
      },
      [
        conversationRow([
          preview({
            effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL,
            ephemeralDuration: 30,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          }),
        ]),
      ],
    );

    expect(row.lastMessage.content).toBe('le code du coffre est 4242');
    expect(row.lastMessage.expiresAt).toBe(readerDeadline.toISOString());
    // La DURÉE est ce dont les trois clients dérivent leur décompte (#7451).
    expect(row.lastMessage.ephemeralDuration).toBe(30);
  });

  it('sert le texte d’un message ORDINAIRE — la retenue ne déborde pas', async () => {
    const { row } = await servedPreview();
    expect(row.lastMessage.content).toBe('le code du coffre est 4242');
    expect(row.lastMessage.isViewOnce).toBe(false);
    expect(row.lastMessage.expiresAt ?? null).toBeNull();
  });

  it('retire l’aperçu écrit AVANT l’arrivée du lecteur — le plancher d’historique', async () => {
    const { row, payload } = await servedPreview(
      { participant: { count: jest.fn<any>().mockResolvedValue(1), findMany: jest.fn<any>().mockResolvedValue([membership({ historyVisibleFrom: JOINED_AT })]) } },
      [conversationRow([preview({ createdAt: BEFORE_FLOOR })])],
    );

    expect(row.lastMessage).toBeNull();
    expect(payload).not.toContain('le code du coffre');
  });

  it('sert le message visible SUIVANT quand l’aperçu est sous le plancher', async () => {
    const visible = preview({ id: 'm-visible', content: 'texte visible', createdAt: AFTER_FLOOR });
    const { row } = await servedPreview(
      {
        participant: { count: jest.fn<any>().mockResolvedValue(1), findMany: jest.fn<any>().mockResolvedValue([membership({ historyVisibleFrom: JOINED_AT })]) },
        message: { count: jest.fn<any>().mockResolvedValue(0), findFirst: jest.fn<any>().mockResolvedValue(visible) },
      },
      [conversationRow([preview({ createdAt: BEFORE_FLOOR })])],
    );

    expect(row.lastMessage.id).toBe('m-visible');
    expect(row.lastMessage.content).toBe('texte visible');
  });

  it('retire l’aperçu quand le plancher est ILLISIBLE — fail-closed', async () => {
    const { row, payload } = await servedPreview(
      {
        participant: {
          count: jest.fn<any>().mockResolvedValue(1),
          findMany: jest.fn<any>().mockResolvedValue([membership({ shareLinkId: 'lnk-1' })]),
        },
        conversationShareLink: {
          count: jest.fn<any>().mockResolvedValue(0),
          findMany: jest.fn<any>().mockRejectedValue(new Error('share link read failed')),
          findUnique: jest.fn<any>().mockRejectedValue(new Error('share link read failed')),
        },
      },
      [conversationRow([preview()])],
    );

    expect(row.lastMessage).toBeNull();
    expect(payload).not.toContain('le code du coffre');
  });

  it('n’a pas d’aperçu là où le lecteur n’a AUCUNE participation lisible', async () => {
    const { row, payload } = await servedPreview(
      { participant: { count: jest.fn<any>().mockResolvedValue(1), findMany: jest.fn<any>().mockResolvedValue([]) } },
      [conversationRow([preview()])],
    );

    expect(row.lastMessage).toBeNull();
    expect(payload).not.toContain('le code du coffre');
  });

  it('retire un aperçu masqué PERSONNELLEMENT et sert le précédent visible', async () => {
    const previous = preview({ id: 'm-previous', content: 'texte précédent' });
    const { row } = await servedPreview(
      {
        userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([{ messageId: 'm-preview' }]) },
        message: { count: jest.fn<any>().mockResolvedValue(0), findFirst: jest.fn<any>().mockResolvedValue(previous) },
      },
      [conversationRow([preview()])],
    );

    expect(row.lastMessage.id).toBe('m-previous');
    expect(row.lastMessage.content).toBe('texte précédent');
  });
});
