/**
 * La mission PERSONNELLE du jour (#9539) : une mission par compte et par jour, tirée sur ses usages réels,
 * ses langues et son niveau, avec une plage de deux heures dans SES heures habituelles — sans que ces heures
 * sortent jamais de la loi (seule la plage tirée est servie).
 */

import { describe, it, expect } from 'vitest';
import { MISSION_TEMPLATES } from '../../utils/game/missions.js';
import {
  PERSONAL_ACTIVITIES,
  PERSONAL_MISSION_SLOT,
  PERSONAL_WINDOW_MINUTES,
  activeHoursHistogram,
  drawPersonalMission,
  isPersonalMissionOpen,
  personalMissionActivity,
  personalMissionState,
  personalWindowStillFits,
  type PersonalMissionInput,
} from '../../utils/game/personal-mission.js';
import { personalMissionPhrase } from '../../utils/game/personal-mission-copy.js';
import { NOTIFICATION_LANGUAGES } from '../../utils/notification-strings.js';

const input = (over: Partial<PersonalMissionInput> = {}): PersonalMissionInput => ({
  userId: 'user-1',
  dayKey: '2026-10-06',
  level: 12,
  flameDays: 3,
  nowMinute: 6 * 60,
  activeHours: null,
  usage: {},
  multilingual: false,
  ...over,
});

const evening = (): number[] => Array.from({ length: 24 }, (_, h) => (h === 18 || h === 19 ? 40 : 0));

describe('la mission personnelle', () => {
  it('occupe l’emplacement 3, à côté des trois missions du jour', () => {
    expect(PERSONAL_MISSION_SLOT).toBe(3);
    expect(PERSONAL_WINDOW_MINUTES).toBe(120);
  });

  it('est déterministe : mêmes entrées, même mission et même plage', () => {
    expect(drawPersonalMission(input())).toEqual(drawPersonalMission(input()));
  });

  it('change d’un compte à l’autre et d’un jour à l’autre', () => {
    const draws = ['a', 'b', 'c', 'd', 'e', 'f'].map((userId) => JSON.stringify(drawPersonalMission(input({ userId }))));
    expect(new Set(draws).size).toBeGreaterThan(1);
    const days = ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'].map((dayKey) =>
      JSON.stringify(drawPersonalMission(input({ dayKey }))),
    );
    expect(new Set(days).size).toBeGreaterThan(1);
  });

  it('tire une plage de deux heures pleines, entre 8 h et 23 h', () => {
    for (const userId of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const draw = drawPersonalMission(input({ userId }))!;
      expect(draw.endMinute - draw.startMinute).toBe(120);
      expect(draw.startMinute % 60).toBe(0);
      expect(draw.startMinute).toBeGreaterThanOrEqual(8 * 60);
      expect(draw.endMinute).toBeLessThanOrEqual(23 * 60);
    }
  });

  it('place la plage dans les heures habituelles du compte', () => {
    const starts = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map(
      (userId) => drawPersonalMission(input({ userId, activeHours: evening() }))!.startMinute / 60,
    );
    expect(starts.filter((h) => h >= 17 && h <= 19).length).toBeGreaterThanOrEqual(8);
  });

  it('ne retient pas une plage déjà trop avancée : il reste au moins une heure', () => {
    const late = drawPersonalMission(input({ nowMinute: 20 * 60 + 30 }))!;
    expect(late.endMinute - (20 * 60 + 30)).toBeGreaterThanOrEqual(60);
    expect(drawPersonalMission(input({ nowMinute: 22 * 60 + 30 }))).toBeNull();
  });

  it('dit AVANT le tirage si une plage tient encore : même verdict que le tirage, minute par minute', () => {
    for (const nowMinute of [0, 5 * 60, 20 * 60 + 30, 22 * 60, 22 * 60 + 1, 23 * 60 + 59]) {
      expect(personalWindowStillFits(nowMinute)).toBe(drawPersonalMission(input({ nowMinute })) !== null);
    }
    expect(personalWindowStillFits(22 * 60)).toBe(true);
    expect(personalWindowStillFits(22 * 60 + 1)).toBe(false);
  });

  it('suit le niveau : facile sous le 10, moyenne sous le 30, difficile ensuite', () => {
    expect(drawPersonalMission(input({ level: 6 }))!.mission.difficulty).toBe('easy');
    expect(drawPersonalMission(input({ level: 20 }))!.mission.difficulty).toBe('medium');
    expect(drawPersonalMission(input({ level: 45 }))!.mission.difficulty).toBe('hard');
  });

  it('adosse l’objectif et la récompense aux lois des missions du jour', () => {
    const draw = drawPersonalMission(input({ level: 20, flameDays: 0 }))!;
    const template = MISSION_TEMPLATES.find((t) => t.key === draw.mission.templateKey)!;
    expect(draw.mission.target).toBeGreaterThanOrEqual(template.baseTarget);
    expect(draw.mission.reward).toBeGreaterThan(0);
    expect(draw.mission.glory).toBe(0);
  });

  it('préfère ce que le compte fait déjà', () => {
    const picks = Array.from({ length: 40 }, (_, i) =>
      drawPersonalMission(input({ userId: `u${i}`, level: 6, usage: { 'axis:content.audio_message': 400 } }))!.mission.templateKey,
    );
    expect(picks.filter((key) => key === 'send-voice').length).toBeGreaterThan(14);
  });

  it('ne propose une mission de langue qu’à un compte qui en parle plusieurs', () => {
    const solo = Array.from({ length: 60 }, (_, i) => drawPersonalMission(input({ userId: `s${i}`, level: 20 }))!.mission.prism);
    expect(solo.some(Boolean)).toBe(false);
    const polyglot = Array.from({ length: 60 }, (_, i) =>
      drawPersonalMission(input({ userId: `p${i}`, level: 20, multilingual: true }))!.mission.prism,
    );
    expect(polyglot.some(Boolean)).toBe(true);
  });

  it('ne tire jamais un gabarit hors de portée du profil (#9635)', () => {
    const nobody = { capabilities: [], habits: {} };
    for (let i = 0; i < 90; i += 1) {
      const draw = drawPersonalMission(input({ userId: `n${i}`, level: [6, 20, 45][i % 3]!, multilingual: true, profile: nobody }))!;
      const template = MISSION_TEMPLATES.find((t) => t.key === draw.mission.templateKey)!;
      expect({ key: template.key, requires: template.requires ?? [] }).toEqual({ key: template.key, requires: [] });
    }
  });

  it('ne reprend jamais le signal d’une mission du jour', () => {
    for (let i = 0; i < 30; i += 1) {
      const draw = drawPersonalMission(input({ userId: `x${i}`, level: 6, excludedSignals: ['axis:tool.reaction', 'axis:content.audio_message'] }))!;
      expect(['axis:tool.reaction', 'axis:content.audio_message']).not.toContain(draw.mission.signal);
    }
  });

  it('nomme une activité pour chaque gabarit qu’elle peut tirer, et chaque activité a sa phrase en huit langues', () => {
    for (let i = 0; i < 60; i += 1) {
      const draw = drawPersonalMission(input({ userId: `k${i}`, level: [6, 20, 45][i % 3]!, multilingual: true }))!;
      expect(PERSONAL_ACTIVITIES).toContain(personalMissionActivity(draw.mission.templateKey));
    }
    for (const lang of NOTIFICATION_LANGUAGES) {
      for (const activity of PERSONAL_ACTIVITIES) expect(personalMissionPhrase(lang, activity).length).toBeGreaterThan(3);
    }
    expect(personalMissionPhrase('xx', 'react')).toBe(personalMissionPhrase('en', 'react'));
  });
});

describe('l’état de la mission personnelle', () => {
  const startsAt = new Date('2026-10-06T16:00:00.000Z');
  const endsAt = new Date('2026-10-06T18:00:00.000Z');
  const at = (iso: string, completedAt: Date | null = null) => personalMissionState({ startsAt, endsAt, completedAt, now: new Date(iso) });

  it('est à venir, en cours, puis manquée', () => {
    expect(at('2026-10-06T15:59:59.000Z')).toBe('upcoming');
    expect(at('2026-10-06T16:00:00.000Z')).toBe('active');
    expect(at('2026-10-06T17:59:59.000Z')).toBe('active');
    expect(at('2026-10-06T18:00:00.000Z')).toBe('missed');
  });

  it('est réussie dès qu’elle est faite, quelle que soit l’heure', () => {
    expect(at('2026-10-06T17:00:00.000Z', new Date('2026-10-06T16:30:00.000Z'))).toBe('completed');
    expect(at('2026-10-07T09:00:00.000Z', new Date('2026-10-06T16:30:00.000Z'))).toBe('completed');
  });

  it('n’est réalisable que dans sa plage : début inclus, fin exclue', () => {
    const open = (iso: string) => isPersonalMissionOpen({ startsAt, endsAt, now: new Date(iso) });
    expect(open('2026-10-06T15:59:59.999Z')).toBe(false);
    expect(open('2026-10-06T16:00:00.000Z')).toBe(true);
    expect(open('2026-10-06T17:59:59.999Z')).toBe(true);
    expect(open('2026-10-06T18:00:00.000Z')).toBe(false);
  });
});

describe('l’histogramme des heures habituelles', () => {
  it('compte une activité par heure locale, sur 24 cases', () => {
    const histogram = activeHoursHistogram([18 * 60 + 5, 18 * 60 + 40, 7 * 60]);
    expect(histogram).toHaveLength(24);
    expect(histogram[18]).toBe(2);
    expect(histogram[7]).toBe(1);
    expect(histogram.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('ignore une minute hors de la journée', () => {
    expect(activeHoursHistogram([-1, 1440, Number.NaN]).reduce((a, b) => a + b, 0)).toBe(0);
  });
});
