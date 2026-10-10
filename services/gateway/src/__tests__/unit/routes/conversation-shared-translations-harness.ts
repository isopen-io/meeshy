/**
 * Le harnais des témoins de `/conversations/:id/shared-translations` (#9899).
 *
 * La base est celle du favori de message — une base en mémoire qui ÉVALUE les
 * `where` qu'on lui passe —, augmentée de ce que la route lit en plus
 * (`conversation`, `sharedTranslation`). Elle applique l'unicité du triplet
 * `(messageId, targetLanguage, sourceVersion)` comme l'index unique de la
 * production : `create` lève `P2002` sur un doublon.
 *
 * La route est montée avec la VRAIE résolution d'identifiant de conversation :
 * `conversationRow()` porte l'identifiant lisible `mshy_equipe`, qui est donc
 * adressable ; `UNKNOWN_CONVERSATION` n'est porté par aucune.
 */
import Fastify from 'fastify';
import { registerSharedTranslationRoutes } from '../../../routes/conversations/shared-translations';
import {
  CONV_A,
  HARNESS_NOW,
  MSG_1,
  OTHER_USER_ID,
  USER_ID,
  conversationRow,
  makePrisma,
  makeStore,
  matchesWhere,
  messageRow,
  participantRow,
  type Store,
} from './me/starred-messages-harness';

export type Row = Record<string, unknown>;

export const SHARER = '68b000000000000000000011';
export const PEER = '68b000000000000000000012';
export const LATE_USER = '68b000000000000000000003';
export const LATE = '68b000000000000000000013';
export const OUTSIDER_USER = '68b000000000000000000009';
export const GUEST = '68b0000000000000000000f1';
export const MSG_OTHER_CONVERSATION = '68b000000000000000000199';
export const UNKNOWN_MESSAGE = '68b0000000000000000001ff';
export const UNKNOWN_CONVERSATION = 'mshy_unknown';

export const SENT_AT = new Date('2026-09-20T10:00:00.000Z');
export const EDITED_AT = new Date('2026-09-20T10:05:00.000Z');
export const AFTER_THE_MESSAGE = new Date('2026-09-20T10:30:00.000Z');

/** Des octets quelconques en base64 : l'enveloppe est OPAQUE, le serveur n'en lit rien. */
export const sealedPayload = (seed: number): string =>
  Buffer.from(Array.from({ length: 60 }, (_, index) => (index * 37 + seed) % 256)).toString('base64');

export const PAYLOAD = sealedPayload(11);
export const OTHER_PAYLOAD = sealedPayload(97);

export const envelope = (overrides: Row = {}): Row => ({ v: 1, alg: 'A256GCM', kdf: 'message-content', payload: PAYLOAD, ...overrides });

export const shareBody = (overrides: Row = {}): Row => ({
  messageId: MSG_1,
  targetLanguage: 'fr',
  envelope: envelope(),
  ...overrides,
});

export const registeredAs = (userId: string): Row => ({ type: 'user', isAuthenticated: true, isAnonymous: false, userId });
export const guestAs = (participantId: string): Row => ({
  type: 'anonymous',
  isAuthenticated: true,
  isAnonymous: true,
  userId: participantId,
  participantId,
});

export const message = (overrides: Row = {}): Row =>
  messageRow({
    id: MSG_1,
    conversationId: CONV_A,
    originalLanguage: 'en',
    createdAt: SENT_AT,
    editedAt: null,
    deletedAt: null,
    expiresAt: null,
    ephemeralDuration: null,
    isViewOnce: false,
    isBlurred: false,
    isEncrypted: false,
    encryptionMode: null,
    effectFlags: 0,
    ...overrides,
  });

export const scene = (overrides: Partial<Store> = {}): Store =>
  makeStore({
    conversations: [conversationRow({ id: CONV_A, encryptionMode: 'server' })],
    messages: [message()],
    participants: [
      participantRow({ id: SHARER, userId: USER_ID }),
      participantRow({ id: PEER, userId: OTHER_USER_ID }),
    ],
    ...overrides,
  });

export const share = (overrides: Row = {}): Row => ({
  id: '68d000000000000000000001',
  conversationId: CONV_A,
  messageId: MSG_1,
  targetLanguage: 'fr',
  sourceVersion: 'original',
  kdf: 'message-content',
  payload: PAYLOAD,
  sharedById: PEER,
  createdAt: new Date('2026-09-20T11:00:00.000Z'),
  ...overrides,
});

function database(store: Store, shares: Row[]) {
  const base = makePrisma(store);
  const issued = { next: 2 };
  const reads: Array<{ where?: Row; take?: number }> = [];
  const prisma = {
    ...base,
    conversation: {
      ...base.conversation,
      findUnique: async (args: { where: { id: string } }) => store.conversations.find((c) => c.id === args.where.id) ?? null,
      findFirst: async (args: { where: Row }) => store.conversations.find((c) => matchesWhere(c, args.where)) ?? null,
    },
    sharedTranslation: {
      create: async (args: { data: Row }) => {
        const clash = shares.some(
          (row) =>
            row.messageId === args.data.messageId &&
            row.targetLanguage === args.data.targetLanguage &&
            row.sourceVersion === args.data.sourceVersion,
        );
        if (clash) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        const row = {
          id: `68d${String(issued.next++).padStart(21, '0')}`,
          createdAt: new Date('2026-09-21T12:00:00.000Z'),
          ...args.data,
        };
        shares.push(row);
        return row;
      },
      findUnique: async (args: {
        where: { messageId_targetLanguage_sourceVersion: { messageId: string; targetLanguage: string; sourceVersion: string } };
      }) => {
        const key = args.where.messageId_targetLanguage_sourceVersion;
        return (
          shares.find(
            (row) =>
              row.messageId === key.messageId &&
              row.targetLanguage === key.targetLanguage &&
              row.sourceVersion === key.sourceVersion,
          ) ?? null
        );
      },
      findMany: async (args: { where?: Row; take?: number }) => {
        reads.push(args);
        const rows = shares.filter((row) => matchesWhere(row, args.where));
        return typeof args.take === 'number' ? rows.slice(0, args.take) : rows;
      },
    },
  };
  return { prisma, reads };
}

/**
 * Une base dont la lecture du masquage PERSONNEL (« supprimé pour moi ») ne
 * répond pas : la posture `'refuse'` de la loi de lecture doit la propager, jamais
 * en conclure que l'appelant ne masque rien.
 */
export const personalHidingLookupDown = (prisma: ReturnType<typeof database>['prisma']) => ({
  ...prisma,
  userMessageDeletion: {
    ...prisma.userMessageDeletion,
    findMany: async () => {
      throw new Error('mongo down');
    },
  },
});

export type Emission = { room: string | string[]; event: string; payload: Row };

export async function buildApp(
  params: {
    store?: Store;
    shares?: Row[];
    authContext?: Row;
    io?: 'throwing' | 'absent';
    prismaOverrides?: (prisma: ReturnType<typeof database>['prisma']) => unknown;
  } = {},
) {
  const store = params.store ?? scene();
  const shares = params.shares ?? [];
  const { prisma, reads } = database(store, shares);
  const emitted: Emission[] = [];

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const io = {
    to: (room: string | string[]) => {
      if (params.io === 'throwing') throw new Error('socket adapter down');
      return {
        emit: (event: string, payload: Row) => {
          emitted.push({ room, event, payload });
          return true;
        },
      };
    },
  };
  if (params.io !== 'absent') {
    (app as unknown as { socketIOHandler: unknown }).socketIOHandler = { getManager: () => ({ getIO: () => io }) };
  }
  const auth = async (req: { authContext?: unknown }) => {
    req.authContext = params.authContext ?? registeredAs(USER_ID);
  };
  registerSharedTranslationRoutes(app, (params.prismaOverrides?.(prisma) ?? prisma) as never, auth, { now: () => HARNESS_NOW });
  await app.ready();
  return { app, shares, emitted, reads };
}

export type Harness = Awaited<ReturnType<typeof buildApp>>;

export const post = (h: Harness, body: unknown, conversationId = CONV_A) =>
  h.app.inject({ method: 'POST', url: `/conversations/${conversationId}/shared-translations`, payload: body as Row });

export const get = (h: Harness, query: Record<string, string>, conversationId = CONV_A) =>
  h.app.inject({ method: 'GET', url: `/conversations/${conversationId}/shared-translations`, query });

export const WIRE_KEYS = ['conversationId', 'envelope', 'id', 'messageId', 'sharedAt', 'sharedBy', 'targetLanguage'];
