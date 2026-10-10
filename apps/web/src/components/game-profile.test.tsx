import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import type { UserGameProfileResponse, UserShowcaseResponse } from '@meeshy/shared/types/game';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockFixture, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { userGameFixture, userShowcaseFixture } from '@/lib/api/game-v2-queries-fixture';

import { GameProfileOwn } from './game-profile-own';
import { ContactGameStrip, GameProfileVisitor } from './game-profile-visitor';

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const base = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
const own = (game = gameBlockWithExtrasFixture({ prestige: 2 })): EngagementWithGame => ({ ...base, game });

/**
 * LE JEU SUR LES PROFILS (#9481, #5738) — le sien en entier (anneau à emblème et
 * chiffre romain, étoiles de Prestige, blason du rang et division, trésor,
 * Flamme, vitrine, médailles, entrée Progression) ; celui d’un autre : ce que SA
 * visibilité autorise, rien sinon — pas même la preuve qu’une vitrine existe.
 */
describe('mon profil', () => {
  const html = renderToStaticMarkup(<GameProfileOwn progress={own()} />);
  const t = text(html);

  test('l’anneau de niveau : palier, chiffre romain, étoiles de Prestige, lu en toutes lettres', () => {
    expect(html).toContain('data-game-tier-numeral');
    expect((html.match(/data-game-prestige-star/g) ?? []).length).toBe(2);
    expect(html).toContain('aria-label="Niveau');
  });

  test('le blason du rang avec sa division, la Gloire, le niveau', () => {
    expect(html).toContain('data-game-shield');
    expect(t).toMatch(/Niveau \d+ · /);
    expect(t).toContain('de Gloire');
  });

  test('la division V..I se dit, le niveau se grave sur le blason (#9636)', () => {
    expect(t).toMatch(/(Murmure|Écho|Voix|Conteur) (V|IV|III|II|I)\b/);
    expect(html).toContain('data-game-level-engraving');
    expect(html).toContain('data-game-notch="on"');
  });

  test('le trésor et la Flamme', () => {
    expect(t).toMatch(/Meeshes?/);
    expect(t).toContain('Flamme : 6 jours');
  });

  test('la vitrine : jusqu’à quatre coupes, la porte vers toute la vitrine', () => {
    expect((html.match(/data-game-trophy="trophy/g) ?? []).length).toBe(3);
    expect(html).toContain('href="/me/progression/vitrine"');
    expect(t).toContain('Coupe d’argent — ligue Jade');
  });

  test('les meilleures médailles : le palier le plus haut d’abord, jamais une empreinte éteinte', () => {
    const medals = [...html.matchAll(/data-game-medal-axis="([^"]+)"/g)].map((m) => m[1]);
    expect(medals.length).toBeGreaterThan(0);
    expect(medals.length).toBeLessThanOrEqual(4);
    expect(html).not.toContain('data-game-imprint');
  });

  test('l’entrée vers Progression', () => {
    expect(html).toContain('href="/me/progression"');
    expect(t).toContain('Voir ma progression');
  });

  test('un ancien serveur (aucun bloc game) : rien ne se dessine', () => {
    expect(renderToStaticMarkup(<GameProfileOwn progress={base} />)).toBe('');
  });

  test('sans trophée : pas d’étagère, la carte reste', () => {
    const empty = renderToStaticMarkup(<GameProfileOwn progress={own({ ...gameBlockWithExtrasFixture(), trophies: { items: [], order: [] } })} />);
    expect(empty).not.toContain('data-game-profile-shelf');
    expect(empty).toContain('id="game-profile"');
  });

  test('un serveur sans extensions : la carte reste celle de la vague 1', () => {
    const old = renderToStaticMarkup(<GameProfileOwn progress={own(gameBlockFixture())} />);
    expect(old).toContain('data-game-shield');
    expect(old).not.toContain('data-game-profile-shelf');
  });
});

describe('le profil d’un autre', () => {
  const open = userShowcaseFixture();

  test('visible : la vitrine nommée, le MOIS d’obtention et jamais le jour', () => {
    const t = text(renderToStaticMarkup(<GameProfileVisitor showcase={open} name="Amina" />));
    expect(t).toContain('Vitrine de Amina');
    expect(t).toMatch(/Obtenu en (octobre|novembre|septembre) 2026/);
    expect(t).not.toMatch(/Obtenu le/);
  });

  test('la vitrine de démonstration est celle qu’un visiteur reçoit : aucune semaine dans ses clés (D-3)', () => {
    expect(JSON.stringify(open)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(open.order.some((key) => key.startsWith('trophy.league-cup.'))).toBe(true);
  });

  test('une coupe de ligue au MOIS se nomme, sans semaine ni jour, et dit combien de fois elle a été gagnée', () => {
    const shown: UserShowcaseResponse = {
      visible: true,
      items: [{ key: 'trophy.league-cup.2026-10.jade.gold', awardedMonth: '2026-10', count: 2 }],
      order: ['trophy.league-cup.2026-10.jade.gold'],
    };
    const t = text(renderToStaticMarkup(<GameProfileVisitor showcase={shown} name="Amina" />));
    expect(t).toContain('ligue Jade, octobre 2026');
    expect(t).toContain('×2');
    expect(t).not.toMatch(/semaine|S\d{1,2}\b/);
  });

  test('fermée par son réglage : RIEN — pas un mot qui dise qu’elle existe', () => {
    expect(renderToStaticMarkup(<GameProfileVisitor showcase={{ visible: false, items: [], order: [] }} name="Amina" />)).toBe('');
  });

  test('pas encore chargée : rien', () => {
    expect(renderToStaticMarkup(<GameProfileVisitor showcase={undefined} name="Amina" />)).toBe('');
  });

  test('visible mais vide : rien', () => {
    expect(renderToStaticMarkup(<GameProfileVisitor showcase={{ visible: true, items: [], order: [] }} name="Amina" />)).toBe('');
  });

  test('un trophée d’une version plus récente ne se montre pas', () => {
    const future: UserShowcaseResponse = { visible: true, items: [{ key: 'trophy.cometa.9', awardedMonth: '2026-11' }], order: ['trophy.cometa.9'] };
    expect(renderToStaticMarkup(<GameProfileVisitor showcase={future} name="Amina" />)).toBe('');
  });

  test('l’ordre du membre est respecté, un trophée absent de l’ordre arrive à la suite', () => {
    const shown: UserShowcaseResponse = {
      visible: true,
      items: [
        { key: 'trophy.flame.100', awardedMonth: '2026-09' },
        { key: 'trophy.season-cup.1', awardedMonth: '2026-11' },
      ],
      order: ['trophy.season-cup.1'],
    };
    const keys = [...renderToStaticMarkup(<GameProfileVisitor showcase={shown} name="Amina" />).matchAll(/data-game-trophy="(trophy[^"]+)"/g)].map((m) => m[1]);
    expect(keys).toEqual(['trophy.season-cup.1', 'trophy.flame.100']);
  });
});

describe('la carte de contact', () => {
  test('trois coupes au plus, en lecture seule, nommées au lecteur d’écran', () => {
    const many: UserShowcaseResponse = {
      visible: true,
      items: ['trophy.flame.100', 'trophy.flame.365', 'trophy.season-cup.1', 'trophy.prestige.1'].map((key) => ({ key, awardedMonth: '2026-11' })),
      order: [],
    };
    const html = renderToStaticMarkup(<ContactGameStrip showcase={many} />);
    expect((html.match(/<li /g) ?? []).length).toBe(3);
    expect(html).not.toContain('<button');
    expect(text(html)).toContain('Trophée de Flamme');
  });

  test('fermée : rien', () => {
    expect(renderToStaticMarkup(<ContactGameStrip showcase={{ visible: false, items: [], order: [] }} />)).toBe('');
    expect(renderToStaticMarkup(<ContactGameStrip showcase={undefined} />)).toBe('');
  });
});

/**
 * LE NIVEAU ET LE RANG D'UN AUTRE (#9481) — ce que SES réglages laissent voir : l'anneau à emblème (sans
 * jauge), son rang et sa division, le PALIER de son trésor, la FORME de sa Flamme, ses étoiles de Prestige.
 * Jamais la Gloire, les jours de série, les Meeshes ni une date : le serveur ne les sert pas, l'écran n'a
 * rien à en dire. Rien servi, rien dessiné — et pas même la preuve qu'un jeu existe.
 */
describe('le jeu d’un autre : niveau, rang, trésor, Flamme', () => {
  const served: UserGameProfileResponse = {
    visible: true,
    standing: { level: 34, tier: 'eclat', prestige: 2, flame: 'brasier', rank: 'voix', division: 2 },
    treasury: { tier: 'coffre' },
  };
  const html = renderToStaticMarkup(<GameProfileVisitor game={served} showcase={undefined} name="Amina" />);
  const t = text(html);

  test('la carte porte son nom et l’anneau à emblème, sans jauge, avec ses étoiles de Prestige', () => {
    expect(t).toContain('Le jeu de Amina');
    expect(html).toContain('data-game-level="34"');
    expect(html).toContain('data-game-tier-numeral');
    expect(html).toContain('data-game-ring-static');
    expect((html.match(/data-game-prestige-star/g) ?? []).length).toBe(2);
  });

  test('le niveau et son palier, le rang et sa division, le blason', () => {
    expect(t).toMatch(/Niveau 34 · /);
    expect(html).toContain('data-game-shield');
    expect(html).toContain('data-game-rank="voix"');
  });

  test('le palier du trésor et la forme de la Flamme, nommés', () => {
    expect(t).toContain('Trésor : Coffre');
    expect(t).toContain('Flamme : Brasier');
  });

  test('jamais un compte exact : ni Gloire, ni jours de série, ni Meeshes', () => {
    expect(t).not.toContain('de Gloire');
    expect(t).not.toMatch(/\d+ jours?/);
    expect(t).not.toMatch(/Meeshes?/);
  });

  test('un réglage « rang » fermé (standing nul) mais un trésor ouvert : le trésor seul', () => {
    const only = renderToStaticMarkup(<GameProfileVisitor game={{ visible: true, standing: null, treasury: { tier: 'bourse' } }} showcase={undefined} name="Amina" />);
    expect(text(only)).toContain('Trésor : Bourse');
    expect(only).not.toContain('data-game-level');
  });

  test('Flamme éteinte, trésor vide, Mythe sans division : seul ce qui existe se montre', () => {
    const mythic = renderToStaticMarkup(
      <GameProfileVisitor game={{ visible: true, standing: { level: 100, tier: 'galaxie', prestige: 0, flame: null, rank: 'mythe', division: null }, treasury: { tier: null } }} showcase={undefined} name="Amina" />,
    );
    expect(mythic).toContain('data-game-rank="mythe"');
    expect(text(mythic)).not.toContain('Flamme :');
    expect(text(mythic)).not.toContain('Trésor :');
  });

  test('la division V..I servie, la place du Mythe et son émission (#9636) ; un ancien serveur garde la division héritée', () => {
    const at = (standing: UserGameProfileResponse['standing']) => renderToStaticMarkup(<GameProfileVisitor game={{ visible: true, standing, treasury: null }} showcase={undefined} name="Amina" />);
    const four = at({ level: 34, tier: 'eclat', prestige: 0, flame: null, rank: 'voix', division: 3, division5: 4 });
    expect(text(four)).toContain('Voix IV');
    expect(four.match(/data-game-notch="on"/g)).toHaveLength(2);
    const mythe = at({ level: 100, tier: 'galaxie', prestige: 0, flame: null, rank: 'mythe', division: null, division5: null, mythic: { number: 61, edition: 75 } });
    expect(text(mythe)).toContain('Mythe n° 61');
    expect(mythe).toContain('data-game-mythic-halo="75"');
    expect(text(at({ level: 34, tier: 'eclat', prestige: 0, flame: null, rank: 'voix', division: 3 }))).toContain('Voix III');
  });

  test('fermé, refusé ou pas encore lu : RIEN — pas un mot qui dise qu’un jeu existe', () => {
    for (const game of [{ visible: false, standing: null, treasury: null }, undefined, { visible: true, standing: null, treasury: null }] as const) {
      expect(renderToStaticMarkup(<GameProfileVisitor game={game} showcase={undefined} name="Amina" />)).toBe('');
    }
  });

  test('« visible: false » l’emporte sur des blocs que le serveur n’aurait pas dû servir', () => {
    expect(renderToStaticMarkup(<GameProfileVisitor game={{ ...served, visible: false }} showcase={undefined} name="Amina" />)).toBe('');
  });

  test('avec une vitrine ouverte : le jeu d’abord, la vitrine dessous, sous son propre intitulé', () => {
    const both = renderToStaticMarkup(<GameProfileVisitor game={userGameFixture()} showcase={userShowcaseFixture()} name="Amina" />);
    expect(text(both)).toContain('Le jeu de Amina');
    expect(text(both)).toContain('Vitrine');
    expect(both.indexOf('data-game-level')).toBeLessThan(both.indexOf('data-game-trophy'));
  });
});

describe('la carte de contact : le niveau et le rang en quelques pictogrammes', () => {
  const served: UserGameProfileResponse = {
    visible: true,
    standing: { level: 34, tier: 'eclat', prestige: 0, flame: 'astre', rank: 'voix', division: 3 },
    treasury: { tier: 'tresor' },
  };

  test('l’anneau, le blason, le palier du trésor et la Flamme — chacun nommé au lecteur d’écran', () => {
    const html = renderToStaticMarkup(<ContactGameStrip showcase={undefined} game={served} />);
    expect(html).toContain('data-game-contact-standing');
    expect(html).toContain('data-game-level="34"');
    expect(html).toContain('data-game-shield');
    expect(text(html)).toContain('Trésor : Trésor');
    expect(text(html)).toContain('Flamme : Astre');
  });

  test('avec les coupes : le niveau d’abord, les trois coupes ensuite', () => {
    const many: UserShowcaseResponse = { visible: true, items: ['trophy.flame.100', 'trophy.flame.365'].map((key) => ({ key, awardedMonth: '2026-11' })), order: [] };
    const html = renderToStaticMarkup(<ContactGameStrip showcase={many} game={served} />);
    expect(html.indexOf('data-game-contact-standing')).toBeLessThan(html.indexOf('data-game-contact-strip'));
  });

  test('rien de servi : rien — ni niveau, ni coupe', () => {
    expect(renderToStaticMarkup(<ContactGameStrip showcase={undefined} game={{ visible: false, standing: null, treasury: null }} />)).toBe('');
    expect(renderToStaticMarkup(<ContactGameStrip showcase={undefined} game={undefined} />)).toBe('');
  });
});
