import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PackGrants } from '../../../services/packs/PackGrants';

type Row = Record<string, unknown>;

const USER = '68c000000000000000000001';
const OTHER = '68c000000000000000000002';
const AT = new Date('2026-10-21T09:00:00.000Z');
const PACK = { domain: 'wallpaper', slug: 'prestige' } as const;

const uniqueViolation = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

const world = (seed: { glory?: number; trophies?: string[]; seasons?: { number: number; stars: number }[]; mythic?: boolean } = {}) => {
  const ownerships: Row[] = [];
  const reads: string[] = [];
  const prisma = {
    userPackOwnership: {
      findUnique: async ({ where }: { where: { userId_packKey: { userId: string; packKey: string } } }) =>
        ownerships.find((row) => row.userId === where.userId_packKey.userId && row.packKey === where.userId_packKey.packKey) ?? null,
      create: async ({ data }: { data: Row }) => {
        if (ownerships.some((row) => row.userId === data.userId && row.packKey === data.packKey)) throw uniqueViolation();
        ownerships.push({ ...data });
        return data;
      },
    },
    gloryLedger: {
      aggregate: async () => {
        reads.push('glory');
        return { _sum: { delta: seed.glory ?? 0 } };
      },
    },
    mythicSeat: {
      findUnique: async () => (seed.mythic === true ? { number: 7, edition: 1 } : null),
    },
    gameTrophy: {
      findMany: async ({ where }: { where: { userId: string; key: string } }) => {
        reads.push('trophy');
        return where.userId === USER ? (seed.trophies ?? []).filter((key) => key === where.key).map((key) => ({ key })) : [];
      },
    },
    gameSeason: {
      findMany: async ({ where }: { where: { userId: string; number: number; stars: { gt: number } } }) => {
        reads.push('season');
        return where.userId === USER ? (seed.seasons ?? []).filter((season) => season.number === where.number && season.stars > where.stars.gt).map(({ number }) => ({ number })) : [];
      },
    },
  };
  return { grants: new PackGrants({ prisma: prisma as unknown as PrismaClient, now: () => AT }), ownerships, reads };
};

describe('PackGrants — un pack se possède par le jeu, un octroi ou un événement', () => {
  it('un octroi écrit une possession SANS dépense : source grant, prix 0, aucune requête de dépense', async () => {
    const { grants, ownerships } = world();

    const outcome = await grants.award({ userId: USER, pack: PACK, award: { source: 'grant', reference: 'support-4821' } });

    expect(outcome).toBe('granted');
    expect(ownerships).toEqual([{ userId: USER, packKey: 'wallpaper.prestige', source: 'grant', reference: 'support-4821', priceMeeshes: 0, acquiredAt: AT }]);
    expect(ownerships[0]).not.toHaveProperty('requestId');
  });

  it('RETOUR ARRIÈRE : chaque voie sans achat écrit un prix 0, que le schéma d’avant (priceMeeshes requis) relit sans lever', async () => {
    const { grants, ownerships } = world({ glory: 40_000 });

    await grants.award({ userId: USER, pack: PACK, award: { source: 'grant', reference: 'support' } });
    await grants.award({ userId: USER, pack: { domain: 'banner', slug: 'coupe' }, award: { source: 'event', reference: 'fete' } });
    await grants.award({ userId: USER, pack: { domain: 'glory-frame', slug: 'or' }, award: { source: 'game', rule: { kind: 'rank', rank: 'conteur' } } });

    expect(ownerships.map((row) => [row.source, row.priceMeeshes])).toEqual([['grant', 0], ['event', 0], ['game', 0]]);
  });

  it('un événement écrit la source event, et la clé est celle du domaine (stickers : le slug nu)', async () => {
    const { grants, ownerships } = world();

    await grants.award({ userId: USER, pack: { domain: 'sticker', slug: 'fete' }, award: { source: 'event', reference: 'fete-2026' } });

    expect(ownerships).toMatchObject([{ packKey: 'fete', source: 'event', reference: 'fete-2026' }]);
  });

  it('IDEMPOTENT : rejouer l’octroi n’écrit rien de plus et dit déjà possédé', async () => {
    const { grants, ownerships } = world();
    const award = { source: 'grant', reference: 'support-4821' } as const;

    const first = await grants.award({ userId: USER, pack: PACK, award });
    const replay = await grants.award({ userId: USER, pack: PACK, award });

    expect([first, replay]).toEqual(['granted', 'already-owned']);
    expect(ownerships).toHaveLength(1);
  });

  it('IDEMPOTENT sous course : la violation d’unicité d’une écriture concurrente est un « déjà possédé », jamais une erreur', async () => {
    const { grants, ownerships } = world();
    const award = { source: 'event', reference: 'fete-2026' } as const;

    const outcomes = await Promise.all([grants.award({ userId: USER, pack: PACK, award }), grants.award({ userId: USER, pack: PACK, award })]);

    expect([...outcomes].sort()).toEqual(['already-owned', 'granted']);
    expect(ownerships).toHaveLength(1);
  });

  it('un pack déjà ACHETÉ n’est pas réécrit par un octroi : la ligne d’achat garde sa source et son prix', async () => {
    const { grants, ownerships } = world();
    ownerships.push({ userId: USER, packKey: 'wallpaper.prestige', priceMeeshes: 50, requestId: 'achat-1', source: 'purchase', acquiredAt: AT });

    const outcome = await grants.award({ userId: USER, pack: PACK, award: { source: 'grant', reference: 'support' } });

    expect(outcome).toBe('already-owned');
    expect(ownerships).toEqual([expect.objectContaining({ priceMeeshes: 50, source: 'purchase' })]);
  });

  it('rang : la règle est évaluée SERVEUR sur la Gloire du compte — rang insuffisant, rien n’est écrit', async () => {
    const poor = world({ glory: 1000 });
    const rich = world({ glory: 40_000 });
    const rule = { kind: 'rank', rank: 'conteur' } as const;

    expect(await poor.grants.award({ userId: USER, pack: PACK, award: { source: 'game', rule } })).toBe('not-eligible');
    expect(poor.ownerships).toEqual([]);
    expect(await rich.grants.award({ userId: USER, pack: PACK, award: { source: 'game', rule } })).toBe('granted');
    expect(rich.ownerships).toEqual([expect.objectContaining({ source: 'game', reference: 'rank:conteur' })]);
  });

  it('rang : une place de Mythe ouvre toute règle de rang, même sous le seuil de Gloire', async () => {
    const { grants } = world({ glory: 0, mythic: true });

    expect(await grants.award({ userId: USER, pack: PACK, award: { source: 'game', rule: { kind: 'rank', rank: 'legende' } } })).toBe('granted');
  });

  it('trophée : la clé doit être gravée pour CE compte, pas pour un autre', async () => {
    const { grants, ownerships } = world({ trophies: ['season-cup:3'] });
    const rule = { kind: 'trophy', key: 'season-cup:3' } as const;

    expect(await grants.award({ userId: OTHER, pack: PACK, award: { source: 'game', rule } })).toBe('not-eligible');
    expect(await grants.award({ userId: USER, pack: PACK, award: { source: 'game', rule } })).toBe('granted');
    expect(ownerships).toEqual([expect.objectContaining({ userId: USER, reference: 'trophy:season-cup:3' })]);
  });

  it('saison : seule une saison JOUÉE (au moins une étoile) ouvre le pack', async () => {
    const { grants } = world({ seasons: [{ number: 1, stars: 0 }, { number: 2, stars: 12 }] });

    expect(await grants.award({ userId: USER, pack: PACK, award: { source: 'game', rule: { kind: 'season', number: 1 } } })).toBe('not-eligible');
    expect(await grants.award({ userId: USER, pack: PACK, award: { source: 'game', rule: { kind: 'season', number: 3 } } })).toBe('not-eligible');
    expect(await grants.award({ userId: USER, pack: PACK, award: { source: 'game', rule: { kind: 'season', number: 2 } } })).toBe('granted');
  });

  it('ne lit que les faits de la règle demandée (un octroi ne lit rien du jeu)', async () => {
    const { grants, reads } = world({ trophies: ['season-cup:3'] });

    await grants.award({ userId: USER, pack: PACK, award: { source: 'grant', reference: 'support' } });
    await grants.award({ userId: USER, pack: { domain: 'banner', slug: 'coupe' }, award: { source: 'game', rule: { kind: 'trophy', key: 'season-cup:3' } } });

    expect(reads).toEqual(['trophy']);
  });
});
