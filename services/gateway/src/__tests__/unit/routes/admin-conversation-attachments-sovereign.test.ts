/**
 * `GET /admin/conversations/:conversationId/attachments` — les PIÈCES d'une
 * conversation, en lecture souveraine, sans remonter le fil (#11510).
 *
 * ## Ce que ces témoins gardent
 *
 * 1. **LE RANG ET LE MOTIF** — les mêmes que la lecture des messages : rang
 *    d'administration par-dessus `canManageConversations`, motif écrit sauf
 *    pour le rang souverain, et la ligne d'audit à CHAQUE page.
 * 2. **LA PROTECTION** — `servedAttachment` et `messageContentIsProtected` sont
 *    APPELÉS, jamais recopiés : une pièce à vue unique, floutée, à effets, ou
 *    portée par un message chiffré / à vue unique / expiré, rend son voile et
 *    jamais son URL — ni sa vignette, ni son `thumbHash`, ni ses variantes, ni
 *    sa transcription, ni ses pistes.
 * 3. **LA REQUÊTE** — le curseur (ordre total `createdAt desc, id desc`), le
 *    filtre par genre et le `where` se mesurent sur ce qui est REMIS à Prisma,
 *    jamais sur le rendu.
 * 4. **LA FORME** — fast-json-stringify supprime ce que le schéma ne déclare
 *    pas : les témoins traversent `app.inject()`.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

const ADMIN_ID = '507f1f77bcf86cd799439001';
const CONVERSATION_ID = '507f1f77bcf86cd799439abc';
const MOTIF = 'audit de conformite du 2026-10-21';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
}));

type AnyRecord = Record<string, unknown>;

type Espion = { findManyArgs: AnyRecord | null; audits: AnyRecord[] };

function createMockPrisma(rows: AnyRecord[], espion: Espion, conversationExiste = true): PrismaClient {
  return {
    conversation: {
      findUnique: jest.fn(async () => (conversationExiste ? { id: CONVERSATION_ID } : null)),
    },
    messageAttachment: {
      findMany: jest.fn(async (args?: AnyRecord) => {
        espion.findManyArgs = args ?? null;
        return rows;
      }),
    },
    adminAuditLog: {
      create: jest.fn(async (args: { data: AnyRecord }) => {
        espion.audits.push(args.data);
        return { id: 'audit-1' };
      }),
    },
  } as unknown as PrismaClient;
}

async function buildApp(prisma: PrismaClient, role: string | null): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  (app as unknown as { prisma: PrismaClient }).prisma = prisma;

  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = role
      ? {
          type: 'registered',
          isAuthenticated: true,
          isAnonymous: false,
          userId: ADMIN_ID,
          registeredUser: { id: ADMIN_ID, role },
          hasFullAccess: true,
        }
      : { isAuthenticated: false, isAnonymous: false };
  });

  const { registerConversationAttachmentsSovereignRoute } = await import(
    '../../../routes/admin/conversation-attachments-sovereign'
  );
  await app.register(
    async (instance) => {
      registerConversationAttachmentsSovereignRoute(instance);
    },
    { prefix: '/api/v1' },
  );
  await app.ready();
  return app;
}

/** Le message PORTEUR, tel que Prisma le rend sous `message: { select: … }` — LIBRE par défaut. */
function porteurFixture(overrides: AnyRecord = {}): AnyRecord {
  return {
    id: 'm-1',
    conversationId: CONVERSATION_ID,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    senderId: 'participant-1',
    isViewOnce: false,
    isBlurred: false,
    effectFlags: 0,
    expiresAt: null,
    isEncrypted: false,
    encryptionMode: null,
    sender: {
      id: 'participant-1',
      userId: 'user-1',
      type: 'user',
      displayName: 'Alice',
      avatar: null,
      nickname: null,
      user: { id: 'user-1', username: 'alice', displayName: 'Alice Martin', avatar: null },
    },
    ...overrides,
  };
}

/** Une pièce BRUTE, telle que Prisma la rend sous le `select` de la route. */
function pieceFixture(overrides: AnyRecord = {}, porteur: AnyRecord = porteurFixture()): AnyRecord {
  return {
    id: 'att-1',
    messageId: 'm-1',
    originalName: 'reunion.m4a',
    mimeType: 'audio/mp4',
    fileSize: 90210,
    width: null,
    height: null,
    duration: 12000,
    bitrate: 64000,
    sampleRate: 44100,
    codec: 'aac',
    channels: 1,
    fps: null,
    videoCodec: null,
    pageCount: null,
    lineCount: null,
    uploadedBy: 'u-1',
    isAnonymous: false,
    capturedInApp: false,
    createdAt: new Date('2026-09-01T10:00:01.000Z'),
    fileUrl: '/api/v1/attachments/file/uploads%2Freunion.m4a',
    thumbnailUrl: '/api/v1/attachments/file/uploads%2Freunion.jpg',
    thumbHash: 'YTQGFYQYd4h_iIeHh4d3iAeQhw',
    imageVariants: [{ url: '/api/v1/attachments/file/uploads%2Freunion-512.webp', size: 512, format: 'webp' }],
    metadata: { audioEffectsTimeline: [{ at: 0, effect: 'none' }] },
    transcription: { text: 'la reunion est deplacee a jeudi', segments: [] },
    translations: {
      en: { text: 'the meeting has moved to thursday', url: '/api/v1/attachments/file/uploads%2Fen.mp3' },
    },
    isViewOnce: false,
    isBlurred: false,
    effectFlags: 0,
    message: porteur,
    ...overrides,
  };
}

type Lecture = { role?: string; rows?: AnyRecord[]; query?: Record<string, string>; conversationExiste?: boolean };

async function lire({ role = 'ADMIN', rows = [pieceFixture()], query = { reason: MOTIF }, conversationExiste = true }: Lecture = {}) {
  const espion: Espion = { findManyArgs: null, audits: [] };
  const prisma = createMockPrisma(rows, espion, conversationExiste);
  const app = await buildApp(prisma, role);
  const search = new URLSearchParams(query).toString();
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/admin/conversations/${CONVERSATION_ID}/attachments${search === '' ? '' : `?${search}`}`,
    headers: { authorization: 'Bearer x' },
  });
  await app.close();
  return { res, espion };
}

async function premierePiece(rows: AnyRecord[]): Promise<AnyRecord> {
  const { res } = await lire({ rows });
  expect(res.statusCode).toBe(200);
  return (res.json().data as AnyRecord[])[0];
}

function cheminsDe(valeur: unknown, prefixe = ''): readonly string[] {
  if (valeur === null || typeof valeur !== 'object') return [];
  if (Array.isArray(valeur)) return valeur.length > 0 ? cheminsDe(valeur[0], `${prefixe}[]`) : [];
  return Object.entries(valeur as AnyRecord).flatMap(([clef, sous]) =>
    sous === undefined ? [] : [`${prefixe}${clef}`, ...cheminsDe(sous, `${prefixe}${clef}.`)],
  );
}

// ---------------------------------------------------------------------------
// 1 — LE RANG, LE MOTIF, LA TRACE
// ---------------------------------------------------------------------------

describe('GET /admin/conversations/:id/attachments — le rang, le motif, la trace', () => {
  it('sert un BIGBOSS et un ADMIN', async () => {
    expect((await lire({ role: 'BIGBOSS' })).res.statusCode).toBe(200);
    expect((await lire({ role: 'ADMIN' })).res.statusCode).toBe(200);
  });

  it("refuse un MODERATOR — il PORTE `canManageConversations`, il n'a pas le RANG — et un AUDIT", async () => {
    expect((await lire({ role: 'MODERATOR' })).res.statusCode).toBe(403);
    expect((await lire({ role: 'AUDIT' })).res.statusCode).toBe(403);
  });

  it('refuse un motif de moins de dix caractères AVANT la requête, et un ADMIN sans motif', async () => {
    const court = await lire({ query: { reason: 'court' } });
    expect(court.res.statusCode).toBe(400);
    expect(court.espion.findManyArgs).toBeNull();

    const absent = await lire({ query: {} });
    expect(absent.res.statusCode).toBe(400);
    expect(absent.espion.audits).toEqual([]);
  });

  it('le rang souverain lit SANS motif, et sa lecture est tracée quand même', async () => {
    const { res, espion } = await lire({ role: 'BIGBOSS', query: {} });
    expect(res.statusCode).toBe(200);
    expect(espion.audits).toHaveLength(1);
  });

  it('écrit UNE ligne d’audit par page, nommant la conversation et le motif', async () => {
    const { espion } = await lire();
    expect(espion.audits).toHaveLength(1);
    expect(espion.audits[0]).toMatchObject({
      action: 'ADMIN_CONVERSATION_ATTACHMENTS_VIEWED',
      entity: 'Conversation',
      entityId: CONVERSATION_ID,
      adminId: ADMIN_ID,
    });
    expect(JSON.parse(String(espion.audits[0].metadata))).toEqual({ reason: MOTIF });
  });

  it('une conversation inconnue rend 404 sans rien lire ni tracer', async () => {
    const { res, espion } = await lire({ conversationExiste: false });
    expect(res.statusCode).toBe(404);
    expect(espion.findManyArgs).toBeNull();
    expect(espion.audits).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2 — LA REQUÊTE : le `where`, le curseur, le genre
// ---------------------------------------------------------------------------

describe('GET /admin/conversations/:id/attachments — la requête remise à Prisma', () => {
  it('ne sélectionne que les pièces d’un message NON supprimé de CETTE conversation, dans un ordre TOTAL', async () => {
    const { espion } = await lire();
    expect(espion.findManyArgs?.where).toEqual({ message: { conversationId: CONVERSATION_ID, deletedAt: null } });
    expect(espion.findManyArgs?.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('lit `limit + 1` lignes — la sonde dit `hasMore` sans compter la table', async () => {
    const { espion } = await lire({ query: { reason: MOTIF, limit: '10' } });
    expect(espion.findManyArgs?.take).toBe(11);
  });

  it('ne charge JAMAIS `fileName` — le basename d’une URL masquée', async () => {
    const { espion } = await lire();
    const select = espion.findManyArgs?.select as AnyRecord;
    expect(select.fileName).toBeUndefined();
    expect(select.fileUrl).toBe(true);
    // Les six colonnes de protection du PORTEUR sont demandées : une garde se
    // mesure sur la requête, et un prédicat dont une colonne manque est muet.
    const porteur = ((select.message as AnyRecord).select as AnyRecord);
    for (const colonne of ['isViewOnce', 'isBlurred', 'effectFlags', 'expiresAt', 'isEncrypted', 'encryptionMode']) {
      expect(porteur[colonne]).toBe(true);
    }
  });

  it('une page pleine rend un curseur OPAQUE en forme `keyset`, et le rejoue en clause de reprise ET-isée', async () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
      pieceFixture({ id: `att-${i}`, createdAt: new Date(`2026-09-0${3 - i}T10:00:00.000Z`) }),
    );
    const premiere = await lire({ rows, query: { reason: MOTIF, limit: '2' } });
    expect(premiere.res.statusCode).toBe(200);
    const page = premiere.res.json();
    expect((page.data as AnyRecord[]).map((p) => p.id)).toEqual(['att-0', 'att-1']);
    expect(page.pagination).toMatchObject({ limit: 2, hasMore: true, form: 'keyset' });
    const cursor = page.pagination.nextCursor as string;
    expect(typeof cursor).toBe('string');
    expect(cursor).not.toContain('att-1');

    const suivante = await lire({ rows: [rows[2]], query: { reason: MOTIF, limit: '2', cursor } });
    expect(suivante.res.statusCode).toBe(200);
    const where = suivante.espion.findManyArgs?.where as AnyRecord;
    expect(where.AND).toBeDefined();
    expect((where.AND as AnyRecord[])[0]).toEqual({ message: { conversationId: CONVERSATION_ID, deletedAt: null } });
    expect(suivante.res.json().pagination).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it('un curseur illisible est REFUSÉ en 400 — jamais la première page re-servie en silence', async () => {
    const { res, espion } = await lire({ query: { reason: MOTIF, cursor: 'pas-un-curseur' } });
    expect(res.statusCode).toBe(400);
    expect(espion.findManyArgs).toBeNull();
  });

  it('`kind=visual` ne retient que les pièces `image/*` et `video/*` ; `kind=document` tout le reste', async () => {
    const visuel = await lire({ query: { reason: MOTIF, kind: 'visual' } });
    const whereVisuel = visuel.espion.findManyArgs?.where as AnyRecord;
    expect(whereVisuel.OR).toEqual([
      { mimeType: { gte: 'image/', lt: 'image0' } },
      { mimeType: { gte: 'video/', lt: 'video0' } },
    ]);
    expect(whereVisuel.message).toEqual({ conversationId: CONVERSATION_ID, deletedAt: null });

    const document = await lire({ query: { reason: MOTIF, kind: 'document' } });
    const whereDocument = document.espion.findManyArgs?.where as AnyRecord;
    expect(Object.keys(whereDocument.NOT as AnyRecord)).toEqual(['OR']);
  });

  it('un genre inconnu est refusé AU SCHÉMA', async () => {
    const { res, espion } = await lire({ query: { reason: MOTIF, kind: 'secret' } });
    expect(res.statusCode).toBe(400);
    expect(espion.findManyArgs).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3 — LA FORME SERVIE
// ---------------------------------------------------------------------------

describe('GET /admin/conversations/:id/attachments — la forme servie', () => {
  it('sert une pièce LIBRE entière, avec son porteur résolu en `User.id`', async () => {
    const piece = await premierePiece([pieceFixture()]);
    expect(piece.isProtected).toBe(false);
    expect(piece.fileUrl).toBe('/api/v1/attachments/file/uploads%2Freunion.m4a');
    expect(piece.transcription).toEqual({ text: 'la reunion est deplacee a jeudi', segments: [] });
    const porteur = piece.message as AnyRecord;
    expect(porteur.id).toBe('m-1');
    expect(porteur.senderId).toBe('user-1');
    expect(porteur.senderParticipantId).toBe('participant-1');
    expect((porteur.sender as AnyRecord).displayName).toBe('Alice');
    expect(porteur.isProtected).toBe(false);
    expect(porteur.createdAt).toBe('2026-09-01T10:00:00.000Z');
  });

  it('déclare au schéma TOUT ce que la projection compose — à chaque profondeur', async () => {
    const { mapSovereignAttachmentRow } = await import('../../../routes/admin/conversation-attachments-sovereign');
    const ligne = pieceFixture({ width: 640, height: 480 });
    const { res } = await lire({ rows: [ligne] });
    expect(res.statusCode).toBe(200);
    const compose = mapSovereignAttachmentRow(ligne as never);
    const servi = (res.json().data as AnyRecord[])[0];
    const perdus = cheminsDe(compose).filter((chemin) => !cheminsDe(servi).includes(chemin));
    expect(perdus).toEqual([]);
    expect(cheminsDe(compose).length).toBeGreaterThan(40);
  });
});

// ---------------------------------------------------------------------------
// 4 — LA PROTECTION : le voile, jamais l'URL
// ---------------------------------------------------------------------------

describe('GET /admin/conversations/:id/attachments — une pièce PROTÉGÉE rend son voile, jamais son URL', () => {
  const protections: ReadonlyArray<readonly [string, AnyRecord]> = [
    ['pièce à vue unique', pieceFixture({ isViewOnce: true })],
    ['pièce floutée', pieceFixture({ isBlurred: true })],
    // Le BITFIELD seul — le troisième canal de `maskedAttachment`, celui qu'une garde partielle laisse tomber.
    ['pièce à effets masquants', pieceFixture({ effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE })],
    ['pièce d’un message CHIFFRÉ', pieceFixture({}, porteurFixture({ isEncrypted: true, encryptionMode: 'e2ee' }))],
    ['pièce d’un message à VUE UNIQUE', pieceFixture({}, porteurFixture({ isViewOnce: true }))],
    ['pièce d’un message EXPIRÉ', pieceFixture({}, porteurFixture({ expiresAt: new Date('2020-01-01T00:00:00.000Z') }))],
  ];

  it.each(protections)('%s', async (_nom, ligne) => {
    const piece = await premierePiece([ligne]);

    // LISTÉE : constater qu'un média existe n'ouvre pas son contenu.
    expect(piece.id).toBe('att-1');
    expect(piece.mimeType).toBe('audio/mp4');
    expect(piece.isProtected).toBe(true);

    expect(piece.fileUrl).toBeNull();
    expect(piece.thumbnailUrl).toBeNull();
    expect(piece.thumbHash).toBeNull();
    expect(piece.imageVariants).toEqual([]);
    expect(piece.transcription).toBeUndefined();
    expect(piece.translations).toBeUndefined();
    expect(piece.metadata).toBeUndefined();

    const brut = JSON.stringify(piece);
    expect(brut).not.toContain('uploads%2F');
    expect(brut).not.toContain('la reunion est deplacee a jeudi');
    expect(brut).not.toContain('the meeting has moved to thursday');
    expect(brut).not.toContain('YTQGFYQYd4h_iIeHh4d3iAeQhw');
  });

  it('le porteur d’une pièce retenue par le MESSAGE le dit : `message.isProtected`', async () => {
    const piece = await premierePiece([pieceFixture({}, porteurFixture({ isEncrypted: true, encryptionMode: 'e2ee' }))]);
    expect((piece.message as AnyRecord).isProtected).toBe(true);
    const libreMaisPieceVoilee = await premierePiece([pieceFixture({ isBlurred: true })]);
    expect((libreMaisPieceVoilee.message as AnyRecord).isProtected).toBe(false);
    expect(libreMaisPieceVoilee.isBlurred).toBe(true);
  });

  it('une pièce dont le porteur manque est voilée — jamais servie en clair par défaut', async () => {
    const piece = await premierePiece([pieceFixture({ message: null })]);
    expect(piece.isProtected).toBe(true);
    expect(piece.fileUrl).toBeNull();
    expect(piece.message).toBeNull();
  });
});
