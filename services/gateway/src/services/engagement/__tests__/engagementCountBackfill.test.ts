/**
 * LE RATTRAPAGE DES COMPTEURS D'ACTIONS (#10845) — à blanc par défaut, `--apply` pour écrire, idempotent, chaque
 * écriture GARDÉE par « la valeur est encore celle que j'ai lue ». Cible = max(compteur actuel, historique réel).
 * Les paliers ≤ cible sont gravés EN SILENCE (aucune notification, P2002 ignoré).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { backfillEngagementCounts, planCountBackfill } from '../engagementCountBackfill';
import { fakeGameDb, seedUser, USER, OTHER, type FakeGameDb } from '../../game/__tests__/fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const AXIS = 'content.text_message';

describe('planCountBackfill — la loi pure', () => {
  it('relève le compteur au total réel et liste les paliers à graver en silence', () => {
    expect(planCountBackfill({ current: 12, history: 3000, engravedThresholds: [1, 10] })).toEqual({
      from: 12,
      target: 3000,
      write: { from: 12, to: 3000 },
      thresholdsToEngrave: [50, 100, 500, 1000],
    });
  });

  it('ne baisse JAMAIS un compteur : cible = max(actuel, historique)', () => {
    expect(planCountBackfill({ current: 5000, history: 3000, engravedThresholds: [1, 10, 50, 100, 500, 1000, 5000] })).toMatchObject({
      target: 5000,
      write: null,
      thresholdsToEngrave: [],
    });
  });

  it('regrave un palier éteint par une ancienne frappe, même quand le compteur est déjà juste', () => {
    expect(planCountBackfill({ current: 60, history: 60, engravedThresholds: [1, 10] })).toMatchObject({
      write: null,
      thresholdsToEngrave: [50],
    });
  });

  it('une ligne absente (from: null) est créée', () => {
    expect(planCountBackfill({ current: null, history: 7, engravedThresholds: [] })).toMatchObject({
      write: { from: null, to: 7 },
      thresholdsToEngrave: [1],
    });
  });

  it('un historique de zéro n\'écrit rien', () => {
    expect(planCountBackfill({ current: null, history: 0, engravedThresholds: [] })).toMatchObject({ write: null, thresholdsToEngrave: [] });
  });

  it('est idempotente : rejouée sur l\'état qu\'elle a produit, elle n\'écrit plus rien', () => {
    const first = planCountBackfill({ current: 12, history: 3000, engravedThresholds: [1, 10] });
    const second = planCountBackfill({ current: first.target, history: 3000, engravedThresholds: [1, 10, ...first.thresholdsToEngrave] });
    expect(second.write).toBeNull();
    expect(second.thresholdsToEngrave).toEqual([]);
  });
});

const seedMessages = (db: FakeGameDb, userId: string, participantId: string, n: number) => {
  db.participant.rows.push({ id: participantId, userId, conversationId: `c-${participantId}` });
  for (let i = 0; i < n; i += 1) {
    db.message.rows.push({ id: `${participantId}-m${i}`, senderId: participantId, messageSource: 'user', messageType: 'text', deletedAt: null });
  }
};

const world = () => {
  const db = fakeGameDb();
  seedUser(db, { role: 'USER' });
  seedUser(db, { role: 'USER' }, OTHER);
  seedMessages(db, USER, 'p-a', 3000);
  seedMessages(db, OTHER, 'p-b', 8);
  db.engagementCounter.rows.push({ id: 'ca', userId: USER, axisKey: AXIS, count: 12, points: 777 });
  return db;
};

const count = (db: FakeGameDb, userId = USER) => db.engagementCounter.rows.find((r) => r.userId === userId && r.axisKey === AXIS);
const badges = (db: FakeGameDb, userId = USER) => db.engagementMilestone.rows.filter((r) => r.userId === userId && r.milestoneType === 'badge').map((r) => r.milestoneKey);

describe('backfillEngagementCounts', () => {
  it('À BLANC par défaut : rien n\'est écrit, le rapport dit ce qui le serait', async () => {
    const db = world();

    const report = await backfillEngagementCounts(db.prisma, { apply: false });

    expect(count(db)?.count).toBe(12);
    expect(badges(db)).toEqual([]);
    expect(db.engagementMilestone.rows).toHaveLength(0);
    expect(report.totals).toMatchObject({ accounts: 2, accountsToWrite: 2, countsRaised: 2, badgesToEngrave: 6 + 1, applied: 0 });
    expect(report.accounts.every((a) => a.status === 'simulated')).toBe(true);
  });

  it('--apply relève les compteurs, crée la ligne manquante et grave les paliers sans notification', async () => {
    const db = world();

    const report = await backfillEngagementCounts(db.prisma, { apply: true });

    expect(count(db)).toMatchObject({ count: 3000, points: 777 });
    expect(count(db, OTHER)).toMatchObject({ count: 8 });
    expect(badges(db).sort()).toEqual(['content.text_message:1', 'content.text_message:10', 'content.text_message:100', 'content.text_message:1000', 'content.text_message:50', 'content.text_message:500'].sort());
    expect(badges(db, OTHER)).toEqual(['content.text_message:1']);
    expect(db.notification.rows).toHaveLength(0);
    expect(report.totals.applied).toBe(2);
  });

  it('ne touche NI `points` NI `updatedAt` : l\'élan lit cette date comme celle du dernier geste', async () => {
    const db = world();
    const before = new Date('2026-09-01T00:00:00Z');
    count(db)!.updatedAt = before;

    await backfillEngagementCounts(db.prisma, { apply: true });

    expect(count(db)?.updatedAt).toBe(before);
    expect(count(db)?.points).toBe(777);
  });

  it('est IDEMPOTENT : une seconde application n\'écrit plus rien', async () => {
    const db = world();
    await backfillEngagementCounts(db.prisma, { apply: true });

    const second = await backfillEngagementCounts(db.prisma, { apply: true });

    expect(second.totals).toMatchObject({ accountsToWrite: 0, countsRaised: 0, badgesToEngrave: 0, applied: 0 });
    expect(count(db)?.count).toBe(3000);
  });

  it('écriture GARDÉE : un crédit arrivé entre la lecture et l\'écriture n\'est pas écrasé — le compte est laissé et compté', async () => {
    const db = world();
    const raw = (db.prisma as unknown as { $runCommandRaw: (c: unknown) => Promise<unknown> }).$runCommandRaw;
    (db.prisma as unknown as { $runCommandRaw: (c: unknown) => Promise<unknown> }).$runCommandRaw = async (command) => {
      // Un geste concurrent : le compteur de USER passe à 13 juste avant l'écriture du rattrapage.
      count(db)!.count = 13;
      return raw(command);
    };

    const report = await backfillEngagementCounts(db.prisma, { apply: true });

    expect(count(db)?.count).toBe(13);
    expect(report.totals.moved).toBeGreaterThanOrEqual(1);
    // Rien n'est gravé pour un compte laissé : il se relance.
    expect(badges(db)).toEqual([]);
  });

  it('un palier déjà gravé (P2002) est ignoré, sans erreur', async () => {
    const db = world();
    db.engagementMilestone.rows.push({ id: 'x', userId: USER, milestoneType: 'badge', milestoneKey: 'content.text_message:10', reachedAt: new Date('2026-09-10') });

    await expect(backfillEngagementCounts(db.prisma, { apply: true })).resolves.toBeDefined();

    expect(badges(db).filter((k) => k === 'content.text_message:10')).toHaveLength(1);
    expect(db.engagementMilestone.rows.find((r) => r.id === 'x')?.reachedAt).toEqual(new Date('2026-09-10'));
  });

  it('un compteur supérieur à l\'historique n\'est jamais baissé', async () => {
    const db = world();
    count(db)!.count = 9000;

    await backfillEngagementCounts(db.prisma, { apply: true });

    expect(count(db)?.count).toBe(9000);
  });

  it('le rapport ne porte AUCUN identifiant de compte : il se colle dans une issue', async () => {
    const db = world();

    const report = await backfillEngagementCounts(db.prisma, { apply: false });

    expect(JSON.stringify(report)).not.toContain(USER);
  });
});
