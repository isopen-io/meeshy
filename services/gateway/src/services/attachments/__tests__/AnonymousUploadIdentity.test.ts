import { describe, it, expect, jest, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  resolveAnonymousUploadIdentity,
  fetchShareLinkAnonymousFlags,
  readFilePrefix,
  type AnonymousUploadIdentityPrisma,
} from '../AnonymousUploadIdentity';
import { hashSessionToken } from '../../../utils/session-token';

function buildPrisma(overrides: Partial<AnonymousUploadIdentityPrisma> = {}): AnonymousUploadIdentityPrisma {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    conversationShareLink: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
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
      select: { id: true, anonymousSession: true },
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

describe('fetchShareLinkAnonymousFlags', () => {
  it('rend les drapeaux du lien quand il existe', async () => {
    const findUnique = jest.fn<any>().mockResolvedValue({ allowAnonymousFiles: false, allowAnonymousImages: true });
    const prisma = buildPrisma({ conversationShareLink: { findUnique } as any });

    const flags = await fetchShareLinkAnonymousFlags(prisma, 'sharelink-1');

    expect(flags).toEqual({ allowAnonymousFiles: false, allowAnonymousImages: true });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'sharelink-1' },
      select: { allowAnonymousFiles: true, allowAnonymousImages: true },
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
    const prisma = buildPrisma();
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
