/**
 * Les missions du jour (#9373) : un catalogue de gabarits dont les signaux ne
 * sont que des faits que la passerelle observe à l'écriture, et un tirage
 * déterministe par utilisateur et par jour.
 */

import { describe, it, expect } from 'vitest';
import {
  MISSION_DIFFICULTIES,
  MISSION_TEMPLATES,
  drawDailyMissions,
  missionBand,
  missionObjective,
  missionReward,
  rerollDailyMission,
  type DrawnMission,
  type MissionSignal,
} from '../../utils/game/missions.js';
import { ENGAGEMENT_AXES } from '../../types/engagement.js';
import { addDays } from '../../utils/game/day-prng.js';

const draw = (over: Partial<Parameters<typeof drawDailyMissions>[0]> = {}) =>
  drawDailyMissions({ userId: 'user-1', dayKey: '2026-10-05', level: 20, flameDays: 5, treasury: 0, ...over });

const OBSERVABLE_NON_AXIS: readonly MissionSignal[] = [
  'reply-distinct-conversations',
  'foreign-language-message',
  'replies-received-distinct-authors',
];

describe('le catalogue', () => {
  it('a des clés uniques et stables', () => {
    const keys = MISSION_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('ne porte que des signaux observables à l\'écriture', () => {
    for (const template of MISSION_TEMPLATES) {
      const isAxis = ENGAGEMENT_AXES.some((axis) => template.signal === `axis:${axis}`);
      const isOtherFact = OBSERVABLE_NON_AXIS.includes(template.signal);
      expect(isAxis || isOtherFact, template.key).toBe(true);
    }
  });

  it('couvre les quatre difficultés avec les points de base de la conception', () => {
    const baseOf = (difficulty: string) =>
      new Set(MISSION_TEMPLATES.filter((t) => t.difficulty === difficulty).map((t) => t.basePoints));
    expect(MISSION_DIFFICULTIES).toEqual(['easy', 'medium', 'hard', 'gold']);
    expect([...baseOf('easy')]).toEqual([30]);
    expect([...baseOf('medium')]).toEqual([60]);
    expect([...baseOf('hard')]).toEqual([120]);
    expect([...baseOf('gold')]).toEqual([250]);
  });

  it('a au moins deux gabarits Prisme moyens ou difficiles', () => {
    expect(MISSION_TEMPLATES.filter((t) => t.prism && (t.difficulty === 'medium' || t.difficulty === 'hard')).length).toBeGreaterThanOrEqual(2);
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

  it('propose un gabarit Prisme au moins un jour sur trois', () => {
    for (let u = 0; u < 40; u++) {
      const level = u % 2 === 0 ? 20 : 60;
      const hasPrism = (offset: number) =>
        draw({ userId: `user-${u}`, dayKey: addDays('2026-09-01', offset), level }).missions.some((m) => m.prism);
      for (let start = 0; start < 28; start++) {
        expect([0, 1, 2].some((k) => hasPrism(start + k)), `user-${u} jour ${start}`).toBe(true);
      }
    }
  });

  it('exclut les signaux impossibles pour le compte', () => {
    const unavailable: readonly MissionSignal[] = ['foreign-language-message', 'axis:tool.reaction'];
    for (let d = 0; d < 20; d++) {
      const signals = draw({ dayKey: addDays('2026-09-01', d), unavailableSignals: unavailable }).missions.map((m) => m.signal);
      for (const s of unavailable) expect(signals).not.toContain(s);
    }
  });

  it('calcule l\'objectif et la récompense de chaque mission pour le compte', () => {
    for (const m of draw({ level: 34, flameDays: 23 }).missions) {
      const template = MISSION_TEMPLATES.find((t) => t.key === m.templateKey);
      expect(template).toBeDefined();
      expect(m.target).toBe(missionObjective({ baseTarget: template!.baseTarget, level: 34 }));
      expect(m.reward).toBe(missionReward({ basePoints: template!.basePoints, level: 34, flameDays: 23 }));
    }
  });

  it('attache 40 de Gloire à la mission d\'or, rien aux autres', () => {
    const missions = draw({ level: 60 }).missions;
    expect(missions.find((m) => m.difficulty === 'gold')?.glory).toBe(40);
    expect(missions.filter((m) => m.difficulty !== 'gold').every((m) => m.glory === 0)).toBe(true);
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

  it('garde la même difficulté et change le gabarit', () => {
    for (let index = 0; index < 3; index++) {
      const next = reroll(index) as DrawnMission;
      expect(next.difficulty).toBe(today.missions[index]!.difficulty);
      expect(next.templateKey).not.toBe(today.missions[index]!.templateKey);
    }
  });

  it('ne duplique aucun signal déjà tiré ce jour-là', () => {
    for (let index = 0; index < 3; index++) {
      const next = reroll(index) as DrawnMission;
      const others = today.missions.filter((_, i) => i !== index).map((m) => m.signal);
      expect(others).not.toContain(next.signal);
      expect(next.signal).not.toBe(today.missions[index]!.signal);
    }
  });

  it('est déterministe', () => {
    expect(reroll(0)).toEqual(reroll(0));
  });

  it('rend null pour une position qui n\'existe pas', () => {
    expect(reroll(7)).toBeNull();
  });
});
