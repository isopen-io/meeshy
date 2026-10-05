import { describe, expect, test } from 'bun:test';

import { FLAME_FORMS } from '@meeshy/shared/utils/game/flame';
import { GLORY_RANKS } from '@meeshy/shared/utils/game/glory';
import { LEVEL_TIER_KEYS } from '@meeshy/shared/utils/game/levels';
import { MISSION_TEMPLATES } from '@meeshy/shared/utils/game/missions';
import { TREASURY_TIERS } from '@meeshy/shared/utils/game/treasury';

import {
  FLAME_FORM_NAMES,
  LEVEL_TIER_NAMES,
  RANK_NAMES,
  TREASURY_NAMES,
  divisionLabel,
  editionName,
  gameErrorMessage,
  meeshCount,
  missionTitle,
  pointsLabel,
  rankLabel,
} from './game-copy';

/**
 * CE QUE LE JEU DIT (#9383) — chaque clé stable du catalogue partagé a son
 * nom. Les tables sont typées `Record<clé, …>` : une clé ajoutée au catalogue
 * sans mot ne compile plus ; ces témoins rejouent l'exhaustivité sur les
 * valeurs, pour qu'un nom vide ne passe pas non plus.
 */
describe('les noms du jeu couvrent tout le catalogue partagé', () => {
  test.each(LEVEL_TIER_KEYS.map((key) => [key]))('palier %s', (key) => {
    expect(LEVEL_TIER_NAMES[key].length).toBeGreaterThan(0);
  });
  test.each(GLORY_RANKS.map((rank) => [rank.key]))('rang %s', (key) => {
    expect(RANK_NAMES[key].length).toBeGreaterThan(0);
  });
  test('le Mythe a son nom', () => {
    expect(RANK_NAMES.mythe).toBe('Mythe');
  });
  test.each(TREASURY_TIERS.map((tier) => [tier.key]))('trésor %s', (key) => {
    expect(TREASURY_NAMES[key].length).toBeGreaterThan(0);
  });
  test.each(FLAME_FORMS.map((form) => [form.key]))('Flamme %s', (key) => {
    expect(FLAME_FORM_NAMES[key].length).toBeGreaterThan(0);
  });
  test.each(MISSION_TEMPLATES.map((template) => [template.key, template.baseTarget]))('mission %s se dit en clair', (key, target) => {
    const title = missionTitle(key, target);
    expect(title.length).toBeGreaterThan(3);
    expect(title).not.toContain(key);
  });
});

describe('les nombres s’accordent', () => {
  test('1 point, 0 point, 2 points', () => {
    expect(pointsLabel(1)).toBe('1 point');
    expect(pointsLabel(0)).toBe('0 point');
    expect(pointsLabel(2)).toBe('2 points');
  });
  test('les milliers se lisent avec une espace', () => {
    expect(pointsLabel(1294).replace(/\s/g, ' ')).toBe('1 294 points');
  });
  test('Meeshes', () => {
    expect(meeshCount(0)).toBe('Aucune Meesh');
    expect(meeshCount(1)).toBe('1 Meesh');
    expect(meeshCount(4)).toBe('4 Meeshes');
  });
  test('une mission au pluriel et au singulier', () => {
    expect(missionTitle('publish-story', 1)).toBe('Publier une story');
    expect(missionTitle('send-texts', 5)).toBe('Envoyer 5 messages');
  });
  test('un gabarit futur se dit sans casser l’écran', () => {
    expect(missionTitle('gabarit-de-2027', 3)).toBe('Mission du jour');
  });
});

describe('rang et division', () => {
  test('la division en chiffres romains, le Mythe sans division', () => {
    expect(divisionLabel(3)).toBe('III');
    expect(divisionLabel(2)).toBe('II');
    expect(divisionLabel(1)).toBe('I');
    expect(rankLabel('voix', 2)).toBe('Voix II');
    expect(rankLabel('mythe', null)).toBe('Mythe');
  });
  test('édition de la Meesh', () => {
    expect(editionName('silver')).toBe('argent');
    expect(editionName('gold')).toBe('or');
    expect(editionName('prism')).toBe('prisme');
  });
});

describe('les refus du serveur se disent', () => {
  test('un code connu a sa phrase, un code inconnu une phrase neutre qui invite à réessayer', () => {
    expect(gameErrorMessage('INSUFFICIENT_MEESHES')).toContain('Meesh');
    expect(gameErrorMessage('FREEZE_AT_MAXIMUM')).toContain('gel');
    expect(gameErrorMessage('???')).toContain('réessaie');
    expect(gameErrorMessage(undefined)).toContain('réessaie');
  });
});
