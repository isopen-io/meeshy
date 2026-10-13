/**
 * LE COMPTEUR SURVIT À UNE COLONNE `points` ABSENTE OU `null` (#10541).
 *
 * Mesuré en production le 2026-10-13 : 24 lignes `EngagementCounter` portent
 * `points` à `null` (23) ou absent (1). Chaque crédit y montait le score — écrit
 * par un pipeline `$ifNull` depuis #6428 — et laissait le compteur à `null`,
 * parce que le compteur, lui, s'écrivait encore par `points: { increment }` :
 * Prisma traduit l'incrément en `$set: { points: { $add: ['$points', n] } }`, et
 * `$add` rend `null` dès qu'un opérande est absent ou `null`. 110 000 points de
 * score ne pouvaient plus payer aucune Meesh.
 *
 * ## Ce que ces témoins prouvent, et sur quoi
 *
 * Ils tournent sur `fakeGameDb`, un DOUBLE en mémoire — pas sur un vrai MongoDB.
 * Un double naïf (un incrément sur `undefined` qui part de zéro) ne verrait pas
 * le défaut ; celui-ci reproduit les deux sémantiques MESURÉES le 2026-10-13 sur
 * un MongoDB 8.0.4 jetable, avec le client Prisma du dépôt :
 *
 *     points ABSENT + { increment: 5 }   ->  null en base, relu 0 par Prisma
 *     points NULL   + { increment: 5 }   ->  null en base, relu 0 par Prisma
 *     points NULL   + { decrement: 2 }   ->  null en base
 *     pipeline `$add` sur `$ifNull`      ->  7, et la ligne absente est créée
 *     la même commande DANS une transaction annulée  ->  rien n'est écrit
 *     la même commande en conflit dans une transaction  ->  P2034
 *
 * `$add` et `$subtract` du double rendent donc `null` sur un opérande absent :
 * une commande qui oublierait `$ifNull` rougirait ici comme elle fuirait en base.
 *
 * L'invariant lu partout : `User.engagementScore == Σ EngagementCounter.points`,
 * les points étant lus comme Prisma les relit (`null` et l'absence valent zéro)
 * — et, après toute écriture du service, la colonne est un NOMBRE en base.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { DEFAULT_ENGAGEMENT_SCALE, type EngagementScale } from '@meeshy/shared/types/engagement-scale';
import { emptyActTiers } from '@meeshy/shared/types/engagement-act-streaks';
import { meeshPrice } from '@meeshy/shared/utils/game/mint';
import { EngagementService } from '../EngagementService';
import { MeeshService } from '../../meesh/MeeshService';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from '../../game/__tests__/fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../notifications/notification-service-registry', () => ({
  getSharedNotificationService: () => ({ createNotification: jest.fn<any>().mockResolvedValue(undefined) }),
}));
jest.mock('../../notifications/NotificationService', () => ({ NotificationService: jest.fn() }));

const DAY_MS = 24 * 60 * 60 * 1000;
const dayKey = (offsetDays = 0): string => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);

/** Les deux états fautifs de production : la colonne ABSENTE, la colonne à `null`. */
const BROKEN_COLUMNS = [
  { name: 'ABSENTE', column: {} },
  { name: 'à null', column: { points: null } },
] as const;

const service = (db: FakeGameDb, scale: EngagementScale = DEFAULT_ENGAGEMENT_SCALE) =>
  new EngagementService(db.prisma, { scale: { current: async () => scale }, emitIO: () => undefined });

const seedCounter = (db: FakeGameDb, axisKey: string, fields: Record<string, unknown>) =>
  db.engagementCounter.rows.push({ id: `c-${axisKey}`, userId: USER, axisKey, ...fields });

const rawPoints = (db: FakeGameDb, axisKey: string): unknown =>
  db.engagementCounter.rows.find((row) => row.userId === USER && row.axisKey === axisKey)?.points;

/** Σ des points, relus comme Prisma les relit : `null` et l'absence valent zéro. */
const pointsHeld = (db: FakeGameDb): number =>
  db.engagementCounter.rows
    .filter((row) => row.userId === USER)
    .reduce((sum, row) => sum + (typeof row.points === 'number' ? row.points : 0), 0);

const score = (db: FakeGameDb): number => (db.user.rows.find((row) => row.id === USER)?.engagementScore as number | undefined) ?? 0;

const verifiedAccount = (fields: Record<string, unknown> = {}): FakeGameDb => {
  const db = fakeGameDb();
  seedUser(db, { engagementScore: 0, emailVerifiedAt: new Date('2026-01-01T00:00:00Z'), ...fields });
  return db;
};

describe.each(BROKEN_COLUMNS)('une ligne dont la colonne `points` est $name', ({ column }) => {
  it('un geste crédite le compteur autant que le score', async () => {
    const db = verifiedAccount();
    seedCounter(db, 'tool.sticker', { count: 56, ...column });

    await service(db).recordActivity(USER, 'tool.sticker');
    await service(db).recordActivity(USER, 'tool.sticker');

    expect(score(db)).toBeGreaterThan(0);
    expect(rawPoints(db, 'tool.sticker')).toBe(score(db));
    expect(pointsHeld(db)).toBe(score(db));
  });

  it('un geste compte une action de plus, sans effacer celles déjà comptées', async () => {
    const db = verifiedAccount();
    seedCounter(db, 'tool.sticker', { count: 56, ...column });

    await service(db).recordActivity(USER, 'tool.sticker');

    expect(db.engagementCounter.rows.find((row) => row.axisKey === 'tool.sticker')?.count).toBe(57);
  });

  it('les points du jeu créditent l’axe autant que le score, sans compter d’action', async () => {
    const db = verifiedAccount({ engagementScore: 0, levelRecord: 1 });
    seedCounter(db, 'content.text_message', { count: 14, ...column });

    await service(db).creditGamePoints(USER, 120, 'content.text_message');

    expect(score(db)).toBe(120);
    expect(rawPoints(db, 'content.text_message')).toBe(120);
    expect(db.engagementCounter.rows.find((row) => row.axisKey === 'content.text_message')?.count).toBe(14);
  });

  it('un bonus de série crédite `streak.bonus` autant que le score', async () => {
    const db = verifiedAccount();
    seedCounter(db, 'streak.bonus', { count: 3, ...column });
    db.engagementActStreak.rows.push({ id: 'a-story', userId: USER, act: 'story', currentDays: 6, longestDays: 6, lastDay: dayKey(-1) });
    const scale: EngagementScale = {
      ...DEFAULT_ENGAGEMENT_SCALE,
      streaks: { global: [], acts: { ...emptyActTiers(), story: [{ days: 7, points: 50 }] } },
      loyalty: [],
    };

    await service(db, scale).recordActivity(USER, 'content.story', { targetId: 's1' });

    expect(rawPoints(db, 'streak.bonus')).toBe(50);
    expect(pointsHeld(db)).toBe(score(db));
  });

  it('une reprise ne débite le score que de ce que le compteur a rendu', async () => {
    const db = verifiedAccount();
    const engagement = service(db);
    await engagement.recordActivity(USER, 'content.reel', { targetId: 'r1', variant: 'public' });
    const credited = score(db);
    expect(credited).toBeGreaterThan(0);
    // La ligne retombe dans l'état fautif de production : le score porte des
    // points qu'aucun compteur ne tient plus.
    const row = db.engagementCounter.rows.find((r) => r.axisKey === 'content.reel')!;
    delete row.points;
    Object.assign(row, column);
    const gapBefore = score(db) - pointsHeld(db);

    await engagement.reclaimContent(USER, 'content.reel', 'r1');

    expect(score(db) - pointsHeld(db)).toBe(gapBefore);
  });

  it('une frappe dont le plan a vieilli ne débite pas une colonne qui ne couvre plus le prix', async () => {
    const price = meeshPrice(1);
    const db = verifiedAccount({ engagementScore: price, levelRecord: 1000, meeshBalance: 0, meeshMintedLifetime: 0 });
    seedCounter(db, 'content.text_message', { count: 400, ...column });
    // Le plan est calculé sur une lecture d'AVANT : la colonne couvrait le prix.
    const findMany = db.engagementCounter.findMany.bind(db.engagementCounter);
    let stale = true;
    db.engagementCounter.findMany = (async (args: Parameters<typeof findMany>[0]) => {
      if (!stale) return findMany(args);
      stale = false;
      return [{ axisKey: 'content.text_message', count: 400, points: price }];
    }) as typeof db.engagementCounter.findMany;

    const outcome = await new MeeshService(db.prisma).mint(USER, 'mint-on-a-stale-plan');

    expect(outcome.status).toBe('insufficient');
    expect(score(db)).toBe(price);
    expect(db.meeshLedger.rows).toHaveLength(0);
    expect(db.engagementCounter.rows.find((r) => r.axisKey === 'content.text_message')?.count).toBe(400);
  });
});

describe('une reprise sur un compteur que la frappe a déjà entamé', () => {
  it('rend ce que le compteur tient encore, et le score ne perd rien de plus', async () => {
    const db = verifiedAccount();
    const engagement = service(db);
    await engagement.recordActivity(USER, 'content.reel', { targetId: 'r1', variant: 'public' });
    const credited = score(db);
    const minted = Math.floor(credited / 4);
    // Une frappe a repris `minted` points : au compteur ET au score, d'un même montant.
    const row = db.engagementCounter.rows.find((r) => r.axisKey === 'content.reel')!;
    row.points = credited - minted;
    db.user.rows.find((r) => r.id === USER)!.engagementScore = credited - minted;
    seedCounter(db, 'content.text_message', { count: 10, points: 0 });
    await engagement.creditGamePoints(USER, 300, 'content.text_message');

    await engagement.reclaimContent(USER, 'content.reel', 'r1');

    expect(rawPoints(db, 'content.reel')).toBe(0);
    expect(score(db)).toBe(300);
    expect(pointsHeld(db)).toBe(score(db));
  });

  it('une ligne déjà vide ne rend rien : le score ne bouge pas', async () => {
    const db = verifiedAccount();
    const engagement = service(db);
    await engagement.recordActivity(USER, 'content.reel', { targetId: 'r1', variant: 'public' });
    const row = db.engagementCounter.rows.find((r) => r.axisKey === 'content.reel')!;
    const actions = row.count;
    row.points = 0;
    db.user.rows.find((r) => r.id === USER)!.engagementScore = 0;
    seedCounter(db, 'content.text_message', { count: 10, points: 0 });
    await engagement.creditGamePoints(USER, 300, 'content.text_message');

    await engagement.reclaimContent(USER, 'content.reel', 'r1');

    expect(score(db)).toBe(300);
    expect(pointsHeld(db)).toBe(300);
    expect(row.count).toBe(actions);
  });
});
