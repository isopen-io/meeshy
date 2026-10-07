/**
 * Les missions du jour (#9373) : un catalogue de gabarits dont les signaux ne
 * sont que des faits que la passerelle observe à l'écriture, et un tirage
 * déterministe par utilisateur et par jour.
 */

import { describe, it, expect } from 'vitest';
import {
  GAME_DAY_MIN_GAP_MS,
  MISSIONS_MIN_LEVEL,
  MISSION_REROLL_PER_DAY,
  MISSION_REROLL_PRICE,
  MISSION_DIFFICULTIES,
  MISSION_TEMPLATES,
  RETIRED_MISSION_TEMPLATE_KEYS,
  drawDailyMissions,
  isRetiredMissionTemplate,
  missionTemplatesFor,
  missionBand,
  missionObjective,
  missionReward,
  replaceRetiredMissions,
  rerollDailyMission,
  resolveGameDayKey,
  type DrawnMission,
  type MissionSignal,
} from '../../utils/game/missions.js';
import { ENGAGEMENT_AXES } from '../../types/engagement.js';
import { addDays } from '../../utils/game/day-prng.js';

const draw = (over: Partial<Parameters<typeof drawDailyMissions>[0]> = {}) =>
  drawDailyMissions({ userId: 'user-1', dayKey: '2026-10-05', level: 20, flameDays: 5, treasury: 0, ...over });

const TRACED = [
  'react-messages',
  'send-voice',
  'send-texts',
  'send-attachments',
  'comment-text',
  'publish-story',
  'publish-post',
  'publish-posts',
  'long-chat',
] as const;

describe('le catalogue (#9634) : seulement des gestes que le serveur compte', () => {
  it('a des clés uniques et stables', () => {
    const keys = MISSION_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('garde exactement les neuf gabarits tracés', () => {
    expect(MISSION_TEMPLATES.map((t) => t.key).sort()).toEqual([...TRACED].sort());
  });

  it('ne contient aucun gabarit retiré', () => {
    expect(RETIRED_MISSION_TEMPLATE_KEYS.slice().sort()).toEqual(
      [
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
      ].sort(),
    );
    for (const difficulty of MISSION_DIFFICULTIES) {
      for (const { key } of missionTemplatesFor(difficulty)) expect({ key, retired: isRetiredMissionTemplate(key) }).toEqual({ key, retired: false });
    }
    expect(isRetiredMissionTemplate('send-texts')).toBe(false);
    expect(isRetiredMissionTemplate('gold-reply-conversations')).toBe(true);
  });

  it('ne porte que des axes d\'engagement : un geste de l\'utilisateur, jamais un fait de tiers ni une langue', () => {
    for (const template of MISSION_TEMPLATES) {
      expect({ key: template.key, axis: ENGAGEMENT_AXES.some((axis) => template.signal === `axis:${axis}`) }).toEqual({ key: template.key, axis: true });
      expect(template.prism).toBe(false);
    }
  });

  it('long-chat est la difficile de send-texts : même geste, deux fois son objectif', () => {
    const texts = MISSION_TEMPLATES.find((t) => t.key === 'send-texts')!;
    const long = MISSION_TEMPLATES.find((t) => t.key === 'long-chat')!;
    expect(long.signal).toBe(texts.signal);
    expect(long.baseTarget).toBe(texts.baseTarget * 2);
  });

  it('chaque difficulté a ses points de base ; l\'Or est la difficile portée à l\'Or', () => {
    const baseOf = (difficulty: (typeof MISSION_DIFFICULTIES)[number]) => new Set(missionTemplatesFor(difficulty).map((t) => t.basePoints));
    expect(MISSION_DIFFICULTIES).toEqual(['easy', 'medium', 'hard', 'gold']);
    expect([...baseOf('easy')]).toEqual([30]);
    expect([...baseOf('medium')]).toEqual([60]);
    expect([...baseOf('hard')]).toEqual([120]);
    expect([...baseOf('gold')]).toEqual([250]);
    expect(missionTemplatesFor('gold').map((t) => [t.key, t.signal, t.baseTarget, t.difficulty])).toEqual(
      missionTemplatesFor('hard').map((t) => [t.key, t.signal, t.baseTarget, 'gold']),
    );
  });

  it('chaque emplacement garde au moins deux gabarits tirables, une fois écartés les signaux déjà tirés', () => {
    const signalsOf = (difficulty: (typeof MISSION_DIFFICULTIES)[number]) => missionTemplatesFor(difficulty).map((t) => t.signal);
    for (const top of ['hard', 'gold'] as const) {
      expect(missionTemplatesFor(top).length).toBeGreaterThanOrEqual(2);
      for (const topSignal of signalsOf(top)) {
        const medium = missionTemplatesFor('medium').filter((t) => t.signal !== topSignal);
        expect({ top, topSignal, medium: medium.length >= 2 }).toEqual({ top, topSignal, medium: true });
        for (const mediumSignal of medium.map((t) => t.signal)) {
          const easy = missionTemplatesFor('easy').filter((t) => t.signal !== topSignal && t.signal !== mediumSignal);
          expect({ top, topSignal, mediumSignal, easy: easy.length >= 2 }).toEqual({ top, topSignal, mediumSignal, easy: true });
        }
      }
    }
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

  it('un jour Prisme, sans gabarit Prisme au catalogue, retombe sur le catalogue entier : trois missions, aucune de langue', () => {
    let prismDays = 0;
    for (let u = 0; u < 40; u++) {
      for (let d = 0; d < 9; d++) {
        const level = [6, 20, 45, 60][(u + d) % 4]!;
        const day = draw({ userId: `user-${u}`, dayKey: addDays('2026-09-01', d), level });
        if (day.prismDay) prismDays += 1;
        expect(day.missions).toHaveLength(3);
        expect(day.missions.some((m) => m.prism)).toBe(false);
      }
    }
    expect(prismDays).toBeGreaterThan(0);
  });

  it('tire toujours trois missions, à tous les niveaux et dans les deux régimes du haut', () => {
    for (let level = 1; level <= 100; level += 1) {
      for (const treasury of [0, 50]) {
        const day = draw({ userId: `lvl-${level}`, dayKey: addDays('2026-09-01', level % 7), level, treasury });
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

describe('remplacer une mission du jour tirée sur un gabarit retiré (#9634)', () => {
  const retired = (over: Partial<DrawnMission>): DrawnMission => ({
    difficulty: 'medium',
    templateKey: 'share-link',
    signal: 'axis:social.share',
    prism: false,
    target: 1,
    reward: 60,
    glory: 0,
    ...over,
  });
  const kept = (key: string): DrawnMission => {
    const t = MISSION_TEMPLATES.find((template) => template.key === key)!;
    return { difficulty: t.difficulty, templateKey: t.key, signal: t.signal, prism: false, target: t.baseTarget, reward: t.basePoints, glory: 0 };
  };
  const replace = (missions: readonly (DrawnMission & { readonly completed?: boolean })[], over: Partial<{ userId: string; level: number }> = {}) =>
    replaceRetiredMissions({
      userId: over.userId ?? 'user-1',
      dayKey: '2026-10-07',
      level: over.level ?? 30,
      flameDays: 5,
      missions: missions.map((m) => ({ ...m, completed: m.completed ?? false })),
    });

  it('remplace par un gabarit tracé de même difficulté, au signal libre ce jour-là', () => {
    const day = [kept('send-texts'), retired({}), retired({ difficulty: 'hard', templateKey: 'prism-foreign-exchange', signal: 'foreign-language-message', prism: true })];
    const replacements = replace(day);
    expect(replacements.map((r) => r.index)).toEqual([1, 2]);
    const signals = new Set([day[0]!.signal, ...replacements.map((r) => r.mission.signal)]);
    expect(signals.size).toBe(3);
    for (const { index, mission } of replacements) {
      expect(mission.difficulty).toBe(day[index]!.difficulty);
      expect(isRetiredMissionTemplate(mission.templateKey)).toBe(false);
      expect(mission.prism).toBe(false);
      expect(mission.target).toBe(missionObjective({ baseTarget: MISSION_TEMPLATES.find((t) => t.key === mission.templateKey)!.baseTarget, level: 30 }));
    }
  });

  it('une mission d\'Or retirée reste d\'Or : points et Gloire de l\'Or', () => {
    const [replacement] = replace([kept('send-voice'), kept('comment-text'), retired({ difficulty: 'gold', templateKey: 'gold-reply-conversations', signal: 'reply-distinct-conversations', reward: 300, glory: 40 })], { level: 60 });
    expect(replacement!.index).toBe(2);
    expect(replacement!.mission.difficulty).toBe('gold');
    expect(replacement!.mission.glory).toBe(40);
    expect(replacement!.mission.reward).toBe(missionReward({ basePoints: 250, level: 60, flameDays: 5 }));
  });

  it('ne touche ni une mission achevée, ni une mission tracée', () => {
    expect(replace([kept('send-texts'), { ...retired({}), completed: true }, kept('publish-posts')])).toEqual([]);
  });

  it('quand tous les gabarits libres sont pris, garde la difficulté plutôt que de laisser la mission morte', () => {
    const [replacement] = replace([kept('send-texts'), kept('publish-post'), retired({ difficulty: 'hard', templateKey: 'voice-comments', signal: 'axis:comment.audio' })]);
    expect(replacement!.mission.difficulty).toBe('hard');
    expect(['publish-posts', 'long-chat']).toContain(replacement!.mission.templateKey);
  });

  it('est déterministe', () => {
    const day = [kept('send-texts'), retired({}), kept('publish-posts')];
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
