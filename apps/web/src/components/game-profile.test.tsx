import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { UserGameProfileResponse, UserShowcaseResponse } from '@meeshy/shared/types/game';

import { userShowcaseFixture } from '@/lib/api/game-v2-queries-fixture';

import { ContactGameStrip } from './game-contact-strip';

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/**
 * LE JEU D'UN AUTRE SUR SA CARTE DE CONTACT (#9481) — ce que SA visibilité autorise, rien sinon : pas même
 * la preuve qu'une vitrine ou un jeu existe. Les cartes « Mon jeu » et « Le jeu de … » ont quitté les
 * fiches (#10092, #10097) : le niveau et le rang y sont sur la bannière.
 */
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

  test('un trophée d’une version plus récente ne se montre pas', () => {
    const future: UserShowcaseResponse = { visible: true, items: [{ key: 'trophy.cometa.9', awardedMonth: '2026-11' }], order: ['trophy.cometa.9'] };
    expect(renderToStaticMarkup(<ContactGameStrip showcase={future} />)).toBe('');
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
    const keys = [...renderToStaticMarkup(<ContactGameStrip showcase={shown} />).matchAll(/data-game-trophy="(trophy[^"]+)"/g)].map((m) => m[1]);
    expect(keys).toEqual(['trophy.season-cup.1', 'trophy.flame.100']);
  });

  test('la vitrine de démonstration, celle qu’un visiteur reçoit, se dessine', () => {
    expect(renderToStaticMarkup(<ContactGameStrip showcase={userShowcaseFixture()} />)).toContain('data-game-contact-strip');
  });

  test('fermée : rien', () => {
    expect(renderToStaticMarkup(<ContactGameStrip showcase={{ visible: false, items: [], order: [] }} />)).toBe('');
    expect(renderToStaticMarkup(<ContactGameStrip showcase={undefined} />)).toBe('');
    expect(renderToStaticMarkup(<ContactGameStrip showcase={{ visible: true, items: [], order: [] }} />)).toBe('');
  });
});

describe('la carte de contact : le niveau et le rang en quelques pictogrammes', () => {
  const served: UserGameProfileResponse = {
    visible: true,
    standing: { level: 34, tier: 'eclat', prestige: 0, flame: 'astre', rank: 'voix', division: 3 },
    treasury: { tier: 'tresor' },
  };

  test('l’anneau, le blason, le palier du trésor — chacun nommé au lecteur d’écran ; jamais la Flamme (#10092)', () => {
    const html = renderToStaticMarkup(<ContactGameStrip showcase={undefined} game={served} />);
    expect(html).toContain('data-game-contact-standing');
    expect(html).toContain('data-game-level="34"');
    expect(html).toContain('data-game-shield');
    expect(text(html)).toContain('Héritage : Trésor');
    expect(text(html)).not.toContain('Flamme');
    expect(html).not.toContain('data-game-flame');
  });

  test('avec les coupes : le niveau d’abord, les trois coupes ensuite', () => {
    const many: UserShowcaseResponse = { visible: true, items: ['trophy.flame.100', 'trophy.flame.365'].map((key) => ({ key, awardedMonth: '2026-11' })), order: [] };
    const html = renderToStaticMarkup(<ContactGameStrip showcase={many} game={served} />);
    expect(html.indexOf('data-game-contact-standing')).toBeLessThan(html.indexOf('data-game-contact-strip'));
  });

  test('un réglage « rang » fermé (standing nul) mais un trésor ouvert : le trésor seul', () => {
    const only = renderToStaticMarkup(<ContactGameStrip game={{ visible: true, standing: null, treasury: { tier: 'bourse' } }} showcase={undefined} />);
    expect(text(only)).toContain('Héritage : Bourse');
    expect(only).not.toContain('data-game-level');
  });

  test('« visible: false » l’emporte sur des blocs que le serveur n’aurait pas dû servir', () => {
    expect(renderToStaticMarkup(<ContactGameStrip game={{ ...served, visible: false }} showcase={undefined} />)).toBe('');
  });

  test('rien de servi : rien — ni niveau, ni coupe', () => {
    expect(renderToStaticMarkup(<ContactGameStrip showcase={undefined} game={{ visible: false, standing: null, treasury: null }} />)).toBe('');
    expect(renderToStaticMarkup(<ContactGameStrip showcase={undefined} game={undefined} />)).toBe('');
  });
});
