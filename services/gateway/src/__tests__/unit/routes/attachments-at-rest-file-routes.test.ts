/**
 * #13100 — un fichier scellé au repos (pièce `server` / `hybrid`) se lit
 * DÉCHIFFRÉ par les routes qui jugent leur lecteur — l'adresse signée et la
 * route par identifiant —, jamais par l'adresse nue, qui n'a pas de lecteur.
 * Un fichier d'avant le scellement (en clair) reste servi comme avant (#9223).
 *
 * Disque réel (dossier temporaire), vrai format scellé, vraies routes montées
 * sous `/api/v1` et l'alias legacy `/api`.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import * as crypto from 'crypto';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(), trace: jest.fn() }) },
}));

import { registerDownloadRoutes } from '../../../routes/attachments/download';
import { attachmentLegacyFileRoutes } from '../../../routes/attachments';
import { readSigningKeys, readerFileUrlSigner } from '../../../services/attachments/readerFileSignature';
import {
  configureAtRestFileAccess,
  sealStoredFile,
  type AtRestFileAccess,
  type AtRestFileRecord,
} from '../../../services/attachments/atRest/atRestFiles';

const PIECE = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const LEGACY_PIECE = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const MESSAGE = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const CONVERSATION = 'dddddddddddddddddddddd01';
const READER = 'cccccccccccccccccccccc01';
const READER_USER = 'eeeeeeeeeeeeeeeeeeeeee01';
const SIGNING_KEY = Buffer.alloc(32, 5).toString('base64');
const DATA_KEY = crypto.randomBytes(32);

const PLAIN_SOURCE = '2026/10/68f2a81417a557e8ce4ddfc1/carte_0f8fad5b-d9cb-469f-a165-70867728950e.png';
const SEALED_KEY = '2026/10/68f2a81417a557e8ce4ddfc1/5f0c2e7a1b9d4c3e8a7b6f5e4d3c2b1a.png';
const LEGACY_KEY = '2026/09/68f2a81417a557e8ce4ddfc1/ancienne_1b9d4c3e-8a7b-4f5e-9d3c-2b1a5f0c2e7a.png';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('CARTE-VITALE-1850775', 'ascii'), crypto.randomBytes(200_000)]);

type Query = { where: Record<string, unknown>; select?: Record<string, unknown> };

const project = <T extends object>(row: T, select?: Record<string, unknown>): Partial<T> =>
  select ? (Object.fromEntries(Object.entries(row).filter(([key]) => select[key])) as Partial<T>) : row;

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (field === 'OR') return (condition as Record<string, unknown>[]).some((branch) => matches(row, branch));
    const value = row[field];
    if (condition !== null && typeof condition === 'object') {
      const c = condition as { startsWith?: string; in?: unknown[]; gte?: string; lt?: string; isSet?: boolean };
      if (c.isSet !== undefined) return c.isSet === (value !== undefined);
      if (c.in !== undefined) return c.in.includes(value);
      if (c.gte !== undefined) return typeof value === 'string' && value >= c.gte && (c.lt === undefined || value < c.lt);
      return false;
    }
    return value === condition;
  });
}

function makePrisma() {
  const piece = (id: string, key: string) => ({
    id, messageId: MESSAGE, filePath: key, thumbnailPath: null, originalName: 'carte.png', mimeType: 'image/png',
    uploadedBy: READER_USER, isViewOnce: false, isBlurred: false, effectFlags: 0, fileUrl: key, fileName: path.basename(key), fileSize: 1,
    createdAt: new Date(), isAnonymous: false, isForwarded: false, viewOnceCount: 0, viewedCount: 0, downloadedCount: 0, consumedCount: 0, isEncrypted: false,
  });
  const pieces = [piece(PIECE, SEALED_KEY), piece(LEGACY_PIECE, LEGACY_KEY)];
  const carriers = [{ id: MESSAGE, conversationId: CONVERSATION, senderId: READER, createdAt: new Date(), deletedAt: null, expiresAt: null, viewOnceBurnAt: null, isViewOnce: false, isBlurred: false, effectFlags: 0, ephemeralDuration: null }];
  const participants = [{ id: READER, userId: READER_USER, conversationId: CONVERSATION, isActive: true }];
  return {
    messageAttachment: {
      findMany: jest.fn(async ({ where, select }: Query) => pieces.filter((r) => matches(r, where)).map((r) => project(r, select))),
      findUnique: jest.fn(async ({ where, select }: Query) => {
        const row = pieces.find((r) => r.id === where.id);
        return row ? project(row, select) : null;
      }),
    },
    message: {
      findMany: jest.fn(async ({ where, select }: Query) => carriers.filter((c) => matches(c, where)).map((c) => project(c, select))),
      findUnique: jest.fn(async ({ where, select }: Query) => {
        const row = carriers.find((c) => c.id === where.id);
        return row ? project(row, select) : null;
      }),
    },
    participant: {
      findFirst: jest.fn(async ({ where, select }: Query) => {
        const row = participants.find((p) => matches(p, where));
        return row ? project(row, select) : null;
      }),
    },
    messageStatusEntry: { findFirst: jest.fn(async () => null) },
    conversationShareLink: { findMany: jest.fn(async () => []) },
  };
}

function memoryAccess(): AtRestFileAccess {
  const records = new Map<string, AtRestFileRecord>();
  return {
    store: {
      find: async (key) => records.get(key) ?? null,
      save: async (record) => { records.set(record.storageKey, record); },
      remove: async (key) => { records.delete(key); },
    },
    keyring: {
      fileSealingKey: async () => ({ keyId: 'k1', key: DATA_KEY }),
      fileOpeningKey: async (keyId, conversationId) => {
        if (keyId !== 'k1' || conversationId !== CONVERSATION) throw new Error('refused');
        return DATA_KEY;
      },
    },
  };
}

let uploadRoot: string;
let app: FastifyInstance;
const access = memoryAccess();

beforeAll(async () => {
  process.env.ATTACHMENT_URL_SIGNING_KEY = SIGNING_KEY;
  uploadRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'at-rest-routes-'));
  process.env.UPLOAD_PATH = uploadRoot;
  for (const key of [PLAIN_SOURCE, LEGACY_KEY]) {
    await fs.mkdir(path.dirname(path.join(uploadRoot, key)), { recursive: true });
    await fs.writeFile(path.join(uploadRoot, key), PNG);
  }
  await sealStoredFile({ uploadRoot, sourceKey: PLAIN_SOURCE, targetKey: SEALED_KEY, binding: { conversationId: CONVERSATION, attachmentId: PIECE, role: 'original' }, access });
  await fs.unlink(path.join(uploadRoot, PLAIN_SOURCE));
  configureAtRestFileAccess(access);

  const prisma = makePrisma();
  app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as unknown as Record<string, unknown>).authContext = { isAuthenticated: true, isAnonymous: false, userId: READER_USER, participantId: READER };
  });
  app.decorate('prisma', prisma as never);
  await app.register(async (scope) => registerDownloadRoutes(scope, prisma as never, { uploadRoot, mirror: null, atRest: access }), { prefix: '/api/v1' });
  await app.register(attachmentLegacyFileRoutes, { prefix: '/api' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  configureAtRestFileAccess(null);
  await fs.rm(uploadRoot, { recursive: true, force: true });
  delete process.env.ATTACHMENT_URL_SIGNING_KEY;
});

const signed = (key: string, piece = PIECE) =>
  readerFileUrlSigner({ keys: readSigningKeys(), now: new Date() })!.sign({ storageKey: key, attachmentId: piece, readerParticipantId: READER });

describe('le disque ne porte que du chiffré', () => {
  it('ni l’en-tête PNG ni le texte de l’image', async () => {
    const onDisk = await fs.readFile(path.join(uploadRoot, SEALED_KEY));
    expect(onDisk.subarray(0, 8).equals(PNG.subarray(0, 8))).toBe(false);
    expect(onDisk.includes(Buffer.from('CARTE-VITALE-1850775'))).toBe(false);
  });
});

describe('l’adresse nue ne sert jamais un fichier scellé', () => {
  it.each([
    ['/api/v1', `/api/v1/attachments/file/${encodeURIComponent(SEALED_KEY)}`],
    ['/api (legacy)', `/api/attachments/file/${encodeURIComponent(SEALED_KEY)}`],
  ])('%s → 404', async (_label, url) => {
    const response = await app.inject({ method: 'GET', url });
    expect(response.statusCode).toBe(404);
    expect(response.rawPayload.includes(Buffer.from('CARTE-VITALE'))).toBe(false);
  });

  it('un fichier d’avant le scellement reste servi par l’adresse nue (rétrocompatibilité)', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/v1/attachments/file/${encodeURIComponent(LEGACY_KEY)}` });
    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.equals(PNG)).toBe(true);
  });
});

describe('l’adresse signée du lecteur déchiffre', () => {
  it('le fichier entier, sous son type, à sa taille claire', async () => {
    const response = await app.inject({ method: 'GET', url: signed(SEALED_KEY) });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(Number(response.headers['content-length'])).toBe(PNG.length);
    expect(response.rawPayload.equals(PNG)).toBe(true);
  });

  it('une plage, au milieu d’un segment et à cheval sur deux', async () => {
    for (const [start, end] of [[0, 7], [65_500, 66_000], [PNG.length - 10, PNG.length - 1]]) {
      const response = await app.inject({ method: 'GET', url: signed(SEALED_KEY), headers: { range: `bytes=${start}-${end}` } });
      expect(response.statusCode).toBe(206);
      expect(response.headers['content-range']).toBe(`bytes ${start}-${end}/${PNG.length}`);
      expect(response.rawPayload.equals(PNG.subarray(start, end + 1))).toBe(true);
    }
  });

  it('un fichier scellé altéré ne rend aucun octet', async () => {
    const absolute = path.join(uploadRoot, SEALED_KEY);
    const original = await fs.readFile(absolute);
    const tampered = Buffer.from(original);
    tampered[100] ^= 0xff;
    await fs.writeFile(absolute, tampered);
    try {
      const response = await app.inject({ method: 'GET', url: signed(SEALED_KEY) });
      expect(response.statusCode).not.toBe(200);
      expect(response.rawPayload.includes(PNG.subarray(0, 8))).toBe(false);
    } finally {
      await fs.writeFile(absolute, original);
    }
  });
});

describe('la route par identifiant, authentifiée et jugée, déchiffre', () => {
  it('GET /attachments/:id', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/v1/attachments/${PIECE}` });
    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.equals(PNG)).toBe(true);
  });
});
