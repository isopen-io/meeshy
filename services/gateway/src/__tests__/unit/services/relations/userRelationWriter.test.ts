/**
 * L'ÉCRIVAIN UNIQUE du lien entre deux personnes (#13926).
 *
 * Trois sites écrivent « accepté » (l'acceptation d'une demande, l'affiliation,
 * le rattrapage) : ils passent tous par `userRelationWriter`. Les témoins
 * lisent l'ÉTAT de la paire après coup, dans un double qui refuse un second
 * exemplaire de la paire (P2002) et honore le `where` de la mise à jour.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  backfillFriendship,
  recordFriendship,
  resetFriendship,
} from '../../../../services/relations/userRelationWriter';
import { relationStore } from '../../../helpers/user-relation-store';

const LOW = '5f0000000000000000000001';
const HIGH = '5f0000000000000000000002';
const NOW = new Date('2026-10-31T10:00:00Z');
const LATER = new Date('2026-11-05T10:00:00Z');

const relation = (overrides: Record<string, unknown> = {}) => ({
  id: 'aa0000000000000000000099',
  userLowId: LOW,
  userHighId: HIGH,
  grantedByLow: 'FRIEND',
  grantedByHigh: 'FRIEND',
  levelSince: new Date('2026-09-01T00:00:00Z'),
  origin: 'backfill-friend',
  transitions: [],
  ...overrides,
});

describe('recordFriendship — une demande acceptée se lit FRIEND des deux côtés', () => {
  it('crée la paire FRIEND/FRIEND, dans l’ordre low/high quel que soit l’ordre d’appel', async () => {
    const store = relationStore();
    const outcome = await recordFriendship(store.prisma, { userA: HIGH, userB: LOW, origin: 'request', at: NOW });

    expect(outcome).toBe('created');
    expect(store.relations()).toHaveLength(1);
    expect(store.relations()[0]).toMatchObject({
      userLowId: LOW, userHighId: HIGH, grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND', origin: 'request', levelSince: NOW,
    });
  });

  it('grave l’historique du passage PUBLIC → FRIEND, un par côté, avec l’auteur de chaque accord', async () => {
    const store = relationStore();
    await recordFriendship(store.prisma, { userA: LOW, userB: HIGH, origin: 'request', at: NOW });

    expect(store.relations()[0].transitions).toEqual([
      { actorId: LOW, from: 'PUBLIC', to: 'FRIEND', at: NOW },
      { actorId: HIGH, from: 'PUBLIC', to: 'FRIEND', at: NOW },
    ]);
  });

  it('rejouée, ne change rien : même état, aucun passage de plus', async () => {
    const store = relationStore();
    await recordFriendship(store.prisma, { userA: LOW, userB: HIGH, origin: 'request', at: NOW });
    const once = store.relations();

    const outcome = await recordFriendship(store.prisma, { userA: HIGH, userB: LOW, origin: 'request', at: LATER });

    expect(outcome).toBe('unchanged');
    expect(store.relations()).toEqual(once);
  });

  it('ne baisse JAMAIS un accord déjà monté (aucune rétrogradation rétroactive)', async () => {
    const store = relationStore({ relations: [relation({ grantedByLow: 'BLOOD', grantedByHigh: 'CLOSE' })] });

    const outcome = await recordFriendship(store.prisma, { userA: LOW, userB: HIGH, origin: 'request', at: LATER });

    expect(outcome).toBe('unchanged');
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'BLOOD', grantedByHigh: 'CLOSE' });
  });

  it('relève seulement le côté en dessous de FRIEND et date le nouveau niveau effectif', async () => {
    const store = relationStore({
      relations: [relation({ grantedByLow: 'CLOSE', grantedByHigh: 'ACQUAINTANCE', origin: 'auto-acquaintance' })],
    });

    const outcome = await recordFriendship(store.prisma, { userA: LOW, userB: HIGH, origin: 'request', at: LATER });

    expect(outcome).toBe('raised');
    const [row] = store.relations();
    expect(row).toMatchObject({ grantedByLow: 'CLOSE', grantedByHigh: 'FRIEND', levelSince: LATER, origin: 'auto-acquaintance' });
    expect(row.transitions).toEqual([{ actorId: HIGH, from: 'ACQUAINTANCE', to: 'FRIEND', at: LATER }]);
  });

  it('relit une valeur stockée illisible comme PUBLIC et la relève', async () => {
    const store = relationStore({ relations: [relation({ grantedByLow: 'MARTIAN', grantedByHigh: undefined })] });

    await recordFriendship(store.prisma, { userA: LOW, userB: HIGH, origin: 'request', at: LATER });

    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND' });
  });

  it('refuse un lien d’une personne avec elle-même, sans rien écrire', async () => {
    const store = relationStore();
    const outcome = await recordFriendship(store.prisma, { userA: LOW, userB: LOW, origin: 'request', at: NOW });

    expect(outcome).toBe('ignored');
    expect(store.relations()).toEqual([]);
  });

  it('survit à une course : si l’autre écrivain crée la paire entre la lecture et la création, il reprend sur la ligne existante', async () => {
    const store = relationStore();
    const racing = {
      userRelation: {
        ...store.prisma.userRelation,
        findUnique: (async () => {
          racing.userRelation.findUnique = store.prisma.userRelation.findUnique as never;
          await store.prisma.userRelation.create({
            data: { userLowId: LOW, userHighId: HIGH, grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE', origin: 'auto-acquaintance' },
          });
          return null;
        }) as never,
      },
    };

    const outcome = await recordFriendship(racing, { userA: LOW, userB: HIGH, origin: 'request', at: NOW });

    expect(outcome).toBe('raised');
    expect(store.relations()).toHaveLength(1);
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND' });
  });
});

describe('resetFriendship — la rupture ramène les deux accords à PUBLIC, en silence', () => {
  it('abaisse les deux accords, date le niveau et garde la baisse dans l’historique', async () => {
    const store = relationStore({ relations: [relation({ grantedByLow: 'CLOSE', grantedByHigh: 'FRIEND' })] });

    const outcome = await resetFriendship(store.prisma, { userA: LOW, userB: HIGH, at: LATER });

    expect(outcome).toBe('reset');
    const [row] = store.relations();
    expect(row).toMatchObject({ grantedByLow: 'PUBLIC', grantedByHigh: 'PUBLIC', levelSince: LATER });
    expect(row.transitions).toEqual([
      { actorId: LOW, from: 'CLOSE', to: 'PUBLIC', at: LATER },
      { actorId: HIGH, from: 'FRIEND', to: 'PUBLIC', at: LATER },
    ]);
  });

  it('ne fait rien quand la paire n’a pas de ligne', async () => {
    const store = relationStore();
    expect(await resetFriendship(store.prisma, { userA: LOW, userB: HIGH, at: LATER })).toBe('unchanged');
    expect(store.relations()).toEqual([]);
  });

  it('ne fait rien quand la paire est déjà à PUBLIC des deux côtés', async () => {
    const store = relationStore({ relations: [relation({ grantedByLow: 'PUBLIC', grantedByHigh: 'PUBLIC', transitions: [] })] });
    expect(await resetFriendship(store.prisma, { userA: LOW, userB: HIGH, at: LATER })).toBe('unchanged');
    expect(store.relations()[0].transitions).toEqual([]);
  });
});

describe('backfillFriendship — le rattrapage relève à FRIEND sans jamais baisser ni défaire une baisse', () => {
  it('crée FRIEND/FRIEND avec l’origine du rattrapage, daté de l’acceptation d’origine', async () => {
    const store = relationStore();
    const outcome = await backfillFriendship(store.prisma, { userA: HIGH, userB: LOW, at: NOW });

    expect(outcome).toBe('created');
    expect(store.relations()[0]).toMatchObject({ origin: 'backfill-friend', levelSince: NOW, grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND' });
  });

  it('laisse intacte une ligne déjà plus haute', async () => {
    const store = relationStore({ relations: [relation({ grantedByLow: 'BLOOD', grantedByHigh: 'CLOSE' })] });

    expect(await backfillFriendship(store.prisma, { userA: LOW, userB: HIGH, at: NOW })).toBe('unchanged');
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'BLOOD', grantedByHigh: 'CLOSE', transitions: [] });
  });

  it('relève à FRIEND une ligne née sous FRIEND sans baisse gravée : une demande acceptée se lit FRIEND', async () => {
    const store = relationStore({
      relations: [relation({
        grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE', origin: 'auto-acquaintance',
        transitions: [
          { actorId: LOW, from: 'PUBLIC', to: 'ACQUAINTANCE', at: NOW },
          { actorId: HIGH, from: 'PUBLIC', to: 'ACQUAINTANCE', at: NOW },
        ],
      })],
    });

    expect(await backfillFriendship(store.prisma, { userA: LOW, userB: HIGH, at: LATER })).toBe('raised');
    expect(store.relations()[0]).toMatchObject({
      grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND', origin: 'auto-acquaintance', levelSince: LATER,
    });
    expect(store.relations()[0].transitions).toHaveLength(4);
  });

  it('respecte une baisse gravée : le rattrapage ne défait pas un choix de la personne', async () => {
    const lowered = relation({
      grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'FRIEND',
      transitions: [{ actorId: LOW, from: 'FRIEND', to: 'ACQUAINTANCE', at: NOW }],
    });
    const store = relationStore({ relations: [lowered] });

    expect(await backfillFriendship(store.prisma, { userA: LOW, userB: HIGH, at: LATER })).toBe('unchanged');
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'FRIEND' });
    expect(store.relations()[0].transitions).toHaveLength(1);
  });

  it('perd la course (P2002) et reprend sur la ligne gagnante sans la doubler', async () => {
    const store = relationStore({ relations: [relation()] });
    let first = true;
    const blindOnce = {
      userRelation: {
        ...store.prisma.userRelation,
        findUnique: (async (args: Parameters<typeof store.prisma.userRelation.findUnique>[0]) => {
          if (first) { first = false; return null; }
          return store.prisma.userRelation.findUnique(args);
        }) as never,
      },
    };

    expect(await backfillFriendship(blindOnce, { userA: LOW, userB: HIGH, at: NOW })).toBe('unchanged');
    expect(store.relations()).toHaveLength(1);
  });
});
