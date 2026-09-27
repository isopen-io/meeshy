/**
 * Supprimer son compte efface son carnet synchronisé et ses notifications (#8284).
 *
 * Décision porteur (2026-09-27) : l'effacement du carnet ne se fait plus à la
 * main, il se fait à la suppression du compte. Une fois la purge passée, le
 * compte n'a plus aucun `UserContact`, aucune `ContactJoinNotice` — ni reçue,
 * ni annonçant son arrivée —, aucune `Notification`, et les annonces
 * « X a rejoint Meeshy » faites À D'AUTRES à son sujet sont retirées.
 *
 * Le double est une petite base EN MÉMOIRE qui applique le filtre `where` : un
 * double qui répondrait `{ count: n }` à toute requête passerait au vert sur un
 * `deleteMany({})` qui viderait les carnets de tout le monde.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/password-hash', () => ({
  hashPassword: jest.fn(async () => '$2b$12$hash-de-test'),
}));

import { purgeAccountIsolatedData } from '../../../services/AccountPurgeService';

const PARTI = '507f1f77bcf86cd799439011';
const AUTRE = '507f1f77bcf86cd799439022';
const MARIE = '507f1f77bcf86cd799439033';

type Row = Record<string, unknown> & { id: string };

function matches(row: Row, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([field, expected]) => {
    if (expected && typeof expected === 'object' && 'in' in (expected as object)) {
      return ((expected as { in: unknown[] }).in).includes(row[field]);
    }
    return row[field] === expected;
  });
}

function table(rows: Row[]) {
  const state = { rows: [...rows] };
  return {
    state,
    findMany: jest.fn(async (args?: { where?: Record<string, unknown> }) =>
      state.rows.filter((row) => matches(row, args?.where))),
    deleteMany: jest.fn(async (args?: { where?: Record<string, unknown> }) => {
      const before = state.rows.length;
      state.rows = state.rows.filter((row) => !matches(row, args?.where));
      return { count: before - state.rows.length };
    }),
  };
}

function base() {
  const userContact = table([
    { id: 'c1', ownerId: PARTI },
    { id: 'c2', ownerId: PARTI },
    { id: 'c3', ownerId: AUTRE },
  ]);
  const contactJoinNotice = table([
    { id: 'n1', recipientId: PARTI, joinerId: MARIE },
    { id: 'n2', recipientId: AUTRE, joinerId: PARTI },
    { id: 'n3', recipientId: AUTRE, joinerId: MARIE },
    { id: 'n4', recipientId: MARIE, joinerId: PARTI },
  ]);
  const notification = table([
    { id: 'm1', userId: PARTI, type: 'new_message', actor: { id: AUTRE }, metadata: {} },
    { id: 'm2', userId: PARTI, type: 'contact_joined', actor: { id: MARIE }, metadata: { joinerIds: [MARIE] } },
    { id: 'm3', userId: AUTRE, type: 'contact_joined', actor: { id: PARTI }, metadata: { joinerIds: [PARTI], joinerCount: 1 } },
    { id: 'm4', userId: MARIE, type: 'contact_joined', actor: { id: AUTRE }, metadata: { joinerIds: [AUTRE, PARTI], joinerCount: 2 } },
    { id: 'm5', userId: AUTRE, type: 'contact_joined', actor: { id: MARIE }, metadata: { joinerIds: [MARIE], joinerCount: 1 } },
    { id: 'm6', userId: AUTRE, type: 'new_message', actor: { id: PARTI }, metadata: {} },
    { id: 'm7', userId: AUTRE, type: 'reaction', actor: { id: MARIE }, metadata: {} },
  ]);
  const prisma = {
    userSession: table([]),
    userVoiceModel: table([]),
    conversationShareLink: table([]),
    userContact,
    contactJoinNotice,
    notification,
  };
  return { prisma, userContact, contactJoinNotice, notification };
}

describe('purgeAccountIsolatedData — le carnet et les notifications du compte supprimé (#8284)', () => {
  it("ne laisse aucune fiche, aucune annonce ni aucune notification du compte", async () => {
    const { prisma, userContact, contactJoinNotice, notification } = base();

    await purgeAccountIsolatedData(prisma as never, PARTI);

    expect(userContact.state.rows.filter((row) => row.ownerId === PARTI)).toEqual([]);
    expect(contactJoinNotice.state.rows.filter((row) => row.recipientId === PARTI || row.joinerId === PARTI)).toEqual([]);
    expect(notification.state.rows.filter((row) => row.userId === PARTI)).toEqual([]);
  });

  it("retire les annonces « X a rejoint » faites à d'autres au sujet du compte supprimé", async () => {
    const { prisma, notification } = base();

    await purgeAccountIsolatedData(prisma as never, PARTI);

    const ids = notification.state.rows.map((row) => row.id);
    expect(ids).not.toContain('m3');
    expect(ids).not.toContain('m4');
  });

  it("laisse intactes les lignes des autres comptes qui ne parlent pas de lui", async () => {
    const { prisma, userContact, contactJoinNotice, notification } = base();

    await purgeAccountIsolatedData(prisma as never, PARTI);

    expect(userContact.state.rows.map((row) => row.id)).toEqual(['c3']);
    expect(contactJoinNotice.state.rows.map((row) => row.id)).toEqual(['n3']);
    // m6 (un message du compte supprimé) relève de l'anonymisation des
    // messages, pas de ce lot : il reste.
    expect(notification.state.rows.map((row) => row.id)).toEqual(['m5', 'm6', 'm7']);
  });

  it('le dit dans son bilan, et une seconde passe ne trouve plus rien (idempotent)', async () => {
    const { prisma } = base();

    const first = await purgeAccountIsolatedData(prisma as never, PARTI);
    const second = await purgeAccountIsolatedData(prisma as never, PARTI);

    expect(first).toMatchObject({
      addressBookContactsDeleted: 2,
      contactJoinNoticesDeleted: 3,
      notificationsDeleted: 2,
      arrivalAnnouncementsDeleted: 2,
    });
    expect(second).toMatchObject({
      addressBookContactsDeleted: 0,
      contactJoinNoticesDeleted: 0,
      notificationsDeleted: 0,
      arrivalAnnouncementsDeleted: 0,
    });
  });
});
