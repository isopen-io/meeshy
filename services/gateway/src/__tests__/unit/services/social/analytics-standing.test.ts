/**
 * @jest-environment node
 *
 * #10499 — les trois situations d'un COMPTE devant l'analyse, lues par la
 * passerelle : `granted` (seul le serveur accorde), `denied` (le client OU un
 * retrait serveur refusent), `not_granted` (rien n'a été tranché). Le double
 * honore le `select` : un champ que la lecture ne demande pas n'existe pas.
 */
import { describe, it, expect } from '@jest/globals';
import { readAnalyticsStanding } from '../../../../services/social/eventPrivacy';

const USER = '507f1f77bcf86cd799439011';
const DATE = new Date('2026-01-01');

const prismaWith = (row: Record<string, Date | null>) => ({
  user: {
    findUnique: async ({ select }: { select: Record<string, true> }) =>
      Object.fromEntries(Object.keys(select).map((key) => [key, row[key] ?? null])),
  },
});

describe('readAnalyticsStanding', () => {
  it('analyse et traitement posés ⇒ granted', async () => {
    const prisma = prismaWith({ analyticsConsentAt: DATE, dataProcessingConsentAt: DATE });
    expect(await readAnalyticsStanding(prisma as never, USER, 'unknown')).toBe('granted');
  });

  it('un retrait serveur ⇒ denied, même si le client dit granted', async () => {
    const prisma = prismaWith({ analyticsConsentAt: null, dataProcessingConsentAt: DATE, analyticsConsentWithdrawnAt: DATE });
    expect(await readAnalyticsStanding(prisma as never, USER, 'granted')).toBe('denied');
  });

  it('rien de tranché ⇒ not_granted, quoi que dise le client', async () => {
    const prisma = prismaWith({});
    expect(await readAnalyticsStanding(prisma as never, USER, 'granted')).toBe('not_granted');
    expect(await readAnalyticsStanding(prisma as never, USER, 'unknown')).toBe('not_granted');
    expect(await readAnalyticsStanding(prisma as never, USER, undefined)).toBe('not_granted');
  });

  it('le client qui refuse ⇒ denied, même consenti côté serveur', async () => {
    const prisma = prismaWith({ analyticsConsentAt: DATE, dataProcessingConsentAt: DATE });
    expect(await readAnalyticsStanding(prisma as never, USER, 'denied')).toBe('denied');
  });
});
