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
});

/**
 * Le scénario « publier, frapper, supprimer » depuis les étincelles (#10846). La frappe ne débite plus les compteurs
 * d'axe : ils gardent ce que chaque axe a rapporté, donc la reprise d'un contenu retiré les trouve entiers. La poche (déjà
 * dépensée à la frappe) ne passe pas sous zéro ; le CYCLE et le TOTAL À VIE, eux, perdent tout ce que ces contenus avaient
 * rapporté — ce qui ferme la triche sur le niveau et sur le total accumulé. Résidu assumé : la Meesh déjà frappée reste.
 */
describe('publier, frapper, supprimer : le total à vie et le niveau reprennent ce que le contenu a rapporté', () => {
  const published = async () => {
    const db = verifiedAccount({ engagementScore: 5000, sparksSincePrestige: 5000, sparksEarnedLifetime: 5000, meeshBalance: 0, meeshMintedLifetime: 0 });
    seedCounter(db, 'conversation.private', { count: 50, points: 5000 });
    missionsAwaitOtherGestures(db);
    const engagement = service(db);
    await engagement.recordActivity(USER, 'content.reel', { targetId: 'r1', variant: 'public' });
    await engagement.recordActivity(USER, 'content.reel', { targetId: 'r2', variant: 'public' });
    expect(rawPoints(db, 'content.reel')).toBe(2000);
    expect(score(db)).toBe(7000);
    const outcome = await new MeeshService(db.prisma).mint(USER, 'mint-between-publish-and-delete');
    expect(outcome.status).toBe('minted');
    // La frappe ne touche AUCUN compteur.
    expect(rawPoints(db, 'content.reel')).toBe(2000);
    expect(rawPoints(db, 'conversation.private')).toBe(5000);
    return { db, engagement, price: outcome.status === 'minted' ? outcome.receipt.price : 0 };
  };

  it('la poche perd le prix puis les 2 000 repris ; le cycle et le total à vie retombent à ce que le joueur a VRAIMENT gagné', async () => {
    const { db, engagement, price } = await published();
    const row = () => db.user.rows.find((r) => r.id === USER)!;
    expect(row()).toMatchObject({ engagementScore: 7000 - price, sparksSincePrestige: 7000, sparksEarnedLifetime: 7000 });

    await engagement.reclaimContent(USER, 'content.reel', 'r1');
    await engagement.reclaimContent(USER, 'content.reel', 'r2');

    expect(row()).toMatchObject({ engagementScore: 7000 - price - 2000, sparksSincePrestige: 5000, sparksEarnedLifetime: 5000 });
    expect(rawPoints(db, 'content.reel')).toBe(0);
  });

  it('la reprise ne retire AUCUNE action aux autres compteurs', async () => {
    const { db, engagement } = await published();

    await engagement.reclaimContent(USER, 'content.reel', 'r1');
    await engagement.reclaimContent(USER, 'content.reel', 'r2');

    expect(db.engagementCounter.rows.find((r) => r.axisKey === 'conversation.private')?.count).toBe(50);
    expect(rawPoints(db, 'conversation.private')).toBe(5000);
  });
});

/**
 * La reprise multi-compteurs n'est PAS dans une transaction : chaque compteur
 * est débité par sa propre commande atomique. Ce témoin fige ce qu'une panne en
 * route laisse — le score suit ce qui a déjà été repris, l'invariant tient.
 */
describe('une reprise interrompue par une panne entre deux compteurs', () => {
  it('retire du score ce qui a déjà été repris, puis remonte l’erreur : score == Σ points', async () => {
    const db = verifiedAccount({ engagementScore: 5000 });
    seedCounter(db, 'conversation.private', { count: 50, points: 5000 });
    missionsAwaitOtherGestures(db);
    const engagement = service(db);
    await engagement.recordActivity(USER, 'content.reel', { targetId: 'r1', variant: 'public' });
    db.engagementCounter.rows.find((r) => r.axisKey === 'content.reel')!.points = 400;
    db.user.rows.find((r) => r.id === USER)!.engagementScore = 5400;
    const client = db.prisma as unknown as { $runCommandRaw: (command: { findAndModify: string }) => Promise<unknown> };
    const raw = client.$runCommandRaw;
    let counterCommands = 0;
    client.$runCommandRaw = async (command) => {
      if (command.findAndModify === 'EngagementCounter' && (counterCommands += 1) === 2) throw new Error('compteur indisponible');
      return raw(command);
    };

    await expect(engagement.reclaimContent(USER, 'content.reel', 'r1')).rejects.toThrow('compteur indisponible');

    expect(rawPoints(db, 'content.reel')).toBe(0);
    expect(score(db)).toBe(5000);
    expect(pointsHeld(db)).toBe(score(db));
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
