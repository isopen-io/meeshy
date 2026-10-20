import { beforeAll, describe, expect, test } from 'bun:test';

import { ACHIEVEMENT_RARITIES } from '@meeshy/shared/utils/game/glory';

import { blasonDesign } from '@/lib/game/ranks';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';

import { authorPlateOf, engravedHandle, monogramOf, photoAuthorOf, plateStyleOf, type PhotoAuthor } from './author-plate';
import type { PhotoEmblem } from './moments';

/**
 * LA PLAQUE D'AUTEUR (#10816) — « le cadre ne dit rien sur l'auteur ». Le
 * cadre d'un succès, d'un rang ou d'une fin de mission grave le PSEUDO de
 * son auteur dans son ornement : un fini (gravure, estampage, grattage) et un
 * métal par étape, tirés de l'étape elle-même — jamais dessinés au cas par cas.
 */

beforeAll(async () => {
  await Promise.all((['fr', 'en', 'de'] as const).map((language) => loadGameCatalog(language)));
});

const author = (handle: string): PhotoAuthor => ({ handle });
const achievement = (rarity?: (typeof ACHIEVEMENT_RARITIES)[number]): PhotoEmblem => ({ kind: 'achievement', key: 'achievement.first_content', ...(rarity === undefined ? {} : { rarity }) });

describe('le fini et le métal se déduisent de l’étape', () => {
  test('un succès prend le métal de SA rareté, et s’estampe à partir d’épique', () => {
    expect(ACHIEVEMENT_RARITIES.map((rarity) => plateStyleOf(achievement(rarity)))).toEqual([
      { family: 'achievement', finish: 'engrave', metal: 'bronze' },
      { family: 'achievement', finish: 'engrave', metal: 'silver' },
      { family: 'achievement', finish: 'emboss', metal: 'platinum' },
      { family: 'achievement', finish: 'emboss', metal: 'gold' },
      { family: 'achievement', finish: 'emboss', metal: 'prism' },
    ]);
  });

  test('sans rareté servie : la plaque NEUTRE, jamais une rareté supposée', () => {
    expect(plateStyleOf(achievement())).toEqual({ family: 'achievement', finish: 'engrave', metal: 'indigo' });
  });

  test('un rang estampe dans le métal de son blason', () => {
    const style = plateStyleOf({ kind: 'rank', rank: 'voix', division: 2, mythic: null });
    expect(style).toEqual({ family: 'rank', finish: 'emboss', metal: blasonDesign('voix').material });
  });

  test('une fin de mission se gratte', () => {
    expect(plateStyleOf({ kind: 'mission', templateKey: 'send_voice', target: 3 })).toEqual({ family: 'mission', finish: 'scratch', metal: 'obsidian' });
  });

  test('les autres moments ne portent pas de plaque', () => {
    expect(plateStyleOf({ kind: 'start' })).toBeNull();
    expect(plateStyleOf({ kind: 'flame', form: 'braise', days: 7 })).toBeNull();
  });
});

describe('le pseudo gravé', () => {
  test('le pseudo, préfixé d’une arobase, jamais deux', () => {
    expect(engravedHandle('atabeth')).toBe('@atabeth');
    expect(engravedHandle('@atabeth')).toBe('@atabeth');
  });

  test('coupé à 16 graphèmes avec une ellipse, sans casser un emoji composé', () => {
    expect(engravedHandle('constantinople_la_grande')).toBe('@constantinople_…');
    expect(engravedHandle('👨‍👩‍👧‍👦'.repeat(20))).toBe(`@${'👨‍👩‍👧‍👦'.repeat(15)}…`);
  });

  test('normalisé en NFC : deux saisies d’un même pseudo gravent la même chose', () => {
    expect(engravedHandle('hélène')).toBe(engravedHandle('hélène'));
  });

  test('le monogramme : les deux premières lettres ou chiffres, en capitales', () => {
    expect(monogramOf('atabeth')).toBe('AT');
    expect(monogramOf('_9lives')).toBe('9L');
    expect(monogramOf('@é')).toBe('É');
  });
});

describe('la plaque complète', () => {
  test('sans auteur (invité, pas de pseudo public) : aucune plaque', () => {
    expect(authorPlateOf(achievement('rare'), null, 'fr')).toBeNull();
    expect(authorPlateOf(achievement('rare'), author('  '), 'fr')).toBeNull();
  });

  test('la formule de la famille, dans la langue de l’interface', () => {
    const plate = authorPlateOf(achievement('legendary'), author('atabeth'), 'fr');
    expect(plate).toMatchObject({ family: 'achievement', finish: 'emboss', metal: 'gold', caption: 'Haut fait de', name: '@atabeth', monogram: 'AT', label: 'Haut fait de @atabeth' });
    expect(authorPlateOf({ kind: 'rank', rank: 'voix', division: 2, mythic: null }, author('atabeth'), 'en')?.caption).toBe('Rank reached by');
    expect(authorPlateOf({ kind: 'mission', templateKey: 'send_voice', target: 3 }, author('atabeth'), 'de')?.caption).toBe('Mission erfüllt von');
  });

  test('la photo de profil voyage avec la plaque quand elle existe', () => {
    expect(authorPlateOf(achievement(), { handle: 'atabeth', avatar: 'https://x/a.jpg' }, 'fr')?.avatar).toBe('https://x/a.jpg');
    expect(authorPlateOf(achievement(), author('atabeth'), 'fr')?.avatar).toBeUndefined();
    expect(Object.keys(authorPlateOf(achievement(), author('atabeth'), 'fr') ?? {})).not.toContain('avatar');
  });
});

describe('l’auteur, depuis le lecteur', () => {
  test('un compte inscrit : son pseudo et sa photo ; un invité ou un visiteur : personne', () => {
    expect(photoAuthorOf({ id: 'u1', handle: 'atabeth', displayName: 'Ata Beth', isAnonymous: false, avatar: 'https://x/a.jpg' })).toEqual({ handle: 'atabeth', avatar: 'https://x/a.jpg' });
    expect(photoAuthorOf({ id: 'u1', handle: 'atabeth', displayName: 'Ata Beth', isAnonymous: false })).toEqual({ handle: 'atabeth' });
    expect(photoAuthorOf({ id: 'p1', handle: null, displayName: 'Invité', isAnonymous: true })).toBeNull();
    expect(photoAuthorOf({ id: null, handle: null, displayName: '', isAnonymous: true })).toBeNull();
  });
});
