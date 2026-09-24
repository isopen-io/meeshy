import { describe, expect, test } from 'bun:test';

import { ENGAGEMENT_ACHIEVEMENT_KEYS, ENGAGEMENT_AXES, ENGAGEMENT_AXIS_FAMILIES } from '@meeshy/shared/types/engagement';
import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import {
  ACHIEVEMENT_COPY,
  AXIS_GLYPHS,
  AXIS_LABELS,
  BADGE_UNIT,
  FAMILY_LABELS,
  LEVEL_UNIT,
  STREAK_UNIT,
  levelTitle,
  nextStepLabel,
  reachedAtLabel,
  scoreLabel,
  streakLabel,
  streakRecordLabel,
} from './progression';

/**
 * CE QUE L'ÉCRAN DIT (#5547) — exhaustif sur le catalogue partagé, et des
 * phrases qui disent le PAS, jamais une fraction nue.
 */

describe('les tables couvrent le catalogue partagé, sans trou ni vide', () => {
  test('chaque axe a un libellé et un glyphe', () => {
    for (const key of ENGAGEMENT_AXES) {
      expect(AXIS_LABELS[key].length).toBeGreaterThan(0);
      expect(AXIS_GLYPHS[key].length).toBeGreaterThan(0);
    }
  });

  test('chaque famille a son titre de section', () => {
    for (const family of ENGAGEMENT_AXIS_FAMILIES) expect(FAMILY_LABELS[family].length).toBeGreaterThan(0);
  });

  test('chaque succès a un titre ET sa condition — verrouillé, on sait quoi faire', () => {
    for (const key of ENGAGEMENT_ACHIEVEMENT_KEYS) {
      expect(ACHIEVEMENT_COPY[key].title.length).toBeGreaterThan(0);
      expect(ACHIEVEMENT_COPY[key].condition.length).toBeGreaterThan(0);
    }
  });
});

describe('les phrases de palier', () => {
  const progress = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);

  test('un axe à 42 sur un palier 50 : « Encore 8 avant le palier 50 »', () => {
    const messages = progress.axes.find((a) => a.axisKey === 'content.text_message');
    expect(messages && nextStepLabel(messages, BADGE_UNIT)).toBe('Encore 8 avant le palier 50');
  });

  test('le niveau compte en points et nomme son RANG, la série en jours', () => {
    // « niveau 4 », jamais « niveau 400 » — le seuil de points n'est pas un niveau.
    const manque = (progress.level.nextThreshold ?? 0) - progress.level.value;
    expect(nextStepLabel(progress.level, LEVEL_UNIT, progress.level.level + 1)).toBe(
      `Encore ${manque} points avant le niveau ${progress.level.level + 1}`,
    );
    expect(nextStepLabel(progress.streak, STREAK_UNIT)).toBe('Encore 2 jours avant le jalon de 7');
  });

  test('une échelle complète le dit, sans palier inventé', () => {
    const complete = resolveEngagementProgress({
      ...ENGAGEMENT_PROGRESS_FIXTURE,
      counters: [{ axisKey: 'tool.sticker', count: 500 }],
    });
    const stickers = complete.axes.find((a) => a.axisKey === 'tool.sticker');
    expect(stickers && nextStepLabel(stickers, BADGE_UNIT)).toBe('Échelle complète');
  });

  test('singulier et pluriel', () => {
    expect(levelTitle(3)).toBe('Niveau 3');
    expect(scoreLabel(1)).toBe('1 point');
    expect(scoreLabel(350)).toBe('350 points');
    expect(streakLabel(0)).toBe('Aucune série en cours');
    expect(streakLabel(1)).toBe('1 jour d’affilée');
    expect(streakLabel(5)).toBe('5 jours d’affilée');
    expect(streakRecordLabel(12)).toBe('Record : 12 jours');
  });

  test('une date gravée se lit « Obtenu le … » ; sans trace, rien — jamais une date inventée', () => {
    expect(reachedAtLabel('2026-09-03T12:00:00.000Z')).toMatch(/^Obtenu le \d{1,2} septembre 2026$/);
    expect(reachedAtLabel(null)).toBeNull();
    expect(reachedAtLabel('pas une date')).toBeNull();
  });
});
