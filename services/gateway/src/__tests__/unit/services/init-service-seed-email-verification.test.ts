/**
 * #6581 — un compte SEMÉ naît vérifié, sinon il ne peut RIEN publier.
 *
 * `InitService` crée `meeshy`, `admin` et `atabeth` avec des adresses qui ne
 * reçoivent aucun courrier (`meeshy@meeshy.me`, `admin@meeshy.me`,
 * `atabeth@meeshy.me` — aucune boîte réelle, aucun lien de vérification
 * cliquable). Depuis #6437, `requireEmailVerification` garde `POST /posts` :
 * sans `emailVerifiedAt`, le compte de démonstration que ce service vient de
 * créer prend `403 EMAIL_NOT_VERIFIED` à sa toute première publication. Il
 * peut lire, écrire en conversation — et ne peut publier ni post, ni story,
 * ni réel, donc n'alimente jamais la bibliothèque de sons.
 *
 * Mesuré le 2026-09-15 avant ce lot : `grep -c emailVerifiedAt InitService.ts`
 * → 0.
 *
 * Tout passe par `initializeDatabase()` — l'API publique du service : ce qui
 * est vérifié est ce que le BOOT écrit, jamais la forme d'un helper interne.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

// `register()` rend un utilisateur DISTINCT par pseudo : c'est l'identifiant
// qui relie chaque `user.update` au compte semé qu'il configure.
jest.mock('../../../services/AuthService', () => ({
  AuthService: jest.fn().mockImplementation(() => ({
    register: jest.fn<any>(async (data: { username: string }) => ({
      user: { id: `user-${data.username}`, username: data.username, displayName: data.username },
    })),
  })),
}));

import { InitService } from '../../../services/InitService';

type SeededUser = { id: string; username: string; emailVerifiedAt: Date | null } | null;

/**
 * `existing` dit, par pseudo, ce que la base contient DÉJÀ. Un pseudo absent
 * de la carte n'existe pas encore : la PREMIÈRE lecture rend `null` (le seed
 * appelle alors `register()`), les suivantes rendent la ligne créée — c'est ce
 * que fait la vraie base, et `createAdminUser` relit son compte juste après
 * l'avoir créé.
 */
function makePrisma(existing: Record<string, SeededUser> = {}) {
  const registered = new Set<string>();
  const findUser = async (args: { where?: { username?: string } }): Promise<SeededUser> => {
    const username = args?.where?.username ?? '';
    const known = existing[username];
    if (known !== undefined) return known;
    if (registered.has(username)) {
      return { id: `user-${username}`, username, emailVerifiedAt: null };
    }
    registered.add(username);
    return null;
  };

  return {
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockResolvedValue({ id: 'conv-global' }),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    user: {
      findFirst: jest.fn<any>(findUser),
      findMany: jest.fn<any>().mockResolvedValue([]),
      update: jest.fn<any>().mockResolvedValue({}),
      create: jest.fn<any>().mockResolvedValue({}),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockResolvedValue({ id: 'part-1' }),
      createMany: jest.fn<any>().mockResolvedValue({}),
      update: jest.fn<any>().mockResolvedValue({}),
      count: jest.fn<any>().mockResolvedValue(1),
    },
    message: { create: jest.fn<any>().mockResolvedValue({ id: 'msg-1' }) },
    $runCommandRaw: jest.fn<any>().mockResolvedValue({}),
  };
}

type UpdateArg = { where?: { id?: string }; data?: Record<string, unknown> };

function updatesFor(prisma: ReturnType<typeof makePrisma>, userId: string): Record<string, unknown>[] {
  const calls = (prisma.user.update as jest.Mock<any>).mock.calls as unknown as UpdateArg[][];
  return calls
    .filter(([arg]) => arg?.where?.id === userId)
    .map(([arg]) => arg?.data ?? {});
}

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  process.env.NODE_ENV = 'test';
  delete process.env.FORCE_DB_RESET;
});

afterEach(() => {
  process.env = originalEnv;
});

describe('InitService — les comptes semés naissent vérifiés (#6581)', () => {
  it.each([['meeshy'], ['admin'], ['atabeth']])(
    'pose emailVerifiedAt sur le compte semé %s — sans quoi POST /posts lui rend 403 EMAIL_NOT_VERIFIED',
    async (username) => {
      const prisma = makePrisma();
      const sut = new InitService(prisma as any);

      await sut.initializeDatabase();

      const written = updatesFor(prisma, `user-${username}`);
      expect(written.length).toBeGreaterThan(0);
      expect(written.some((data) => data.emailVerifiedAt instanceof Date)).toBe(true);
    },
  );

  it('ne réécrit PAS la date d’un compte déjà vérifié — une vérification réelle ne se rejoue pas à chaque boot', async () => {
    // Mesuré en production le 2026-09-15 : `atabeth` porte
    // `2026-02-15T13:01:17.760Z`. Le boot d'un seed ne doit pas la déplacer.
    const reelle = new Date('2026-02-15T13:01:17.760Z');
    const prisma = makePrisma({
      admin: { id: 'user-admin-existant', username: 'admin', emailVerifiedAt: reelle },
    });
    const sut = new InitService(prisma as any);

    await sut.initializeDatabase();

    const written = updatesFor(prisma, 'user-admin-existant');
    expect(written.length).toBeGreaterThan(0);
    expect(written.every((data) => !('emailVerifiedAt' in data))).toBe(true);
  });

  it('rattrape un compte semé existant QUE personne n’a jamais vérifié', async () => {
    const prisma = makePrisma({
      admin: { id: 'user-admin-existant', username: 'admin', emailVerifiedAt: null },
    });
    const sut = new InitService(prisma as any);

    await sut.initializeDatabase();

    const written = updatesFor(prisma, 'user-admin-existant');
    expect(written.some((data) => data.emailVerifiedAt instanceof Date)).toBe(true);
  });
});
