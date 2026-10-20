import { describe, expect, test } from 'bun:test';

import { ACHIEVEMENT_FAMILIES } from '@meeshy/shared/types/achievement-families';
import { BADGE_THRESHOLDS, ENGAGEMENT_ACHIEVEMENT_KEYS, ENGAGEMENT_AXES, ENGAGEMENT_AXIS_FAMILIES } from '@meeshy/shared/types/engagement';
import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { familyName, pointsLabel } from './game-copy';
import {
  AXIS_GLYPHS,
  achievementCopy,
  achievementSectionTitle,
  axisLabel,
  generatedAchievementLabel,
  levelTitle,
  nextStepLabel,
  reachedAtLabel,
} from './progression';

/**
 * CE QUE L'ÉCRAN DIT (#5547) — exhaustif sur le catalogue partagé, et des
 * phrases qui disent le PAS, jamais une fraction nue.
 */

describe('les tables couvrent le catalogue partagé, sans trou ni vide', () => {
  test('chaque axe a un libellé et un glyphe', () => {
    for (const key of ENGAGEMENT_AXES) {
      expect(axisLabel(key).length).toBeGreaterThan(0);
      expect(AXIS_GLYPHS[key].length).toBeGreaterThan(0);
    }
  });

  test('un logo par type (#9639) : deux axes ne partagent jamais la même icône', () => {
    const glyphs = ENGAGEMENT_AXES.map((key) => AXIS_GLYPHS[key]);
    expect(new Set(glyphs).size).toBe(ENGAGEMENT_AXES.length);
  });

  test('chaque famille a son titre de section', () => {
    for (const family of ENGAGEMENT_AXIS_FAMILIES) expect(familyName(family).length).toBeGreaterThan(0);
  });

  test('chaque succès a un titre ET sa condition — verrouillé, on sait quoi faire', () => {
    for (const key of ENGAGEMENT_ACHIEVEMENT_KEYS) {
      expect(achievementCopy(key).title.length).toBeGreaterThan(0);
      expect(achievementCopy(key).condition.length).toBeGreaterThan(0);
    }
  });
});

describe('les phrases de palier', () => {
  const progress = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);

  test('un axe à 42 sur un palier 50 : « 8 jusqu’au palier 50 »', () => {
    const messages = progress.axes.find((a) => a.axisKey === 'content.text_message');
    expect(messages && nextStepLabel(messages)).toBe('8 jusqu’au palier 50');
  });

  test('une échelle complète le dit, sans palier inventé', () => {
    // Le plus haut palier, jamais un nombre en dur (#9392 a étendu
    // BADGE_THRESHOLDS à 1 000 et 5 000 sans que ce témoin ne suive).
    const dernierPalier = Math.max(...BADGE_THRESHOLDS);
    const complete = resolveEngagementProgress({
      ...ENGAGEMENT_PROGRESS_FIXTURE,
      counters: [{ axisKey: 'tool.sticker', count: dernierPalier }],
    });
    const stickers = complete.axes.find((a) => a.axisKey === 'tool.sticker');
    expect(stickers && nextStepLabel(stickers)).toBe('Échelle complète');
  });

  test('singulier et pluriel', () => {
    expect(levelTitle(3)).toBe('Niveau 3');
    expect(pointsLabel(1)).toBe('1 étincelle');
    expect(pointsLabel(350)).toBe('350 étincelles');
  });

  test('une date gravée se lit « Obtenu le … » ; sans trace, rien — jamais une date inventée', () => {
    expect(reachedAtLabel('2026-09-03T12:00:00.000Z')).toMatch(/^Obtenu le \d{1,2} septembre 2026$/);
    expect(reachedAtLabel(null)).toBeNull();
    expect(reachedAtLabel('pas une date')).toBeNull();
  });

  test('interface en : la date gravée parle anglais, plus « Obtenu le » ni un mois français (#10822)', async () => {
    await loadGameCatalog('en');
    const label = reachedAtLabel('2026-09-03T12:00:00.000Z', 'en');
    expect(label).toMatch(/^Earned on September \d{1,2}, 2026$/);
  });
});

/**
 * UNE SEULE LANGUE D'INTERFACE (#10823) — l'ancien chrome de Progression
 * (familles, sections, paliers, niveau, libellés d'axe et de succès) suit la
 * langue d'interface, avec les valeurs d'iOS.
 */
describe('l’écran Progression parle la langue d’interface', () => {
  const progress = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
  const messages = progress.axes.find((a) => a.axisKey === 'content.text_message');

  test('interface en : palier, échelle complète, niveau, section, axe, succès', async () => {
    await loadGameCatalog('en');
    expect(messages && nextStepLabel(messages, 'en')).toBe('8 to the 50 mark');
    expect(levelTitle(3, 'en')).toBe('Level 3');
    expect(achievementSectionTitle('cercles', 'en')).toBe('Circles');
    expect(achievementSectionTitle('decouverte', 'en')).toBe('Discovery');
    expect(axisLabel('content.text_message', 'en')).not.toBe(axisLabel('content.text_message', 'fr'));
    expect(achievementCopy('achievement.first_voice', 'en').title).not.toBe(achievementCopy('achievement.first_voice', 'fr').title);
    const family = ACHIEVEMENT_FAMILIES[0];
    expect(family && generatedAchievementLabel(family, 10, 'en')).not.toBe(family && generatedAchievementLabel(family, 10, 'fr'));
  });

  test('interface de : la section et le palier viennent du catalogue allemand', async () => {
    await loadGameCatalog('de');
    expect(achievementSectionTitle('appels', 'de')).toBe('Anrufe');
    expect(messages && nextStepLabel(messages, 'de')).toBe('Noch 8 bis Stufe 50');
  });
});
