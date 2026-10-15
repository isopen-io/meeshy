/**
 * #10440 — le chemin resumable (`/api/v1/uploads`) ne traverse pas
 * `middleware/auth.ts`, où #10437 a posé la garde du lien échu sur toute
 * requête d'un invité. Il la porte lui-même : un invité dont le lien a expiré
 * est refusé avant le premier octet, en 403 `SHARE_LINK_EXPIRED` — le code des
 * autres portes, jamais un 401 qui inviterait le client à rejouer sa session.
 *
 * Fichier séparé : `tus-handler.test.ts` est hors budget de taille (#4531).
 * Même méthode de capture des options passées à `@tus/server`.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import os from 'os';

type CapturedTusOptions = {
  onIncomingRequest: (req: unknown, uploadId: string) => Promise<void>;
  onUploadCreate: (req: unknown, upload: unknown) => Promise<unknown>;
};

let captured: CapturedTusOptions | null = null;

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
      return { id, metadata: { userId: 'participant-1' }, offset: 0 };
    }
  },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const TOKEN = 'anon-session-token-expired-link';
const headers = { get: (key: string) => (key.toLowerCase() === 'x-session-token' ? TOKEN : undefined) };

function prismaWithLink(expiresAt: Date | null) {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: 'participant-1', shareLinkId: 'link-1', anonymousSession: { shareLinkId: 'link-1' } }),
    },
    conversationShareLink: {
      findUnique: jest.fn<any>().mockResolvedValue({ allowAnonymousFiles: true, allowAnonymousImages: true, expiresAt }),
    },
  };
}

async function registerWith(prisma: ReturnType<typeof prismaWithLink>): Promise<CapturedTusOptions> {
  process.env.UPLOAD_PATH = os.tmpdir();
  jest.resetModules();
  const { registerTusRoutes } = await import('../tus-handler');
  await registerTusRoutes({ prisma, addContentTypeParser: jest.fn(), route: jest.fn() } as never);
  if (!captured) throw new Error('tus options not captured');
  return captured;
}

const refusalOf = (promise: Promise<unknown>) =>
  promise.then(() => null, (error: unknown) => error as { status_code: number; body: string });

describe('tus-handler — un invité au lien expiré est refusé en 403 SHARE_LINK_EXPIRED (#10440)', () => {
  beforeEach(() => {
    captured = null;
  });

  it('à la création du téléversement', async () => {
    const tus = await registerWith(prismaWithLink(new Date(Date.now() - 60_000)));

    const refusal = await refusalOf(
      tus.onUploadCreate({ headers }, { metadata: { filename: 'voice.webm', filetype: 'audio/webm' }, size: 16 })
    );

    expect(refusal?.status_code).toBe(403);
    expect(JSON.parse(refusal?.body ?? '{}').code).toBe('SHARE_LINK_EXPIRED');
  });

  it('à la reprise (PATCH/HEAD) d’un téléversement déjà commencé', async () => {
    const tus = await registerWith(prismaWithLink(new Date(Date.now() - 60_000)));

    const refusal = await refusalOf(tus.onIncomingRequest({ headers }, 'upload-1'));

    expect(refusal?.status_code).toBe(403);
    expect(JSON.parse(refusal?.body ?? '{}').code).toBe('SHARE_LINK_EXPIRED');
  });

  it('laisse reprendre le téléversement d’un invité au lien vivant', async () => {
    const tus = await registerWith(prismaWithLink(new Date(Date.now() + 60_000)));

    await expect(tus.onIncomingRequest({ headers }, 'upload-1')).resolves.toBeUndefined();
  });
});
