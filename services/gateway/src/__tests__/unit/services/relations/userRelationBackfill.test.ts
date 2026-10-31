/**
 * LE RATTRAPAGE DES LIENS (#13926) — chaque demande d'amitié ACCEPTÉE donne une
 * ligne `UserRelation` FRIEND/FRIEND.
 *
 * Le double lit un vrai `where` et refuse le doublon de paire : jouer le
 * rattrapage DEUX fois doit donner le même état, et ne rien écraser.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { backfillUserRelations } from '../../../../services/relations/userRelationBackfill';
import { relationStore } from '../../../helpers/user-relation-store';

const A = '5f0000000000000000000001';
const B = '5f0000000000000000000002';
const C = '5f0000000000000000000003';
const D = '5f0000000000000000000004';
const T0 = new Date('2026-09-01T08:00:00Z');

const request = (id: string, senderId: string, receiverId: string, status: string, respondedAt?: Date) => ({
  id: `bb${id.padStart(22, '0')}`, senderId, receiverId, status, ...(respondedAt ? { respondedAt } : {}),
});

const NOW = new Date('2026-10-31T12:00:00Z');
const run = (store: ReturnType<typeof relationStore>, extra: Partial<Parameters<typeof backfillUserRelations>[1]> = {}) =>
  backfillUserRelations(store.prisma, { dryRun: false, now: NOW, batchSize: 2, ...extra });

describe('backfillUserRelations', () => {
  it('donne une ligne FRIEND/FRIEND à chaque demande acceptée, datée de sa réponse', async () => {
    const store = relationStore({ friendRequests: [request('1', B, A, 'accepted', T0)] });

    const report = await run(store);

    expect(report).toMatchObject({ scanned: 1, created: 1, alreadyPresent: 0 });
    expect(store.relations()).toHaveLength(1);
    expect(store.relations()[0]).toMatchObject({
      userLowId: A, userHighId: B, grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND', origin: 'backfill-friend', levelSince: T0,
    });
  });

  it('jouée DEUX fois, laisse exactement le même état (idempotent)', async () => {
    const store = relationStore({
      friendRequests: [request('1', A, B, 'accepted', T0), request('2', C, D, 'accepted', T0), request('3', A, C, 'accepted', T0)],
    });

    await run(store);
    const afterFirst = store.relations();
    const second = await run(store);

    expect(store.relations()).toEqual(afterFirst);
    expect(second).toMatchObject({ scanned: 3, created: 0, raised: 0, alreadyPresent: 3 });
  });

  it('ne baisse ni n’écrase une ligne déjà montée entre deux passes', async () => {
    const store = relationStore({
      friendRequests: [request('1', A, B, 'accepted', T0)],
      relations: [{
        id: 'aa0000000000000000000009', userLowId: A, userHighId: B, grantedByLow: 'BLOOD', grantedByHigh: 'CLOSE',
        origin: 'request', transitions: [],
      }],
    });

    await run(store);

    expect(store.relations()).toHaveLength(1);
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'BLOOD', grantedByHigh: 'CLOSE', origin: 'request' });
  });

  it('relève à FRIEND une paire déjà liée plus bas (Connaissance née avant le rattrapage) : aucun ami ne recule', async () => {
    const store = relationStore({
      friendRequests: [request('1', A, B, 'accepted', T0)],
      relations: [{
        id: 'aa0000000000000000000009', userLowId: A, userHighId: B, grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE',
        origin: 'auto-acquaintance', transitions: [{ actorId: A, from: 'PUBLIC', to: 'ACQUAINTANCE', at: T0 }],
      }],
    });

    const first = await run(store);
    const afterFirst = store.relations();
    const second = await run(store);

    expect(first).toMatchObject({ raised: 1, created: 0 });
    expect(afterFirst[0]).toMatchObject({ grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND' });
    expect(second).toMatchObject({ raised: 0, alreadyPresent: 1 });
    expect(store.relations()).toEqual(afterFirst);
  });

  it('ne défait pas une baisse gravée par l’une des deux personnes', async () => {
    const store = relationStore({
      friendRequests: [request('1', A, B, 'accepted', T0)],
      relations: [{
        id: 'aa0000000000000000000009', userLowId: A, userHighId: B, grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'FRIEND',
        origin: 'request', transitions: [{ actorId: A, from: 'FRIEND', to: 'ACQUAINTANCE', at: T0 }],
      }],
    });

    const report = await run(store);

    expect(report).toMatchObject({ raised: 0, alreadyPresent: 1 });
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'FRIEND' });
  });

  it('ignore pending, rejected et blocked : seule une demande ACCEPTÉE fait un ami', async () => {
    const store = relationStore({
      friendRequests: [
        request('1', A, B, 'pending'), request('2', A, C, 'rejected'), request('3', A, D, 'blocked'), request('4', B, C, 'accepted', T0),
      ],
    });

    const report = await run(store);

    expect(report.scanned).toBe(1);
    expect(store.relations().map((r) => `${r.userLowId}-${r.userHighId}`)).toEqual([`${B}-${C}`]);
  });

  it('ignore une demande dont l’émetteur est le receveur', async () => {
    const store = relationStore({ friendRequests: [request('1', A, A, 'accepted', T0), request('2', A, B, 'accepted', T0)] });

    const report = await run(store);

    expect(report).toMatchObject({ skippedSelf: 1, created: 1 });
    expect(store.relations()).toHaveLength(1);
  });

  it('dédoublonne une paire portée par plusieurs lignes (A→B, B→A, doublons), à travers les lots', async () => {
    const store = relationStore({
      friendRequests: [
        request('1', A, B, 'accepted', T0), request('2', B, A, 'accepted', T0), request('3', A, B, 'accepted', T0),
        request('4', C, D, 'accepted', T0),
      ],
    });

    const report = await run(store);

    expect(store.relations()).toHaveLength(2);
    expect(report).toMatchObject({ scanned: 4, created: 2, alreadyPresent: 2 });
  });

  it('prend la date de mise à jour de la demande quand la réponse n’a pas été gravée', async () => {
    const store = relationStore({
      friendRequests: [{ ...request('1', A, B, 'accepted'), updatedAt: T0 }],
    });

    await run(store);

    expect(store.relations()[0].levelSince).toEqual(T0);
  });

  it('à blanc (dryRun), compte sans rien écrire et dédoublonne quand même', async () => {
    const below = {
      id: 'aa0000000000000000000009', userLowId: A, userHighId: C, grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE',
      origin: 'auto-acquaintance', transitions: [],
    };
    const store = relationStore({
      friendRequests: [
        request('1', A, B, 'accepted', T0), request('2', B, A, 'accepted', T0), request('3', C, D, 'accepted', T0),
        request('4', A, C, 'accepted', T0),
      ],
      relations: [below],
    });

    const report = await run(store, { dryRun: true });

    expect(store.relations()).toEqual([below]);
    expect(report).toMatchObject({ scanned: 4, created: 2, raised: 1, alreadyPresent: 1 });
  });
});
