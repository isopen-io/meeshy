/**
 * LE PSEUDONYME DE LIGUE (#9384, conformité A-4, A-5) — tiré au CSPRNG, stocké,
 * unique sous sa forme pliée, renouvelé à la saison ; le nom choisi est fermé
 * par défaut et filtré quand il s'ouvre.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { GameRefusal } from '../GameRefusal';
import { LeaguePseudonymService, pseudonymKeyOf } from '../LeaguePseudonymService';
import { fakeGameDb, seedUser, USER, OTHER } from './fakeGameDb';

const draws = (...values: number[]) => {
  const queue = [...values];
  return () => queue.shift() ?? 999_999;
};

const setup = (deps: ConstructorParameters<typeof LeaguePseudonymService>[1] = {}, user: Record<string, unknown> = {}) => {
  const db = fakeGameDb();
  seedUser(db, { username: 'marie_d', firstName: 'Marie', lastName: 'Dupont', email: 'marie.dupont@example.com', phoneNumber: '+33612345678', ...user }, USER);
  seedUser(db, { username: 'paul' }, OTHER);
  return { db, service: new LeaguePseudonymService(db.prisma, deps) };
};

describe('le pseudonyme tiré', () => {
  it('vient du tirage, est stocké, et reste le même dans la saison', async () => {
    const { service } = setup({ draw: draws(12345, 777) });
    const first = await service.ensure(USER, new Date('2026-10-14T00:00:00Z'));
    const again = await service.ensure(USER, new Date('2026-11-20T00:00:00Z'));
    expect(first).toBe('Colibri-09ix');
    expect(again).toBe(first);
  });

  it('se renouvelle à la saison suivante', async () => {
    const { service } = setup({ draw: draws(1, 2) });
    const season1 = await service.ensure(USER, new Date('2026-10-14T00:00:00Z'));
    const season2 = await service.ensure(USER, new Date('2026-12-14T00:00:00Z'));
    expect(season2).not.toBe(season1);
  });

  it('un tirage déjà pris se retire (unicité sur la forme pliée)', async () => {
    const { service } = setup({ draw: draws(5, 5, 6) });
    const mine = await service.ensure(USER);
    const other = await service.ensure(OTHER);
    expect(mine).toBe('Colibri-0005');
    expect(other).toBe('Colibri-0006');
  });

  it('refuse un tirage non fini : jamais Colibri-0000 pour tout le monde', async () => {
    const { service } = setup({ draw: () => Number.NaN });
    await expect(service.ensure(USER)).rejects.toThrow('whole number');
  });

  it('n’est jamais calculé depuis l’identifiant du compte : deux comptes tirent des noms indépendants du compte', async () => {
    const { service } = setup({ draw: draws(1000, 1000, 1001) });
    const a = await service.ensure(USER);
    const b = await service.ensure(OTHER);
    expect(a).not.toContain(USER.slice(-4));
    expect(b).not.toBe(a);
  });
});

describe('le nom choisi', () => {
  it('est FERMÉ par défaut (A-5 : ni filtre, ni signalement, ni recours)', async () => {
    const { service } = setup();
    await expect(service.choose({ userId: USER, value: 'LeFlambeur' })).rejects.toMatchObject({ code: 'LEAGUE_PSEUDONYM_FORBIDDEN', details: { reason: 'custom-closed' } });
  });

  it('ouvert : une forme invalide, un nom réservé, l’identité sont refusés avec leur motif', async () => {
    const { service } = setup({ customAllowed: () => true });
    await expect(service.choose({ userId: USER, value: 'a' })).rejects.toMatchObject({ code: 'LEAGUE_PSEUDONYM_INVALID' });
    await expect(service.choose({ userId: USER, value: 'Meeshy' })).rejects.toMatchObject({ code: 'LEAGUE_PSEUDONYM_FORBIDDEN', details: { reason: 'reserved' } });
    await expect(service.choose({ userId: USER, value: 'Marie.Dupont' })).rejects.toMatchObject({ code: 'LEAGUE_PSEUDONYM_FORBIDDEN', details: { reason: 'identity' } });
    await expect(service.choose({ userId: USER, value: 'marie_d' })).rejects.toMatchObject({ code: 'LEAGUE_PSEUDONYM_FORBIDDEN' });
  });

  it('ouvert : la partie locale de l’e-mail et le numéro sont dans la liste interdite', async () => {
    const { service } = setup({ customAllowed: () => true }, { email: 'jojo.le.rapide@example.com', phoneNumber: '+33 6 12 34 56 78' });
    await expect(service.choose({ userId: USER, value: 'jojo-le-rapide' })).rejects.toMatchObject({ code: 'LEAGUE_PSEUDONYM_FORBIDDEN', details: { reason: 'identity' } });
  });

  it('ouvert : le filtre d’injures injecté refuse', async () => {
    const { service } = setup({ customAllowed: () => true, isOffensive: (value) => value.toLowerCase().includes('vilain') });
    await expect(service.choose({ userId: USER, value: 'GrosVilain' })).rejects.toMatchObject({ code: 'LEAGUE_PSEUDONYM_FORBIDDEN', details: { reason: 'offensive' } });
  });

  it('ouvert : un nom pris — même sous une autre casse ou ponctuation — est refusé, un nom libre accepté', async () => {
    const { service } = setup({ customAllowed: () => true });
    expect(await service.choose({ userId: OTHER, value: 'Le.Flambeur' })).toBe('Le.Flambeur');
    await expect(service.choose({ userId: USER, value: 'le_flambeur' })).rejects.toBeInstanceOf(GameRefusal);
    await expect(service.choose({ userId: USER, value: 'le_flambeur' })).rejects.toMatchObject({ code: 'LEAGUE_PSEUDONYM_TAKEN' });
  });

  it('un nom choisi survit au changement de saison ; un nom tiré non', async () => {
    const { service } = setup({ customAllowed: () => true, draw: draws(1, 2) });
    await service.choose({ userId: USER, value: 'Vigie' });
    expect(await service.ensure(USER, new Date('2027-03-01T00:00:00Z'))).toBe('Vigie');
  });
});

describe('release et of', () => {
  it('release efface le pseudonyme (retrait du consentement)', async () => {
    const { service } = setup({ draw: draws(1) });
    await service.ensure(USER);
    await service.release(USER);
    expect(await service.current(USER)).toBeNull();
  });

  it('of rend un nom par compte, en une lecture', async () => {
    const { service } = setup({ draw: draws(1, 2) });
    await service.ensure(USER);
    await service.ensure(OTHER);
    expect([...(await service.of([USER, OTHER])).values()].sort()).toEqual(['Colibri-0001', 'Colibri-0002']);
  });
});

describe('pseudonymKeyOf', () => {
  it('plie casse, accents et séparateurs', () => {
    expect(pseudonymKeyOf('Élan.Du_Soir-1')).toBe('elandusoir1');
  });
});
