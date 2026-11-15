/**
 * #10493 — la porte TUS applique la loi du REST : un jeton ne téléverse que si
 * la session qu'il NOMME vit encore (`sessionAdmissionRefusal`,
 * `services/auth/session-admission.ts`).
 *
 * Avant ce lot, `resolveUploadCallerIdentity` ne lisait aucune session : un
 * jeton de session révoquée, ou le jeton du lien « ce n'était pas moi », créait
 * et reprenait des téléversements au nom du compte.
 *
 * Même plomberie que `tus-handler.test.ts` : `@tus/server` et `@tus/file-store`
 * sont doublés, les VRAIES options capturées. Les jetons sont de vrais JWT.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';
import { signRevokeAllLinkToken } from '../../../services/auth/revoke-all-link-token';

type CapturedTusOptions = {
  onIncomingRequest: (req: unknown, uploadId: string) => Promise<void>;
  onUploadCreate: (req: unknown, upload: unknown) => Promise<{ metadata?: Record<string, string> }>;
};

let captured: CapturedTusOptions | null = null;
const mockFileStoreRecords = new Map<string, { metadata?: Record<string, string> }>();

jest.mock('@tus/server', () => ({
  Server: class MockTusServer {
    constructor(opts: CapturedTusOptions) {
      captured = opts;
    }
    handle() {}
  },
}));

jest.mock('@tus/file-store', () => ({
  FileStore: class MockFileStore {
    async getUpload(id: string) {
      const record = mockFileStoreRecords.get(id);
      if (!record) throw { status_code: 404, body: 'Not found\n' };
      return { id, metadata: record.metadata, offset: 0 };
    }
  },
}));

jest.mock('../../../services/attachments/MetadataManager', () => ({
  MetadataManager: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const SECRET = 'test-secret-tus-session-admission-0123456789';
const USER_ID = '507f1f77bcf86cd799439011';
const SID = '507f1f77bcf86cd799439022';
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
const ORIGINAL_UPLOAD_PATH = process.env.UPLOAD_PATH;

type Session = { isValid: boolean; expiresAt: Date } | null;

const live = (): Session => ({ isValid: true, expiresAt: new Date(Date.now() + 3_600_000) });

function prismaWith(session: Session | Error) {
  return {
    userSession: {
      findFirst: jest.fn(async (_query: unknown) => {
        if (session instanceof Error) throw session;
        return session;
      }),
    },
  };
}

const sessionToken = (claims: Record<string, unknown> = { sid: SID }) =>
  jwt.sign({ userId: USER_ID, username: 'alice', role: 'USER', ...claims }, SECRET, { expiresIn: '24h' });

const bearer = (token: string) => {
  const map: Record<string, string> = { authorization: `Bearer ${token}` };
  return { headers: { get: (key: string) => map[key.toLowerCase()] } };
};

const UPLOAD = { metadata: { filename: 'note.webm', filetype: 'audio/webm' }, size: 16 };

async function tusOptions(prisma: ReturnType<typeof prismaWith>, uploadDir: string): Promise<CapturedTusOptions> {
  process.env.UPLOAD_PATH = uploadDir;
  jest.resetModules();
  const { registerTusRoutes } = await import('../tus-handler');
  await registerTusRoutes({ prisma, addContentTypeParser: jest.fn(), route: jest.fn() } as never);
  if (!captured) throw new Error('options TUS non capturées');
  return captured;
}

async function refusal(run: () => Promise<unknown>): Promise<{ status_code?: number } | null> {
  try {
    await run();
    return null;
  } catch (thrown) {
    return thrown as { status_code?: number };
  }
}

describe('TUS — la session nommée par le jeton doit vivre, comme au REST (#10493)', () => {
  let uploadDir: string;

  beforeEach(async () => {
    captured = null;
    mockFileStoreRecords.clear();
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tus-session-admission-'));
    process.env.JWT_SECRET = SECRET;
  });

  afterEach(async () => {
    await fs.rm(uploadDir, { recursive: true, force: true });
    if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
    if (ORIGINAL_UPLOAD_PATH === undefined) delete process.env.UPLOAD_PATH;
    else process.env.UPLOAD_PATH = ORIGINAL_UPLOAD_PATH;
  });

  it('crée le téléversement quand la session nommée vit', async () => {
    const prisma = prismaWith(live());
    const tus = await tusOptions(prisma, uploadDir);

    const created = await tus.onUploadCreate(bearer(sessionToken()), UPLOAD);

    expect(created.metadata?.userId).toBe(USER_ID);
    expect(prisma.userSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SID, userId: USER_ID } })
    );
  });

  it.each([
    ['sans `sid`', live(), () => sessionToken({})],
    ['au `sid` inconnu', null, () => sessionToken()],
    ['au `sid` révoqué', { isValid: false, expiresAt: new Date(Date.now() + 3_600_000) }, () => sessionToken()],
    ['au `sid` échu', { isValid: true, expiresAt: new Date(Date.now() - 1) }, () => sessionToken()],
    ["du lien « ce n'était pas moi », ancienne forme", live(), () =>
      jwt.sign({ userId: USER_ID, action: 'revoke-all' }, SECRET, { expiresIn: '24h' })],
    ["du lien « ce n'était pas moi », nouvelle forme", live(), () =>
      signRevokeAllLinkToken({ userId: USER_ID, jwtSecret: SECRET })],
  ])('refuse en 401 la création par un jeton %s', async (_cas, session, token) => {
    const tus = await tusOptions(prismaWith(session), uploadDir);

    const refus = await refusal(() => tus.onUploadCreate(bearer(token()), UPLOAD));

    expect(refus?.status_code).toBe(401);
  });

  it('refuse en 401 la REPRISE d’un téléversement par un jeton dont la session a été révoquée depuis', async () => {
    mockFileStoreRecords.set('upload-1', { metadata: { userId: USER_ID } });
    const tus = await tusOptions(prismaWith({ isValid: false, expiresAt: new Date(Date.now() + 3_600_000) }), uploadDir);

    const refus = await refusal(() => tus.onIncomingRequest(bearer(sessionToken()), 'upload-1'));

    expect(refus?.status_code).toBe(401);
  });

  it('rend 503, jamais 401, quand la lecture de session lève', async () => {
    const tus = await tusOptions(prismaWith(new Error('mongo indisponible')), uploadDir);

    const refus = await refusal(() => tus.onUploadCreate(bearer(sessionToken()), UPLOAD));

    expect(refus?.status_code).toBe(503);
  });
});
