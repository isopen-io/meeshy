/**
 * #6581 — un compte SEMÉ naît vérifié, sinon il ne peut RIEN publier.
 *
 * `InitService` crée `meeshy`, `admin` et `atabeth` avec des adresses qui ne
 * reçoivent aucun courrier (`meeshy@meeshy.me`, `admin@meeshy.me`,
 * `atabeth@meeshy.me` — aucune boîte réelle, aucun lien de vérification
 * cliquable). Depuis #6437, `requireEmailVerification` garde `POST /posts` :
 * sans `emailVerifiedAt`, le compte de démonstration prend
 * `403 EMAIL_NOT_VERIFIED` à sa première publication. Il peut lire, écrire en
 * conversation — et ne peut publier ni post, ni story, ni réel, donc
 * n'alimente jamais la bibliothèque de sons.
 *
 * ─── CE QUE CE FICHIER MESURE, ET POURQUOI IL A CHANGÉ ────────────────────
 *
 * Le premier jet du lot appelait `initializeDatabase()` EN DIRECT. Le témoin
 * était vert et le correctif MORT : `server.ts` ne lance `initializeDatabase()`
 * que derrière `shouldInitialize()`, dont les six lectures rendent toutes une
 * ligne sur une base de production saine — `needsInit` y est FAUX, et le seed
 * n'est jamais rejoué. Un témoin qui franchit lui-même la porte ne peut pas
 * voir qu'elle est fermée.
 *
 * Tout passe donc désormais par `bootstrapDatabase()` — la séquence de boot
 * RÉELLE, celle que `server.ts` appelle —, et la base par défaut de ce fichier
 * est une base de PRODUCTION SAINE : conversation globale présente, trois
 * comptes présents, deux participations présentes, donc `shouldInitialize()`
 * FAUX. C'est la forme sur laquelle le correctif doit agir.
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
import { bootstrapDatabase } from '../../../services/database-bootstrap';

type SeedRow = { id: string; username: string; email: string | null; emailVerifiedAt: Date | null };

const SEED_ADDRESS: Record<string, string> = {
  meeshy: 'meeshy@meeshy.me',
  admin: 'admin@meeshy.me',
  atabeth: 'atabeth@meeshy.me',
};

const USERNAMES = ['meeshy', 'admin', 'atabeth'] as const;

function seedRow(username: string, overrides: Partial<SeedRow> = {}): SeedRow {
  return {
    id: `user-${username}`,
    username,
    email: SEED_ADDRESS[username],
    emailVerifiedAt: null,
    ...overrides,
  };
}

/**
 * Une base de PRODUCTION SAINE par défaut : tout ce que `shouldInitialize()`
 * interroge existe, donc la porte est FERMÉE. `rows` remplace, pseudo par
 * pseudo, la ligne servie ; `null` retire le compte de la base.
 *
 * Une base VIDE (`empty: true`) ouvre la porte : `conversation.findFirst` rend
 * `null`, les comptes n'existent pas encore, et `register()` les crée au fil de
 * l'ensemencement — la première lecture d'un pseudo rend `null`, les suivantes
 * rendent la ligne créée, comme le ferait la vraie base.
 */
function makePrisma(opts: { rows?: Partial<Record<string, SeedRow | null>>; empty?: boolean; auditedUserIds?: string[] } = {}) {
  const { rows = {}, empty = false, auditedUserIds = [] } = opts;
  const registered = new Set<string>();

  const findUser = async (args: { where?: { username?: string } }): Promise<SeedRow | null> => {
    const username = args?.where?.username ?? '';
    if (Object.prototype.hasOwnProperty.call(rows, username)) return rows[username] ?? null;
    if (empty) {
      if (registered.has(username)) return seedRow(username);
      registered.add(username);
      return null;
    }
    return USERNAMES.includes(username as (typeof USERNAMES)[number]) ? seedRow(username) : null;
  };

  return {
    conversation: {
      findFirst: jest.fn<any>(async () => (empty ? null : { id: 'conv-global', identifier: 'meeshy' })),
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
      findFirst: jest.fn<any>(async () => (empty ? null : { id: 'part-1' })),
      create: jest.fn<any>().mockResolvedValue({ id: 'part-1' }),
      createMany: jest.fn<any>().mockResolvedValue({}),
      update: jest.fn<any>().mockResolvedValue({}),
      count: jest.fn<any>().mockResolvedValue(1),
    },
    adminAuditLog: {
      findFirst: jest.fn<any>(async (args: { where?: { userId?: string; action?: string } }) =>
        auditedUserIds.includes(args?.where?.userId ?? '') ? { id: 'audit-1' } : null),
    },
    message: { create: jest.fn<any>().mockResolvedValue({ id: 'msg-1' }) },
    $runCommandRaw: jest.fn<any>().mockResolvedValue({}),
  };
}

type UpdateArg = { where?: { id?: string }; data?: Record<string, unknown> };

function verificationsFor(prisma: ReturnType<typeof makePrisma>, userId: string): Date[] {
  const calls = (prisma.user.update as jest.Mock<any>).mock.calls as unknown as UpdateArg[][];
  return calls
    .filter(([arg]) => arg?.where?.id === userId)
    .map(([arg]) => arg?.data?.emailVerifiedAt)
    .filter((value): value is Date => value instanceof Date);
}

async function boot(prisma: ReturnType<typeof makePrisma>): Promise<void> {
  await bootstrapDatabase(new InitService(prisma as never));
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

describe('Boot — les trois comptes semés naissent vérifiés (#6581)', () => {
  it('la porte du seed est FERMÉE sur une base saine — le rattrapage ne peut pas vivre derrière elle', async () => {
    const prisma = makePrisma();

    expect(await new InitService(prisma as never).shouldInitialize()).toBe(false);
  });

  it.each(USERNAMES.map((u) => [u]))(
    'pose emailVerifiedAt sur %s au boot d’une base SAINE — la porte fermée n’y change rien',
    async (username) => {
      const prisma = makePrisma();

      await boot(prisma);

      expect(verificationsFor(prisma, `user-${username}`)).toHaveLength(1);
    },
  );

  it.each(USERNAMES.map((u) => [u]))(
    'pose emailVerifiedAt sur %s au boot d’une base VIDE — le compte fraîchement semé passe par le MÊME site',
    async (username) => {
      const prisma = makePrisma({ empty: true });

      await boot(prisma);

      expect(verificationsFor(prisma, `user-${username}`)).toHaveLength(1);
    },
  );

  it('rejoue le boot sans rien réécrire — un second démarrage est muet', async () => {
    const verifiee = new Date('2026-02-15T13:01:17.760Z');
    const prisma = makePrisma({
      rows: Object.fromEntries(USERNAMES.map((u) => [u, seedRow(u, { emailVerifiedAt: verifiee })])),
    });

    await boot(prisma);

    expect(USERNAMES.flatMap((u) => verificationsFor(prisma, `user-${u}`))).toHaveLength(0);
  });
});

describe('Boot — les trois refus de la vérification d’office (#6581)', () => {
  it('ne réécrit PAS la date d’un compte déjà vérifié — mesuré en production : atabeth porte 2026-02-15', async () => {
    const reelle = new Date('2026-02-15T13:01:17.760Z');
    const prisma = makePrisma({ rows: { atabeth: seedRow('atabeth', { emailVerifiedAt: reelle }) } });

    await boot(prisma);

    expect(verificationsFor(prisma, 'user-atabeth')).toHaveLength(0);
  });

  it('ne vérifie PAS un compte dont l’adresse a été REPURPOSÉE — production 2026-09-15 : atabeth porte zuymanto@gmail.com', async () => {
    const prisma = makePrisma({ rows: { atabeth: seedRow('atabeth', { email: 'zuymanto@gmail.com' }) } });

    await boot(prisma);

    expect(verificationsFor(prisma, 'user-atabeth')).toHaveLength(0);
    // Le pseudo est bien celui du seed : ce qui refuse est l'ADRESSE, jamais le pseudo.
    expect(verificationsFor(prisma, 'user-admin')).toHaveLength(1);
  });

  it('ne vérifie PAS un compte sur lequel un administrateur a TRANCHÉ — une dévérification motivée ne se rejoue pas en silence', async () => {
    const prisma = makePrisma({ auditedUserIds: ['user-admin'] });

    await boot(prisma);

    expect(verificationsFor(prisma, 'user-admin')).toHaveLength(0);
    expect(verificationsFor(prisma, 'user-meeshy')).toHaveLength(1);
  });

  it('ne vérifie RIEN quand le compte n’existe pas encore — aucune écriture à l’aveugle', async () => {
    // Appel DIRECT du rattrapage : une base sans aucun compte semé ouvrirait la
    // porte du seed, qui les créerait — ce n'est pas ce que ce cas mesure.
    const prisma = makePrisma({ rows: { meeshy: null, admin: null, atabeth: null } });

    await new InitService(prisma as never).ensureSeedAccountsVerified();

    expect((prisma.user.update as jest.Mock<any>).mock.calls).toHaveLength(0);
  });

  it('suit le pseudo et l’adresse CONFIGURÉS — ATABETH_USERNAME/ATABETH_EMAIL, pas les valeurs par défaut', async () => {
    process.env.ATABETH_USERNAME = 'demo';
    process.env.ATABETH_EMAIL = 'demo@meeshy.me';
    const prisma = makePrisma({
      rows: {
        demo: { id: 'user-demo', username: 'demo', email: 'demo@meeshy.me', emailVerifiedAt: null },
        atabeth: null,
      },
    });

    await boot(prisma);

    expect(verificationsFor(prisma, 'user-demo')).toHaveLength(1);
  });
});
