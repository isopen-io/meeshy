import { beforeAll, describe, expect, test } from 'bun:test';

import { ENGAGEMENT_AXIS_FAMILIES } from '@meeshy/shared/types/engagement';
import { FLAME_FORMS } from '@meeshy/shared/utils/game/flame';
import { GLORY_RANKS } from '@meeshy/shared/utils/game/glory';
import { LEVEL_TIER_KEYS } from '@meeshy/shared/utils/game/levels';
import { MISSION_DIFFICULTIES, MISSION_TEMPLATES } from '@meeshy/shared/utils/game/missions';
import { TREASURY_TIERS } from '@meeshy/shared/utils/game/treasury';

import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

import {
  boundedPercent,
  convertiblePointsLabel,
  daysLabel,
  difficultyName,
  divisionLabel,
  editionName,
  familyName,
  flameFormName,
  formatCount,
  gameErrorMessage,
  levelRingLabel,
  levelTierName,
  levelsLabel,
  materialName,
  medalLabel,
  meeshCount,
  missionTitle,
  pointsLabel,
  rankLabel,
  standingLabel,
  rankName,
  treasuryName,
} from './game-copy';

beforeAll(async () => {
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadGameCatalog(language)));
});

/**
 * CE QUE LE JEU DIT (#9383, #9379) — chaque clé stable du catalogue partagé a
 * son nom, dans CHACUNE des sept langues de l'interface. Les noms viennent du
 * catalogue (`i18n-game-catalog.ts`) : ces témoins rejouent l'exhaustivité sur
 * les valeurs, pour qu'un nom vide ou une clé nue ne passe pas non plus.
 */
const NAMED = (text: string): boolean => text.trim().length > 0 && !text.startsWith('game.') && !text.includes('{') && !text.includes('undefined');

describe('les noms du jeu couvrent tout le catalogue partagé, dans les sept langues', () => {
  for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
    test(`${language} : paliers, rangs, trésor, Flamme, difficultés, éditions`, () => {
      for (const key of LEVEL_TIER_KEYS) expect({ key, ok: NAMED(levelTierName(key, language)) }).toEqual({ key, ok: true });
      for (const { key } of GLORY_RANKS) expect({ key, ok: NAMED(rankName(key, language)) }).toEqual({ key, ok: true });
      expect(NAMED(rankName('mythe', language))).toBe(true);
      for (const { key } of TREASURY_TIERS) expect({ key, ok: NAMED(treasuryName(key, language)) }).toEqual({ key, ok: true });
      for (const { key } of FLAME_FORMS) expect({ key, ok: NAMED(flameFormName(key, language)) }).toEqual({ key, ok: true });
      for (const key of MISSION_DIFFICULTIES) expect({ key, ok: NAMED(difficultyName(key, language)) }).toEqual({ key, ok: true });
      for (const edition of ['silver', 'gold', 'prism'] as const) expect({ edition, ok: NAMED(editionName(edition, language)) }).toEqual({ edition, ok: true });
    });

    test(`${language} : chaque gabarit de mission se dit en clair, au singulier comme au pluriel`, () => {
      for (const { key, baseTarget } of MISSION_TEMPLATES) {
        for (const target of [1, baseTarget, 2, 5, 11, 100]) {
          const title = missionTitle(key, target, language);
          expect({ key, target, ok: NAMED(title) && !title.includes(key) }).toEqual({ key, target, ok: true });
        }
        expect(missionTitle(key, baseTarget, language)).not.toBe(missionTitle('gabarit-de-2027', baseTarget, language));
      }
    });
  }

  test('le Mythe a son nom', () => {
    expect(rankName('mythe', 'fr')).toBe('Mythe');
    expect(rankName('mythe', 'en')).toBe('Myth');
  });

  test('les noms sont traduits, pas recopiés du français', () => {
    expect(levelTierName('etincelle', 'en')).toBe('Spark');
    expect(rankName('voix', 'es')).toBe('Voz');
    expect(treasuryName('coffre', 'de')).not.toBe(treasuryName('coffre', 'fr'));
    expect(flameFormName('soleil', 'ar')).not.toBe(flameFormName('soleil', 'fr'));
  });
});

describe('les nombres s’accordent', () => {
  test('1 point, 0 point, 2 points', () => {
    expect(pointsLabel(1, 'fr')).toBe('1 point');
    expect(pointsLabel(0, 'fr')).toBe('0 point');
    expect(pointsLabel(2, 'fr')).toBe('2 points');
  });
  test('l’anglais met zéro au pluriel', () => {
    expect(pointsLabel(0, 'en')).toBe('0 points');
    expect(pointsLabel(1, 'en')).toBe('1 point');
  });
  test('les milliers se lisent avec une espace', () => {
    expect(pointsLabel(1294, 'fr').replace(/\s/g, ' ')).toBe('1 294 points');
    expect(pointsLabel(1294, 'en')).toBe('1,294 points');
    expect(formatCount(1221, 'de')).toBe('1.221');
  });
  test('points convertibles', () => {
    expect(convertiblePointsLabel(1, 'fr')).toBe('1 point convertible');
    expect(convertiblePointsLabel(621, 'fr')).toBe('621 points convertibles');
  });
  test('Meeshes', () => {
    expect(meeshCount(0, 'fr')).toBe('Aucune Meesh');
    expect(meeshCount(1, 'fr')).toBe('1 Meesh');
    expect(meeshCount(4, 'fr')).toBe('4 Meeshes');
    expect(meeshCount(0, 'en')).toBe('No Meesh');
  });
  test('jours et niveaux, en arabe : duel, 3 à 10, puis le singulier du compté', () => {
    expect(daysLabel(2, 'ar')).toBe('يومان');
    expect(daysLabel(7, 'ar')).toBe('7 أيام');
    expect(daysLabel(12, 'ar')).toBe('12 يومًا');
    expect(levelsLabel(2, 'ar')).toBe('مستويان');
  });
  test('une mission au pluriel et au singulier', () => {
    expect(missionTitle('publish-story', 1, 'fr')).toBe('Publier une story');
    expect(missionTitle('send-texts', 5, 'fr')).toBe('Envoyer 5 messages');
    expect(missionTitle('send-texts', 5, 'en')).toBe('Send 5 messages');
    expect(missionTitle('send-texts', 1, 'en')).toBe('Send 1 message');
  });
  test('un gabarit futur se dit sans casser l’écran', () => {
    expect(missionTitle('gabarit-de-2027', 3, 'fr')).toBe('Mission du jour');
    expect(missionTitle('gabarit-de-2027', 3, 'en')).toBe('Mission of the day');
  });
});

describe('rang et division', () => {
  test('la division en chiffres romains, le Mythe sans division', () => {
    expect(divisionLabel(3)).toBe('III');
    expect(divisionLabel(2)).toBe('II');
    expect(divisionLabel(1)).toBe('I');
    expect(rankLabel('voix', 2, 'fr')).toBe('Voix II');
    expect(rankLabel('mythe', null, 'fr')).toBe('Mythe');
  });
  test('cinq divisions, de V à I (#9636)', () => {
    expect(divisionLabel(5)).toBe('V');
    expect(divisionLabel(4)).toBe('IV');
    expect(rankLabel('echo', 5, 'fr')).toBe('Écho V');
    expect(rankLabel('legende', 4, 'en')).toBe('Legend IV');
  });
  test('un Mythe se dit avec sa place, dans les sept langues ; sans place servie, son nom seul', () => {
    const seat = { number: 42, edition: 57 };
    expect(standingLabel({ rank: 'mythe', division: null, mythic: seat }, 'fr')).toBe('Mythe n° 42');
    expect(standingLabel({ rank: 'mythe', division: null, mythic: seat }, 'en')).toBe('Myth #42');
    for (const language of ['de', 'es', 'it', 'pt', 'ar'] as const) {
      const label = standingLabel({ rank: 'mythe', division: null, mythic: seat }, language);
      expect(label).toContain('42');
      expect(label).toContain(rankLabel('mythe', null, language));
    }
    expect(standingLabel({ rank: 'mythe', division: null, mythic: null }, 'fr')).toBe('Mythe');
    expect(standingLabel({ rank: 'voix', division: 4, mythic: null }, 'fr')).toBe('Voix IV');
  });
  test('édition de la Meesh', () => {
    expect(editionName('silver', 'fr')).toBe('argent');
    expect(editionName('gold', 'fr')).toBe('or');
    expect(editionName('prism', 'fr')).toBe('prisme');
  });
});

describe('les refus du serveur se disent', () => {
  test('un code connu a sa phrase, un code inconnu une phrase neutre qui invite à réessayer', () => {
    expect(gameErrorMessage('INSUFFICIENT_MEESHES', 'fr')).toContain('Meesh');
    expect(gameErrorMessage('FREEZE_AT_MAXIMUM', 'fr')).toContain('gel');
    expect(gameErrorMessage('???', 'fr')).toContain('réessaie');
    expect(gameErrorMessage(undefined, 'fr')).toContain('réessaie');
  });

  test('dans chaque langue, un code connu et l’inconnu ont leur phrase', () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      expect(NAMED(gameErrorMessage('INSUFFICIENT_POINTS', language))).toBe(true);
      expect(gameErrorMessage('INSUFFICIENT_POINTS', language)).not.toBe(gameErrorMessage('???', language));
    }
  });
});

describe('les familles du barème se nomment (#5841)', () => {
  test('les cinq familles ont un nom, dans les sept langues, tous différents', () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const names = ENGAGEMENT_AXIS_FAMILIES.map((family) => familyName(family, language));
      for (const name of names) expect({ language, ok: NAMED(name) }).toEqual({ language, ok: true });
      expect(new Set(names).size).toBe(5);
    }
  });
});

describe('la médaille se dit en toutes lettres (#9466)', () => {
  const axisName = 'Messages texte';

  test('« Messages texte, Or, 100 sur 500 vers Platine »', () => {
    const medal = { tier: 4, material: 'gold', nextMaterial: 'platinum', value: 100, nextThreshold: 500, missing: null } as const;
    expect(medalLabel(medal, axisName, 'fr')).toBe('Messages texte, Or, 100 sur 500 vers Platine');
  });

  test('l’échelle complète ne promet aucun palier suivant', () => {
    const medal = { tier: 5, material: 'platinum', nextMaterial: null, value: 900, nextThreshold: null, missing: null } as const;
    expect(medalLabel(medal, axisName, 'fr')).toBe('Messages texte, Platine, 900');
  });

  test('un badge éteint dit ce qu’il manque', () => {
    const medal = { tier: 0, material: null, nextMaterial: null, value: 0, nextThreshold: 1, missing: 1 } as const;
    expect(medalLabel(medal, axisName, 'fr')).toContain('pas encore obtenu');
  });

  test('dans chaque langue : les sept matières ont un nom, et les trois phrases se disent', () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      for (const material of ['copper', 'bronze', 'silver', 'gold', 'platinum', 'obsidian', 'prism'] as const) {
        expect({ language, material, ok: NAMED(materialName(material, language)) }).toEqual({ language, material, ok: true });
      }
      const climbing = medalLabel({ tier: 4, material: 'gold', nextMaterial: 'platinum', value: 100, nextThreshold: 500, missing: null }, 'X', language);
      const top = medalLabel({ tier: 5, material: 'platinum', nextMaterial: null, value: 900, nextThreshold: null, missing: null }, 'X', language);
      const off = medalLabel({ tier: 0, material: null, nextMaterial: null, value: 0, nextThreshold: 1, missing: 1 }, 'X', language);
      for (const sentence of [climbing, top, off]) expect({ language, ok: NAMED(sentence) }).toEqual({ language, ok: true });
      expect(new Set([climbing, top, off]).size).toBe(3);
    }
  });
});

describe('l’anneau de niveau se dit en toutes lettres (#9481)', () => {
  test('« Niveau 34, palier Éclat, quatrième palier »', () => {
    expect(levelRingLabel(34, 'eclat', 'fr')).toBe('Niveau 34, palier Éclat, quatrième palier');
  });

  test('dans chaque langue, chacun des dix paliers dit son niveau, son nom et son rang', () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      for (const [index, tier] of LEVEL_TIER_KEYS.entries()) {
        const label = levelRingLabel(index * 10 + 5, tier, language);
        expect({ language, tier, ok: NAMED(label) && label.includes(levelTierName(tier, language)) }).toEqual({ language, tier, ok: true });
      }
    }
  });

  test('les vingt rangs ordinaux sont distincts dans une langue', () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const labels = LEVEL_TIER_KEYS.map((tier) => levelRingLabel(1, tier, language));
      expect(new Set(labels).size).toBe(20);
    }
  });
});

describe('un identifiant de requête déjà pris', () => {
  test('REQUEST_ID_CONFLICT a sa phrase dans chaque langue, distincte de la phrase neutre', () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      expect(NAMED(gameErrorMessage('REQUEST_ID_CONFLICT', language))).toBe(true);
      expect(gameErrorMessage('REQUEST_ID_CONFLICT', language)).not.toBe(gameErrorMessage('???', language));
    }
  });
});

describe('un pourcentage servi se borne à l’affichage', () => {
  test('un bonus au-delà de l’ancien plafond (50) s’affiche tel quel', () => {
    expect(boundedPercent(80)).toBe(80);
  });

  test('un pourcentage hors de 0 à 100 est ramené dans la plage, jamais refusé', () => {
    expect(boundedPercent(-4)).toBe(0);
    expect(boundedPercent(250)).toBe(100);
  });
});
