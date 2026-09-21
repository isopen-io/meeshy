/**
 * Harnais des témoins du favori de message (#7377).
 *
 * Le faux Prisma est une BASE EN MÉMOIRE qui ÉVALUE les `where` qu'on lui
 * passe (égalité, `in`, `lt`/`gte`, `isSet`, `null`, `OR`/`AND`/`NOT`,
 * relation imbriquée) plutôt que de rendre une réponse fixée d'avance : un
 * témoin de garde doit pouvoir tomber quand la REQUÊTE cesse de garder, pas
 * seulement quand le handler cesse d'appeler (`services/gateway/CLAUDE.md`,
 * « un témoin qui ne peut pas tomber n'est pas un témoin »).
 *
 * Il rend des lignes ENTIÈRES, `select` ignoré, et les fixtures portent
 * délibérément des colonnes qui ne doivent jamais partir (`encryptedContent`,
 * `metadata`, la présence de l'auteur, l'enveloppe de chiffrement d'une
 * traduction…) : c'est la projection, pas la requête, qui doit les retenir.
 */
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

import { meStarredMessagesRoutes } from '../../../../routes/me/starred-messages';

export const USER_ID = '68b000000000000000000001';
export const OTHER_USER_ID = '68b000000000000000000002';
export const CONV_A = '68b0000000000000000000a1';
export const CONV_B = '68b0000000000000000000b1';
export const CONV_DIRECT = '68b0000000000000000000d1';
export const MSG_1 = '68b000000000000000000101';
export const MSG_2 = '68b000000000000000000102';
export const MSG_3 = '68b000000000000000000103';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const OPERATORS = new Set(['in', 'notIn', 'lt', 'lte', 'gt', 'gte', 'not', 'isSet', 'equals']);

function compare(a: unknown, b: unknown): number {
  const left = a instanceof Date ? a.getTime() : a;
  const right = b instanceof Date ? b.getTime() : b;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

function isPlainObject(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !(value instanceof Date) && !Array.isArray(value);
}

function matchesField(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null;
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
  if (!isPlainObject(cond)) return value === cond;
  const isOperatorBlock = Object.keys(cond).every((key) => OPERATORS.has(key));
  if (!isOperatorBlock) return isPlainObject(value) && matchesWhere(value, cond);
  return Object.entries(cond).every(([op, arg]) => {
    switch (op) {
      case 'in': return (arg as unknown[]).includes(value);
      case 'notIn': return !(arg as unknown[]).includes(value);
      case 'lt': return value !== undefined && value !== null && compare(value, arg) < 0;
      case 'lte': return value !== undefined && value !== null && compare(value, arg) <= 0;
      case 'gt': return value !== undefined && value !== null && compare(value, arg) > 0;
      case 'gte': return value !== undefined && value !== null && compare(value, arg) >= 0;
      case 'not': return !matchesField(value, arg);
      case 'isSet': return arg ? value !== undefined : value === undefined;
      case 'equals': return matchesField(value, arg);
      default: return false;
    }
  });
}

export function matchesWhere(row: Row, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Where[]).some((w) => matchesWhere(row, w));
    if (key === 'AND') return (cond as Where[]).every((w) => matchesWhere(row, w));
    if (key === 'NOT') return !matchesWhere(row, cond as Where);
    return matchesField(row[key], cond);
  });
}

function sortRows(rows: Row[], orderBy: unknown): Row[] {
  const clauses = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []) as Array<Record<string, 'asc' | 'desc'>>;
  return [...rows].sort((a, b) => {
    for (const clause of clauses) {
      const [field, direction] = Object.entries(clause)[0];
      const diff = compare(a[field], b[field]);
      if (diff !== 0) return direction === 'desc' ? -diff : diff;
    }
    return 0;
  });
}

function findMany(rows: Row[], args: { where?: Where; orderBy?: unknown; take?: number } = {}): Row[] {
  const sorted = sortRows(rows.filter((row) => matchesWhere(row, args.where)), args.orderBy);
  return typeof args.take === 'number' ? sorted.slice(0, args.take) : sorted;
}

export type Store = {
  messages: Row[];
  participants: Row[];
  conversations: Row[];
  stars: Row[];
  deletions: Row[];
  prefs: Row[];
  shareLinks: Row[];
};

export type Emitted = { room: string; event: string; payload: unknown };

export function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    messages: [],
    participants: [],
    conversations: [],
    stars: [],
    deletions: [],
    prefs: [],
    shareLinks: [],
    ...overrides,
  };
}

function uniqueViolation(): Error & { code: string } {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

/** Un compteur d'ids par base, jamais un `let` de module partagé entre témoins. */
function idFactory(prefix: string): () => string {
  const state = { next: 1 };
  return () => {
    const id = `${prefix}${String(state.next).padStart(24 - prefix.length, '0')}`;
    state.next += 1;
    return id;
  };
}

export function makePrisma(store: Store, options: { now?: () => Date } = {}) {
  const nextStarId = idFactory('68c0');
  const now = options.now ?? (() => new Date('2026-09-21T12:00:00.000Z'));
  const withMessage = (row: Row): Row => ({ ...row, message: store.messages.find((m) => m.id === row.messageId) ?? null });

  return {
    message: {
      findUnique: async (args: { where: { id: string } }) => store.messages.find((m) => m.id === args.where.id) ?? null,
      findMany: async (args: { where?: Where; take?: number }) => findMany(store.messages, args),
    },
    participant: {
      findFirst: async (args: { where?: Where }) => findMany(store.participants, args)[0] ?? null,
      findMany: async (args: { where?: Where; take?: number }) => findMany(store.participants, args),
    },
    conversation: {
      findMany: async (args: { where?: Where; take?: number }) => findMany(store.conversations, args),
    },
    conversationShareLink: {
      findUnique: async (args: { where: { id: string } }) => store.shareLinks.find((l) => l.id === args.where.id) ?? null,
      findMany: async (args: { where?: Where }) => findMany(store.shareLinks, args),
    },
    userConversationPreferences: {
      findFirst: async (args: { where?: Where }) => findMany(store.prefs, args)[0] ?? null,
      findMany: async (args: { where?: Where }) => findMany(store.prefs, args),
    },
    userMessageDeletion: {
      findMany: async (args: { where?: Where }) => findMany(store.deletions.map(withMessage), args),
    },
    messageStar: {
      create: async (args: { data: Row }) => {
        const exists = store.stars.some((s) => s.userId === args.data.userId && s.messageId === args.data.messageId);
        if (exists) throw uniqueViolation();
        const row = { id: nextStarId(), createdAt: now(), ...args.data };
        store.stars.push(row);
        return row;
      },
      findUnique: async (args: { where: { userId_messageId: { userId: string; messageId: string } } }) => {
        const key = args.where.userId_messageId;
        return store.stars.find((s) => s.userId === key.userId && s.messageId === key.messageId) ?? null;
      },
      findMany: async (args: { where?: Where; orderBy?: unknown; take?: number }) => findMany(store.stars, args),
      deleteMany: async (args: { where?: Where }) => {
        const doomed = store.stars.filter((s) => matchesWhere(s, args.where));
        doomed.forEach((row) => store.stars.splice(store.stars.indexOf(row), 1));
        return { count: doomed.length };
      },
    },
  };
}

export const REGISTERED = {
  type: 'user',
  isAuthenticated: true,
  isAnonymous: false,
  userId: USER_ID,
  registeredUser: { id: USER_ID, role: 'USER' },
} as const;

export const ANONYMOUS = {
  type: 'anonymous',
  isAuthenticated: true,
  isAnonymous: true,
  userId: '68b0000000000000000000f1',
  participantId: '68b0000000000000000000f1',
} as const;

export async function buildApp(
  prisma: ReturnType<typeof makePrisma>,
  options: { authContext?: Row; emitted?: Emitted[] } = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const emitted = options.emitted ?? [];
  const io = {
    to: (room: string | string[]) => ({
      emit: (event: string, payload: unknown) => {
        emitted.push({ room: String(room), event, payload });
        return true;
      },
    }),
  };
  app.decorate('prisma', prisma as never);
  app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => io }) } as never);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    (request as unknown as Row).authContext = options.authContext ?? REGISTERED;
    (request as unknown as Row).auth = { userId: (options.authContext ?? REGISTERED).userId, isAuthenticated: true };
  });
  await app.register(meStarredMessagesRoutes);
  await app.ready();
  return app;
}

/**
 * Un message VIVANT et lisible — chargé de tout ce qui ne doit JAMAIS partir.
 */
export function messageRow(overrides: Row = {}): Row {
  return {
    id: MSG_1,
    conversationId: CONV_A,
    senderId: '68b0000000000000000000e1',
    content: 'Hello team',
    originalLanguage: 'en',
    messageType: 'text',
    createdAt: new Date('2026-09-20T10:00:00.000Z'),
    editedAt: null,
    deletedAt: null,
    expiresAt: null,
    isViewOnce: false,
    isBlurred: false,
    isEncrypted: false,
    effectFlags: 0,
    encryptedContent: 'CIPHERTEXT-MUST-NOT-LEAVE',
    encryptionMetadata: { keyId: 'k1' },
    metadata: { location: { lat: 1, lng: 2 } },
    reactionSummary: { '👍': 3 },
    validatedMentions: ['bob'],
    translations: {
      fr: { text: 'Bonjour l’équipe', translationModel: 'basic', createdAt: new Date('2026-09-20T10:00:01.000Z'), encryptionIv: 'IV-MUST-NOT-LEAVE' },
      es: { text: 'SECRETO', translationModel: 'basic', isEncrypted: true, encryptionKeyId: 'k1', createdAt: new Date('2026-09-20T10:00:01.000Z') },
    },
    sender: {
      id: '68b0000000000000000000e1',
      userId: OTHER_USER_ID,
      displayName: null,
      avatar: null,
      isOnline: true,
      lastActiveAt: new Date('2026-09-21T11:59:00.000Z'),
      user: {
        username: 'ada',
        displayName: 'Ada',
        avatar: 'https://cdn.example/ada.png',
        isOnline: true,
        lastActiveAt: new Date('2026-09-21T11:59:00.000Z'),
        email: 'ada@example.com',
      },
    },
    attachments: [],
    ...overrides,
  };
}

export function attachmentRow(overrides: Row = {}): Row {
  return {
    id: '68b0000000000000000000c1',
    mimeType: 'image/jpeg',
    fileUrl: 'https://cdn.example/photo.jpg',
    thumbnailUrl: 'https://cdn.example/photo-thumb.jpg',
    isViewOnce: false,
    isBlurred: false,
    effectFlags: 0,
    fileName: 'photo.jpg',
    transcription: { text: 'TRANSCRIPT-MUST-NOT-LEAVE' },
    encryptionIv: 'IV-MUST-NOT-LEAVE',
    ...overrides,
  };
}

export function participantRow(overrides: Row = {}): Row {
  return {
    id: '68b000000000000000000011',
    conversationId: CONV_A,
    userId: USER_ID,
    isActive: true,
    bannedAt: undefined,
    role: 'member',
    joinedAt: new Date('2026-01-01T00:00:00.000Z'),
    shareLinkId: null,
    historyVisibleFrom: null,
    permissions: null,
    anonymousSession: null,
    user: { role: 'USER' },
    displayName: null,
    avatar: null,
    ...overrides,
  };
}

export function conversationRow(overrides: Row = {}): Row {
  return {
    id: CONV_A,
    identifier: 'mshy_equipe',
    type: 'group',
    title: 'Équipe',
    avatar: null,
    memberCount: 4200,
    encryptionMode: 'server',
    ...overrides,
  };
}

export function starRow(overrides: Row = {}): Row {
  return {
    id: '68c000000000000000000001',
    userId: USER_ID,
    messageId: MSG_1,
    conversationId: CONV_A,
    createdAt: new Date('2026-09-21T09:00:00.000Z'),
    ...overrides,
  };
}
