/**
 * Le harnais des témoins de `/conversations/:id/shared-translations` (#9899).
 *
 * La base est celle du favori de message — une base en mémoire qui ÉVALUE les
 * `where` qu'on lui passe —, augmentée de ce que la route lit en plus
 * (`conversation`, la ligne `participant` du partageur, `sharedTranslation`).
 * Elle applique l'unicité du triplet `(messageId, targetLanguage, sourceVersion)`
 * comme l'index unique de la production : `create` lève `P2002` sur un doublon.
 * Sa lecture des traductions trie selon `orderBy`.
 *
 * Les lectures de `message`, `participant`, `conversation` et `sharedTranslation`
 * ne rendent, sous un `select`, que ce qu'il demande — `true` garde une colonne,
 * `{ select }` descend dans une relation, une liste est filtrée par son `where`
 * puis projetée (`projectDocument`, la règle de `findFirstHonouringWhere`). La
 * base de base rend des lignes ENTIÈRES : un `select` auquel il manque une colonne
 * lue par la route (l'état terminal d'une conversation, le rang du partageur, la
 * version d'un message) y passait au vert, alors que la production lit
 * `undefined`. Une route qui servirait une enveloppe qu'elle n'a pas lue, ou
 * déciderait sur une colonne qu'elle n'a pas demandée, tombe ici comme en
 * production.
 *
 * La route est montée avec la VRAIE résolution d'identifiant de conversation :
 * `conversationRow()` porte l'identifiant lisible `mshy_equipe`, qui est donc
 * adressable ; `UNKNOWN_CONVERSATION` n'est porté par aucune.
 *
 * Les préférences de confidentialité passent par le VRAI résolveur
 * (`loadPrivacyPreferencesCached`) : la base porte le document `privacy` de
 * `UserPreferences` et les lignes héritées de `UserPreference`, et le cache du
 * module est vidé à chaque montage — il vit au niveau MODULE, et un réglage posé
 * par un témoin survivrait sinon au suivant.
 *
 * Les blocages passent de même par la VRAIE loi (`isBlockedBetween`) : la base porte
 * `User.blockedUserIds` (`blocks`) et évalue la question qu'on lui pose, et
 * `blockLookups` garde chaque question posée — un témoin « aucune lecture de
 * blocage » (un groupe, un invité) n'a que lui pour tomber.
 */
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import {
  registerSharedTranslationRoutes,
  type SharedTranslationShareBudget,
} from '../../../routes/conversations/shared-translations';
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';
import { findFirstHonouringWhere, projectDocument } from '../../helpers/find-first-honouring-where';
import {
  CONV_A,
  CONV_B,
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
  sourceVersion: 'original',
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

export const SHARER_IN_B = '68b0000000000000000000b2';

/**
 * Le même COMPTE dans deux conversations — chacune avec SA ligne de participant
 * (`SHARER` dans A, `SHARER_IN_B` dans B, deux `Participant.id` pour un seul
 * `User.id`) et son message (`MSG_1` dans A, `MSG_OTHER_CONVERSATION` dans B). Un
 * témoin de clé (le budget d'un compte, l'adresse d'un message) ne peut tomber que
 * si l'appelant a le droit de LIRE ce qu'on lui oppose : dans la scène ordinaire,
 * le message d'une autre conversation est un 404 pour une autre raison.
 */
export const sceneWithTwoConversations = (overrides: Partial<Store> = {}): Store =>
  scene({
    conversations: [
      conversationRow({ id: CONV_A, encryptionMode: 'server' }),
      conversationRow({ id: CONV_B, identifier: 'mshy_autre', encryptionMode: 'server' }),
    ],
    messages: [message(), message({ id: MSG_OTHER_CONVERSATION, conversationId: CONV_B })],
    participants: [
      participantRow({ id: SHARER, userId: USER_ID }),
      participantRow({ id: PEER, userId: OTHER_USER_ID }),
      participantRow({ id: SHARER_IN_B, userId: USER_ID, conversationId: CONV_B }),
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

/**
 * Ce que la base porte des préférences de confidentialité : le document `privacy`
 * par `User.id`, et les lignes kebab-case de janvier (`show-read-receipts`).
 */
export type PrivacyFixture = {
  readonly documents?: Readonly<Record<string, Row>>;
  readonly legacyRows?: ReadonlyArray<{ readonly userId: string; readonly key: string; readonly value: string }>;
};

/**
 * Ce que la base porte des BLOCAGES : `User.blockedUserIds` par compte, donc
 * « A a bloqué B » s'écrit `{ [A]: [B] }`. `isBlockedBetween` pose UNE question
 * (`user.findFirst`, un `OR` de deux `has`) que la base évalue : un sens ou l'autre
 * suffit, comme en production.
 */
export type BlocksFixture = Readonly<Record<string, readonly string[]>>;

type Ordering = Readonly<Record<string, 'asc' | 'desc'>>;

const compareValues = (a: unknown, b: unknown): number => {
  const left = a instanceof Date ? a.getTime() : a;
  const right = b instanceof Date ? b.getTime() : b;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
};

const ordered = (rows: readonly Row[], orderBy: Ordering | readonly Ordering[] | undefined): Row[] => {
  const clauses: readonly Ordering[] = orderBy === undefined ? [] : Array.isArray(orderBy) ? orderBy : [orderBy as Ordering];
  return [...rows].sort((a, b) =>
    clauses.reduce((verdict, clause) => {
      if (verdict !== 0) return verdict;
      const [field, direction] = Object.entries(clause)[0];
      const diff = compareValues(a[field], b[field]);
      return direction === 'desc' ? -diff : diff;
    }, 0),
  );
};

type Select = Readonly<Record<string, unknown>>;

/** Ce que Prisma rend sous un `select` : les seules colonnes demandées — un double qui rend tout cacherait une colonne qu'on n'a pas lue. */
const selected = (row: Row | null | undefined, args: { readonly select?: Select }): Row | null =>
  row ? projectDocument(row, { select: args.select }) : null;

const selectedAll = (rows: readonly Row[], args: { readonly select?: Select }): Row[] => rows.map((row) => projectDocument(row, { select: args.select }));

export type SharedTranslationRead = {
  readonly where?: Row;
  readonly select?: Readonly<Record<string, boolean>>;
  readonly orderBy?: Ordering | readonly Ordering[];
  readonly take?: number;
};

function database(store: Store, shares: Row[], privacy: PrivacyFixture, blocks: BlocksFixture) {
  const base = makePrisma(store);
  const issued = { next: 2 };
  const reads: SharedTranslationRead[] = [];
  const blockLookups: Row[] = [];
  const findBlocker = findFirstHonouringWhere(
    Object.entries(blocks).map(([id, blockedUserIds]) => ({ id, blockedUserIds: [...blockedUserIds] })),
  );
  const prisma = {
    ...base,
    message: {
      ...base.message,
      findUnique: async (args: { where: { id: string }; select?: Select }) => selected(await base.message.findUnique(args), args),
      findMany: async (args: { where?: Row; take?: number; select?: Select }) => selectedAll(await base.message.findMany(args), args),
    },
    participant: {
      ...base.participant,
      findUnique: async (args: { where: { id: string }; select?: Select }) => selected(store.participants.find((p) => p.id === args.where.id), args),
      findFirst: async (args: { where?: Row; select?: Select }) => selected(await base.participant.findFirst(args), args),
      findMany: async (args: { where?: Row; take?: number; select?: Select }) => selectedAll(await base.participant.findMany(args), args),
    },
    conversation: {
      ...base.conversation,
      findUnique: async (args: { where: { id: string }; select?: Select }) => selected(store.conversations.find((c) => c.id === args.where.id), args),
      findFirst: async (args: { where: Row; select?: Select }) => selected(store.conversations.find((c) => matchesWhere(c, args.where)), args),
      findMany: async (args: { where?: Row; take?: number; select?: Select }) => selectedAll(await base.conversation.findMany(args), args),
    },
    user: {
      findFirst: async (args: Row) => {
        blockLookups.push(args);
        return findBlocker(args);
      },
    },
    userPreferences: {
      findMany: async (args: { where: { userId: { in: string[] } } }) =>
        Object.entries(privacy.documents ?? {})
          .filter(([userId]) => args.where.userId.in.includes(userId))
          .map(([userId, document]) => ({ userId, privacy: document })),
    },
    userPreference: {
      findMany: async (args: { where: { userId: { in: string[] }; key: { in: string[] } } }) =>
        (privacy.legacyRows ?? []).filter(
          (row) => args.where.userId.in.includes(row.userId) && args.where.key.in.includes(row.key),
        ),
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
      deleteMany: async (args: { where: Row }) => {
        const doomed = shares.filter((row) => matchesWhere(row, args.where));
        doomed.forEach((row) => shares.splice(shares.indexOf(row), 1));
        return { count: doomed.length };
      },
      findMany: async (args: SharedTranslationRead) => {
        reads.push(args);
        const rows = selectedAll(
          ordered(
            shares.filter((row) => matchesWhere(row, args.where)),
            args.orderBy,
          ),
          args,
        );
        return typeof args.take === 'number' ? rows.slice(0, args.take) : rows;
      },
    },
  };
  return { prisma, reads, blockLookups };
}

export type HarnessPrisma = ReturnType<typeof database>['prisma'];

/**
 * Une base dont la lecture du masquage PERSONNEL (« supprimé pour moi ») ne
 * répond pas : la posture `'refuse'` de la loi de lecture doit la propager, jamais
 * en conclure que l'appelant ne masque rien.
 */
export const personalHidingLookupDown = (prisma: HarnessPrisma) => ({
  ...prisma,
  userMessageDeletion: {
    ...prisma.userMessageDeletion,
    findMany: async () => {
      throw new Error('mongo down');
    },
  },
});

/**
 * Une base dont les préférences de confidentialité ne répondent pas : la route ne
 * peut pas savoir si l'appelant montre ses accusés de lecture, et doit refuser
 * plutôt que d'en conclure qu'il n'a rien réglé.
 */
export const privacyLookupDown = (prisma: HarnessPrisma) => ({
  ...prisma,
  userPreferences: {
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
    prismaOverrides?: (prisma: HarnessPrisma) => unknown;
    /** Le compte de CHAQUE requête, lu dans ses en-têtes — pour les témoins de débit à deux comptes. */
    authContextFor?: (headers: Record<string, unknown>) => Row;
    /**
     * Monte le VRAI `@fastify/rate-limit` (`global: false`) avant la route.
     * `skipOnError` au niveau du plugin reproduit le global vivant
     * (`registerGlobalRateLimiter`), dont une config de route hérite tout ce
     * qu'elle ne redéclare pas.
     */
    rateLimit?: { skipOnError: boolean; store?: unknown };
    /** Les préférences de confidentialité stockées — aucune par défaut, donc les défauts s'appliquent. */
    privacy?: PrivacyFixture;
    /** Le budget d'octets des partages — celui de la production par défaut. */
    shareBudget?: SharedTranslationShareBudget;
    /** Les blocages stockés (`User.blockedUserIds`) — aucun par défaut. */
    blocks?: BlocksFixture;
  } = {},
) {
  const store = params.store ?? scene();
  const shares = params.shares ?? [];
  clearPrivacyPreferencesCache();
  const { prisma, reads, blockLookups } = database(store, shares, params.privacy ?? {}, params.blocks ?? {});
  const emitted: Emission[] = [];

  // Le `bodyLimit` du serveur de production (`server.ts`, pour les fichiers audio) : la
  // borne propre à la route est alors la seule qui retienne un corps de plusieurs Mio.
  const app = Fastify({ logger: false, bodyLimit: 50 * 1024 * 1024, ajv: { customOptions: { strict: false } } });
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
  const auth = async (req: { authContext?: unknown; headers?: Record<string, unknown> }) => {
    req.authContext = params.authContextFor?.(req.headers ?? {}) ?? params.authContext ?? registeredAs(USER_ID);
  };
  if (params.rateLimit) {
    await app.register(rateLimit, {
      global: false,
      skipOnError: params.rateLimit.skipOnError,
      ...(params.rateLimit.store ? { store: params.rateLimit.store as never } : {}),
    });
  }
  registerSharedTranslationRoutes(app, (params.prismaOverrides?.(prisma) ?? prisma) as never, auth, {
    now: () => HARNESS_NOW,
    ...(params.shareBudget ? { shareBudget: params.shareBudget } : {}),
  });
  await app.ready();
  return { app, shares, emitted, reads, blockLookups };
}

export type Harness = Awaited<ReturnType<typeof buildApp>>;

export const post = (h: Harness, body: unknown, conversationId = CONV_A) =>
  h.app.inject({ method: 'POST', url: `/conversations/${conversationId}/shared-translations`, payload: body as Row });

export const get = (h: Harness, query: Record<string, string>, conversationId = CONV_A) =>
  h.app.inject({ method: 'GET', url: `/conversations/${conversationId}/shared-translations`, query });

export const WIRE_KEYS = ['conversationId', 'envelope', 'id', 'messageId', 'sharedAt', 'sharedBy', 'targetLanguage'];
