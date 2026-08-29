/**
 * Tests — GET /api/v1/sync (SyncEngine A3.1, collection pilote `messages`).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

const USER_ID = '507f1f77bcf86cd799439000';
/** Un `Participant.id` — c'est CE que porte `authContext.userId` d'un anonyme. */
const PARTICIPANT_ID = '507f1f77bcf86cd799439aaa';
/**
 * Une valeur `scope=` à la forme ObjectId valide (issue #4171, critère 2) —
 * `scope` était `z.string().optional()` avant ce lot, et les témoins de
 * portée utilisaient des identifiants lisibles (`cX`, `c-autre`) qui ne
 * survivent plus à la validation. La VALEUR du `conversationId` mocké derrière
 * (`c1`, `cX`, peu importe) reste libre — seule la clé de la QUERY STRING doit
 * être un ObjectId.
 */
const SCOPE_ID = '507f1f77bcf86cd799439ccc';

type TestAuthContext = {
  userId?: string;
  type?: 'user' | 'anonymous';
  participantId?: string;
};

/**
 * L'authContext servi à la requête suivante, et les options avec lesquelles la
 * route a construit son middleware.
 *
 * Le middleware réel est mocké (il exige une base) : c'est donc le seul endroit
 * où l'ouverture aux sessions anonymes est observable — `allowAnonymous` est un
 * argument, pas un comportement de handler.
 */
let mockAuthContext: TestAuthContext = { userId: USER_ID, type: 'user' };
const mockAuthMiddlewareOptions: unknown[] = [];

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: (_prisma: unknown, options: unknown) => {
    mockAuthMiddlewareOptions.push(options);
    return async (req: FastifyRequest) => {
      (req as unknown as { authContext: TestAuthContext }).authContext = mockAuthContext;
    };
  },
}));

import {
  syncRoutes,
  encodeSyncCursor,
  decodeSyncCursor,
  SYNC_CHECKPOINT_LAG_MS,
  SYNC_MESSAGE_RENDERABLE_KEYS,
  SYNC_MAX_PAGE_BYTES,
} from '../../../routes/sync';

type PrismaStub = {
  participant: { findMany: jest.Mock };
  message: { findMany: jest.Mock };
  conversationShareLink: { findMany: jest.Mock };
  userEventSeq: { findUnique: jest.Mock };
  // `UserMessageDeletion` porte DEUX rôles disjoints dans cette route et le
  // stub doit servir les deux : le filtre de lecture (masquer les bulles du
  // stream `changed`) et le stream de tombstones personnelles. Un stub qui
  // omet la table fait dégrader les deux — silencieusement pour le premier,
  // en `truncated: true` pour le second.
  userMessageDeletion: { findMany: jest.Mock };
  userConversationPreferences: { findMany: jest.Mock };
};

function makePrisma(over: Partial<Record<string, unknown>> = {}): PrismaStub {
  return {
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([{ conversationId: 'c1' }]),
    },
    message: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversationShareLink: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    userEventSeq: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    userMessageDeletion: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    userConversationPreferences: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    ...over,
  } as PrismaStub;
}

async function buildApp(
  prisma: PrismaStub,
  authContext: TestAuthContext = { userId: USER_ID, type: 'user' },
): Promise<FastifyInstance> {
  mockAuthContext = authContext;
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  await app.register(syncRoutes);
  await app.ready();
  return app;
}

const SINCE = '2026-07-01T00:00:00.000Z';

/**
 * Ce que `syncMessageSelect` rend TOUJOURS et qu'une rangée de témoin ne peut
 * pas omettre : une relation sélectionnée revient en tableau VIDE, jamais en
 * `undefined`.
 *
 * Les rangées de cette suite l'omettaient tant que rien ne les lisait — la
 * charge utile traversait telle quelle. Le sérialiseur de réponse, lui, les
 * lit. C'est la question qui départage un témoin d'une fiction : non pas « à
 * quoi ressemble cette réponse ? » mais « que rend la REQUÊTE ? ».
 */
const CHANGED_ROW_RELATIONS = { attachments: [] as unknown[] };

describe('GET /sync — validation', () => {
  it('400 when `since` is missing', async () => {
    const app = await buildApp(makePrisma());
    const res = await app.inject({ method: 'GET', url: '/sync?collections=messages' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('400 when `collections` is missing', async () => {
    const app = await buildApp(makePrisma());
    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}` });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('400 on an unsupported collection', async () => {
    const app = await buildApp(makePrisma());
    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=posts` });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /sync — messages collection', () => {
  it('splits added (createdAt > since) vs modified (createdAt <= since), sorted updatedAt ASC', async () => {
    const prisma = makePrisma();
    prisma.message.findMany
      // first call = changed (non-deleted)
      .mockResolvedValueOnce([
        { ...CHANGED_ROW_RELATIONS, id: 'm-old', conversationId: 'c1', senderId: 'u', content: 'edited',
          createdAt: new Date('2026-06-01T00:00:00Z'), updatedAt: new Date('2026-07-02T00:00:00Z') },
        { ...CHANGED_ROW_RELATIONS, id: 'm-new', conversationId: 'c1', senderId: 'u', content: 'fresh',
          createdAt: new Date('2026-07-02T10:00:00Z'), updatedAt: new Date('2026-07-02T10:00:00Z') },
      ])
      // second call = deleted tombstones
      .mockResolvedValueOnce([]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    expect(res.statusCode).toBe(200);
    const msgs = res.json().data.collections.messages;
    expect(msgs.added.map((m: { id: string }) => m.id)).toEqual(['m-new']);
    expect(msgs.modified.map((m: { id: string }) => m.id)).toEqual(['m-old']);
    await app.close();
  });

  it('returns deleted tombstones from the second query', async () => {
    const prisma = makePrisma();
    prisma.message.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'm-del', conversationId: 'c1', deletedAt: new Date('2026-07-02T00:00:00Z') },
      ]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    expect(res.json().data.collections.messages.deleted).toHaveLength(1);
    expect(res.json().data.collections.messages.deleted[0].id).toBe('m-del');
    await app.close();
  });

  it('RLS: a user in no conversations gets empty collections and never queries messages', async () => {
    const prisma = makePrisma({ participant: { findMany: jest.fn<any>().mockResolvedValue([]) } });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.collections.messages.added).toEqual([]);
    expect(prisma.message.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('scopes the participant lookup to `scope` when provided', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages&scope=${SCOPE_ID}` });
    expect(prisma.participant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ conversationId: SCOPE_ID }) }),
    );
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Le select de `/sync` est le CONTRAT de rendabilité du rattrapage : ce qu'il
// omet, le client l'écrit tel quel dans sa base locale et l'affiche tel quel.
// Six champs (id, conversationId, senderId, content, createdAt, updatedAt) ne
// suffisent pas — sans `translations` le Prisme Linguistique n'a rien à
// résoudre et le message s'affiche dans la langue de l'expéditeur ; sans
// `attachments` la bulle perd sa pièce jointe ; sans `clientMessageId` la
// réconciliation optimiste ne peut pas apparier sa ligne.
// ---------------------------------------------------------------------------
describe('GET /sync — contrat de rendabilité du select messages', () => {
  it('sert les champs du Prisme, la pièce jointe et l’expéditeur', async () => {
    const prisma = makePrisma();
    prisma.message.findMany
      .mockResolvedValueOnce([
        {
          id: 'm1', conversationId: 'c1', senderId: 's1', content: 'Hello',
          clientMessageId: 'cid_x', originalLanguage: 'en',
          translations: { fr: { text: 'Bonjour' } },
          messageType: 'text', metadata: null, isEdited: false, editedAt: null,
          replyToId: null, reactionSummary: null, reactionCount: 0,
          attachments: [{ id: 'a1', fileUrl: '/f.jpg' }],
          sender: { id: 's1', displayName: 'Ana' },
          createdAt: new Date('2026-07-02T10:00:00Z'), updatedAt: new Date('2026-07-02T10:00:00Z'),
        },
      ])
      .mockResolvedValueOnce([]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    const added = res.json().data.collections.messages.added[0];

    // Ce témoin assertait la CARTE Mongo telle quelle — il codifiait la forme
    // de la BASE, écrite à un moment où la réponse n'était gouvernée par aucun
    // schéma et où toute forme y était donc « juste ». Le contrat, lui, est un
    // tableau, et c'est ce que les clients décodent.
    expect(added.translations).toEqual([
      expect.objectContaining({ targetLanguage: 'fr', translatedContent: 'Bonjour' }),
    ]);
    expect(added.originalLanguage).toBe('en');
    expect(added.attachments).toHaveLength(1);
    expect(added.sender).toEqual({ id: 's1', displayName: 'Ana' });
    expect(added.clientMessageId).toBe('cid_x');
    await app.close();
  });

  it('DEMANDE ces champs à Prisma — une charge utile vide ne prouve rien', async () => {
    // Le témoin ci-dessus passerait sur un select maigre si le double rendait
    // les champs de lui-même : c'est la REQUÊTE qui porte le contrat.
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });

    const select = prisma.message.findMany.mock.calls[0]![0]!.select as Record<string, unknown>;
    for (const key of SYNC_MESSAGE_RENDERABLE_KEYS) {
      expect(select[key]).toBeDefined();
    }
    await app.close();
  });

  it('garde le stream `deleted` maigre — un tombstone n’a rien à rendre', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });

    const deletedSelect = prisma.message.findMany.mock.calls[1]![0]!.select as Record<string, unknown>;
    expect(Object.keys(deletedSelect).sort()).toEqual(['conversationId', 'deletedAt', 'id']);
    await app.close();
  });

  it('n’avance pas le cursor sur une clé absente du select enrichi', async () => {
    // Le keyset reste `(updatedAt, id)` : enrichir la projection ne doit pas
    // déplacer la position de reprise.
    const prisma = makePrisma();
    prisma.message.findMany
      .mockResolvedValueOnce([
        { ...CHANGED_ROW_RELATIONS, id: 'm1', conversationId: 'c1', senderId: 's1', content: '', translations: null,
          createdAt: new Date('2026-07-02T10:00:00Z'), updatedAt: new Date('2026-07-02T10:00:00Z') },
        { ...CHANGED_ROW_RELATIONS, id: 'm2', conversationId: 'c1', senderId: 's1', content: '', translations: null,
          createdAt: new Date('2026-07-02T11:00:00Z'), updatedAt: new Date('2026-07-02T11:00:00Z') },
      ])
      .mockResolvedValueOnce([]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages&limit=1` });
    const token = res.json().data.collections.messages.nextCursor as string;

    expect(decodeSyncCursor(token).c).toEqual({ u: '2026-07-02T10:00:00.000Z', i: 'm1' });
    await app.close();
  });
});

describe('GET /sync — gap detection (A1 reuse)', () => {
  it('hasGap=true and skips the message query when the client seq is far behind', async () => {
    const prisma = makePrisma({
      userEventSeq: { findUnique: jest.fn<any>().mockResolvedValue({ lastSeq: BigInt(50_000) }) },
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages&seq=100` });
    const data = res.json().data;
    expect(data.hasGap).toBe(true);
    expect(data.gapAction).toBe('full_resync_required');
    expect(prisma.message.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('hasGap=false when the client seq is recent', async () => {
    const prisma = makePrisma({
      userEventSeq: { findUnique: jest.fn<any>().mockResolvedValue({ lastSeq: BigInt(105) }) },
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages&seq=100` });
    expect(res.json().data.hasGap).toBe(false);
    await app.close();
  });
});

describe('GET /sync — ETag / 304', () => {
  it('returns an ETag + Cache-Control no-store, and 304 on a matching If-None-Match', async () => {
    const app = await buildApp(makePrisma());
    const first = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    expect(first.headers['cache-control']).toBe('no-store');
    const etag = first.headers.etag as string;
    expect(etag).toBeTruthy();

    // The ETag is stable (userId + checkpointSeq + collectionsHash, NOT the
    // wall-clock checkpoint), so an unchanged dataset must 304.
    const second = await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=messages`,
      headers: { 'if-none-match': etag },
    });
    expect(second.statusCode).toBe(304);
    await app.close();
  });
});

// In-memory prisma.message.findMany that HONORS the composite keyset cursor,
// the `since` floor, the ordering and `take` — so a full round-trip proves the
// pages tile the dataset with NO overlap and NO gap, including an updatedAt tie
// (the exact case a time-only watermark would drop or duplicate).
function keysetMessageStore(
  changed: Array<{ id: string; conversationId: string; senderId: string; content: string; createdAt: Date; updatedAt: Date }>,
) {
  return jest.fn<any>().mockImplementation((args: any) => {
    const where = args.where ?? {};
    // Two streams per request: changed (deletedAt === null) vs deleted.
    if (where.deletedAt !== null) return Promise.resolve([]); // no tombstones here
    let rows = [...changed];
    const or = where.OR as Array<any> | undefined;
    if (or) {
      const gtU = new Date(or[0].updatedAt.gt).getTime();
      const eqU = new Date(or[1].updatedAt).getTime();
      const gtI = or[1].id.gt as string;
      rows = rows.filter((r) => r.updatedAt.getTime() > gtU || (r.updatedAt.getTime() === eqU && r.id > gtI));
    } else if (where.updatedAt?.gt) {
      const floor = new Date(where.updatedAt.gt).getTime();
      rows = rows.filter((r) => r.updatedAt.getTime() > floor);
    }
    rows.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return Promise.resolve(rows.slice(0, args.take));
  });
}

describe('GET /sync — cursor pagination (A3.2)', () => {
  const rows = (n: number) =>
    Array.from({ length: n }, (_, k) => ({
      ...CHANGED_ROW_RELATIONS,
      id: `m${k}`,
      conversationId: 'c1',
      senderId: 'u',
      content: `#${k}`,
      createdAt: new Date('2026-06-01T00:00:00Z'),
      updatedAt: new Date(`2026-07-02T00:00:${String(k).padStart(2, '0')}.000Z`),
    }));

  it('truncation emits a non-null opaque nextCursor and hasMore=true', async () => {
    const prisma = makePrisma();
    prisma.message.findMany
      .mockResolvedValueOnce(rows(3)) // changed: 3 rows for cap=2 → truncated
      .mockResolvedValueOnce([]); // deleted
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages&limit=2` });
    const data = res.json().data;
    expect(data.collections.messages.truncated).toBe(true);
    expect(typeof data.collections.messages.nextCursor).toBe('string');
    expect(data.nextCursor).toBe(data.collections.messages.nextCursor);
    expect(data.hasMore).toBe(true);
    await app.close();
  });

  it('paginates the full changed set with no overlap and no gap (incl. an updatedAt tie)', async () => {
    const T = (s: string) => new Date(s);
    const dataset = [
      { ...CHANGED_ROW_RELATIONS, id: 'a', conversationId: 'c1', senderId: 'u', content: '', createdAt: T('2026-06-01T00:00:00Z'), updatedAt: T('2026-07-02T00:00:01Z') },
      { ...CHANGED_ROW_RELATIONS, id: 'b1', conversationId: 'c1', senderId: 'u', content: '', createdAt: T('2026-06-01T00:00:00Z'), updatedAt: T('2026-07-02T00:00:02Z') },
      { ...CHANGED_ROW_RELATIONS, id: 'b2', conversationId: 'c1', senderId: 'u', content: '', createdAt: T('2026-06-01T00:00:00Z'), updatedAt: T('2026-07-02T00:00:02Z') }, // tie w/ b1
      { ...CHANGED_ROW_RELATIONS, id: 'c', conversationId: 'c1', senderId: 'u', content: '', createdAt: T('2026-06-01T00:00:00Z'), updatedAt: T('2026-07-02T00:00:03Z') },
      { ...CHANGED_ROW_RELATIONS, id: 'd', conversationId: 'c1', senderId: 'u', content: '', createdAt: T('2026-06-01T00:00:00Z'), updatedAt: T('2026-07-02T00:00:04Z') },
    ];
    const prisma = makePrisma({ message: { findMany: keysetMessageStore(dataset) } });
    const app = await buildApp(prisma);

    const seen: string[] = [];
    let cursor: string | null = null;
    let guard = 0;
    for (; guard < 10; guard++) {
      const url = `/sync?since=${SINCE}&collections=messages&limit=2` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
      const res: any = await app.inject({ method: 'GET', url });
      const msgs = res.json().data.collections.messages;
      for (const m of [...msgs.added, ...msgs.modified]) seen.push(m.id as string);
      if (!msgs.truncated) {
        cursor = null;
        break;
      }
      cursor = msgs.nextCursor as string;
    }
    expect(guard).toBeLessThan(10); // terminated, no infinite loop
    expect(cursor).toBeNull();
    expect([...seen].sort()).toEqual(['a', 'b1', 'b2', 'c', 'd']);
    expect(new Set(seen).size).toBe(seen.length); // no duplicates
    await app.close();
  });

  it('400 INVALID_CURSOR on a malformed cursor', async () => {
    const app = await buildApp(makePrisma());
    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages&cursor=not-json` });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_CURSOR');
    await app.close();
  });
});

describe('sync cursor codec', () => {
  it('round-trips a changed + deleted keyset position', () => {
    const pos = { c: { u: '2026-07-02T00:00:02.000Z', i: 'b1' }, d: { u: '2026-07-02T00:00:09.000Z', i: 'z' } };
    expect(decodeSyncCursor(encodeSyncCursor(pos))).toEqual(pos);
  });

  it('omits an absent stream key on round-trip', () => {
    const pos = { c: { u: '2026-07-02T00:00:02.000Z', i: 'b1' } };
    expect(decodeSyncCursor(encodeSyncCursor(pos))).toEqual(pos);
  });

  it('throws on a malformed token', () => {
    expect(() => decodeSyncCursor('%%%not-json%%%')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Cycle 98 — le `checkpoint` rendu est un WATERMARK : le client le renvoie en
// `since` au tour suivant, et la borne serveur est STRICTE (`gt`). Tout ce qui
// devient visible APRÈS la lecture mais AVANT l'instant du checkpoint tombe
// donc dans un trou définitif. Les gardes ci-dessous ancrent la seule
// direction sûre : un checkpoint qui ne peut jamais dépasser la donnée que la
// réponse couvre réellement — quitte à faire relire (idempotent).
//
// Jumelle exacte de la règle que le SDK iOS documente déjà côté client
// (`SyncWatermark.advancedAfterDeltaPage` : « la fenêtre ne saute jamais une
// mise à jour réelle, au pire elle en relit »).
// ---------------------------------------------------------------------------
describe('GET /sync — checkpoint watermark', () => {
  it('never post-dates the oldest read the response is built from', async () => {
    // La borne honnête est l'instant où la PREMIÈRE lecture part, pas celui où
    // la dernière rend : une ligne écrite après ce départ peut manquer au
    // snapshot de lecture tout en portant un `updatedAt` antérieur au
    // checkpoint — exactement le trou définitif. Le délai matérialise la
    // fenêtre ; sans lui, lecture et checkpoint partagent la milliseconde et
    // le défaut passe inaperçu.
    let firstQueryEnteredAtMs = 0;
    const prisma = makePrisma({
      message: {
        findMany: jest.fn<any>().mockImplementation(async () => {
          if (firstQueryEnteredAtMs === 0) firstQueryEnteredAtMs = Date.now();
          await new Promise((resolve) => setTimeout(resolve, 25));
          return [];
        }),
      },
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    const checkpointMs = new Date(res.json().data.checkpoint).getTime();

    expect(firstQueryEnteredAtMs).toBeGreaterThan(0);
    expect(checkpointMs).toBeLessThanOrEqual(firstQueryEnteredAtMs);
    await app.close();
  });

  it('trails wall-clock by the write-visibility lag', async () => {
    const app = await buildApp(makePrisma());

    const beforeMs = Date.now();
    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    const afterMs = Date.now();
    const checkpointMs = new Date(res.json().data.checkpoint).getTime();

    // `updatedAt` est estampillé par Prisma à la CONSTRUCTION de l'écriture,
    // pas à son commit : une ligne estampillée T peut n'être visible qu'à
    // T+δ. Sans ce retrait, un checkpoint pris même AVANT la lecture laisse
    // passer les écritures en vol. Le checkpoint vaut donc
    // `débutHandler − SYNC_CHECKPOINT_LAG_MS`, encadré par les deux bornes.
    expect(checkpointMs).toBeLessThanOrEqual(afterMs - SYNC_CHECKPOINT_LAG_MS);
    expect(checkpointMs).toBeGreaterThanOrEqual(beforeMs - SYNC_CHECKPOINT_LAG_MS);
    await app.close();
  });

  it('never regresses below the `since` the caller already acknowledged', async () => {
    const app = await buildApp(makePrisma());

    // `since` = maintenant : `now − lag` tombe DERRIÈRE lui. Reculer le
    // watermark rejouerait sans fin une fenêtre déjà livrée.
    const nowIso = new Date().toISOString();
    const res = await app.inject({
      method: 'GET',
      url: `/sync?since=${encodeURIComponent(nowIso)}&collections=messages`,
    });

    expect(new Date(res.json().data.checkpoint).getTime()).toBe(new Date(nowIso).getTime());
    await app.close();
  });

});

// ─── Cycle 117 ───────────────────────────────────────────────────────────────
//
// Le `checkpoint` n'est pas un horodatage, c'est une AFFIRMATION : « tout ce
// qui a changé jusqu'ici t'a été livré ». Le client le renvoie en `since`, et
// la borne serveur est STRICTE (`updatedAt > since`) — une affirmation fausse
// creuse donc un trou DÉFINITIF, ce que le docblock de `SYNC_CHECKPOINT_LAG_MS`
// écrit déjà mot pour mot.
//
// Le dépôt tenait cette règle pour la TRONCATURE (§ checkpoint vs truncation,
// juste en dessous) et l'énonçait dans son commentaire : une page qui n'a livré
// qu'une PARTIE de la fenêtre tient le watermark à `since`, sans quoi le client
// « perdrait tout l'arriéré d'un coup, définitivement ».
//
// Elle ne la tenait sur AUCUNE des deux réponses qui n'en livrent RIEN. Une
// couverture partielle retenait le watermark, une couverture NULLE l'avançait —
// deux `describe` voisins, deux règles contraires sur le même invariant.
describe('GET /sync — le checkpoint AFFIRME une couverture', () => {
  // Le témoin que ce bloc remplace s'intitulait « applies the same watermark on
  // the gap path, which returns no items at all » : il NOMMAIT le défaut
  // (« returns no items at all ») et le gelait sous une uniformité qui n'a pas
  // lieu d'être — la seule chose que le chemin de gap partage avec les autres
  // est de ne rien avoir couvert.
  it('holds the watermark at `since` on the gap path, which served nothing at all', async () => {
    const prisma = makePrisma({
      userEventSeq: { findUnique: jest.fn<any>().mockResolvedValue({ lastSeq: 50_000 }) },
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages&seq=1` });
    const body = res.json().data;

    expect(body.hasGap).toBe(true);
    expect(body.gapAction).toBe('full_resync_required');
    // La fenêtre `since → now` n'a JAMAIS été lue : sur le chemin de gap la
    // route court-circuite la requête messages. Avancer le watermark ici est
    // strictement pire que sur une page tronquée — celle-là laissait un
    // arriéré, celle-ci laisse la fenêtre ENTIÈRE.
    expect(body.checkpoint).toBe(new Date(SINCE).toISOString());
    await app.close();
  });

  // `gapAction` est une INSTRUCTION. Une réponse ne doit pas dépendre de ce que
  // son destinataire en fera pour rester sûre : la resync complète peut être
  // différée, échouer hors ligne, ou — c'est l'état du dépôt aujourd'hui —
  // n'être lue par AUCUN client (`hasGap` / `gapAction` n'ont zéro
  // consommateur sur les trois clients). Le watermark tenu est ce qui rend
  // l'oubli rattrapable.
  it('leaves the gap response re-askable — the same `since` comes back untouched', async () => {
    const prisma = makePrisma({
      userEventSeq: { findUnique: jest.fn<any>().mockResolvedValue({ lastSeq: 50_000 }) },
    });
    const app = await buildApp(prisma);

    const first = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages&seq=1` });
    const second = await app.inject({
      method: 'GET',
      url: `/sync?since=${encodeURIComponent(first.json().data.checkpoint)}&collections=messages&seq=1`,
    });

    expect(second.json().data.checkpoint).toBe(new Date(SINCE).toISOString());
    await app.close();
  });

  // Deuxième façon de ne rien couvrir, et elle ne passe pas par `hasGap` :
  // `collections` est validé par `z.string().min(1)`, donc `','` franchit la
  // validation, se réduit à `[]` après `filter(Boolean)`, ne déclenche aucun
  // `UNSUPPORTED_COLLECTION` — et `hasMore` sur zéro collection vaut `false`.
  it('holds the watermark at `since` when not one collection was served', async () => {
    const app = await buildApp(makePrisma());

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=,` });
    const body = res.json().data;

    expect(res.statusCode).toBe(200);
    expect(body.collections).toEqual({});
    expect(body.checkpoint).toBe(new Date(SINCE).toISOString());
    await app.close();
  });

  // Le pendant NÉGATIF : la règle ne doit pas geler le watermark en général.
  // Une page complète, servie, sans gap, l'avance — sans quoi le client ne
  // progresserait jamais et relirait la même fenêtre indéfiniment.
  it('still advances on a served, complete, gap-free page', async () => {
    const app = await buildApp(makePrisma());

    const beforeMs = Date.now();
    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    const afterMs = Date.now();
    const body = res.json().data;

    expect(body.hasGap).toBe(false);
    expect(body.hasMore).toBe(false);
    const checkpointMs = new Date(body.checkpoint).getTime();
    expect(checkpointMs).toBeLessThanOrEqual(afterMs - SYNC_CHECKPOINT_LAG_MS);
    expect(checkpointMs).toBeGreaterThanOrEqual(beforeMs - SYNC_CHECKPOINT_LAG_MS);
    await app.close();
  });
});

describe('GET /sync — checkpoint vs truncation', () => {
  // Une page TRONQUÉE n'a pas livré toute la fenêtre : le reste porte des
  // `updatedAt` ANTÉRIEURS au checkpoint (c'est un arriéré). Un client qui
  // adopterait ce checkpoint au lieu de suivre `nextCursor` perdrait tout
  // l'arriéré d'un coup, définitivement. Le serveur ne doit donc pas remettre
  // un watermark qui affirme une couverture qu'il n'a pas démontrée — même
  // règle que `SyncWatermark.advancedAfterDeltaPage` côté SDK iOS.
  function backlog(count: number) {
    return Array.from({ length: count }, (_, n) => ({
      ...CHANGED_ROW_RELATIONS,
      id: `m${String(n).padStart(4, '0')}`,
      conversationId: 'c1',
      senderId: 's1',
      content: 'x',
      createdAt: new Date('2026-07-02T00:00:00.000Z'),
      updatedAt: new Date('2026-07-02T00:00:00.000Z'),
    }));
  }

  it('holds the watermark at `since` while the page leaves a remainder', async () => {
    const prisma = makePrisma({
      message: {
        findMany: jest.fn<any>().mockImplementation((args: any) =>
          Promise.resolve(args.where.deletedAt === null ? backlog(args.take) : []),
        ),
      },
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages&limit=5` });
    const body = res.json().data;

    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBeTruthy();
    expect(body.checkpoint).toBe(new Date(SINCE).toISOString());
    await app.close();
  });

  it('advances the watermark again on the page that closes the run', async () => {
    const app = await buildApp(makePrisma());

    const beforeMs = Date.now();
    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages&limit=5` });
    const body = res.json().data;

    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
    expect(new Date(body.checkpoint).getTime()).toBeGreaterThanOrEqual(beforeMs - SYNC_CHECKPOINT_LAG_MS);
    await app.close();
  });
});

// ─── Disparitions PERSONNELLES (« supprimer pour moi ») ──────────────────────

/**
 * `userMessageDeletion.findMany` sert DEUX appels dans cette route, et un stub
 * ordonné par `mockResolvedValueOnce` casserait dès qu'on réordonne le code.
 * On distingue donc par la FORME de la requête : le stream de tombstones est le
 * seul à sélectionner `id` (la ligne de masquage) et à trier.
 */
function makeHidingPrisma(rows: Array<{
  id: string;
  messageId: string;
  deletedAt: Date;
  conversationId?: string;
}>): PrismaStub {
  const prisma = makePrisma();
  prisma.userMessageDeletion.findMany = jest.fn<any>(async (args: any) => {
    if (args?.select?.id) {
      return rows.map((r) => ({
        id: r.id,
        messageId: r.messageId,
        deletedAt: r.deletedAt,
        message: { conversationId: r.conversationId ?? 'c1' },
      }));
    }
    return [];
  });
  return prisma;
}

describe('GET /sync — le stream des disparitions personnelles', () => {
  it('rend un « supprimer pour moi » comme tombstone, portant l’id du MESSAGE', async () => {
    const prisma = makeHidingPrisma([
      { id: 'umd-1', messageId: 'm-hidden', deletedAt: new Date('2026-07-03T00:00:00Z') },
    ]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    const msgs = res.json().data.collections.messages;

    // L'id servi est celui du message — la ligne `UserMessageDeletion` n'existe
    // pas côté client et ne sert qu'au keyset.
    expect(msgs.deleted).toEqual([
      {
        id: 'm-hidden',
        conversationId: 'c1',
        deletedAt: new Date('2026-07-03T00:00:00Z').toISOString(),
      },
    ]);
    await app.close();
  });

  it('interroge `UserMessageDeletion` et non `Message` — un delete-for-me ne bouge pas `Message.updatedAt`', async () => {
    const prisma = makeHidingPrisma([
      { id: 'umd-1', messageId: 'm-hidden', deletedAt: new Date('2026-07-03T00:00:00Z') },
    ]);
    const app = await buildApp(prisma);

    await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });

    const call = (prisma.userMessageDeletion.findMany as jest.Mock).mock.calls
      .map((c) => c[0] as any)
      .find((a) => a?.select?.id);
    expect(call.where.userId).toBe(USER_ID);
    expect(call.where.message.conversationId).toEqual({ in: ['c1'] });
    expect(call.where.deletedAt).toEqual({ gt: new Date(SINCE) });
    await app.close();
  });

  it('fusionne les deux origines de disparition dans UN tableau, triées et dédupliquées', async () => {
    const prisma = makeHidingPrisma([
      { id: 'umd-1', messageId: 'm-both', deletedAt: new Date('2026-07-05T00:00:00Z') },
      { id: 'umd-2', messageId: 'm-hidden', deletedAt: new Date('2026-07-02T00:00:00Z') },
    ]);
    prisma.message.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'm-both', conversationId: 'c1', deletedAt: new Date('2026-07-04T00:00:00Z') },
      ]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    const msgs = res.json().data.collections.messages;

    // `m-both` est masqué pour moi PUIS supprimé pour tous : une seule ligne,
    // la plus ancienne des deux dates.
    expect(msgs.deleted.map((d: { id: string }) => d.id)).toEqual(['m-hidden', 'm-both']);
    expect(msgs.deleted[1].deletedAt).toBe(new Date('2026-07-04T00:00:00Z').toISOString());
    await app.close();
  });

  it('tronque sur `cap + 1` et reprend le keyset par l’id de la LIGNE de masquage', async () => {
    const sameInstant = new Date('2026-07-03T00:00:00Z');
    const prisma = makeHidingPrisma(
      // Deux masquages à la MÊME milliseconde : seul l'id de la ligne les
      // départage (un lot de 100 en produit exactement autant).
      Array.from({ length: 3 }, (_, i) => ({
        id: `umd-${i}`,
        messageId: `m-${i}`,
        deletedAt: sameInstant,
      }))
    );
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=messages&limit=2`,
    });
    const body = res.json().data;

    expect(body.collections.messages.truncated).toBe(true);
    expect(body.hasMore).toBe(true);
    expect(decodeSyncCursor(body.nextCursor).h).toEqual({
      u: sameInstant.toISOString(),
      i: 'umd-1',
    });
    await app.close();
  });

  it('reprend STRICTEMENT après la position portée par le curseur', async () => {
    const prisma = makeHidingPrisma([]);
    const app = await buildApp(prisma);
    const cursor = encodeSyncCursor({ h: { u: '2026-07-03T00:00:00.000Z', i: 'umd-1' } });

    await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=messages&cursor=${cursor}`,
    });

    const call = (prisma.userMessageDeletion.findMany as jest.Mock).mock.calls
      .map((c) => c[0] as any)
      .find((a) => a?.select?.id);
    expect(call.where.OR).toEqual([
      { deletedAt: { gt: new Date('2026-07-03T00:00:00.000Z') } },
      { deletedAt: new Date('2026-07-03T00:00:00.000Z'), id: { gt: 'umd-1' } },
    ]);
    await app.close();
  });

  it('accepte un curseur SANS `h` — un client en vol ne doit pas repartir de zéro', () => {
    const legacy = encodeSyncCursor({ c: { u: '2026-07-03T00:00:00.000Z', i: 'm-1' } });
    expect(decodeSyncCursor(legacy).h).toBeUndefined();
    expect(decodeSyncCursor(legacy).c).toEqual({ u: '2026-07-03T00:00:00.000Z', i: 'm-1' });
  });

  it('annonce la page TRONQUÉE plutôt que d’échouer quand la recherche de masquages tombe', async () => {
    const prisma = makePrisma();
    prisma.userMessageDeletion.findMany = jest.fn<any>(async (args: any) => {
      if (args?.select?.id) throw new Error('mongo down');
      return [];
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });

    // Servir le rattrapage reste le produit ; on rend « je ne peux pas
    // affirmer l'exhaustivité », jamais un 500.
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.collections.messages.truncated).toBe(true);
    expect(body.hasMore).toBe(true);
    expect(body.checkpoint).toBe(new Date(SINCE).toISOString());
    await app.close();
  });
});

describe('GET /sync — plafond de POIDS de la page', () => {
  const T = (s: string) => new Date(s);

  /**
   * Une ligne du stream `changed` d'un poids CHOISI. Le poids passe par
   * `content` parce que c'est le champ le plus honnête à gonfler : dans la vraie
   * vie il est rejoint par `translations` (une copie du contenu PAR langue),
   * `metadata`, et les `transcription`/`translations` des pièces jointes — tous
   * des blobs JSON dont la taille est écrite par l'utilisateur, jamais par le
   * schéma.
   */
  const heavy = (id: string, bytes: number, seconds: number) => ({
    ...CHANGED_ROW_RELATIONS,
    id,
    conversationId: 'c1',
    senderId: 'u',
    content: 'x'.repeat(bytes),
    createdAt: T('2026-06-01T00:00:00Z'),
    updatedAt: T(`2026-07-02T00:00:${String(seconds).padStart(2, '0')}.000Z`),
  });

  const deliveredIds = (msgs: { added: Array<{ id: string }>; modified: Array<{ id: string }> }) =>
    [...msgs.added, ...msgs.modified].map((m) => m.id);

  it('tronque la page sur le POIDS bien avant le plafond de LIGNES', async () => {
    // Six lignes seulement — cent fois moins que le cap de 1000 — mais chacune
    // pèse un tiers du budget. Le plafond de lignes ne peut rien voir.
    const prisma = makePrisma();
    prisma.message.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 6 }, (_, k) => heavy(`m${k}`, Math.floor(SYNC_MAX_PAGE_BYTES / 3), k)),
      )
      .mockResolvedValueOnce([]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    const msgs = res.json().data.collections.messages;

    expect(deliveredIds(msgs).length).toBeLessThan(6);
    expect(msgs.truncated).toBe(true);
    expect(typeof msgs.nextCursor).toBe('string');
    // Le corps servi reste sous le budget, à une ligne près (la ligne qui fait
    // franchir la borne est exclue, pas incluse « juste cette fois »).
    expect(Buffer.byteLength(res.payload, 'utf8')).toBeLessThan(SYNC_MAX_PAGE_BYTES * 1.5);
    await app.close();
  });

  it('ancre le curseur sur la dernière ligne LIVRÉE, jamais sur la dernière ligne LUE', async () => {
    const prisma = makePrisma();
    prisma.message.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 6 }, (_, k) => heavy(`m${k}`, Math.floor(SYNC_MAX_PAGE_BYTES / 3), k)),
      )
      .mockResolvedValueOnce([]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    const msgs = res.json().data.collections.messages;
    const delivered = deliveredIds(msgs);

    // Une ligne écartée par le budget n'a PAS été livrée : ancrer le curseur
    // derrière elle la perdrait définitivement (la borne serveur est stricte).
    expect(decodeSyncCursor(msgs.nextCursor).c?.i).toBe(delivered[delivered.length - 1]);
    await app.close();
  });

  it('sert quand même un message plus lourd À LUI SEUL que le budget — sinon le rattrapage n’avance jamais', async () => {
    const prisma = makePrisma();
    prisma.message.findMany
      .mockResolvedValueOnce([heavy('énorme', SYNC_MAX_PAGE_BYTES * 2, 1), heavy('m2', 10, 2)])
      .mockResolvedValueOnce([]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    const msgs = res.json().data.collections.messages;

    // Rendre une page VIDE + `truncated: true` + le curseur inchangé serait une
    // boucle infinie : le client redemanderait la même position pour toujours.
    expect(deliveredIds(msgs)).toEqual(['énorme']);
    expect(msgs.truncated).toBe(true);
    expect(decodeSyncCursor(msgs.nextCursor).c?.i).toBe('énorme');
    await app.close();
  });

  it('parcourt tout le jeu sans trou ni doublon quand c’est le POIDS qui pagine', async () => {
    const dataset = Array.from({ length: 5 }, (_, k) =>
      heavy(`m${k}`, Math.floor(SYNC_MAX_PAGE_BYTES / 2), k),
    );
    const prisma = makePrisma({ message: { findMany: keysetMessageStore(dataset) } });
    const app = await buildApp(prisma);

    const seen: string[] = [];
    let cursor: string | null = null;
    let guard = 0;
    for (; guard < 12; guard++) {
      const url =
        `/sync?since=${SINCE}&collections=messages` +
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
      const res: any = await app.inject({ method: 'GET', url });
      const msgs = res.json().data.collections.messages;
      seen.push(...deliveredIds(msgs));
      if (!msgs.truncated) {
        cursor = null;
        break;
      }
      cursor = msgs.nextCursor as string;
    }

    expect(guard).toBeLessThan(12);
    expect(cursor).toBeNull();
    expect([...seen].sort()).toEqual(['m0', 'm1', 'm2', 'm3', 'm4']);
    expect(new Set(seen).size).toBe(seen.length);
    await app.close();
  });

  it('ne tronque pas une page qui tient dans le budget', async () => {
    const prisma = makePrisma();
    prisma.message.findMany
      .mockResolvedValueOnce([heavy('m0', 100, 0), heavy('m1', 100, 1)])
      .mockResolvedValueOnce([]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    const msgs = res.json().data.collections.messages;

    expect(deliveredIds(msgs)).toEqual(['m0', 'm1']);
    expect(msgs.truncated).toBe(false);
    expect(msgs.nextCursor).toBeNull();
    await app.close();
  });

  it('n’impose pas le budget aux tombstones — trois scalaires par ligne, déjà bornés par le plafond de lignes', async () => {
    const prisma = makePrisma();
    prisma.message.findMany
      .mockResolvedValueOnce([]) // changed
      .mockResolvedValueOnce(
        Array.from({ length: 200 }, (_, k) => ({
          id: `d${k}`,
          conversationId: 'c1',
          deletedAt: T(`2026-07-02T00:00:${String(k % 60).padStart(2, '0')}.000Z`),
        })),
      );
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    const msgs = res.json().data.collections.messages;

    expect(msgs.deleted).toHaveLength(200);
    expect(msgs.truncated).toBe(false);
    await app.close();
  });
});

/**
 * Sessions anonymes — le rattrapage des participants par lien de partage.
 *
 * Trois choses distinctes se jouent ici, et aucune n'est le simple retrait d'un
 * `allowAnonymous: false` :
 *
 * 1. **L'identité n'a pas la même colonne.** `authContext.userId` d'un anonyme
 *    porte un `Participant.id`, pas un `User.id` : la RLS de `/sync` filtrait
 *    `Participant.userId`, qui est NULL pour un anonyme — la clause n'aurait
 *    jamais matché et l'ouverture aurait rendu des streams vides en silence.
 * 2. **Les tables personnelles ne le concernent pas.** `UserMessageDeletion` et
 *    `UserConversationPreferences` sont attachées à `User` : les interroger avec
 *    un id de participant est une faute de catégorie.
 * 3. **L'historique d'un lien `allowViewHistory: false` reste interdit.** Et le
 *    plancher se pose sur `createdAt`, jamais sur le watermark `since` : un
 *    message ANCIEN édité aujourd'hui porte un `updatedAt` d'aujourd'hui, donc
 *    remonter `since` ne l'exclut pas — il fuirait par le stream `changed`.
 */
describe('GET /sync — sessions anonymes (lien de partage)', () => {
  const anonymous = (): TestAuthContext => ({
    userId: PARTICIPANT_ID,
    type: 'anonymous',
    participantId: PARTICIPANT_ID,
  });

  const anonymousPrisma = (
    membership: Record<string, unknown> = {
      conversationId: 'c1',
      joinedAt: new Date('2026-06-15T00:00:00Z'),
      shareLinkId: null,
    },
  ): PrismaStub => {
    const prisma = makePrisma();
    prisma.participant.findMany = jest.fn<any>().mockResolvedValue([membership]);
    return prisma;
  };

  it('la route déclare son middleware avec `allowAnonymous: true`', async () => {
    const before = mockAuthMiddlewareOptions.length;
    const app = await buildApp(makePrisma());
    expect(mockAuthMiddlewareOptions.slice(before)).toEqual([
      { requireAuth: true, allowAnonymous: true },
    ]);
    await app.close();
  });

  it('scope la RLS sur le `Participant.id` de la session, jamais sur `userId`', async () => {
    const prisma = anonymousPrisma();
    const app = await buildApp(prisma, anonymous());

    await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });

    const where = prisma.participant.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where).toEqual({ id: PARTICIPANT_ID, isActive: true });
    await app.close();
  });

  it('honore `scope` en INTERSECTION du participant — jamais à sa place', async () => {
    const prisma = anonymousPrisma();
    prisma.participant.findMany = jest.fn<any>().mockResolvedValue([]);
    const app = await buildApp(prisma, anonymous());

    const res = await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=messages&scope=${SCOPE_ID}`,
    });

    expect(prisma.participant.findMany.mock.calls[0]![0]!.where).toEqual({
      id: PARTICIPANT_ID,
      isActive: true,
      conversationId: SCOPE_ID,
    });
    const msgs = res.json().data.collections.messages;
    expect(msgs.added).toEqual([]);
    expect(msgs.deleted).toEqual([]);
    expect(prisma.message.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('n’interroge pas `UserEventSeq` — le curseur `_seq` est indexé par `User.id`', async () => {
    const prisma = anonymousPrisma();
    const app = await buildApp(prisma, anonymous());

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });

    expect(prisma.userEventSeq.findUnique).not.toHaveBeenCalled();
    expect(res.json().data.checkpointSeq).toBe(0);
    expect(res.json().data.hasGap).toBe(false);
    await app.close();
  });

  it('n’interroge aucune table personnelle et n’en annonce pas la page tronquée', async () => {
    const prisma = anonymousPrisma();
    prisma.userMessageDeletion.findMany = jest.fn<any>(async () => {
      throw new Error('UserMessageDeletion ne doit pas être interrogée pour un anonyme');
    });
    const app = await buildApp(prisma, anonymous());

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });

    expect(prisma.userMessageDeletion.findMany).not.toHaveBeenCalled();
    expect(prisma.userConversationPreferences.findMany).not.toHaveBeenCalled();
    // Le stream personnel absent ne doit pas se lire comme « exhaustivité non
    // garantie » : il n'y a rien à garantir.
    expect(res.json().data.collections.messages.truncated).toBe(false);
    await app.close();
  });

  it('sans identité de participant, refuse plutôt que de retomber sur la clause `userId`', async () => {
    const prisma = anonymousPrisma();
    const app = await buildApp(prisma, { userId: PARTICIPANT_ID, type: 'anonymous' });

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });

    expect(res.statusCode).toBe(401);
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
    await app.close();
  });
});

/**
 * Le plancher d'historique d'un lien de partage — la règle que `GET
 * /conversations/:id/messages` applique depuis toujours (`historyStartDate =
 * participant.joinedAt` quand `allowViewHistory` est faux) et que `/sync`
 * n'appliquait pas.
 *
 * Elle est portée par la LIGNE PARTICIPANT, pas par le type d'identité : un
 * utilisateur INSCRIT qui rejoint par un lien sans historique porte le même
 * `shareLinkId`, et le trou était le même pour lui — le fait qu'il ait un
 * `User.id` ne lui donne aucun droit sur l'avant-jointure.
 */
describe('GET /sync — plancher d’historique des liens de partage', () => {
  const JOINED = new Date('2026-06-15T00:00:00Z');

  const linkedPrisma = (allowViewHistory: boolean | undefined): PrismaStub => {
    const prisma = makePrisma();
    prisma.participant.findMany = jest.fn<any>().mockResolvedValue([
      { conversationId: 'c1', joinedAt: JOINED, shareLinkId: 'sl-1' },
    ]);
    prisma.conversationShareLink.findMany = jest.fn<any>().mockResolvedValue(
      allowViewHistory === undefined ? [] : [{ id: 'sl-1', allowViewHistory }],
    );
    return prisma;
  };

  const scopeClause = (prisma: PrismaStub, callIndex: number): unknown =>
    (prisma.message.findMany.mock.calls[callIndex]![0]! as Record<string, any>).where.AND;

  it('borne les DEUX streams sur `createdAt >= joinedAt` quand l’historique est fermé', async () => {
    const prisma = linkedPrisma(false);
    const app = await buildApp(prisma, {
      userId: PARTICIPANT_ID,
      type: 'anonymous',
      participantId: PARTICIPANT_ID,
    });

    await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });

    const expected = [{ OR: [{ conversationId: 'c1', createdAt: { gte: JOINED } }] }];
    expect(scopeClause(prisma, 0)).toEqual(expected); // changed
    expect(scopeClause(prisma, 1)).toEqual(expected); // deleted (tombstones)
    await app.close();
  });

  it('applique le même plancher à un utilisateur INSCRIT entré par le même lien', async () => {
    const prisma = linkedPrisma(false);
    const app = await buildApp(prisma);

    await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });

    expect(prisma.participant.findMany.mock.calls[0]![0]!.where).toEqual({
      userId: USER_ID,
      isActive: true,
    });
    expect(scopeClause(prisma, 0)).toEqual([
      { OR: [{ conversationId: 'c1', createdAt: { gte: JOINED } }] },
    ]);
    await app.close();
  });

  it('ne borne rien quand le lien autorise l’historique', async () => {
    const prisma = linkedPrisma(true);
    const app = await buildApp(prisma);

    await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });

    expect(prisma.conversationShareLink.findMany).toHaveBeenCalledTimes(1);
    expect(scopeClause(prisma, 0)).toBeUndefined();
    await app.close();
  });

  it('le plancher ne touche PAS le watermark `since` — un message ancien réédité doit rester exclu', async () => {
    const prisma = linkedPrisma(false);
    const app = await buildApp(prisma);

    await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });

    // Remonter `since` à `joinedAt` aurait laissé passer un message créé avant
    // la jointure mais édité après : c'est `createdAt` qui porte la borne.
    const changed = prisma.message.findMany.mock.calls[0]![0]! as Record<string, any>;
    expect(changed.where.updatedAt).toEqual({ gt: new Date(SINCE) });
    await app.close();
  });

  it('un participant SANS lien de partage ne paie aucune requête et garde sa clause intacte', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });

    expect(prisma.conversationShareLink.findMany).not.toHaveBeenCalled();
    expect(scopeClause(prisma, 0)).toBeUndefined();
    expect(prisma.message.findMany.mock.calls[0]![0]!.where.conversationId).toEqual({ in: ['c1'] });
    await app.close();
  });

  it('un lien introuvable ne borne pas — même posture que GET messages', async () => {
    const prisma = linkedPrisma(undefined);
    const app = await buildApp(prisma);

    await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });

    expect(scopeClause(prisma, 0)).toBeUndefined();
    await app.close();
  });
});

describe('GET /sync — le plancher ILLISIBLE ne se dégrade pas en silence', () => {
  const withFailingFloor = (): PrismaStub => {
    const prisma = makePrisma();
    prisma.participant.findMany = jest.fn<any>().mockResolvedValue([
      { conversationId: 'c1', joinedAt: new Date('2026-06-15T00:00:00Z'), shareLinkId: 'sl-1' },
    ]);
    prisma.conversationShareLink.findMany = jest.fn<any>(async () => {
      throw new Error('mongo down');
    });
    return prisma;
  };

  it('retire la conversation ET annonce la page incomplète — jamais un checkpoint adoptable', async () => {
    const prisma = withFailingFloor();
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    const body = res.json().data;

    // Servie sans borne, elle fuirait ; retirée en silence, la page passerait
    // pour complète et la fenêtre ne serait JAMAIS redemandée (la borne serveur
    // est stricte). Les deux à la fois : retirée, et page déclarée incomplète.
    expect(prisma.message.findMany).not.toHaveBeenCalled();
    expect(body.collections.messages.truncated).toBe(true);
    expect(body.hasMore).toBe(true);
    expect(body.checkpoint).toBe(SINCE);
    expect(body.nextCursor).not.toBeNull();
    await app.close();
  });

  it('reprend AU MÊME endroit — le curseur entrant est rendu tel quel', async () => {
    const prisma = withFailingFloor();
    const app = await buildApp(prisma);
    const cursor = encodeSyncCursor({ c: { u: '2026-07-03T00:00:00.000Z', i: 'm-1' } });

    const res = await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=messages&cursor=${cursor}`,
    });

    expect(decodeSyncCursor(res.json().data.nextCursor).c).toEqual({
      u: '2026-07-03T00:00:00.000Z',
      i: 'm-1',
    });
    await app.close();
  });

  it('une conversation SANS lien reste servie à côté de celle qu’on a dû retirer', async () => {
    const prisma = withFailingFloor();
    prisma.participant.findMany = jest.fn<any>().mockResolvedValue([
      { conversationId: 'c1', joinedAt: new Date('2026-06-15T00:00:00Z'), shareLinkId: 'sl-1' },
      { conversationId: 'c2', joinedAt: new Date('2026-06-15T00:00:00Z'), shareLinkId: null },
    ]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });

    expect(prisma.message.findMany.mock.calls[0]![0]!.where.conversationId).toEqual({ in: ['c2'] });
    expect(res.json().data.collections.messages.truncated).toBe(true);
    await app.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LE CONTRAT DE RÉPONSE (cycle 95)
//
// Jusqu'ici cette suite mesurait le `select` — « la projection charge-t-elle
// bien les clés rendables ? » — et jamais la RÉPONSE. Les deux ne disent pas la
// même chose : entre la ligne Prisma et le fil il y a `fast-json-stringify`,
// qui ne laisse passer que le DÉCLARÉ. Tant que `/sync` n'avait aucun
// `schema.response`, la distinction était sans objet — rien n'était gouverné,
// donc rien n'était faux. Gouverner crée la possibilité même du désaccord, et
// les témoins ci-dessous sont les désaccords qui étaient là depuis le début.
//
// Ils assertent sur les VALEURS servies, jamais sur `statusCode` : la route
// rendait 200 pendant toute la vie des deux défauts.
// ─────────────────────────────────────────────────────────────────────────────

const READER_PARTICIPANT_ID = '507f1f77bcf86cd799439bbb';

/**
 * La ligne que rend RÉELLEMENT `prisma.message.findMany` sous `syncMessageSelect`.
 *
 * `translations` y est une CARTE (`schema.prisma` : colonne `Json?`, « map:
 * langue -> données »), et `attachments[].reactions` la relation BRUTE que
 * `attachmentMediaSelect` charge. C'est la question qui départage un témoin
 * d'une fiction : non pas « à quoi ressemble cette réponse ? » mais « que rend
 * la requête, et que passe le gestionnaire au sérialiseur ? ».
 */
const syncMessageRow = () => ({
  id: 'm-contract-1',
  conversationId: 'c1',
  senderId: 'p-sender',
  content: 'bonjour',
  clientMessageId: 'cid_9f1c',
  originalLanguage: 'fr',
  translations: {
    en: {
      text: 'hello',
      translationModel: 'basic',
      confidenceScore: 0.93,
      createdAt: '2026-07-02T10:05:00.000Z',
    },
  },
  messageType: 'audio',
  messageSource: 'user',
  metadata: { postReplyTo: { id: 'post-1' } },
  isEdited: true,
  editedAt: new Date('2026-07-02T10:30:00.000Z'),
  replyToId: 'm-parent',
  reactionSummary: { '❤️': 2 },
  reactionCount: 2,
  validatedMentions: ['bob'],
  createdAt: new Date('2026-07-02T10:00:00.000Z'),
  updatedAt: new Date('2026-07-02T10:30:00.000Z'),
  attachments: [
    {
      id: 'att-1',
      messageId: 'm-contract-1',
      fileName: 'voix.m4a',
      originalName: 'voix.m4a',
      mimeType: 'audio/mp4',
      fileSize: 20480,
      fileUrl: 'https://cdn/voix.m4a',
      thumbnailUrl: null,
      thumbHash: 'AQIDBA==',
      imageVariants: null,
      width: null,
      height: null,
      duration: 4200,
      bitrate: 64000,
      sampleRate: 48000,
      codec: 'aac',
      channels: 1,
      fps: null,
      videoCodec: null,
      pageCount: null,
      lineCount: null,
      metadata: { waveform: [1, 2, 3] },
      uploadedBy: 'u-sender',
      isAnonymous: false,
      createdAt: new Date('2026-07-02T10:00:00.000Z'),
      transcription: { type: 'audio', text: 'bonjour', language: 'fr', confidence: 0.9, source: 'whisper' },
      // Les traductions d'une pièce jointe restent une CARTE par langue —
      // c'est leur forme canonique, à ne pas confondre avec celle du message.
      // Ses trois clés obligatoires (`type`, `transcription`, `createdAt`) ne
      // sont pas décoratives : `messageAttachmentSchema` les déclare `required`,
      // et fast-json-stringify REFUSE de sérialiser une entrée qui en manque
      // une. Une charge inventée l'aurait découvert en 500, pas en assertion.
      translations: {
        en: {
          type: 'audio',
          transcription: 'hello',
          url: 'https://cdn/voix-en.m4a',
          durationMs: 4200,
          createdAt: '2026-07-02T10:05:00.000Z',
        },
      },
      reactions: [
        { emoji: '👍', participantId: READER_PARTICIPANT_ID },
        { emoji: '👍', participantId: 'p-other' },
      ],
    },
  ],
  sender: {
    id: 'p-sender',
    userId: 'u-sender',
    displayName: 'Emetteur',
    avatar: null,
    type: 'user',
    role: 'member',
    language: 'fr',
    user: { id: 'u-sender', username: 'emetteur', displayName: 'Emetteur', avatar: null },
  },
});

/** Le lecteur EST participant de `c1` — sa ligne porte l'id que les réactions
 *  de pièce jointe doivent reconnaître comme « les siennes ». */
const readerMembership = () => ({
  id: READER_PARTICIPANT_ID,
  conversationId: 'c1',
  joinedAt: new Date('2026-06-15T00:00:00Z'),
  shareLinkId: null,
  permissions: null,
  anonymousSession: null,
});

async function fetchSyncPage(): Promise<any> {
  const prisma = makePrisma();
  prisma.participant.findMany = jest.fn<any>().mockResolvedValue([readerMembership()]);
  prisma.message.findMany = jest
    .fn<any>()
    .mockResolvedValueOnce([syncMessageRow()])
    .mockResolvedValueOnce([
      { id: 'm-gone', conversationId: 'c1', deletedAt: new Date('2026-07-02T12:00:00.000Z') },
    ]);
  const app = await buildApp(prisma);
  const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
  await app.close();
  return JSON.parse(res.body);
}

describe('GET /sync — l’enveloppe réelle', () => {
  it('sert exactement les clés que le gestionnaire compose, aucune de moins', async () => {
    const body = await fetchSyncPage();

    expect(body.success).toBe(true);
    expect(Object.keys(body.data).sort()).toEqual([
      'checkpoint', 'checkpointSeq', 'collections', 'gapAction', 'hasGap', 'hasMore', 'nextCursor',
    ]);
    expect(Object.keys(body.data.collections.messages).sort()).toEqual([
      'added', 'deleted', 'modified', 'nextCursor', 'truncated',
    ]);
  });

  it('ne perd aucune colonne que `syncMessageSelect` charge', async () => {
    const body = await fetchSyncPage();
    const served = new Set(Object.keys(body.data.collections.messages.added[0]));

    const composed = Object.keys(syncMessageRow());
    expect(composed.filter((k) => !served.has(k))).toEqual([]);
  });

  it('sert le bloc expéditeur et son utilisateur imbriqué', async () => {
    const body = await fetchSyncPage();
    const { sender } = body.data.collections.messages.added[0];

    expect(sender).toMatchObject({ id: 'p-sender', displayName: 'Emetteur', type: 'user', language: 'fr' });
    expect(sender.user).toMatchObject({ id: 'u-sender', username: 'emetteur' });
  });

  /**
   * `/sync` sert le profil d'un TIERS — l'expéditeur — et n'a AUCUN gate de
   * présence. La règle du dépôt n'autorise que deux issues, et c'est la seconde
   * qui est prise ici : ni le `select` ni le schéma ne portent `isOnline` /
   * `lastActiveAt`, donc rien à garder. C'est fail-closed, la posture du
   * cycle 93 — un gate sur une donnée que personne ne charge est du code mort
   * qui se périme, l'omission déclarée ne se périme pas.
   *
   * Ce témoin garde une PORTE, pas un bug : le jour où quelqu'un ajoute la
   * présence au `select` du rattrapage, il tombe et l'oblige à poser le gate
   * dans le MÊME lot — c'est la règle du cycle 84, et c'est ce qu'un piège armé
   * doit faire.
   */
  it('ne sert AUCUN champ de présence de l’expéditeur — ni au select, ni au schéma', async () => {
    const prisma = makePrisma();
    prisma.participant.findMany = jest.fn<any>().mockResolvedValue([readerMembership()]);
    const leaky = syncMessageRow();
    (leaky.sender as Record<string, unknown>).isOnline = true;
    (leaky.sender as Record<string, unknown>).lastActiveAt = new Date('2026-07-02T09:00:00Z');
    prisma.message.findMany = jest.fn<any>()
      .mockResolvedValueOnce([leaky])
      .mockResolvedValueOnce([]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    const { sender } = res.json().data.collections.messages.added[0];
    await app.close();

    // Le schéma est la garde : même posée sur l'objet, la présence ne sort pas.
    expect(sender).not.toHaveProperty('isOnline');
    expect(sender).not.toHaveProperty('lastActiveAt');

    // Et le select ne la demande pas — les deux moitiés, séparément.
    const senderSelect = prisma.message.findMany.mock.calls[0]![0]!.select.sender.select as Record<string, unknown>;
    expect(senderSelect.isOnline).toBeUndefined();
    expect(senderSelect.lastActiveAt).toBeUndefined();
  });

  it('conserve `metadata` et `reactionSummary`, deux objets de FORME LIBRE', async () => {
    const body = await fetchSyncPage();
    const message = body.data.collections.messages.added[0];

    // Sans `additionalProperties`, fast-json-stringify en vide le contenu en
    // silence — le piège que `messageSchema.metadata` documente déjà.
    expect(message.metadata).toEqual({ postReplyTo: { id: 'post-1' } });
    expect(message.reactionSummary).toEqual({ '❤️': 2 });
  });

  it('garde la tombstone entière — un client qui perd `deletedAt` ne sait plus dater la disparition', async () => {
    const body = await fetchSyncPage();

    expect(body.data.collections.messages.deleted[0]).toEqual({
      id: 'm-gone',
      conversationId: 'c1',
      deletedAt: '2026-07-02T12:00:00.000Z',
    });
  });
});

describe('GET /sync — `translations` a la forme du CONTRAT', () => {
  /**
   * Le défaut jumeau de celui que le cycle 94 bis a corrigé sur
   * `GET /messages/:messageId`, et il vivait ici pour la même raison : rien
   * n'était gouverné. `APIMessage.translations` se décode côté iOS avec un
   * `try` NON tolérant — une carte y fait échouer le décodage du message
   * ENTIER, pas seulement de ses traductions.
   */
  it('sert un TABLEAU, jamais la carte Mongo', async () => {
    const body = await fetchSyncPage();
    const { translations } = body.data.collections.messages.added[0];

    expect(Array.isArray(translations)).toBe(true);
    expect(translations).toHaveLength(1);
  });

  it('sert la forme que produit `transformTranslationsToArray`', async () => {
    const body = await fetchSyncPage();
    const [translation] = body.data.collections.messages.added[0].translations;

    expect(translation).toMatchObject({
      id: 'm-contract-1-en',
      messageId: 'm-contract-1',
      targetLanguage: 'en',
      translatedContent: 'hello',
      translationModel: 'basic',
    });
    expect(translation).not.toHaveProperty('text');
  });
});

describe('GET /sync — pièces jointes à la forme du fil', () => {
  /**
   * `attachmentMediaSelect` charge la relation `reactions` BRUTE
   * (`{emoji, participantId}`) ; le contrat de fil est `reactionSummary` +
   * `currentUserReactions`, produits par une agrégation serveur. Tant que la
   * réponse n'était pas gouvernée, la relation brute partait telle quelle —
   * une forme qu'aucun client ne décode, et qui fuite en prime QUI a réagi.
   */
  it('agrège les réactions par pièce jointe et retire les lignes brutes', async () => {
    const body = await fetchSyncPage();
    const [attachment] = body.data.collections.messages.added[0].attachments;

    expect(attachment.reactionSummary).toEqual({ '👍': 2 });
    expect(attachment).not.toHaveProperty('reactions');
  });

  it('reconnaît les réactions DU LECTEUR — par son `Participant.id` de CETTE conversation', async () => {
    const body = await fetchSyncPage();
    const [attachment] = body.data.collections.messages.added[0].attachments;

    expect(attachment.currentUserReactions).toEqual(['👍']);
  });

  /**
   * Le témoin ci-dessus ne peut pas tomber tout seul : le double Prisma rend sa
   * ligne d'appartenance quel que soit le `select`, donc `id` y est présent même
   * si la requête cesse de le demander. C'est la REQUÊTE qui porte le contrat —
   * mesuré : retirer `id: true` du select laisse le témoin de valeur VERT.
   */
  it('DEMANDE le `Participant.id` à Prisma — sans lui, aucune réaction n’est « la mienne »', async () => {
    const prisma = makePrisma();
    prisma.participant.findMany = jest.fn<any>().mockResolvedValue([readerMembership()]);
    const app = await buildApp(prisma);

    await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });

    const select = prisma.participant.findMany.mock.calls[0]![0]!.select as Record<string, unknown>;
    expect(select.id).toBe(true);
    await app.close();
  });

  it('conserve le rendable — codecs, thumbHash, transcription et traductions audio', async () => {
    const body = await fetchSyncPage();
    const [attachment] = body.data.collections.messages.added[0].attachments;

    expect(attachment).toMatchObject({
      id: 'att-1',
      mimeType: 'audio/mp4',
      fileUrl: 'https://cdn/voix.m4a',
      thumbHash: 'AQIDBA==',
      duration: 4200,
      codec: 'aac',
      sampleRate: 48000,
      channels: 1,
    });
    expect(attachment.transcription.text).toBe('bonjour');
    // La carte par langue est ici la forme CANONIQUE — la déclarer en tableau
    // aurait détruit le Prisme audio en croyant réparer le Prisme texte.
    expect(attachment.translations.en).toMatchObject({
      type: 'audio',
      transcription: 'hello',
      url: 'https://cdn/voix-en.m4a',
    });
    expect(attachment.metadata).toEqual({ waveform: [1, 2, 3] });
  });
});
