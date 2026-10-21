/**
 * LES IDENTITÉS D'ÉTAPE QUE LE REGISTRE ACCEPTE (#10162, revue adverse du L10a) : une étape appartient à une
 * famille connue, dans ses bornes ; `day:` ne vit que dans une fenêtre courte autour du jour serveur ; le
 * plafond par compte se déduit du nombre d'étapes qu'un compte peut réellement franchir.
 */

import { describe, it, expect } from 'vitest';
import {
  PHOTO_DAY_WINDOW,
  PHOTO_MEESH_MAX,
  PHOTO_MOMENTS_ACCOUNT_MAX,
  PHOTO_MOMENTS_HORIZON_YEARS,
  PHOTO_STATIC_STEP_IDS,
  PHOTO_STEPS_PER_YEAR,
  isKnownPhotoStepId,
} from '../../utils/game/photo-step-ids.js';

const NOW = new Date('2026-10-12T12:00:00.000Z');
const IN_SEASON_THREE = new Date('2027-04-20T12:00:00.000Z');
const known = (id: string, now: Date = NOW) => isKnownPhotoStepId(id, now);

describe('les familles fixes', () => {
  it.each([
    'start',
    'rank:murmure:5',
    'rank:ambassadeur:4',
    'rank:legende:1',
    'rank:mythe:0',
    'tier:singularite',
    'tier:lueur:1',
    'tier:singularite:5',
    'level-100:0',
    'level-100:5',
    'prestige:1',
    'prestige:5',
    'meesh:1',
    'meesh:10',
    'meesh:1000',
    'meesh:10000',
    'treasury:bourse',
    'treasury:reserve',
    'flame:7',
    'flame:365',
    'achievement:achievement.first_content',
    'achievement:achievement.cercles.conversation.join.size:1000',
    'trophy:trophy.prestige.5',
    'trophy:trophy.flame.100',
  ])('%s est connue', (id) => {
    expect(known(id)).toBe(true);
  });

  it.each([
    'invente',
    'start:1',
    'rank:empereur:1',
    'rank:ambassadeur:6',
    'rank:ambassadeur:0',
    'rank:mythe:1',
    'tier:inconnu',
    'tier:lueur:0',
    'tier:lueur:6',
    'tier:lueur:01',
    'tier:etincelle:1',
    'level-100:6',
    'prestige:0',
    'prestige:6',
    'meesh:0',
    'meesh:15',
    'meesh:10010',
    'meesh:010',
    'treasury:banque',
    'flame:8',
    'achievement:achievement.inconnu',
    'achievement:achievement.cercles.conversation.join.size:7',
    'trophy:trophy.prestige.6',
    'trophy:trophy.flame.30',
    'trophy:trophy.league-cup.2026-10.jade.gold',
  ])('%s est refusée', (id) => {
    expect(known(id)).toBe(false);
  });

  it('le premier palier de niveau n’est pas une étape : on y commence', () => {
    expect(known('tier:etincelle')).toBe(false);
    expect(known('tier:lueur')).toBe(true);
  });
});

describe('la réalisation du jour : J-2 à J+1 autour du jour serveur', () => {
  it('la fenêtre est celle annoncée', () => {
    expect(PHOTO_DAY_WINDOW).toEqual({ before: 2, after: 1 });
  });

  it.each(['day:2026-10-10', 'day:2026-10-11', 'day:2026-10-12', 'day:2026-10-13'])('%s est dans la fenêtre', (id) => {
    expect(known(id)).toBe(true);
  });

  it.each(['day:2026-10-09', 'day:2026-10-14', 'day:2031-01-01', 'day:2026-02-30', 'day:2026-10-12x'])('%s est refusée', (id) => {
    expect(known(id)).toBe(false);
  });
});

describe('les semaines de ligue : de la première semaine publique à la semaine qui s’ouvre', () => {
  it('une montée de la semaine en cours, vers une ligue connue', () => {
    expect(known('league-up:2026-10-12:jade')).toBe(true);
    expect(known('trophy:trophy.league-cup.2026-10-12.jade.gold')).toBe(true);
  });

  it('le dimanche, la semaine suivante est déjà recevable (fermeture à 20 h locale, UTC+14 compris)', () => {
    const sunday = new Date('2026-10-18T07:00:00.000Z');
    expect(known('league-up:2026-10-19:jade', sunday)).toBe(true);
    expect(known('league-up:2026-10-26:jade', sunday)).toBe(false);
  });

  it.each([
    'league-up:2026-10-05:jade',
    'league-up:2026-10-19:jade',
    'league-up:2026-10-13:jade',
    'league-up:2026-10-12:or',
    'trophy:trophy.league-cup.2026-10-19.jade.gold',
    'trophy:trophy.league-cup.2026-10-12.jade.platine',
  ])('%s est refusée', (id) => {
    expect(known(id)).toBe(false);
  });
});

describe('les saisons : jusqu’à la saison en cours', () => {
  it('aucune saison avant la première', () => {
    expect(known('season:1')).toBe(false);
    expect(known('trophy:trophy.season-cup.1')).toBe(false);
  });

  it('pendant la saison 3, les saisons 1 à 3 seulement', () => {
    expect(known('season:2', IN_SEASON_THREE)).toBe(true);
    expect(known('season:3', IN_SEASON_THREE)).toBe(true);
    expect(known('trophy:trophy.season-cup.2', IN_SEASON_THREE)).toBe(true);
    expect(known('season:4', IN_SEASON_THREE)).toBe(false);
    expect(known('season:0', IN_SEASON_THREE)).toBe(false);
    expect(known('trophy:trophy.season-cup.4', IN_SEASON_THREE)).toBe(false);
  });
});

describe('le plafond par compte', () => {
  it('se déduit des étapes fixes et de ce qu’une année peut ajouter, sur l’horizon annoncé', () => {
    expect(PHOTO_MEESH_MAX).toBe(10_000);
    expect(PHOTO_STEPS_PER_YEAR).toBe(366 + 53 * 2 + 7 * 2);
    expect(PHOTO_MOMENTS_ACCOUNT_MAX).toBe(PHOTO_STATIC_STEP_IDS.length + PHOTO_MOMENTS_HORIZON_YEARS * PHOTO_STEPS_PER_YEAR);
  });

  it('chaque étape fixe est connue, sans doublon', () => {
    expect(new Set(PHOTO_STATIC_STEP_IDS).size).toBe(PHOTO_STATIC_STEP_IDS.length);
    expect(PHOTO_STATIC_STEP_IDS.every((id) => known(id))).toBe(true);
  });
});
