import { describe, it, expect, jest, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  resolveAnonymousUploadIdentity,
  fetchShareLinkAnonymousFlags,
  GuestUploadAccessRevokedError,
  guestAccessRevokedTusRefusal,
  shareLinkExpiredTusRefusal,
  readFilePrefix,
  type AnonymousUploadIdentityPrisma,
} from '../AnonymousUploadIdentity';
import { hashSessionToken } from '../../../utils/session-token';
import { ShareLinkExpiredError } from '../../shareLinkReadGate';

function buildPrisma(overrides: Partial<AnonymousUploadIdentityPrisma> = {}): AnonymousUploadIdentityPrisma {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    conversationShareLink: {
      // Un lien VIVANT par défaut : un invité dont le lien n'existe plus est
      // refusé (#10492), ce que ses propres témoins couvrent.
      findUnique: jest.fn<any>().mockResolvedValue({ expiresAt: null, isActive: true, guestRevocationPendingAt: null }),
    },
    ...overrides,
  } as unknown as AnonymousUploadIdentityPrisma;
}

describe('resolveAnonymousUploadIdentity', () => {
  it('résout un jeton de session valide en identité réelle (participantId + shareLinkId)', async () => {
    const rawToken = 'anon_session_token_abc';
    const findFirst = jest.fn<any>().mockResolvedValue({
      id: 'participant-1',
      anonymousSession: { shareLinkId: 'sharelink-1' },
    });
    const prisma = buildPrisma({ participant: { findFirst } as any });

    const identity = await resolveAnonymousUploadIdentity(prisma, rawToken);

    expect(identity).toEqual({ participantId: 'participant-1', shareLinkId: 'sharelink-1' });
  });

  it('interroge par sessionTokenHash — jamais le jeton brut — comme AuthMiddleware.createAnonymousUserContext', async () => {
    const rawToken = 'anon_session_token_abc';
    const findFirst = jest.fn<any>().mockResolvedValue({ id: 'p-1', anonymousSession: { shareLinkId: 's-1' } });
    const prisma = buildPrisma({ participant: { findFirst } as any });

    await resolveAnonymousUploadIdentity(prisma, rawToken);

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        sessionTokenHash: hashSessionToken(rawToken),
        type: 'anonymous',
        isActive: true,
      },
      select: { id: true, shareLinkId: true, anonymousSession: true, joinedAt: true, bannedAt: true },
    });
  });

  it('rend null quand aucun participant actif ne correspond — jamais le jeton brut comme identité de repli', async () => {
    const prisma = buildPrisma();
    const identity = await resolveAnonymousUploadIdentity(prisma, 'garbage-or-forged-token');
    expect(identity).toBeNull();
  });

  it('rend shareLinkId vide (pas une exception) quand anonymousSession est absent', async () => {
    const findFirst = jest.fn<any>().mockResolvedValue({ id: 'p-2', anonymousSession: null });
    const prisma = buildPrisma({ participant: { findFirst } as any });

    const identity = await resolveAnonymousUploadIdentity(prisma, 'token');

    expect(identity).toEqual({ participantId: 'p-2', shareLinkId: '' });
  });
});

/**
 * #10440 — le chemin resumable (`/api/v1/uploads`) ne passe pas par
 * `middleware/auth.ts`, où #10437 a posé la garde du lien échu : un invité au
 * lien expiré y téléversait encore. La résolution d'identité de ce chemin
 * applique désormais la même garde, et lève la même cause typée.
 */
describe('resolveAnonymousUploadIdentity — un lien expiré ferme le chemin resumable (#10440)', () => {
  const guest = (link: { shareLinkId?: string; session?: string }) =>
    jest.fn<any>().mockResolvedValue({
      id: 'p-guest',
      shareLinkId: link.shareLinkId ?? null,
      anonymousSession: link.session ? { shareLinkId: link.session } : null,
    });

  it('refuse un invité dont le lien (colonne) a expiré', async () => {
    const findUnique = jest.fn<any>().mockResolvedValue({ expiresAt: new Date(Date.now() - 60_000) });
    const prisma = buildPrisma({ participant: { findFirst: guest({ shareLinkId: 'link-col' }) } as any, conversationShareLink: { findUnique } as any });

    await expect(resolveAnonymousUploadIdentity(prisma, 'token')).rejects.toBeInstanceOf(ShareLinkExpiredError);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'link-col' }, select: expect.objectContaining({ expiresAt: true }) });
  });

  it('refuse un invité dont le lien (session embarquée) a expiré', async () => {
    const findUnique = jest.fn<any>().mockResolvedValue({ expiresAt: new Date(Date.now() - 60_000) });
    const prisma = buildPrisma({ participant: { findFirst: guest({ session: 'link-emb' }) } as any, conversationShareLink: { findUnique } as any });

    await expect(resolveAnonymousUploadIdentity(prisma, 'token')).rejects.toBeInstanceOf(ShareLinkExpiredError);
  });

  it('admet un invité au lien vivant ou sans échéance', async () => {
    const findUnique = jest.fn<any>()
      .mockResolvedValueOnce({ expiresAt: new Date(Date.now() + 60_000) })
      .mockResolvedValueOnce({ expiresAt: null });
    const prisma = buildPrisma({ participant: { findFirst: guest({ shareLinkId: 'link-col' }) } as any, conversationShareLink: { findUnique } as any });

    await expect(resolveAnonymousUploadIdentity(prisma, 'token')).resolves.toEqual({ participantId: 'p-guest', shareLinkId: 'link-col' });
    await expect(resolveAnonymousUploadIdentity(prisma, 'token')).resolves.toEqual({ participantId: 'p-guest', shareLinkId: 'link-col' });
  });

  it('propage une lecture du lien qui échoue — fail-closed, jamais une identité servie', async () => {
    const findUnique = jest.fn<any>().mockRejectedValue(new Error('mongo down'));
    const prisma = buildPrisma({ participant: { findFirst: guest({ shareLinkId: 'link-col' }) } as any, conversationShareLink: { findUnique } as any });

    await expect(resolveAnonymousUploadIdentity(prisma, 'token')).rejects.toThrow('mongo down');
  });

  it('le refus rendu par @tus/server est le 403 SHARE_LINK_EXPIRED des autres portes', () => {
    const refusal = shareLinkExpiredTusRefusal();

    expect(refusal.status_code).toBe(403);
    expect(JSON.parse(refusal.body)).toEqual({
      success: false,
      error: 'This share link has expired',
      message: 'This share link has expired',
      code: 'SHARE_LINK_EXPIRED',
    });
  });
});

describe('fetchShareLinkAnonymousFlags', () => {
  it('rend les drapeaux du lien quand il existe', async () => {
    const findUnique = jest.fn<any>().mockResolvedValue({ allowAnonymousFiles: false, allowAnonymousImages: true });
    const prisma = buildPrisma({ conversationShareLink: { findUnique } as any });

    const flags = await fetchShareLinkAnonymousFlags(prisma, 'sharelink-1');

    expect(flags).toEqual({ allowAnonymousFiles: false, allowAnonymousImages: true });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'sharelink-1' },
      select: { allowAnonymousFiles: true, allowAnonymousImages: true, allowedAttachmentKinds: true, conversation: { select: { identifier: true } }, expiresAt: true, isActive: true, guestRevocationPendingAt: true },
    });
  });

  it('rend null sans interroger Prisma quand shareLinkId est vide', async () => {
    const findUnique = jest.fn<any>().mockResolvedValue({ allowAnonymousFiles: true, allowAnonymousImages: true });
    const prisma = buildPrisma({ conversationShareLink: { findUnique } as any });

    const flags = await fetchShareLinkAnonymousFlags(prisma, '');

    expect(flags).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rend null quand le lien n\'existe plus', async () => {
    const prisma = buildPrisma({ conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) } as any });
    const flags = await fetchShareLinkAnonymousFlags(prisma, 'deleted-link');
    expect(flags).toBeNull();
  });
});

describe('readFilePrefix', () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  });

  it('lit exactement les N premiers octets d\'un fichier plus grand que N', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sig-prefix-'));
    const filePath = path.join(dir, 'big.bin');
    await fs.writeFile(filePath, Buffer.concat([Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]), Buffer.alloc(1000)]));

    const prefix = await readFilePrefix(filePath, 4);

    expect(prefix).toEqual(Buffer.from([1, 2, 3, 4]));
  });

  it('rend un buffer plus court que N sans lever quand le fichier est plus petit', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sig-prefix-'));
    const filePath = path.join(dir, 'small.bin');
    await fs.writeFile(filePath, Buffer.from([9, 9, 9]));

    const prefix = await readFilePrefix(filePath, 64);

    expect(prefix).toEqual(Buffer.from([9, 9, 9]));
  });

  it('rend un buffer vide pour un fichier vide', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sig-prefix-'));
    const filePath = path.join(dir, 'empty.bin');
    await fs.writeFile(filePath, Buffer.alloc(0));

    const prefix = await readFilePrefix(filePath, 32);

    expect(prefix.length).toBe(0);
  });
});

describe('resolveAnonymousUploadIdentity — la garde commune d’un invité ferme aussi le chemin resumable (#10470)', () => {
  const CLOSED_AT = new Date('2026-10-13T09:30:00Z');
  const guestJoined = (joinedAt: Date, extra: Record<string, unknown> = {}) =>
    jest.fn<any>().mockResolvedValue({ id: 'p-guest', shareLinkId: 'link-col', anonymousSession: null, joinedAt, bannedAt: null, ...extra });

  it('refuse un invité entré avant la marque d’un lien rouvert', async () => {
    const findFirst = guestJoined(new Date('2026-10-13T09:00:00Z'));
    const findUnique = jest.fn<any>().mockResolvedValue({ expiresAt: null, isActive: true, guestRevocationPendingAt: CLOSED_AT });
    const prisma = buildPrisma({ participant: { findFirst } as any, conversationShareLink: { findUnique } as any });

    await expect(resolveAnonymousUploadIdentity(prisma, 'token')).rejects.toBeInstanceOf(GuestUploadAccessRevokedError);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ joinedAt: true, bannedAt: true }) }));
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ isActive: true, guestRevocationPendingAt: true }),
    }));
  });

  it('refuse un invité dont le lien est fermé, et un invité banni', async () => {
    const closed = buildPrisma({
      participant: { findFirst: guestJoined(new Date('2026-10-13T09:45:00Z')) } as any,
      conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue({ expiresAt: null, isActive: false }) } as any,
    });
    const banned = buildPrisma({
      participant: { findFirst: guestJoined(new Date('2026-10-13T09:45:00Z'), { bannedAt: CLOSED_AT }) } as any,
      conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue({ expiresAt: null, isActive: true }) } as any,
    });

    await expect(resolveAnonymousUploadIdentity(closed, 'token')).rejects.toBeInstanceOf(GuestUploadAccessRevokedError);
    await expect(resolveAnonymousUploadIdentity(banned, 'token')).rejects.toBeInstanceOf(GuestUploadAccessRevokedError);
  });

  // #10492 — le refus tel que `@tus/server` le renvoie : le 410 des autres portes, jamais un 401 qui se rejoue.
  it('le refus d’un accès fini est un 410 GUEST_ACCESS_REVOKED dans l’enveloppe de l’API', () => {
    const refusal = guestAccessRevokedTusRefusal();

    expect(refusal.status_code).toBe(410);
    expect(JSON.parse(refusal.body)).toMatchObject({ success: false, error: 'GUEST_ACCESS_REVOKED', code: 'GUEST_ACCESS_REVOKED' });
  });

  it('admet un invité entré après la réouverture', async () => {
    const prisma = buildPrisma({
      participant: { findFirst: guestJoined(new Date('2026-10-13T09:45:00Z')) } as any,
      conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue({ expiresAt: null, isActive: true, guestRevocationPendingAt: CLOSED_AT }) } as any,
    });

    await expect(resolveAnonymousUploadIdentity(prisma, 'token')).resolves.toEqual({ participantId: 'p-guest', shareLinkId: 'link-col' });
  });
});
