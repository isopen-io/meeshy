/**
 * `resolveSystemLanguageVariants` / `buildBroadcastRecipientFilter` — #5161.
 *
 * `User.systemLanguage` est persisté VERBATIM (région/casse variables) alors
 * que le ciblage d'une diffusion admin se choisit parmi des codes CANONIQUES.
 * Ces témoins prouvent que le filtre `in` s'élargit aux variantes verbatim
 * dont le repli canonique matche un code demandé, et qu'il exclut tout ce qui
 * ne matche pas — même SSOT `normalizeLanguageForDedup` que #5146/#5155.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  resolveSystemLanguageVariants,
  buildBroadcastRecipientFilter,
} from '../../../jobs/broadcast-recipients';

function makeUserClient(rows: readonly { systemLanguage: string | null }[]) {
  return { user: { findMany: jest.fn<any>().mockResolvedValue(rows) } };
}

describe('resolveSystemLanguageVariants', () => {
  it('returns [] without querying the database when no canonical language is requested', async () => {
    const prisma = makeUserClient([{ systemLanguage: 'fr' }]);

    const result = await resolveSystemLanguageVariants(prisma as any, []);

    expect(result).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('expands a canonical code to every verbatim variant that normalizes to it', async () => {
    const prisma = makeUserClient([
      { systemLanguage: 'fr' },
      { systemLanguage: 'FR' },
      { systemLanguage: 'fr-FR' },
      { systemLanguage: 'fr_FR' },
      { systemLanguage: 'en' },
    ]);

    const result = await resolveSystemLanguageVariants(prisma as any, ['fr']);

    expect(result.sort()).toEqual(['FR', 'fr', 'fr-FR', 'fr_FR']);
  });

  it('never includes a verbatim value that normalizes to a different language', async () => {
    // 'fil' (Filipino) ne doit JAMAIS matcher 'fi' (Finnois) par troncature —
    // même garde que normalizeLanguageCode.
    const prisma = makeUserClient([{ systemLanguage: 'fil' }, { systemLanguage: 'fi' }]);

    const result = await resolveSystemLanguageVariants(prisma as any, ['fi']);

    expect(result).toEqual(['fi']);
  });

  it('queries only distinct, non-null systemLanguage values', async () => {
    const prisma = makeUserClient([{ systemLanguage: 'fr' }]);

    await resolveSystemLanguageVariants(prisma as any, ['fr']);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { systemLanguage: { not: null } },
        distinct: ['systemLanguage'],
      }),
    );
  });
});

describe('buildBroadcastRecipientFilter', () => {
  it('builds an `in` filter from the expanded verbatim variants, not the literal canonical codes', async () => {
    const prisma = makeUserClient([
      { systemLanguage: 'fr' },
      { systemLanguage: 'FR' },
      { systemLanguage: 'en' },
    ]);

    const filter = await buildBroadcastRecipientFilter(prisma as any, { languages: ['fr'] });

    expect((filter.systemLanguage as { in: string[] }).in.sort()).toEqual(['FR', 'fr']);
  });

  it('omits systemLanguage entirely when no language targeting is set', async () => {
    const prisma = makeUserClient([]);

    const filter = await buildBroadcastRecipientFilter(prisma as any, {});

    expect(filter).not.toHaveProperty('systemLanguage');
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('still carries isActive/deletedAt and country/activity filters alongside the expanded languages', async () => {
    const prisma = makeUserClient([{ systemLanguage: 'fr' }]);
    const now = new Date('2026-09-05T00:00:00Z');

    const filter = await buildBroadcastRecipientFilter(
      prisma as any,
      { languages: ['fr'], countries: ['FR'], activityStatus: 'active' },
      now,
    );

    expect(filter).toEqual(
      expect.objectContaining({
        isActive: true,
        deletedAt: null,
        systemLanguage: { in: ['fr'] },
        registrationCountry: { in: ['FR'] },
        lastActiveAt: { gte: expect.any(Date) },
      }),
    );
  });
});
