/**
 * @jest-environment node
 *
 * Revue de conformité O5 (#10499) — la MESURE exemptée ne nourrit aucune
 * personnalisation. La fatigue d'impression du fil (« ce post t'a déjà été
 * montré trois fois ») lit `PostImpression` PAR COMPTE : c'est du
 * classement personnalisé, il n'a lieu que si l'analyse est consentie.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { readSeenCounts } from '../seenCounts';

type Row = {
  readonly analyticsConsentAt: Date | null;
  readonly dataProcessingConsentAt: Date | null;
  readonly analyticsConsentWithdrawnAt?: Date | null;
  readonly birthDate?: Date | null;
};

/** Le double honore le `select` : un champ que la lecture ne demande pas n'existe pas. */
const prismaWithRow = (row: Row) => {
  const groupBy = jest.fn(async () => [{ postId: 'p1', _count: { postId: 3 } }]);
  return {
    groupBy,
    prisma: {
      user: {
        findUnique: jest.fn(async ({ select }: { select: Record<string, true> }) =>
          Object.fromEntries(Object.keys(select).map((key) => [key, (row as Record<string, Date | null | undefined>)[key] ?? null]))),
      },
      postImpression: { groupBy },
    },
  };
};

const prismaWith = (consentedAt: Date | null) =>
  prismaWithRow({ analyticsConsentAt: consentedAt, dataProcessingConsentAt: consentedAt });

const yearsAgo = (years: number) => new Date(Date.now() - years * 365.25 * 24 * 3600 * 1000);

describe('readSeenCounts', () => {
  it('sans consentement d’analyse : aucune lecture de PostImpression, aucune pénalité', async () => {
    const { prisma, groupBy } = prismaWith(null);
    const counts = await readSeenCounts(prisma as never, 'u1', ['p1']);

    expect(counts.size).toBe(0);
    expect(groupBy).not.toHaveBeenCalled();
  });

  it('avec consentement : la fatigue d’impression est lue', async () => {
    const { prisma } = prismaWith(new Date('2026-01-01'));
    const counts = await readSeenCounts(prisma as never, 'u1', ['p1']);

    expect(counts.get('p1')).toBe(3);
  });

  it('#10780 — un MINEUR (moins de 15 ans) consentant n’est pas personnalisé : aucune lecture', async () => {
    const consented = new Date('2026-01-01');
    const { prisma, groupBy } = prismaWithRow({
      analyticsConsentAt: consented, dataProcessingConsentAt: consented, birthDate: yearsAgo(13),
    });
    const counts = await readSeenCounts(prisma as never, 'u1', ['p1']);

    expect(counts.size).toBe(0);
    expect(groupBy).not.toHaveBeenCalled();
  });

  it('#10780 — un RETRAIT serveur de l’analyse coupe la lecture, même consentement posé', async () => {
    const consented = new Date('2026-01-01');
    const { prisma, groupBy } = prismaWithRow({
      analyticsConsentAt: consented, dataProcessingConsentAt: consented, analyticsConsentWithdrawnAt: new Date('2026-02-01'),
    });
    const counts = await readSeenCounts(prisma as never, 'u1', ['p1']);

    expect(counts.size).toBe(0);
    expect(groupBy).not.toHaveBeenCalled();
  });

  it('#10780 — un adulte consentant est personnalisé', async () => {
    const consented = new Date('2026-01-01');
    const { prisma } = prismaWithRow({
      analyticsConsentAt: consented, dataProcessingConsentAt: consented, birthDate: yearsAgo(30),
    });
    const counts = await readSeenCounts(prisma as never, 'u1', ['p1']);

    expect(counts.get('p1')).toBe(3);
  });
});

const SRC = join(__dirname, '..', '..', '..');

const sources = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : sources(path);
  return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
});

describe('garde O5 — personne d’autre ne lit PostImpression par compte', () => {
  it('seul seenCounts.ts (gardé par le consentement) lit PostImpression filtré par userId', () => {
    const readers = sources(SRC).filter((path) => {
      const text = readFileSync(path, 'utf8');
      return /postImpression\.(groupBy|findMany|findFirst|count|aggregate)\(\s*\{[\s\S]{0,200}userId/.test(text);
    }).map((path) => path.slice(SRC.length + 1));

    // `viewImpressions.ts` (#10732) lit par compte pour l'INTÉGRITÉ du
    // compteur, jamais pour classer : « ce lecteur a-t-il déjà une impression
    // de CE post ? » (une vue implique son impression) et « porte-t-il encore
    // une impression déduite à remplacer ? ». La réponse ne quitte pas la
    // requête, ne touche aucun ordre de fil et ne nourrit aucune personnalisation.
    // #11037 : il lit aussi « l'auteur a-t-il déjà une impression de son
    // propre post ? » — la même question d'intégrité, pour ne la compter qu'une fois.
    expect(readers).toEqual(['services/posts/seenCounts.ts', 'services/social/viewImpressions.ts']);
  });
});
