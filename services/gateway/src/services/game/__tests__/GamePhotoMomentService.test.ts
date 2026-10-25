/**
 * LES ÉTAPES FRANCHIES APP FERMÉE (#10175, L19 — § 5.16.4) : la détection écrit le registre partagé
 * (`GamePhotoMoment.detectedAt`) depuis les MÊMES faits que le bloc `game` servi au client, et pose la ligne
 * de base à la première évaluation ; l'envoi pousse UNE notification groupée, après le délai de la politique,
 * seulement pour des étapes ni présentées ni notifiées, jamais à un compte en ligne, jamais pendant son « Ne
 * pas déranger » ni la nuit dans SON fuseau, jamais deux fois pour une même étape, jamais en doublon de
 * `streak_milestone`, et pas du tout à qui a coupé le push photo ou le jeu.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { GameBlock } from '@meeshy/shared/types/game';
import { buildGameBlock, type GameBlockFacts } from '@meeshy/shared/utils/game/game-block';
import { catchUpStandingOf, photoStepsReached } from '@meeshy/shared/utils/game/photo-catch-up';
import type { GameNotificationEvent, GameNotifyResult } from '../GameNotifier';
import { GamePhotoMomentService } from '../GamePhotoMomentService';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const MINUTE = 60_000;
const DETECTED = new Date('2026-10-14T10:00:00Z');
const LATER = new Date(DETECTED.getTime() + 61 * MINUTE);

const facts = (over: Partial<GameBlockFacts> = {}): GameBlockFacts => ({
  userId: USER,
  today: '2026-10-14',
  score: 1_000,
  levelRecord: 3,
  prestige: 0,
  glory: 0,
  mythic: false,
  mintedLifetime: 0,
  missionsDone: 0,
  flameRecord: 2,
  debitablePoints: 0,
  balance: 0,
  streak: 2,
  lastActiveDay: '2026-10-14',
  broken: null,
  freezes: 0,
  lastRelightDay: null,
  missions: [],
  rerollsUsedToday: 0,
  chestClaimed: false,
  chestReward: null,
  guideSeen: [],
  ...over,
});

const stepsOf = (block: GameBlock): string[] => photoStepsReached(catchUpStandingOf(block)).map((step) => step.id);

/** Une coque Android qui route le push photo (`PUSH_TYPE_ROUTING_FLOORS`). */
const CAPABLE_SHELL = { platform: 'android', type: 'fcm', isActive: true, appVersion: '2.23.0', bundleId: 'me.meeshy.app' };

const world = (options: { user?: Record<string, unknown>; notify?: GameNotifyResult; tokens?: readonly Record<string, unknown>[] } = {}) => {
  const db: FakeGameDb = fakeGameDb();
  seedUser(db, { isActive: true, deletedAt: null, isOnline: false, timezone: 'UTC', systemLanguage: 'fr', ...options.user }, USER);
  for (const [index, token] of (options.tokens ?? [CAPABLE_SHELL]).entries()) db.pushToken.rows.push({ id: `token-${index}`, userId: USER, token: `t-${index}`, ...token });
  let block: GameBlock = buildGameBlock(facts());
  const events: GameNotificationEvent[] = [];
  const notifier = { notify: jest.fn(async (event: GameNotificationEvent) => (events.push(event), options.notify ?? 'sent')) };
  const service = new GamePhotoMomentService(db.prisma, { blocks: { build: async () => block }, notifier });
  const setBlock = (over: Partial<GameBlockFacts>) => {
    block = buildGameBlock(facts(over));
    return block;
  };
  const rows = () => db.gamePhotoMoment.rows.map((row) => row as Record<string, unknown>);
  return { db, service, notifier, events, setBlock, rows, block: () => block };
};

/** Pose la ligne de base sur la situation de départ, puis franchit une Flamme de 7 jours (et ce qu'elle entraîne). */
const crossFlameSeven = async (w: ReturnType<typeof world>) => {
  await w.service.detect(USER, new Date(DETECTED.getTime() - 3600_000));
  w.setBlock({ flameRecord: 7, streak: 7 });
  return w.service.detect(USER, DETECTED);
};

describe('la détection', () => {
  it('la PREMIÈRE évaluation pose la ligne de base, sans une seule étape à annoncer', async () => {
    const w = world();

    expect(await w.service.detect(USER, DETECTED)).toEqual({ kind: 'baseline' });

    expect(w.rows()).toHaveLength(0);
    const profile = w.db.gameProfile.rows.find((row) => row.userId === USER);
    expect(profile?.photoAlertsBaselineAt).toEqual(DETECTED);
    expect(profile?.photoAlertsBaseline).toEqual(catchUpStandingOf(w.block()));
  });

  it('les étapes du SERVEUR sont celles du CLIENT sur le même bloc : franchies depuis la ligne de base, sans le départ', async () => {
    const w = world();
    const before = stepsOf(w.block());
    await w.service.detect(USER, new Date(DETECTED.getTime() - 3600_000));
    const after = stepsOf(w.setBlock({ flameRecord: 7, streak: 7, mintedLifetime: 1 }));

    const outcome = await w.service.detect(USER, DETECTED);

    const expected = after.filter((id) => !before.includes(id) && id !== 'start');
    expect(expected).toContain('flame:7');
    expect(outcome).toEqual({ kind: 'detected', stepIds: expect.arrayContaining(expected) });
    expect(w.rows().map((row) => row.stepId).sort()).toEqual([...expected].sort());
    for (const row of w.rows()) expect(row).toMatchObject({ userId: USER, detectedAt: DETECTED });
  });

  it('une étape déjà au registre (présentée sur un appareil) n’est ni récrite ni redatée', async () => {
    const w = world();
    await w.service.detect(USER, new Date(DETECTED.getTime() - 3600_000));
    w.db.gamePhotoMoment.rows.push({ id: 'x', userId: USER, stepId: 'flame:7', presentedAt: new Date('2026-10-14T09:00:00Z') });
    w.setBlock({ flameRecord: 7, streak: 7 });

    await w.service.detect(USER, DETECTED);

    const flame = w.rows().filter((row) => row.stepId === 'flame:7');
    expect(flame).toHaveLength(1);
    expect(flame[0]?.detectedAt).toBeUndefined();
  });

  it('un palier atteint de nouveau après un Prestige redevient un moment de photo ; celui du cycle d’avant ne repart pas (#10911)', async () => {
    const w = world();
    w.setBlock({ levelRecord: 34 });
    await w.service.detect(USER, new Date(DETECTED.getTime() - 3600_000));
    w.db.gamePhotoMoment.rows.push({ id: 'old', userId: USER, stepId: 'tier:lueur', presentedAt: new Date('2026-10-01T09:00:00Z') });
    w.setBlock({ levelRecord: 20, prestige: 1, score: 100 * 20 * 20, pastCycleRecords: [100] });

    const detection = await w.service.detect(USER, DETECTED);

    expect(detection).toEqual({ kind: 'detected', stepIds: expect.arrayContaining(['tier:lueur:1', 'tier:lumiere:1']) });
    expect(w.rows().filter((row) => String(row.stepId).startsWith('tier:')).map((row) => row.stepId).sort()).toEqual(['tier:lueur', 'tier:lumiere:1', 'tier:lueur:1'].sort());
  });
});

describe('l’envoi', () => {
  it('rien avant le délai de la politique (60 min), puis UNE notification groupée ; les étapes passent notifiées', async () => {
    const w = world();
    await crossFlameSeven(w);
    const pending = w.rows().map((row) => row.stepId);

    expect(await w.service.deliver(new Date(DETECTED.getTime() + 59 * MINUTE))).toEqual({ sent: 0, deferred: 0 });
    expect(w.events).toHaveLength(0);

    expect(await w.service.deliver(LATER)).toEqual({ sent: 1, deferred: 0 });
    expect(w.events).toEqual([{ kind: 'photo-moment', recipientId: USER, stepIds: expect.arrayContaining(pending), dayKey: '2026-10-14' }]);
    for (const row of w.rows()) expect(row.notifiedAt).toEqual(LATER);
  });

  it('pas de relance : une étape notifiée ne repart jamais, une étape nouvelle part seule le lendemain', async () => {
    const w = world();
    await crossFlameSeven(w);
    await w.service.deliver(LATER);
    w.setBlock({ flameRecord: 30, streak: 30 });
    const nextDay = new Date('2026-10-15T10:00:00Z');
    await w.service.detect(USER, nextDay);

    await w.service.deliver(new Date(nextDay.getTime() + 61 * MINUTE));

    expect(w.events).toHaveLength(2);
    const second = w.events[1] as Extract<GameNotificationEvent, { kind: 'photo-moment' }>;
    expect(second.stepIds).toContain('flame:30');
    expect(second.stepIds).not.toContain('flame:7');
  });

  it('une étape PRÉSENTÉE sur un appareil n’est pas poussée', async () => {
    const w = world();
    await crossFlameSeven(w);
    await w.db.gamePhotoMoment.updateMany({ where: { userId: USER }, data: { presentedAt: new Date(DETECTED.getTime() + MINUTE) } });

    expect(await w.service.deliver(LATER)).toEqual({ sent: 0, deferred: 0 });
    expect(w.events).toHaveLength(0);
  });

  it('un compte EN LIGNE n’est pas poussé : l’hôte de l’app est la surface', async () => {
    const w = world({ user: { isOnline: true } });
    await crossFlameSeven(w);

    expect(await w.service.deliver(LATER)).toEqual({ sent: 0, deferred: 1 });
    expect(w.events).toHaveLength(0);
    for (const row of w.rows()) expect(row.notifiedAt).toBeUndefined();
  });

  it('« Ne pas déranger » : testé AVANT GameNotifier, l’envoi est différé', async () => {
    const w = world();
    w.db.userPreferences.rows.push({ id: 'p', userId: USER, notification: { dndEnabled: true, dndStartTime: '00:00', dndEndTime: '23:59', dndUtcOffsetMinutes: 0 } });
    await crossFlameSeven(w);

    expect(await w.service.deliver(LATER)).toEqual({ sent: 0, deferred: 1 });
    expect(w.notifier.notify).not.toHaveBeenCalled();
  });

  it('la nuit (21 h → 9 h) se lit dans le FUSEAU du compte, jamais dans dndUtcOffsetMinutes', async () => {
    const w = world({ user: { timezone: 'Asia/Tokyo' } });
    w.db.userPreferences.rows.push({ id: 'p', userId: USER, notification: { dndEnabled: false, dndUtcOffsetMinutes: 0 } });
    await crossFlameSeven(w);

    expect(await w.service.deliver(new Date('2026-10-14T13:30:00Z'))).toEqual({ sent: 0, deferred: 1 });
    expect(w.notifier.notify).not.toHaveBeenCalled();
    expect(await w.service.deliver(new Date('2026-10-15T01:30:00Z'))).toEqual({ sent: 1, deferred: 0 });
    expect(w.events[0]).toMatchObject({ dayKey: '2026-10-15' });
  });

  it('« Ne pas déranger » ACTIVÉ gouverne seul : hors de sa fenêtre, la nuit de la politique ne s’y ajoute pas', async () => {
    const w = world({ user: { timezone: 'Asia/Tokyo' } });
    w.db.userPreferences.rows.push({ id: 'p', userId: USER, notification: { dndEnabled: true, dndStartTime: '23:00', dndEndTime: '07:00', dndUtcOffsetMinutes: 540 } });
    await crossFlameSeven(w);

    expect(await w.service.deliver(new Date('2026-10-14T12:30:00Z'))).toEqual({ sent: 1, deferred: 0 });
  });

  it('push photo coupé, ou « Jeu » coupé : rien ne part, le carnet garde tout', async () => {
    for (const notification of [{ gamePhotoEnabled: false }, { gameEnabled: false }]) {
      const w = world();
      w.db.userPreferences.rows.push({ id: 'p', userId: USER, notification });
      await crossFlameSeven(w);

      expect(await w.service.deliver(LATER)).toEqual({ sent: 0, deferred: 0 });
      expect(w.notifier.notify).not.toHaveBeenCalled();
      expect(w.rows().length).toBeGreaterThan(0);
    }
  });

  it('créneau du jour déjà pris : les étapes restent à notifier, la prochaine fenêtre les reprend', async () => {
    const w = world({ notify: 'skipped:daily-cap' });
    await crossFlameSeven(w);

    expect(await w.service.deliver(LATER)).toEqual({ sent: 0, deferred: 1 });
    for (const row of w.rows()) expect(row.notifiedAt).toBeUndefined();
  });

  it('ne double pas streak_milestone : une Flamme de 7 jours déjà annoncée ne part pas en push photo', async () => {
    const w = world();
    await w.service.detect(USER, new Date(DETECTED.getTime() - 3600_000));
    w.setBlock({ flameRecord: 7, streak: 7, mintedLifetime: 1 });
    await w.service.detect(USER, DETECTED);
    w.db.notification.rows.push({ id: 'n', userId: USER, type: 'streak_milestone', createdAt: DETECTED });

    await w.service.deliver(LATER);

    const event = w.events[0] as Extract<GameNotificationEvent, { kind: 'photo-moment' }>;
    expect(event.stepIds).toContain('meesh:1');
    expect(event.stepIds).not.toContain('flame:7');
    expect(w.rows().find((row) => row.stepId === 'flame:7')?.notifiedAt).toBeUndefined();
  });

  it('une Flamme de 7 jours SEULE, déjà annoncée par streak_milestone : rien ne part', async () => {
    const w = world();
    await crossFlameSeven(w);
    w.db.notification.rows.push({ id: 'n', userId: USER, type: 'streak_milestone', createdAt: DETECTED });

    expect(await w.service.deliver(LATER)).toEqual({ sent: 0, deferred: 0 });
    expect(w.events).toHaveLength(0);
  });

  it('aucun appareil qui sache ouvrir le push photo : rien ne part, le créneau reste libre, et l’étape reste à présenter (#10267)', async () => {
    const iphoneOnly = [{ platform: 'ios', type: 'apns', isActive: true, appVersion: '1.9.0 (900)', bundleId: 'me.meeshy.app' }];
    const oldShell = [{ ...CAPABLE_SHELL, appVersion: '2.22.0' }];
    const inactive = [{ ...CAPABLE_SHELL, isActive: false }];
    const voipOnly = [{ ...CAPABLE_SHELL, platform: 'ios', type: 'voip' }];
    for (const tokens of [[], iphoneOnly, oldShell, inactive, voipOnly]) {
      const w = world({ tokens });
      await crossFlameSeven(w);

      expect(await w.service.deliver(LATER)).toEqual({ sent: 0, deferred: 0 });
      expect(w.notifier.notify).not.toHaveBeenCalled();
      for (const row of w.rows()) expect(row.notifiedAt).toBeUndefined();
    }
  });

  it('l’appareil capable arrive : l’étape restée en attente part au passage suivant', async () => {
    const w = world({ tokens: [{ ...CAPABLE_SHELL, appVersion: '2.22.0' }] });
    await crossFlameSeven(w);
    await w.service.deliver(LATER);
    w.db.pushToken.rows.push({ id: 'token-new', userId: USER, token: 't-new', ...CAPABLE_SHELL });

    expect(await w.service.deliver(new Date(LATER.getTime() + 10 * MINUTE))).toEqual({ sent: 1, deferred: 0 });
    expect(w.events).toHaveLength(1);
  });
});
