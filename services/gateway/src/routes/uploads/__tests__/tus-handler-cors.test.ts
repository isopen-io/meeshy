/**
 * `registerTusRoutes` — l'option `allowedOrigins` du serveur tus (#5298).
 *
 * Fichier séparé de `tus-handler.test.ts` (1017 lignes, dette gelée par
 * `gateway-test-file-size-budget.test.ts`) : la directive interdit d'ajouter
 * à un fichier déjà hors budget avant d'en extraire. Ce témoin n'a besoin que
 * de capturer les options passées à `new Server({…})` — pas du protocole tus
 * complet, déjà couvert ailleurs.
 *
 * Avant #5298, `new Server({…})` ne recevait aucun `allowedOrigins` : le
 * `getCorsOrigin` de `@tus/server` 2.4.4 rendait `'*'` sur CHAQUE réponse
 * (`if (!allowedOrigins) return '*';`), et cette porte décidait SEULE — la
 * réponse est écrite sur `reply.raw`, jamais vue par `@fastify/cors`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

type CapturedTusOptions = { allowedOrigins?: unknown };

let captured: CapturedTusOptions | null = null;

jest.mock('@tus/server', () => ({
  Server: class MockTusServer {
    constructor(opts: any) {
      captured = opts;
    }
    handle() {
      // Plomberie du protocole TUS — hors périmètre de ce témoin.
    }
  },
}));

jest.mock('@tus/file-store', () => ({
  FileStore: class MockFileStore {
    constructor(_opts: any) {}
  },
}));

jest.mock('../../../services/attachments/MetadataManager', () => ({
  MetadataManager: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/attachments/ThumbHashGenerator', () => ({
  ThumbHashGenerator: { generate: jest.fn() },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

function buildFakeFastify(prisma: any = {}) {
  return { prisma, addContentTypeParser: jest.fn(), route: jest.fn() } as any;
}

const ORIGINAL_UPLOAD_PATH = process.env.UPLOAD_PATH;
const ORIGINAL_CORS_ORIGINS = process.env.CORS_ORIGINS;
const ORIGINAL_ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

async function importFreshTusHandler(uploadPath: string) {
  process.env.UPLOAD_PATH = uploadPath;
  jest.resetModules();
  return import('../tus-handler');
}

function restoreEnv(name: string, original: string | undefined) {
  if (original === undefined) delete process.env[name];
  else process.env[name] = original;
}

describe('registerTusRoutes — allowedOrigins du serveur tus (#5298)', () => {
  let uploadDir: string;

  beforeEach(async () => {
    captured = null;
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tus-handler-cors-test-'));
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = 'https://meeshy.me,https://gate.meeshy.me';
    delete process.env.ALLOWED_ORIGINS;
  });

  afterEach(async () => {
    await fs.rm(uploadDir, { recursive: true, force: true });
    restoreEnv('UPLOAD_PATH', ORIGINAL_UPLOAD_PATH);
    restoreEnv('CORS_ORIGINS', ORIGINAL_CORS_ORIGINS);
    restoreEnv('ALLOWED_ORIGINS', ORIGINAL_ALLOWED_ORIGINS);
    restoreEnv('NODE_ENV', ORIGINAL_NODE_ENV);
  });

  it('construit le serveur tus avec un `allowedOrigins` défini — plus de "*" implicite', async () => {
    const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
    await registerTusRoutes(buildFakeFastify());

    expect(captured).not.toBeNull();
    expect(captured!.allowedOrigins).toBeDefined();
    expect(typeof captured!.allowedOrigins).toBe('function');
  });

  it('autorise une origine déclarée dans CORS_ORIGINS, évaluée à l’appel (pas figée à la construction)', async () => {
    const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
    await registerTusRoutes(buildFakeFastify());
    const allowedOrigins = captured!.allowedOrigins as (origin: string) => boolean;

    expect(allowedOrigins('https://meeshy.me')).toBe(true);

    // La liste change après la construction — la fermeture doit la relire,
    // pas l'avoir figée : c'est ce qui distingue `originIsAllowed(origin)`
    // d'un tableau capturé une fois pour toutes.
    process.env.CORS_ORIGINS = 'https://autre.example';
    expect(allowedOrigins('https://meeshy.me')).toBe(false);
    expect(allowedOrigins('https://autre.example')).toBe(true);
  });

  it('refuse une origine hors liste', async () => {
    const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
    await registerTusRoutes(buildFakeFastify());
    const allowedOrigins = captured!.allowedOrigins as (origin: string) => boolean;

    expect(allowedOrigins('https://evil.example')).toBe(false);
  });

  it('le court-circuit de développement (NODE_ENV=development) autorise toute origine — même règle que les deux autres portes', async () => {
    process.env.NODE_ENV = 'development';
    const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
    await registerTusRoutes(buildFakeFastify());
    const allowedOrigins = captured!.allowedOrigins as (origin: string) => boolean;

    expect(allowedOrigins('https://n-importe-quoi.example')).toBe(true);
  });
});
