/**
 * Les missions du jour (#9373) : un catalogue de gabarits dont les signaux ne
 * sont que des faits que la passerelle observe à l'écriture, et un tirage
 * déterministe par utilisateur et par jour.
 */

import { describe, it, expect } from 'vitest';
import {
  GAME_DAY_MIN_GAP_MS,
  MISSIONS_MIN_LEVEL,
  MISSION_BASE_POINTS,
  MISSION_CAPABILITIES,
  MISSION_FACT_SIGNALS,
  MISSION_GOALS,
  MISSION_REROLL_PER_DAY,
  MISSION_REROLL_PRICE,
  MISSION_DIFFICULTIES,
  MISSION_SIGNALS,
  MISSION_TEMPLATES,
  drawDailyMissions,
  drawnMissionOf,
  missionArtifacts,
  missionAvailableFor,
  missionBand,
  missionGlory,
  missionObjective,
  missionReward,
  missionTarget,
  missionTemplatesFor,
  replaceImpossibleMissions,
  rerollDailyMission,
  resolveGameDayKey,
  type DrawnMission,
  type MissionCapability,
  type MissionProfile,
  type MissionSignal,
} from '../../utils/game/missions.js';
import { DEFAULT_ENGAGEMENT_SCALE } from '../../types/engagement-scale.js';
import { seasonStarsForMission } from '../../utils/game/season.js';
import { GLORY_POINTS } from '../../utils/game/glory.js';
import { addDays } from '../../utils/game/day-prng.js';

const draw = (over: Partial<Parameters<typeof drawDailyMissions>[0]> = {}) =>
  drawDailyMissions({ userId: 'user-1', dayKey: '2026-10-05', level: 20, flameDays: 5, treasury: 0, ...over });

const profile = (capabilities: readonly MissionCapability[] = [], habits: MissionProfile['habits'] = {}): MissionProfile => ({ capabilities, habits });
const NOBODY = profile();
const EVERYTHING = profile(MISSION_CAPABILITIES);

const RETURNING = [
  'share-link',
  'prism-foreign-messages',
  'prism-foreign-exchange',
  'gold-replies-received',
  'use-stickers',
  'voice-comments',
  'publish-reel',
  'reply-conversations',
  'reply-conversations-wide',
  'gold-reply-conversations',
];

describe('le catalogue (#9635) : varié, rangé par les quatre buts, chaque défi sur un signal établi par le serveur', () => {
  it('a des clés uniques', () => {
    const keys = MISSION_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('les dix défis retirés par #9634 sont revenus', () => {
    const keys = MISSION_TEMPLATES.map((t) => t.key);
    for (const key of RETURNING) expect({ key, present: keys.includes(key) }).toEqual({ key, present: true });
  });

  it('chaque but a des défis, et chaque signal est une opération créditée ou un fait que la passerelle pose', () => {
    for (const goal of MISSION_GOALS) expect({ goal, count: MISSION_TEMPLATES.filter((t) => t.goal === goal).length >= 3 }).toEqual({ goal, count: true });
    for (const template of MISSION_TEMPLATES) expect({ key: template.key, observed: MISSION_SIGNALS.includes(template.signal) }).toEqual({ key: template.key, observed: true });
    expect(MISSION_FACT_SIGNALS.every((signal) => MISSION_SIGNALS.includes(signal))).toBe(true);
  });

  it('chaque gabarit a des bornes saines', () => {
    for (const t of MISSION_TEMPLATES) {
      expect({ key: t.key, ok: t.minTarget >= 1 && t.minTarget <= t.maxTarget && t.unitPoints > 0 }).toEqual({ key: t.key, ok: true });
    }
  });

  it('les défis « faire connaître » et l’Or portent de la Gloire, lue dans GLORY_POINTS ; l’invité inscrit est rare', () => {
    for (const t of MISSION_TEMPLATES) {
      const expected = t.goal === 'reach' || t.difficulty === 'gold' ? GLORY_POINTS.goldMission : 0;
      expect({ key: t.key, glory: missionGlory(t, t.difficulty) }).toEqual({ key: t.key, glory: expected });
    }
    expect(MISSION_TEMPLATES.find((t) => t.key === 'invite-joined')?.weight).toBe(1);
  });

  it('les défis de langue sont du Prisme', () => {
    for (const t of MISSION_TEMPLATES.filter((x) => x.goal === 'languages')) expect(t.prism).toBe(true);
  });

  it('chaque emplacement garde au moins deux gabarits tirables, même pour le profil le plus démuni, signaux tirés écartés', () => {
    const open = (difficulty: (typeof MISSION_DIFFICULTIES)[number], excluded: readonly MissionSignal[]) =>
      missionTemplatesFor(difficulty).filter((t) => missionAvailableFor(t, NOBODY) && !excluded.includes(t.signal));
    for (const top of ['hard', 'gold'] as const) {
      for (const topT of open(top, [])) {
        expect({ top, key: topT.key, medium: open('medium', [topT.signal]).length >= 2 }).toEqual({ top, key: topT.key, medium: true });
        for (const mediumT of open('medium', [topT.signal])) {
          const easy = open('easy', [topT.signal, mediumT.signal]).length;
          expect({ top: topT.key, medium: mediumT.key, easy: easy >= 2 }).toEqual({ top: topT.key, medium: mediumT.key, easy: true });
        }
      }
    }
  });

  it('l’Or tire parmi ses gabarits et les difficiles portés à l’Or', () => {
    const gold = missionTemplatesFor('gold');
    expect(gold.every((t) => t.difficulty === 'gold')).toBe(true);
    for (const hard of missionTemplatesFor('hard')) expect(gold.some((t) => t.key === hard.key)).toBe(true);
  });
});

describe('un objectif à la mesure de chacun (#9635)', () => {
  const template = (key: string) => MISSION_TEMPLATES.find((t) => t.key === key)!;

  it('un compte qui ne fait pas ce geste commence au plancher, à tout niveau', () => {
    for (const level of [1, 20, 60, 100]) {
      for (const t of MISSION_TEMPLATES) {
        expect({ key: t.key, level, target: missionTarget({ template: t, difficulty: t.difficulty, level, profile: NOBODY }) }).toEqual({ key: t.key, level, target: t.minTarget });
      }
    }
  });

  it('un compte actif est poussé au-delà de sa moyenne, d’autant plus que la mission est difficile', () => {
    const active = profile([], { 'content.text_message': 8 });
    expect(missionTarget({ template: template('send-texts'), difficulty: 'easy', level: 1, profile: active })).toBe(4);
    expect(missionTarget({ template: template('long-chat'), difficulty: 'hard', level: 1, profile: active })).toBe(10);
    expect(missionTarget({ template: template('long-chat'), difficulty: 'gold', level: 1, profile: active })).toBe(12);
  });

  it('la bande de niveau s’applique, et le plafond borne', () => {
    const active = profile([], { 'content.text_message': 8 });
    expect(missionTarget({ template: template('long-chat'), difficulty: 'hard', level: 40, profile: active })).toBe(22);
    expect(missionTarget({ template: template('long-chat'), difficulty: 'hard', level: 100, profile: profile([], { 'content.text_message': 500 }) })).toBe(40);
  });

  it('sans profil, l’objectif de base passe par la bande, borné de même', () => {
    expect(missionTarget({ template: template('send-texts'), difficulty: 'easy', level: 34 })).toBe(missionObjective({ baseTarget: 5, level: 34 }));
    expect(missionTarget({ template: template('publish-post'), difficulty: 'medium', level: 100 })).toBe(1);
  });

  it('un défi hors de portée du profil n’est jamais tiré pour lui', () => {
    for (let u = 0; u < 60; u++) {
      for (const level of [12, 60]) {
        const day = draw({ userId: `poor-${u}`, dayKey: addDays('2026-09-01', u % 9), level, profile: NOBODY });
        expect(day.missions).toHaveLength(3);
        for (const m of day.missions) {
          const t = missionTemplatesFor(m.difficulty).find((x) => x.key === m.templateKey)!;
          expect({ key: t.key, requires: t.requires ?? [] }).toEqual({ key: t.key, requires: [] });
        }
      }
    }
  });
});

describe('hautement récompensé (#9635)', () => {
  const gesturePoints = (signal: string): number => {
    const operation = signal.startsWith('axis:') ? signal.slice(5) : '';
    const rule = (DEFAULT_ENGAGEMENT_SCALE.operations as Record<string, { points: number } | undefined>)[operation];
    return rule?.points ?? 0;
  };

  it('chaque mission paie nettement plus que la somme des points de ses gestes', () => {
    for (const difficulty of MISSION_DIFFICULTIES) {
      for (const template of missionTemplatesFor(difficulty)) {
        for (const target of [template.minTarget, template.maxTarget]) {
          const reward = missionReward({ basePoints: MISSION_BASE_POINTS[difficulty] + template.unitPoints * target, level: 1, flameDays: 0 });
          const gestures = gesturePoints(template.signal) * target;
          expect({ key: template.key, difficulty, target, ok: reward >= 2 * gestures && reward > gestures + MISSION_BASE_POINTS[difficulty] / 2 }).toEqual({ key: template.key, difficulty, target, ok: true });
        }
      }
    }
  });

  it('déclare ce que l’achèvement paie : points, Gloire, étoiles de saison, coffre', () => {
    const joined = drawnMissionOf({ template: MISSION_TEMPLATES.find((t) => t.key === 'invite-joined')!, difficulty: 'gold', level: 60, flameDays: 0 });
    expect(missionArtifacts(joined, 2)).toEqual({ points: joined.reward, glory: GLORY_POINTS.goldMission, seasonStars: seasonStarsForMission('gold'), chest: true });
    const share = drawnMissionOf({ template: MISSION_TEMPLATES.find((t) => t.key === 'share-link')!, difficulty: 'medium', level: 1, flameDays: 0 });
    expect(missionArtifacts(share, 3)).toEqual({ points: share.reward, glory: GLORY_POINTS.goldMission, seasonStars: 1, chest: false });
    const texts = drawnMissionOf({ template: MISSION_TEMPLATES.find((t) => t.key === 'send-texts')!, difficulty: 'easy', level: 1, flameDays: 0 });
    expect(missionArtifacts(texts, 0).glory).toBe(0);
    const promoted = drawnMissionOf({ template: MISSION_TEMPLATES.find((t) => t.key === 'long-chat')!, difficulty: 'gold', level: 60, flameDays: 0 });
    expect(promoted.glory).toBe(GLORY_POINTS.goldMission);
    expect(promoted.reward).toBe(missionReward({ basePoints: MISSION_BASE_POINTS.gold + 12 * promoted.target, level: 60, flameDays: 0 }));
  });
});

describe('objectif et récompense', () => {
  it('lit la bande sur le niveau', () => {
    expect(missionBand(1)).toBe(0);
    expect(missionBand(9)).toBe(0);
    expect(missionBand(10)).toBe(1);
    expect(missionBand(34)).toBe(3);
    expect(missionBand(100)).toBe(10);
  });

  it('suit objectif = ⌈ base × (1 + 0,3 × bande) ⌉', () => {
    expect(missionObjective({ baseTarget: 5, level: 5 })).toBe(5);
    expect(missionObjective({ baseTarget: 5, level: 34 })).toBe(10);
    expect(missionObjective({ baseTarget: 5, level: 50 })).toBe(13);
    expect(missionObjective({ baseTarget: 3, level: 50 })).toBe(8);
    expect(missionObjective({ baseTarget: 1, level: 50 })).toBe(3);
    expect(missionObjective({ baseTarget: 4, level: 50 })).toBe(10);
  });

  it('suit récompense = base × (1 + 0,15 × bande) × (1 + bonus de Flamme)', () => {
    expect(missionReward({ basePoints: 30, level: 5, flameDays: 0 })).toBe(30);
    expect(missionReward({ basePoints: 60, level: 34, flameDays: 23 })).toBe(127);
    expect(missionReward({ basePoints: 30, level: 34, flameDays: 23 })).toBe(64);
    expect(missionReward({ basePoints: 250, level: 50, flameDays: 40 })).toBe(656);
  });
});

describe('le tirage du jour', () => {
  it('est déterministe pour un utilisateur et un jour', () => {
    expect(draw()).toEqual(draw());
  });

  it('change d\'un jour et d\'un utilisateur à l\'autre', () => {
    const keys = (d: ReturnType<typeof draw>) => d.missions.map((m) => m.templateKey).join('|');
    const variants = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f'].flatMap((u) => [1, 2, 3, 4].map((d) => keys(draw({ userId: u, dayKey: `2026-10-0${d}` })))),
    );
    expect(variants.size).toBeGreaterThan(8);
  });

  it('tire une facile, une moyenne et une difficile sous le niveau 50', () => {
    expect(draw().missions.map((m) => m.difficulty)).toEqual(['easy', 'medium', 'hard']);
  });

  it('remplace la difficile par la mission d\'or dès le niveau 50', () => {
    expect(draw({ level: 50 }).missions.map((m) => m.difficulty)).toEqual(['easy', 'medium', 'gold']);
  });

  it('remplace la difficile par la mission d\'or dès 50 Meeshes gardées', () => {
    expect(draw({ level: 12, treasury: 50 }).missions.map((m) => m.difficulty)).toEqual(['easy', 'medium', 'gold']);
    expect(draw({ level: 12, treasury: 49 }).missions.map((m) => m.difficulty)).toEqual(['easy', 'medium', 'hard']);
  });

  it('ne tire jamais deux fois le même signal le même jour', () => {
    for (let u = 0; u < 60; u++) {
      for (let d = 0; d < 6; d++) {
        const day = addDays('2026-09-20', d);
        const signals = draw({ userId: `user-${u}`, dayKey: day, level: u % 2 === 0 ? 20 : 60 }).missions.map((m) => m.signal);
        expect(new Set(signals).size).toBe(signals.length);
      }
    }
  });

  it('un jour Prisme garantit un défi de langue à qui y a droit, et retombe sur le catalogue pour les autres', () => {
    for (let u = 0; u < 40; u++) {
      for (let d = 0; d < 9; d++) {
        const level = [6, 20, 45, 60][(u + d) % 4]!;
        const dayKey = addDays('2026-09-01', d);
        const able = draw({ userId: `user-${u}`, dayKey, level, profile: EVERYTHING });
        const unable = draw({ userId: `user-${u}`, dayKey, level, profile: NOBODY });
        expect(unable.missions).toHaveLength(3);
        expect(unable.missions.some((m) => m.prism)).toBe(false);
        if (able.prismDay) expect({ u, d, prism: able.missions.some((m) => m.prism) }).toEqual({ u, d, prism: true });
      }
    }
  });

  it('tire toujours trois missions, à tous les niveaux, dans les deux régimes du haut, pour tous les profils', () => {
    for (let level = 1; level <= 100; level += 1) {
      for (const [treasury, who] of [[0, NOBODY], [50, NOBODY], [0, EVERYTHING], [50, undefined]] as const) {
        const day = draw({ userId: `lvl-${level}`, dayKey: addDays('2026-09-01', level % 7), level, treasury, ...(who ? { profile: who } : {}) });
        expect({ level, treasury, count: day.missions.length }).toEqual({ level, treasury, count: 3 });
      }
    }
  });

  it('exclut les signaux impossibles pour le compte', () => {
    const unavailable: readonly MissionSignal[] = ['axis:content.post', 'axis:tool.reaction'];
    for (let d = 0; d < 20; d++) {
      const signals = draw({ dayKey: addDays('2026-09-01', d), unavailableSignals: unavailable }).missions.map((m) => m.signal);
      for (const s of unavailable) expect(signals).not.toContain(s);
    }
  });

  it('calcule l\'objectif et la récompense de chaque mission pour le compte', () => {
    for (const m of [...draw({ level: 34, flameDays: 23 }).missions, ...draw({ level: 34, flameDays: 23, treasury: 60 }).missions]) {
      const template = missionTemplatesFor(m.difficulty).find((t) => t.key === m.templateKey);
      expect(template).toBeDefined();
      expect(m.target).toBe(missionTarget({ template: template!, difficulty: m.difficulty, level: 34 }));
      expect(m.reward).toBe(missionReward({ basePoints: MISSION_BASE_POINTS[m.difficulty] + template!.unitPoints * m.target, level: 34, flameDays: 23 }));
    }
  });

  it('attache au moins 40 de Gloire à la mission d\'or', () => {
    for (let u = 0; u < 30; u++) {
      const gold = draw({ userId: `g-${u}`, level: 60 }).missions.find((m) => m.difficulty === 'gold');
      expect(gold!.glory).toBeGreaterThanOrEqual(40);
    }
  });

  it('dit si le jour est un jour Prisme garanti', () => {
    const days = Array.from({ length: 9 }, (_, i) => draw({ dayKey: addDays('2026-09-01', i) }).prismDay);
    expect(days.filter(Boolean).length).toBe(3);
  });
});

describe('changer une mission', () => {
  const today = draw({ level: 30 });

  const reroll = (index: number, rerollCount = 1) =>
    rerollDailyMission({
      userId: 'user-1',
      dayKey: '2026-10-05',
      level: 30,
      flameDays: 5,
      missions: today.missions,
      index,
      rerollCount,
    });

  const rerolled = (index: number) => reroll(index);

  it('garde la même difficulté et change le gabarit', () => {
    for (let index = 0; index < 2; index++) {
      const next = rerolled(index) as DrawnMission;
      expect(next.difficulty).toBe(today.missions[index]!.difficulty);
      expect(next.templateKey).not.toBe(today.missions[index]!.templateKey);
    }
  });

  it('ne duplique aucun signal déjà tiré ce jour-là — et rend null quand la difficulté n\'a plus d\'autre gabarit libre', () => {
    for (let index = 0; index < 3; index++) {
      const next = rerolled(index);
      const others = today.missions.filter((_, i) => i !== index).map((m) => m.signal);
      const free = missionTemplatesFor(today.missions[index]!.difficulty).filter(
        (t) => t.key !== today.missions[index]!.templateKey && !today.missions.some((m) => m.signal === t.signal),
      );
      if (free.length === 0) {
        expect(next).toBeNull();
        continue;
      }
      expect(next).not.toBeNull();
      expect(others).not.toContain(next!.signal);
      expect(next!.signal).not.toBe(today.missions[index]!.signal);
    }
  });

  it('est déterministe', () => {
    expect(reroll(0)).toEqual(reroll(0));
  });

  it('rend null pour une position qui n\'existe pas', () => {
    expect(reroll(7)).toBeNull();
  });
});

describe('remplacer une mission du jour devenue impossible', () => {
  const stale = (over: Partial<DrawnMission>): DrawnMission => ({
    difficulty: 'medium',
    templateKey: 'gabarit-disparu',
    signal: 'axis:social.share',
    prism: false,
    target: 1,
    reward: 60,
    glory: 0,
    ...over,
  });
  const kept = (key: string): DrawnMission =>
    drawnMissionOf({ template: MISSION_TEMPLATES.find((t) => t.key === key)!, difficulty: MISSION_TEMPLATES.find((t) => t.key === key)!.difficulty, level: 30, flameDays: 5 });
  const replace = (
    missions: readonly (DrawnMission & { readonly completed?: boolean })[],
    over: Partial<{ unavailableSignals: readonly MissionSignal[]; profile: MissionProfile }> = {},
  ) =>
    replaceImpossibleMissions({
      userId: 'user-1',
      dayKey: '2026-10-07',
      level: 30,
      flameDays: 5,
      missions: missions.map((m) => ({ ...m, completed: m.completed ?? false })),
      ...over,
    });

  it('un gabarit inconnu du catalogue reçoit un gabarit de même difficulté, au signal libre ce jour-là', () => {
    const day = [kept('send-texts'), stale({}), stale({ difficulty: 'hard', templateKey: 'autre-disparu', signal: 'axis:content.reel' })];
    const replacements = replace(day);
    expect(replacements.map((r) => r.index)).toEqual([1, 2]);
    expect(new Set([day[0]!.signal, ...replacements.map((r) => r.mission.signal)]).size).toBe(3);
    for (const { index, mission } of replacements) {
      expect(mission.difficulty).toBe(day[index]!.difficulty);
      expect(missionTemplatesFor(mission.difficulty).some((t) => t.key === mission.templateKey)).toBe(true);
    }
  });

  it('un défi devenu hors de portée du compte est remplacé par un défi à sa portée', () => {
    const [replacement] = replace([kept('send-texts'), kept('community-hello'), kept('publish-posts')], {
      unavailableSignals: ['axis:conversation.community'],
      profile: NOBODY,
    });
    expect(replacement!.index).toBe(1);
    expect(replacement!.mission.signal).not.toBe('axis:conversation.community');
    expect(MISSION_TEMPLATES.find((t) => t.key === replacement!.mission.templateKey)?.requires ?? []).toEqual([]);
  });

  it('une mission d\'Or reste d\'Or : points et Gloire de l\'Or', () => {
    const [replacement] = replace([kept('send-voice'), kept('comment-text'), stale({ difficulty: 'gold', templateKey: 'or-disparu', reward: 300, glory: 40 })]);
    expect(replacement!.mission.difficulty).toBe('gold');
    expect(replacement!.mission.glory).toBeGreaterThanOrEqual(40);
  });

  it('ne touche ni une mission achevée, ni une mission encore possible', () => {
    expect(replace([kept('send-texts'), { ...stale({}), completed: true }, kept('publish-posts')])).toEqual([]);
  });

  it('est déterministe', () => {
    const day = [kept('send-texts'), stale({}), kept('publish-posts')];
    expect(replace(day)).toEqual(replace(day));
  });
});

describe('les règles autour des missions', () => {
  it('ouvrent au niveau 5, et un changement coûte une Meesh, une fois par jour', () => {
    expect(MISSIONS_MIN_LEVEL).toBe(5);
    expect(MISSION_REROLL_PRICE).toBe(1);
    expect(MISSION_REROLL_PER_DAY).toBe(1);
  });
});

describe('la journée de jeu : une clé monotone, jamais deux ouvertures à moins de 20 h', () => {
  const opened = (dayKey: string, at: string) => ({ dayKey, openedAt: new Date(at) });

  it('sans journée ouverte, la clé est celle du fuseau', () => {
    expect(resolveGameDayKey({ candidate: '2026-10-05', latest: null, now: new Date('2026-10-05T08:00:00Z') })).toBe('2026-10-05');
  });

  it('ne revient jamais en arrière : un fuseau qui recule garde la journée ouverte', () => {
    const latest = opened('2026-10-06', '2026-10-05T23:30:00Z');
    expect(resolveGameDayKey({ candidate: '2026-10-05', latest, now: new Date('2026-10-06T10:00:00Z') })).toBe('2026-10-06');
  });

  it('un fuseau qui avance ne rouvre pas le lendemain moins de 20 h après l’ouverture', () => {
    const latest = opened('2026-10-05', '2026-10-05T10:00:00Z');
    expect(resolveGameDayKey({ candidate: '2026-10-06', latest, now: new Date('2026-10-05T12:00:00Z') })).toBe('2026-10-05');
    expect(resolveGameDayKey({ candidate: '2026-10-06', latest, now: new Date('2026-10-06T05:59:59Z') })).toBe('2026-10-05');
  });

  it('20 h après l’ouverture, la journée suivante s’ouvre', () => {
    const latest = opened('2026-10-05', '2026-10-05T10:00:00Z');
    expect(GAME_DAY_MIN_GAP_MS).toBe(20 * 60 * 60 * 1000);
    expect(resolveGameDayKey({ candidate: '2026-10-06', latest, now: new Date('2026-10-06T06:00:00Z') })).toBe('2026-10-06');
  });
});
