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

/**
 * Les missions du jour déjà tirées, toutes sur un geste que ces témoins ne font
 * pas : le crédit observé est celui du SEUL geste, quel que soit le tirage du jour.
 */
const missionsAwaitOtherGestures = (db: FakeGameDb) =>
  db.dailyMission.rows.push(
    ...[0, 1, 2].map((slot) => ({
      id: `m-other-${slot}`, userId: USER, dayKey: dayKey(), slot, templateKey: 'publish-posts', difficulty: 'easy',
      signal: 'axis:content.post', prism: false, target: 2, progress: 0, reward: 60, glory: 0, seen: [],
      completedAt: null, paidPoints: null, rerolledAt: null,
    })),
  );

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

  it('une reprise prend aux autres compteurs ce que la ligne ne peut pas rendre, et le score perd autant', async () => {
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
    seedCounter(db, 'conversation.private', { count: 50, points: 5000 });
    db.user.rows.find((r) => r.id === USER)!.engagementScore = credited + 5000;
    const gapBefore = score(db) - pointsHeld(db);

    await engagement.reclaimContent(USER, 'content.reel', 'r1');

    expect(score(db)).toBe(5000);
    expect(rawPoints(db, 'conversation.private')).toBe(5000 - credited);
    expect(db.engagementCounter.rows.find((r) => r.axisKey === 'conversation.private')?.count).toBe(50);
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

/**
 * Le scénario de l'audit adversarial du 2026-10-13, chiffres exacts. La frappe
 * retire au score le PRIX d'une Meesh, pas les points du contenu : elle les
 * prend au rang le plus renouvelable qui en tient. Une reprise bornée au seul
 * compteur du contenu laissait donc au compte 1 221 points d'un contenu
 * supprimé, devenus une Meesh gratuite — rejouable chaque jour.
 */
describe('publier, frapper, supprimer : un contenu retiré rend TOUS ses points', () => {
  const PRICE = meeshPrice(1);

  const publishedThenMinted = async () => {
    // Aucun niveau record : le Vent arrière (+25 % sous le record) ne gonfle pas les crédits.
    const db = verifiedAccount({ engagementScore: 5000, meeshBalance: 0, meeshMintedLifetime: 0 });
    seedCounter(db, 'conversation.private', { count: 50, points: 5000 });
    missionsAwaitOtherGestures(db);
    const engagement = service(db);
    await engagement.recordActivity(USER, 'content.reel', { targetId: 'r1', variant: 'public' });
    await engagement.recordActivity(USER, 'content.reel', { targetId: 'r2', variant: 'public' });
    expect(rawPoints(db, 'content.reel')).toBe(2000);
    expect(score(db)).toBe(7000);
    const outcome = await new MeeshService(db.prisma).mint(USER, 'mint-between-publish-and-delete');
    expect(outcome.status).toBe('minted');
    expect(PRICE).toBe(1221);
    expect(rawPoints(db, 'content.reel')).toBe(779);
    expect(score(db)).toBe(5779);
    return { db, engagement };
  };

  it('le score retombe à 3 779 : les 2 000 points des deux réels supprimés sont repris, pas 779', async () => {
    const { db, engagement } = await publishedThenMinted();

    await engagement.reclaimContent(USER, 'content.reel', 'r1');
    await engagement.reclaimContent(USER, 'content.reel', 'r2');

    expect(score(db)).toBe(3779);
    expect(rawPoints(db, 'content.reel')).toBe(0);
    expect(rawPoints(db, 'conversation.private')).toBe(3779);
    expect(pointsHeld(db)).toBe(score(db));
  });

  it('le reliquat se prend dans l’ordre de débit de la frappe : le texte avant les conversations', async () => {
    const { db, engagement } = await publishedThenMinted();
    seedCounter(db, 'content.text_message', { count: 30, points: 90 });
    db.user.rows.find((r) => r.id === USER)!.engagementScore = score(db) + 90;

    await engagement.reclaimContent(USER, 'content.reel', 'r1');
    await engagement.reclaimContent(USER, 'content.reel', 'r2');

    expect(rawPoints(db, 'content.text_message')).toBe(0);
    expect(rawPoints(db, 'conversation.private')).toBe(5000 - (PRICE - 90));
    expect(pointsHeld(db)).toBe(score(db));
  });

  it('le reliquat ne retire AUCUNE action aux autres compteurs : c’est une reprise de points, pas une frappe', async () => {
    const { db, engagement } = await publishedThenMinted();
    seedCounter(db, 'content.text_message', { count: 30, points: 90 });

    await engagement.reclaimContent(USER, 'content.reel', 'r1');
    await engagement.reclaimContent(USER, 'content.reel', 'r2');

    expect(db.engagementCounter.rows.find((r) => r.axisKey === 'content.text_message')?.count).toBe(30);
    expect(db.engagementCounter.rows.find((r) => r.axisKey === 'conversation.private')?.count).toBe(50);
  });
});

describe('une reprise sur un compte qui n’a plus rien nulle part', () => {
  it('reprend ce qui existe, et ni le score ni un compteur ne passe sous zéro', async () => {
    const db = verifiedAccount();
    const engagement = service(db);
    await engagement.recordActivity(USER, 'content.reel', { targetId: 'r1', variant: 'public' });
    expect(score(db)).toBe(1000);
    // Le compte a dépensé le reste : 300 points tenus, sur deux compteurs.
    db.engagementCounter.rows.find((r) => r.axisKey === 'content.reel')!.points = 200;
    seedCounter(db, 'tool.sticker', { count: 100, points: 100 });
    db.user.rows.find((r) => r.id === USER)!.engagementScore = 300;

    await engagement.reclaimContent(USER, 'content.reel', 'r1');

    expect(score(db)).toBe(0);
    expect(db.engagementCounter.rows.filter((r) => r.userId === USER).map((r) => r.points)).toEqual([0, 0]);
  });

  it('une ligne vide et aucun autre compteur : rien ne bouge, pas même le compte d’actions', async () => {
    const db = verifiedAccount();
    const engagement = service(db);
    await engagement.recordActivity(USER, 'content.reel', { targetId: 'r1', variant: 'public' });
    const row = db.engagementCounter.rows.find((r) => r.axisKey === 'content.reel')!;
    const actions = row.count;
    row.points = 0;
    db.user.rows.find((r) => r.id === USER)!.engagementScore = 0;

    await engagement.reclaimContent(USER, 'content.reel', 'r1');

    expect(score(db)).toBe(0);
    expect(row.points).toBe(0);
    expect(row.count).toBe(actions);
  });
});
