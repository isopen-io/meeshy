/**
 * LE SEED DE RECETTE DU PUSH PHOTO (#10175, L19 — § 7) : il amène un compte de recette de STAGING à une étape de
 * Flamme, comme le jeu l'y amènerait en trente jours, puis le marque « à évaluer » pour que le job le lise. Il
 * refuse toute base, et tout Redis, qui n'est pas celui du staging : il n'écrit jamais ailleurs.
 *
 * @jest-environment node
 */
import { parsePhotoSeedArgs, seedFlameStep, stagingSeedGuard, type PhotoSeedDeps } from '../photoStagingSeed';

const STAGING_ENV = {
  DATABASE_URL: 'mongodb://database-staging:27017/meeshy?replicaSet=rs0&directConnection=true',
  REDIS_URL: 'redis://redis-staging:6379',
} as const;

const USER = '6acc48614c85e5715368063c';
const NOW = new Date('2026-10-25T03:00:00.000Z');

describe('la garde du seed : le staging, et lui seul', () => {
  it('la composition de staging passe', () => {
    expect(stagingSeedGuard(STAGING_ENV)).toEqual({ ok: true });
  });

  it.each([
    ['la production (hôte `database`)', 'mongodb://database:27017/meeshy?replicaSet=rs0'],
    ['une base locale', 'mongodb://localhost:27017/meeshy'],
    ['un hôte qui CONTIENT le nom du staging', 'mongodb://database-staging.evil.example:27017/meeshy'],
    ['un jeu de répliques qui mêle le staging et un autre hôte', 'mongodb://database-staging:27017,database:27017/meeshy'],
    ['des identifiants posés devant un autre hôte', 'mongodb://database-staging:pw@database:27017/meeshy'],
    ['un SRV', 'mongodb+srv://database-staging/meeshy'],
    ['une URL illisible', 'pas une url'],
  ])('refuse %s', (_label, url) => {
    expect(stagingSeedGuard({ ...STAGING_ENV, DATABASE_URL: url })).toEqual({ ok: false, reason: 'database-not-staging' });
  });

  it('refuse sans DATABASE_URL', () => {
    expect(stagingSeedGuard({ REDIS_URL: STAGING_ENV.REDIS_URL })).toEqual({ ok: false, reason: 'database-url-missing' });
  });

  it('refuse un Redis hors staging, ou absent : une marque perdue en mémoire ne serait jamais lue par le job', () => {
    expect(stagingSeedGuard({ ...STAGING_ENV, REDIS_URL: 'redis://redis:6379' })).toEqual({ ok: false, reason: 'redis-not-staging' });
    expect(stagingSeedGuard({ DATABASE_URL: STAGING_ENV.DATABASE_URL })).toEqual({ ok: false, reason: 'redis-url-missing' });
  });

  it('accepte des identifiants devant l’hôte du staging', () => {
    expect(
      stagingSeedGuard({ DATABASE_URL: 'mongodb://meeshy:secret@database-staging:27017/meeshy', REDIS_URL: 'redis://:pw@redis-staging:6379/0' }),
    ).toEqual({ ok: true });
  });
});

describe('les arguments : un compte et un seuil de Flamme photographiable', () => {
  it('lit `--user` et `--flame`', () => {
    expect(parsePhotoSeedArgs(['--user', USER, '--flame', '30'])).toEqual({ ok: true, userId: USER, flameDays: 30 });
  });

  it.each([
    [['--flame', '30'], 'user-missing'],
    [['--user', 'abc', '--flame', '30'], 'user-invalid'],
    [['--user', USER], 'flame-invalid'],
    [['--user', USER, '--flame', '12'], 'flame-invalid'],
    [['--user', USER, '--flame', '30.5'], 'flame-invalid'],
  ] as const)('%j ⇒ %s', (argv, reason) => {
    expect(parsePhotoSeedArgs(argv)).toEqual({ ok: false, reason });
  });
});

type UserRow = { readonly isActive: boolean; readonly deletedAt: Date | null; readonly longestStreakDays: number | null; readonly timezone?: string | null };

const harness = (row: UserRow | null) => {
  const calls: string[] = [];
  const updates: Array<Record<string, unknown>> = [];
  const selects: Array<Record<string, unknown>> = [];
  const deps: PhotoSeedDeps = {
    users: {
      findUnique: async (args) => (selects.push(args.select), row === null ? null : { timezone: null, ...row }),
      update: async (args) => {
        calls.push('update');
        updates.push(args.data);
        return { id: USER };
      },
    },
    detect: async () => {
      calls.push('detect');
    },
    marks: {
      mark: async () => {
        calls.push('mark');
      },
    },
  };
  return { deps, calls, updates, selects };
};

describe('amener le compte à l’étape de Flamme', () => {
  it('pose d’abord la ligne de base (détection), puis porte la Flamme, puis marque le compte', async () => {
    const h = harness({ isActive: true, deletedAt: null, longestStreakDays: 0 });
    expect(await seedFlameStep(h.deps, { userId: USER, flameDays: 30, now: NOW })).toBe('seeded');
    expect(h.calls).toEqual(['detect', 'update', 'mark']);
    expect(h.updates).toEqual([{ currentStreakDays: 30, longestStreakDays: 30, lastStreakDate: new Date('2026-10-25T00:00:00.000Z') }]);
  });

  it('le dernier jour actif est le jour LOCAL du compte, au marqueur que le jeu écrit (minuit UTC de sa clé)', async () => {
    const h = harness({ isActive: true, deletedAt: null, longestStreakDays: 0, timezone: 'America/Los_Angeles' });
    expect(await seedFlameStep(h.deps, { userId: USER, flameDays: 7, now: NOW })).toBe('seeded');
    expect(h.updates).toEqual([{ currentStreakDays: 7, longestStreakDays: 7, lastStreakDate: new Date('2026-10-24T00:00:00.000Z') }]);
    expect(h.selects).toEqual([expect.objectContaining({ timezone: true })]);
  });

  it('une Flamme déjà au-delà du seuil : rien n’est écrit — l’étape est déjà franchie', async () => {
    const h = harness({ isActive: true, deletedAt: null, longestStreakDays: 30 });
    expect(await seedFlameStep(h.deps, { userId: USER, flameDays: 30, now: NOW })).toBe('already-reached');
    expect(h.calls).toEqual([]);
  });

  it.each([
    ['absent', null],
    ['désactivé', { isActive: false, deletedAt: null, longestStreakDays: 0 }],
    ['supprimé', { isActive: true, deletedAt: NOW, longestStreakDays: 0 }],
  ] as const)('un compte %s : rien n’est écrit', async (_label, row) => {
    const h = harness(row);
    expect(await seedFlameStep(h.deps, { userId: USER, flameDays: 7, now: NOW })).toBe('unknown-account');
    expect(h.calls).toEqual([]);
  });
});
