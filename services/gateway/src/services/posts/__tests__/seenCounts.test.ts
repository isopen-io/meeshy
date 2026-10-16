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

const prismaWith = (consentedAt: Date | null) => {
  const groupBy = jest.fn(async () => [{ postId: 'p1', _count: { postId: 3 } }]);
  return {
    groupBy,
    prisma: {
      user: { findUnique: jest.fn(async () => ({ analyticsConsentAt: consentedAt, dataProcessingConsentAt: consentedAt })) },
      postImpression: { groupBy },
    },
  };
};

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
    expect(readers).toEqual(['services/posts/seenCounts.ts', 'services/social/viewImpressions.ts']);
  });
});
