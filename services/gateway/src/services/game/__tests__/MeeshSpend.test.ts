/**
 * LES DÉPENSES DE MEESHES (#9376) — chaque dépense est une ligne `spend` du
 * registre existant, idempotente par `requestId`, et `meeshBalance == Σ(delta)`
 * reste vrai après chacune.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { MeeshSpend } from '../MeeshSpend';
import { fakeGameDb, seedUser, USER, writeConflict, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const withBalance = (db: FakeGameDb, balance: number) => {
  seedUser(db, { meeshBalance: null, meeshMintedLifetime: null });
  if (balance > 0) db.meeshLedger.rows.push({ id: 'g1', userId: USER, delta: balance, reason: 'grant', requestId: 'octroi-0001' });
};

const sum = (db: FakeGameDb) => db.meeshLedger.rows.reduce((s, r) => s + (r.delta as number), 0);

describe('MeeshSpend.spend', () => {
  it('grave une ligne spend négative et la colonne égale la somme du registre', async () => {
    const db = fakeGameDb();
    withBalance(db, 5);

    const issue = await new MeeshSpend(db.prisma).spend({ userId: USER, requestId: 'depense-01', price: 3, kind: 'flame-relight' });

    expect(issue).toEqual({ status: 'spent', balance: 2, result: undefined });
    expect(db.meeshLedger.rows.at(-1)).toMatchObject({ delta: -3, reason: 'spend', requestId: 'depense-01' });
    expect(db.meeshLedger.rows.at(-1)?.meta).toMatchObject({ kind: 'flame-relight', price: 3 });
    expect(db.user.rows[0]?.meeshBalance).toBe(sum(db));
  });

  it('refuse sans rien écrire quand le solde du REGISTRE ne couvre pas le prix', async () => {
    const db = fakeGameDb();
    withBalance(db, 2);
    const apply = jest.fn<any>();

    const issue = await new MeeshSpend(db.prisma).spend({ userId: USER, requestId: 'depense-02', price: 3, kind: 'flame-relight', apply });

    expect(issue).toEqual({ status: 'insufficient', balance: 2 });
    expect(apply).not.toHaveBeenCalled();
    expect(db.meeshLedger.rows).toHaveLength(1);
  });

  it('le solde se lit au registre, pas à la colonne : une colonne gonflée n’achète rien', async () => {
    const db = fakeGameDb();
    seedUser(db, { meeshBalance: 99, meeshMintedLifetime: 0 });

    const issue = await new MeeshSpend(db.prisma).spend({ userId: USER, requestId: 'depense-03', price: 1, kind: 'flame-freeze' });

    expect(issue.status).toBe('insufficient');
  });

  it('rejouer le même requestId ne débite pas deux fois', async () => {
    const db = fakeGameDb();
    withBalance(db, 5);
    const apply = jest.fn<any>().mockResolvedValue('effet');
    const service = new MeeshSpend(db.prisma);

    const first = await service.spend({ userId: USER, requestId: 'depense-04', price: 1, kind: 'flame-freeze', apply });
    const second = await service.spend({ userId: USER, requestId: 'depense-04', price: 1, kind: 'flame-freeze', apply });

    expect(first.status).toBe('spent');
    expect(second).toMatchObject({ status: 'already-spent', balance: 4 });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(sum(db)).toBe(4);
  });

  it('un requestId déjà employé pour une AUTRE dépense est refusé (REQUEST_ID_CONFLICT), sans effet ni débit', async () => {
    const db = fakeGameDb();
    withBalance(db, 5);
    const apply = jest.fn<any>().mockResolvedValue('effet');
    const service = new MeeshSpend(db.prisma);
    await service.spend({ userId: USER, requestId: 'depense-08', price: 1, kind: 'flame-freeze' });

    await expect(
      service.spend({ userId: USER, requestId: 'depense-08', price: 3, kind: 'flame-relight', apply }),
    ).rejects.toMatchObject({ name: 'GameRefusal', code: 'REQUEST_ID_CONFLICT' });

    expect(apply).not.toHaveBeenCalled();
    expect(sum(db)).toBe(4);
  });

  it('un requestId déjà porté par une FRAPPE (ligne non `spend`) est refusé, jamais rendu comme une dépense faite', async () => {
    const db = fakeGameDb();
    withBalance(db, 5);
    db.meeshLedger.rows.push({ id: 'm1', userId: USER, delta: 1, reason: 'mint', requestId: 'frappe-0001', meta: null });
    const apply = jest.fn<any>();

    await expect(
      new MeeshSpend(db.prisma).spend({ userId: USER, requestId: 'frappe-0001', price: 1, kind: 'flame-freeze', apply }),
    ).rejects.toMatchObject({ code: 'REQUEST_ID_CONFLICT' });

    expect(apply).not.toHaveBeenCalled();
    expect(sum(db)).toBe(6);
  });

  it('deux dépenses concurrentes portant le même requestId ne débitent qu’une fois', async () => {
    const db = fakeGameDb();
    withBalance(db, 5);
    const service = new MeeshSpend(db.prisma);

    await Promise.all([
      service.spend({ userId: USER, requestId: 'depense-05', price: 1, kind: 'flame-freeze' }),
      service.spend({ userId: USER, requestId: 'depense-05', price: 1, kind: 'flame-freeze' }),
    ]);

    expect(sum(db)).toBe(4);
  });

  it('l’effet s’applique DANS la transaction : s’il échoue, aucun débit ne subsiste', async () => {
    const db = fakeGameDb();
    withBalance(db, 5);
    const apply = jest.fn<any>().mockRejectedValue(new Error('refus de l’effet'));

    await expect(
      new MeeshSpend(db.prisma).spend({ userId: USER, requestId: 'depense-06', price: 1, kind: 'flame-freeze', apply }),
    ).rejects.toThrow('refus de l’effet');

    expect(sum(db)).toBe(5);
  });

  it('un conflit d’écriture se rejoue en bloc', async () => {
    const db = fakeGameDb();
    withBalance(db, 5);
    let conflicts = 1;
    const update = db.user.update.bind(db.user);
    db.user.update = (async (args: Parameters<typeof update>[0]) => {
      if (conflicts > 0) {
        conflicts -= 1;
        throw writeConflict();
      }
      return update(args);
    }) as typeof db.user.update;

    const issue = await new MeeshSpend(db.prisma).spend({ userId: USER, requestId: 'depense-07', price: 1, kind: 'flame-freeze' });

    expect(issue.status).toBe('spent');
    expect(sum(db)).toBe(4);
  });
});
