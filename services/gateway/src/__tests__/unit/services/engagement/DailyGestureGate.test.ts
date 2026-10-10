/**
 * La limite quotidienne de gestes (#9584, porteur 2026-10-07) — la porte seule,
 * sur une base en mémoire qui applique l'index unique comme Mongo.
 *
 * Ce qu'elle tient : une place par geste admis, jamais au-delà de la limite,
 * même à deux gestes simultanés ; un refus n'incrémente rien ; le jour est
 * celui du FUSEAU DU COMPTE, et le refus dit l'instant exact de sa remise à
 * zéro — minuit local.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { DEFAULT_ENGAGEMENT_SCALE, type EngagementScale } from '@meeshy/shared/types/engagement-scale';
import { DailyGestureGate, DailyGestureLimitReached, nextMidnight } from '../../../../services/engagement/DailyGestureGate';
import { fakeGameDb, seedUser, type FakeGameDb } from '../../../../services/game/__tests__/fakeGameDb';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const USER = '68a000000000000000000071';

const limits = (repostComments: unknown): EngagementScale => ({
  ...DEFAULT_ENGAGEMENT_SCALE,
  pathCaps: { comment: { original: 50, repost: repostComments }, reaction: { original: 100, repost: 50 } },
} as unknown as EngagementScale);

function setup(options: { readonly timezone?: string; readonly scale?: EngagementScale } = {}) {
  const db = fakeGameDb();
  seedUser(db, { timezone: options.timezone ?? 'UTC' }, USER);
  const scale = options.scale ?? limits(2);
  const gate = new DailyGestureGate(db.prisma, { current: async () => scale });
  return { db, gate };
}

const placesOn = (db: FakeGameDb, dayKey: string): number =>
  (db.engagementQuota.rows.find((row) => row.userId === USER && row.operationKey === 'gesture:comment' && row.bucket === `repost:day:${dayKey}`)
    ?.count as number | undefined) ?? 0;

const refusalOf = async (attempt: Promise<unknown>): Promise<DailyGestureLimitReached> => {
  const outcome = await attempt.then(() => null, (error: unknown) => error);
  expect(outcome).toBeInstanceOf(DailyGestureLimitReached);
  return outcome as DailyGestureLimitReached;
};

describe('la porte des gestes du jour', () => {
  it('admet jusqu’à la limite, puis refuse — et le refus ne consomme rien', async () => {
    const { db, gate } = setup();
    const now = new Date('2026-10-07T10:00:00Z');

    await gate.admit(USER, 'comment', 'repost', now);
    await gate.admit(USER, 'comment', 'repost', now);
    const refusal = await refusalOf(gate.admit(USER, 'comment', 'repost', now));
    await refusalOf(gate.admit(USER, 'comment', 'repost', now));

    expect(refusal).toMatchObject({ code: 'DAILY_COMMENT_LIMIT', family: 'comment', path: 'repost', limit: 2 });
    expect(placesOn(db, '2026-10-07')).toBe(2);
  });

  it('deux gestes simultanés à une place du bord : un seul passe', async () => {
    const { db, gate } = setup();
    const now = new Date('2026-10-07T10:00:00Z');
    await gate.admit(USER, 'comment', 'repost', now);

    const outcomes = await Promise.allSettled([gate.admit(USER, 'comment', 'repost', now), gate.admit(USER, 'comment', 'repost', now)]);

    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(placesOn(db, '2026-10-07')).toBe(2);
  });

  it('les deux premiers gestes du jour, simultanés, prennent deux places — la création concurrente ne perd rien', async () => {
    const { db, gate } = setup();
    const now = new Date('2026-10-07T10:00:00Z');

    await Promise.all([gate.admit(USER, 'comment', 'repost', now), gate.admit(USER, 'comment', 'repost', now)]);

    expect(placesOn(db, '2026-10-07')).toBe(2);
  });

  it('le jour est celui du FUSEAU DU COMPTE : 23 h 59 et 0 h 01 à Paris sont deux jours, même dans le même jour UTC', async () => {
    const { db, gate } = setup({ timezone: 'Europe/Paris' });
    const lateEvening = new Date('2026-10-07T21:59:00Z');
    const afterMidnight = new Date('2026-10-07T22:01:00Z');

    await gate.admit(USER, 'comment', 'repost', lateEvening);
    await gate.admit(USER, 'comment', 'repost', lateEvening);
    await refusalOf(gate.admit(USER, 'comment', 'repost', lateEvening));
    await gate.admit(USER, 'comment', 'repost', afterMidnight);

    expect(placesOn(db, '2026-10-07')).toBe(2);
    expect(placesOn(db, '2026-10-08')).toBe(1);
  });

  it('le refus dit l’instant de la remise à zéro : minuit local du compte, et les secondes qui y mènent', async () => {
    const { gate } = setup({ timezone: 'Europe/Paris' });
    const now = new Date('2026-10-07T20:00:00Z');
    await gate.admit(USER, 'comment', 'repost', now);
    await gate.admit(USER, 'comment', 'repost', now);

    const refusal = await refusalOf(gate.admit(USER, 'comment', 'repost', now));

    expect(refusal.resetAt.toISOString()).toBe('2026-10-07T22:00:00.000Z');
    expect(refusal.details(now)).toEqual({ retryAfter: 7200, resetAt: '2026-10-07T22:00:00.000Z', limit: 2, path: 'repost' });
  });

  it('sans fuseau connu, le jour et sa remise à zéro sont ceux d’UTC', () => {
    expect(nextMidnight('2026-10-07', null).toISOString()).toBe('2026-10-08T00:00:00.000Z');
    expect(nextMidnight('2026-10-31', 'Not/AZone').toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('la remise à zéro suit l’heure d’été : minuit à Paris le lendemain du changement d’heure', () => {
    expect(nextMidnight('2026-10-24', 'Europe/Paris').toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(nextMidnight('2026-10-25', 'Europe/Paris').toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });

  it('rendre la place d’un geste qui n’a pas eu lieu la libère pour le suivant', async () => {
    const { db, gate } = setup();
    const now = new Date('2026-10-07T10:00:00Z');
    await gate.admit(USER, 'comment', 'repost', now);
    const ticket = await gate.admit(USER, 'comment', 'repost', now);

    await gate.release(ticket);
    await gate.admit(USER, 'comment', 'repost', now);

    expect(placesOn(db, '2026-10-07')).toBe(2);
  });

  it.each([
    ['null', null],
    ['négative', -1],
    ['absente', undefined],
    ['au-delà du plafond dur', 5_000],
  ])('un barème dont la limite est %s ne donne JAMAIS « sans limite » : la limite par défaut (10) s’applique', async (_label, value) => {
    const { db, gate } = setup({ scale: limits(value) });
    const now = new Date('2026-10-07T10:00:00Z');

    for (let n = 0; n < 10; n += 1) await gate.admit(USER, 'comment', 'repost', now);
    const refusal = await refusalOf(gate.admit(USER, 'comment', 'repost', now));

    expect(refusal.limit).toBe(10);
    expect(placesOn(db, '2026-10-07')).toBe(10);
  });

  it('une limite à zéro refuse tout', async () => {
    const { gate } = setup({ scale: limits(0) });

    await refusalOf(gate.admit(USER, 'comment', 'repost', new Date('2026-10-07T10:00:00Z')));
  });

  it('un compteur illisible laisse passer le geste SANS place, donc sans points (null ⇒ mayCredit faux) — seule une limite ATTEINTE refuse', async () => {
    const { db, gate } = setup();
    db.engagementQuota.updateMany = async () => {
      throw new Error('mongo down');
    };

    await expect(gate.admit(USER, 'comment', 'repost', new Date('2026-10-07T10:00:00Z'))).resolves.toBeNull();
  });
});
