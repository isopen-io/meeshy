/**
 * Tests — GET /api/v1/sync (SyncEngine A3.1, collection pilote `messages`).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

const USER_ID = '507f1f77bcf86cd799439000';

// createUnifiedAuthMiddleware est mocké pour injecter un authContext.
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (req: FastifyRequest) => {
    (req as unknown as { authContext: { userId: string } }).authContext = { userId: USER_ID };
  },
}));

import {
  syncRoutes,
  encodeSyncCursor,
  decodeSyncCursor,
  SYNC_CHECKPOINT_LAG_MS,
  SYNC_MESSAGE_RENDERABLE_KEYS,
} from '../../../routes/sync';

type PrismaStub = {
  participant: { findMany: jest.Mock };
  message: { findMany: jest.Mock };
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

async function buildApp(prisma: PrismaStub): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  await app.register(syncRoutes);
  await app.ready();
  return app;
}

const SINCE = '2026-07-01T00:00:00.000Z';

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
        { id: 'm-old', conversationId: 'c1', senderId: 'u', content: 'edited',
          createdAt: new Date('2026-06-01T00:00:00Z'), updatedAt: new Date('2026-07-02T00:00:00Z') },
        { id: 'm-new', conversationId: 'c1', senderId: 'u', content: 'fresh',
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

    await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages&scope=cX` });
    expect(prisma.participant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ conversationId: 'cX' }) }),
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

    expect(added.translations).toEqual({ fr: { text: 'Bonjour' } });
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
        { id: 'm1', conversationId: 'c1', senderId: 's1', content: '', translations: null,
          createdAt: new Date('2026-07-02T10:00:00Z'), updatedAt: new Date('2026-07-02T10:00:00Z') },
        { id: 'm2', conversationId: 'c1', senderId: 's1', content: '', translations: null,
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
      { id: 'a', conversationId: 'c1', senderId: 'u', content: '', createdAt: T('2026-06-01T00:00:00Z'), updatedAt: T('2026-07-02T00:00:01Z') },
      { id: 'b1', conversationId: 'c1', senderId: 'u', content: '', createdAt: T('2026-06-01T00:00:00Z'), updatedAt: T('2026-07-02T00:00:02Z') },
      { id: 'b2', conversationId: 'c1', senderId: 'u', content: '', createdAt: T('2026-06-01T00:00:00Z'), updatedAt: T('2026-07-02T00:00:02Z') }, // tie w/ b1
      { id: 'c', conversationId: 'c1', senderId: 'u', content: '', createdAt: T('2026-06-01T00:00:00Z'), updatedAt: T('2026-07-02T00:00:03Z') },
      { id: 'd', conversationId: 'c1', senderId: 'u', content: '', createdAt: T('2026-06-01T00:00:00Z'), updatedAt: T('2026-07-02T00:00:04Z') },
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

  it('applies the same watermark on the gap path, which returns no items at all', async () => {
    const prisma = makePrisma({
      userEventSeq: { findUnique: jest.fn<any>().mockResolvedValue({ lastSeq: 50_000 }) },
    });
    const app = await buildApp(prisma);

    const beforeMs = Date.now();
    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages&seq=1` });
    const afterMs = Date.now();
    const body = res.json().data;

    expect(body.hasGap).toBe(true);
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
