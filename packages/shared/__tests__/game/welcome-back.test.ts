import { describe, it, expect } from 'vitest';
import {
  WELCOME_BACK_ABSENCE_DAYS,
  WELCOME_BACK_EASED_DAYS,
  WELCOME_BACK_PERIOD_DAYS,
  easedProfile,
  isEasedDreamDay,
  welcomeBackDay,
} from '../../utils/game/welcome-back.js';
import { MISSION_CAPABILITIES, MISSION_TEMPLATES, drawDailyMissions, missionTarget, type MissionProfile } from '../../utils/game/missions.js';

const day = (previousGameDay: string | null, today: string, lastWelcomeDay: string | null = null) =>
  welcomeBackDay({ previousGameDay, today, lastWelcomeDay });

describe('welcomeBackDay — le jour où un joueur revient après une absence (#20218, #17373)', () => {
  it('sept jours sans journée de jeu : le retour commence aujourd’hui', () => {
    expect(WELCOME_BACK_ABSENCE_DAYS).toBe(7);
    expect(day('2026-11-10', '2026-11-17')).toBe('2026-11-17');
  });

  it('six jours : aucun retour', () => {
    expect(day('2026-11-11', '2026-11-17')).toBeNull();
  });

  it('un joueur qui n’a jamais joué ne revient pas : il commence', () => {
    expect(day(null, '2026-11-17')).toBeNull();
  });

  it('une fois par période de trente jours : un second départ dans la période ne rouvre rien', () => {
    expect(WELCOME_BACK_PERIOD_DAYS).toBe(30);
    expect(day('2026-11-20', '2026-12-01', '2026-11-10')).toBe('2026-11-10');
    expect(day('2026-12-01', '2026-12-10', '2026-11-10')).toBe('2026-12-10');
  });

  it('rend le retour déjà gravé tant qu’aucun autre ne commence', () => {
    expect(day('2026-11-17', '2026-11-18', '2026-11-17')).toBe('2026-11-17');
  });

  it('une clé illisible ne fabrique aucun retour', () => {
    expect(day('hier', '2026-11-17')).toBeNull();
    expect(day('2026-11-01', 'demain')).toBeNull();
    expect(day('2026-11-17', '2026-11-18', 'jadis')).toBeNull();
  });
});

describe('isEasedDreamDay — trois Rêves allégés, du jour du retour aux deux suivants', () => {
  it('le jour du retour et les deux suivants sont allégés, pas le quatrième', () => {
    expect(WELCOME_BACK_EASED_DAYS).toBe(3);
    expect(isEasedDreamDay({ welcomeDay: '2026-11-17', today: '2026-11-17' })).toBe(true);
    expect(isEasedDreamDay({ welcomeDay: '2026-11-17', today: '2026-11-19' })).toBe(true);
    expect(isEasedDreamDay({ welcomeDay: '2026-11-17', today: '2026-11-20' })).toBe(false);
  });

  it('aucun retour, un jour antérieur ou une clé illisible : rien n’est allégé', () => {
    expect(isEasedDreamDay({ welcomeDay: null, today: '2026-11-17' })).toBe(false);
    expect(isEasedDreamDay({ welcomeDay: '2026-11-17', today: '2026-11-16' })).toBe(false);
    expect(isEasedDreamDay({ welcomeDay: 'jadis', today: '2026-11-17' })).toBe(false);
  });
});

describe('easedProfile — un Rêve allégé se tire comme celui d’un compte qui commence', () => {
  const profile: MissionProfile = {
    capabilities: MISSION_CAPABILITIES,
    habits: Object.fromEntries(MISSION_TEMPLATES.flatMap((t) => (t.habit ? [[t.habit.operation, 40]] : []))),
  };

  it('garde ce que le compte peut faire, oublie ce qu’il faisait d’habitude', () => {
    expect(easedProfile(profile)).toEqual({ capabilities: profile.capabilities, habits: {} });
  });

  it('chaque acte vaut le plancher de son gabarit', () => {
    const draw = drawDailyMissions({ userId: 'u1', dayKey: '2026-11-17', level: 40, flameDays: 0, treasury: 0, profile: easedProfile(profile) });
    expect(draw.missions.length).toBeGreaterThan(0);
    for (const mission of draw.missions) {
      const template = MISSION_TEMPLATES.find((t) => t.key === mission.templateKey)!;
      expect(mission.target).toBe(template.minTarget);
    }
  });

  it('n’alourdit jamais un acte : l’objectif allégé ne dépasse pas l’ordinaire', () => {
    for (const template of MISSION_TEMPLATES) {
      const usual = missionTarget({ template, difficulty: template.difficulty, level: 40, profile });
      const eased = missionTarget({ template, difficulty: template.difficulty, level: 40, profile: easedProfile(profile) });
      expect(eased).toBeLessThanOrEqual(usual);
    }
  });
});
