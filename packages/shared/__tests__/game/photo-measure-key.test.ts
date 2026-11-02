/**
 * LA CLÉ DE MESURE D'UNE ÉTAPE (D15, #10185 — lot L20 #10176) : la mesure de l'immortalisation groupe les étapes par
 * famille et par une clé AGRÉGÉE, qui ne garde que ce qui dit QUEL moment (le rang, le palier, le seuil) et jamais ce
 * qui individualise une ligne (la division, le numéro de Meesh ou de Prestige, la date, la semaine, la saison).
 */

import { describe, it, expect } from 'vitest';
import { PHOTO_MEASURE_FAMILIES, photoMeasureKeyOf } from '../../utils/game/photo-measure.js';
import { PHOTO_STATIC_STEP_IDS } from '../../utils/game/photo-step-ids.js';

describe('la clé agrégée garde le moment, jamais ce qui individualise la ligne', () => {
  it.each([
    ['start', 'start', 'start'],
    ['rank:murmure:5', 'rank', 'rank:murmure'],
    ['rank:murmure:1', 'rank', 'rank:murmure'],
    ['rank:legende:3', 'rank', 'rank:legende'],
    ['rank:mythe:0', 'rank', 'rank:mythe'],
    ['tier:lueur', 'tier', 'tier:lueur'],
    ['tier:lueur:3', 'tier', 'tier:lueur'],
    ['level-100:0', 'summit', 'level-100'],
    ['level-100:4', 'summit', 'level-100'],
    ['prestige:2', 'summit', 'prestige'],
    ['meesh:1', 'meesh', 'meesh'],
    ['meesh:9990', 'meesh', 'meesh'],
    ['treasury:coffre', 'treasury', 'treasury:coffre'],
    ['flame:30', 'flame', 'flame:30'],
    ['achievement:achievement.first_content', 'achievement', 'achievement:achievement.first_content'],
    ['trophy:trophy.prestige.3', 'trophy', 'trophy:prestige'],
    ['trophy:trophy.flame.100', 'trophy', 'trophy:flame'],
    ['trophy:trophy.league-cup.2026-10-12.jade.gold', 'trophy', 'trophy:league-cup'],
    ['trophy:trophy.season-cup.4', 'trophy', 'trophy:season-cup'],
    ['league-up:2026-10-12:jade', 'league', 'league-up:jade'],
    ['season:3', 'season', 'season'],
    ['day:2026-10-25', 'day', 'day'],
  ])('%s ⇒ %s / %s', (stepId, family, key) => {
    expect(photoMeasureKeyOf(stepId)).toEqual({ family, key });
  });

  it("un haut fait composé perd son palier, comme un rang perd sa division", () => {
    const composed = PHOTO_STATIC_STEP_IDS.find((id) => /^achievement:achievement\.[^:]+:\d+$/.test(id));
    expect(composed).toBeDefined();
    const family = (composed ?? '').replace(/:\d+$/, '');
    expect(photoMeasureKeyOf(composed ?? '')).toEqual({ family: 'achievement', key: family });
  });

  it.each([
    '',
    'rank:murmure',
    'rank:murmure:0',
    'rank:murmure:6',
    'rank:inconnu:3',
    'rank:mythe:1',
    'tier:inconnu',
    'tier:etincelle',
    'tier:lueur:0',
    'tier:lueur:99',
    'level-100:99',
    'prestige:0',
    'meesh:0',
    'meesh:abc',
    'treasury:inconnu',
    'flame:8',
    'achievement:achievement.inconnu',
    'trophy:inconnu',
    'league-up:2026-10-12:inconnue',
    'league-up:pas-un-jour:jade',
    'season:0',
    'season:x',
    'day:2026-02-30',
    'inconnu:1',
  ])('%s ⇒ aucune clé : une identité hors de la grammaire ne se compte pas', (stepId) => {
    expect(photoMeasureKeyOf(stepId)).toBeNull();
  });

  it('toute étape fixe que le registre accepte a sa clé, et sa famille est déclarée', () => {
    const keys = PHOTO_STATIC_STEP_IDS.map((id) => photoMeasureKeyOf(id));
    expect(keys.filter((key) => key === null)).toEqual([]);
    expect(new Set(keys.map((key) => key?.family)).size).toBeLessThanOrEqual(PHOTO_MEASURE_FAMILIES.length);
    keys.forEach((key) => expect(PHOTO_MEASURE_FAMILIES).toContain(key?.family));
  });

  it('aucune clé ne porte un chiffre de division, de Meesh, de Prestige ou de date', () => {
    const keys = PHOTO_STATIC_STEP_IDS.map((id) => photoMeasureKeyOf(id)?.key ?? '');
    const individualising = keys.filter((key) => /^(rank|tier|meesh|level-100|prestige|trophy):.*\d/.test(key) || /^(rank|tier):[^:]+:/.test(key));
    expect(individualising).toEqual([]);
  });
});
