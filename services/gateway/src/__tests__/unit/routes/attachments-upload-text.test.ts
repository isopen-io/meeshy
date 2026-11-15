/**
 * Unit tests for attachments/upload.ts — POST /attachments/upload-text
 * (le texte joint : garde d'authentification, autorisation anonyme du lien,
 * plafond de taille en octets). POST /attachments/upload vit dans
 * attachments-upload.test.ts.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockUploadMultiple = jest.fn<any>();
const mockCreateTextAttachment = jest.fn<any>();
// #6604 — la route valide chaque fichier AVANT l'upload ; le défaut « valide »
// laisse tous les témoins existants (qui n'exercent pas ce refus) inchangés.
const mockValidateFile = jest.fn<any>().mockReturnValue({ valid: true });

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    uploadMultiple: (...a: any[]) => mockUploadMultiple(...a),
    createTextAttachment: (...a: any[]) => mockCreateTextAttachment(...a),
    validateFile: (...a: any[]) => mockValidateFile(...a),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import multipart from '@fastify/multipart';
import { registerUploadRoutes, MAX_TEXT_ATTACHMENT_LENGTH } from '../../../routes/attachments/upload';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

// ─── Factories ────────────────────────────────────────────────────────────────

function makePrisma(
  shareLink: any = { allowAnonymousFiles: true, allowAnonymousImages: true },
  target: { conversationType?: string; birthDate?: Date | null } = {}
) {
  return {
    conversationShareLink: {
      findUnique: jest.fn<any>().mockResolvedValue(shareLink),
    },
    message: {
      findFirst: jest.fn<any>().mockResolvedValue({ conversation: { type: target.conversationType ?? 'group' } }),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({ birthDate: target.birthDate ?? null }),
    },
  };
}

async function buildApp({
  authenticated = true,
  isAnonymous = false,
  participantId = null as string | null,
  prisma = makePrisma() as any,
}: {
  authenticated?: boolean;
  isAnonymous?: boolean;
  participantId?: string | null;
  prisma?: any;
} = {}): Promise<FastifyInstance> {
  // `bodyLimit` aligné sur `server.ts` (50MB) — sans lui, le `bodyLimit` PAR
  // DÉFAUT de Fastify (1MB) rejetterait déjà les payloads de test du plafond
  // `MAX_TEXT_ATTACHMENT_LENGTH` (10MB) avant même d'atteindre la validation
  // de schéma (`maxLength`) que ces tests vérifient.
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } }, bodyLimit: 50 * 1024 * 1024 });

  const authOptional = async (req: any) => {
    if (!authenticated && !isAnonymous) return;
    if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        isAnonymous: false,
        userId: USER_ID,
        registeredUser: { id: USER_ID, role: 'USER' },
        participantId: null,
      };
    } else if (isAnonymous) {
      (req as any).authContext = {
        // Un participant anonyme MUNI d'un jeton de session valide porte
        // `isAuthenticated: true` (cf. `createAnonymousUserContext`). Seul le
        // visiteur nu a `isAuthenticated: false` — et c'est lui que cette
        // fixture décrivait, ce qui masquait la garde cassée des routes.
        isAuthenticated: true,
        isAnonymous: true,
        userId: 'anon-session',
        participantId,
        anonymousUser: { shareLinkId: 'sl-001', username: 'AnonUser' },
      };
    }
  };

  await app.register(multipart);
  registerUploadRoutes(app, authOptional, prisma);
  await app.ready();
  return app;
}

describe('POST /attachments/upload-text — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ authenticated: false, isAnonymous: false });
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload-text',
      payload: { content: 'hello' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /attachments/upload-text — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCreateTextAttachment.mockResolvedValue({ id: 'att-1', fileUrl: 'https://example.com/file.txt' });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 on successful text attachment creation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload-text',
      payload: { content: 'Hello World', messageId: 'msg-123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('calls createTextAttachment with content and userId', async () => {
    await app.inject({
      method: 'POST',
      url: '/attachments/upload-text',
      payload: { content: 'Test content' },
    });
    expect(mockCreateTextAttachment).toHaveBeenCalledWith(
      'Test content',
      USER_ID,
      false,
      undefined,
    );
  });
});

describe('POST /attachments/upload-text — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCreateTextAttachment.mockRejectedValue(new Error('storage error'));
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on service error', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload-text',
      payload: { content: 'test' },
    });
    expect(res.statusCode).toBe(500);
  });

  it('returns 500 with fallback message when error has no message', async () => {
    const errNoMsg = new Error();
    (errNoMsg as any).message = '';
    mockCreateTextAttachment.mockRejectedValue(errNoMsg);
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload-text',
      payload: { content: 'test' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ── task-1-fix-round-3, I2 : ce point d'entrée était sans garde d'autorisation
// anonyme, jusqu'à ~50 Mo (bodyLimit global), sans rien forger — le
// contournement le plus simple des trois vus sur ce chantier.

describe('POST /attachments/upload-text — anonymous, blocked when files are forbidden (task-1-fix-round-3, I2)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    // Baseline propre : si la garde d'autorisation manque, cette valeur
    // résolue produirait un 200 (pas un 500 hérité d'un test précédent) —
    // pour que le ROUGE prouve bien l'ABSENCE de garde, pas un état de mock
    // fuité entre describe blocks.
    mockCreateTextAttachment.mockResolvedValue({ id: 'should-not-be-created' });
    app = await buildApp({
      authenticated: false,
      isAnonymous: true,
      participantId: 'part-001',
      prisma: makePrisma({ allowAnonymousFiles: false, allowAnonymousImages: true }),
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when anonymous file upload is not allowed', async () => {
    mockCreateTextAttachment.mockClear();
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload-text',
      payload: { content: 'a wall of unauthorized text' },
    });
    expect(res.statusCode).toBe(403);
    expect(mockCreateTextAttachment).not.toHaveBeenCalled();
  });
});

describe('POST /attachments/upload-text — anonymous, share link not found (task-1-fix-round-3, I2)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCreateTextAttachment.mockResolvedValue({ id: 'should-not-be-created' });
    app = await buildApp({
      authenticated: false,
      isAnonymous: true,
      participantId: 'part-001',
      prisma: makePrisma(null),
    });
  });
  afterAll(async () => { await app.close(); });

  // #4856 — même verdict que `/attachments/upload` : c'est le lien de la
  // session anonyme appelante, jamais celui d'un tiers.
  it('returns 404 when share link does not exist', async () => {
    mockCreateTextAttachment.mockClear();
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload-text',
      payload: { content: 'text' },
    });
    expect(res.statusCode).toBe(404);
    expect(mockCreateTextAttachment).not.toHaveBeenCalled();
  });
});

describe('POST /attachments/upload-text — anonymous, allowed when files are permitted (task-1-fix-round-3, I2)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCreateTextAttachment.mockResolvedValue({ id: 'att-anon-text' });
    app = await buildApp({
      authenticated: false,
      isAnonymous: true,
      participantId: 'part-001',
      prisma: makePrisma({ allowAnonymousFiles: true, allowAnonymousImages: false }),
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 when anonymous file upload is allowed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload-text',
      payload: { content: 'authorized text' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockCreateTextAttachment).toHaveBeenCalledWith('authorized text', 'anon-session', true, undefined);
  });
});

describe('POST /attachments/upload-text — anonymous without participantId (task-1-fix-round-3, I2)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCreateTextAttachment.mockResolvedValue({ id: 'att-anon-text-2' });
    app = await buildApp({ authenticated: false, isAnonymous: true, participantId: null });
  });
  afterAll(async () => { await app.close(); });

  it('skips the permission check and returns 200 when participantId is null', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload-text',
      payload: { content: 'text' },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /attachments/upload-text — content size cap (task-1-fix-round-3, I2)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCreateTextAttachment.mockResolvedValue({ id: 'att-text-size' });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('rejects a content string longer than MAX_TEXT_ATTACHMENT_LENGTH before it reaches the service', async () => {
    mockCreateTextAttachment.mockClear();
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload-text',
      payload: { content: 'a'.repeat(MAX_TEXT_ATTACHMENT_LENGTH + 1) },
    });
    expect(res.statusCode).toBe(400);
    expect(mockCreateTextAttachment).not.toHaveBeenCalled();
  });

  it('accepts a content string exactly at MAX_TEXT_ATTACHMENT_LENGTH', async () => {
    mockCreateTextAttachment.mockClear();
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload-text',
      payload: { content: 'a'.repeat(MAX_TEXT_ATTACHMENT_LENGTH) },
    });
    expect(res.statusCode).toBe(200);
    expect(mockCreateTextAttachment).toHaveBeenCalledTimes(1);
  });
});

// task-1-fix-round-4 — le plafond round 3 comptait des POINTS DE CODE Unicode
// (via `maxLength` AJV), pas des octets. Un contenu composé de caractères
// astraux (4 octets chacun en UTF-8, 1 seul point de code chacun) peut donc
// passer très en dessous de `MAX_TEXT_ATTACHMENT_LENGTH` points de code tout
// en pesant NETTEMENT plus que `MAX_TEXT_ATTACHMENT_LENGTH` octets une fois
// écrit sur disque par `Buffer.from(content, 'utf-8')` — jusqu'à ~4× en pire
// cas. Ce test prouve que ce contournement est fermé : le plafond compte
// désormais des octets réels (`Buffer.byteLength`), pas des caractères.
describe('POST /attachments/upload-text — byte-based size cap, not codepoint-based (task-1-fix-round-4)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCreateTextAttachment.mockResolvedValue({ id: 'should-not-be-created' });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('rejects multi-byte content whose codepoint count passes the schema maxLength but whose UTF-8 byte weight exceeds MAX_TEXT_ATTACHMENT_LENGTH', async () => {
    mockCreateTextAttachment.mockClear();

    // 😀 (U+1F600) : exactement 1 point de code (ce qu'AJV `maxLength`
    // compte), 4 octets en UTF-8 (ce que `Buffer.byteLength`/`Buffer.from`
    // mesurent/écrivent réellement). `codepointCount` est le plus PETIT
    // nombre de points de code pour lequel le poids en octets dépasse
    // strictement le plafond, tout en restant très en dessous du plafond en
    // points de code — la preuve la plus serrée du contournement.
    const codepointCount = Math.floor(MAX_TEXT_ATTACHMENT_LENGTH / 4) + 1;
    const content = '\u{1F600}'.repeat(codepointCount);

    expect(codepointCount).toBeLessThan(MAX_TEXT_ATTACHMENT_LENGTH);
    expect(Buffer.byteLength(content, 'utf-8')).toBeGreaterThan(MAX_TEXT_ATTACHMENT_LENGTH);

    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload-text',
      payload: { content },
    });

    expect(res.statusCode).toBe(400);
    expect(mockCreateTextAttachment).not.toHaveBeenCalled();
  });
});
