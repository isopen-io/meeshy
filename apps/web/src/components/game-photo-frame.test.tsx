import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { photoLayout } from '@/lib/game-photo/layout';
import { flameMoment, levelHundredMoment, meeshMoment, rankMoment, startMoment, tierMoment, treasuryMoment, type PhotoMoment } from '@/lib/game-photo/moments';

import { GamePhotoFrame } from './game-photo-frame';

const render = (moment: PhotoMoment, format: 'story' | 'square' = 'story'): string =>
  renderToStaticMarkup(<GamePhotoFrame moment={moment} dateLabel="5 octobre 2026" format={format} />);

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/**
 * LE CADRE EN SURIMPRESSION (#9382) — conception, partie VI : « emblème en
 * haut, titre et date, Mee et Meo en bas ». Le MÊME cadre se pose sur
 * l'aperçu de la caméra et sert de source aux dessins de l'image finale : les
 * quatre emplacements `data-photo-art` sont ce que la composition relit.
 */
describe('les quatre emplacements', () => {
  const html = render(rankMoment({ rank: 'voix', division: 2 }));

  test('emblème, Mee, Meo, Signature — chacun avec son dessin', () => {
    for (const slot of ['emblem', 'mee', 'meo', 'signature']) {
      expect(html).toMatch(new RegExp(`data-photo-art="${slot}"[^>]*>\\s*<svg`));
    }
  });

  test('Mee et Meo portent leur rôle pour la chorégraphie de frappe', () => {
    expect(html).toContain('data-game-actor="mee"');
    expect(html).toContain('data-game-actor="meo"');
  });

  test('l’emblème est frappé « en place » : il est sa propre pièce, avec son onde', () => {
    expect(html).toContain('data-game-coin-flip');
    expect(html).toContain('data-game-face-wrap="reverse"');
    expect(html).toContain('data-game-shockwave');
  });
});

describe('le texte', () => {
  test('le haut, le titre, la date', () => {
    const page = text(render(rankMoment({ rank: 'voix', division: 2 })));
    expect(page).toContain('Nouveau rang');
    expect(page).toContain('Voix II');
    expect(page).toContain('5 octobre 2026');
  });

  test('la mise en page est celle de l’image finale, en fractions de la largeur', () => {
    const layout = photoLayout('story');
    const html = render(startMoment());
    const percent = (n: number) => `${((n / layout.width) * 100).toFixed(2)}%`;
    expect(html).toContain(`left:${percent(layout.emblem.x)}`);
    expect(html).toContain(`width:${percent(layout.emblem.w)}`);
  });

  test('le cadre carré a sa propre proportion', () => {
    expect(render(startMoment(), 'story')).toContain('aspect-ratio:1080 / 1920');
    expect(render(startMoment(), 'square')).toContain('aspect-ratio:1080 / 1080');
  });
});

describe('un emblème par sorte de moment', () => {
  const cases: readonly [string, PhotoMoment, string][] = [
    ['départ', startMoment(), 'data-game-signature'],
    ['rang', rankMoment({ rank: 'oracle', division: 1 }), 'data-game-rank="oracle"'],
    ['palier', tierMoment({ tier: 'aurore', level: 50 }), 'data-game-tier="aurore"'],
    ['niveau 100', levelHundredMoment(0), 'data-game-tier="galaxie"'],
    ['Meesh', meeshMoment({ number: 10, edition: 'silver' }), 'data-game-coin'],
    ['trésor', treasuryMoment('coffre'), 'data-game-coin'],
    ['Flamme', flameMoment(30), 'data-game-flame="brasier"'],
  ];
  for (const [name, moment, marker] of cases) {
    test(`${name} : ${marker}`, () => {
      expect(render(moment)).toContain(marker);
    });
  }

  test('une Meesh frappée montre son numéro', () => {
    expect(text(render(meeshMoment({ number: 10, edition: 'silver' })))).toContain('N° 10');
  });
});

describe('l’accessibilité', () => {
  test('le cadre est décoratif : le dialogue qui l’héberge porte le texte', () => {
    expect(render(startMoment())).toMatch(/^<div[^>]*aria-hidden="true"/);
  });

  test('le chrome du cadre (texte, voile) se lit dans la charte : aucune couleur écrite (le plumage de Mee et Meo est de l’illustration)', () => {
    const html = render(rankMoment({ rank: 'voix', division: 2 }));
    expect(html).not.toMatch(/(?:color|background)[^;"]*:[^;"]*#[0-9a-f]{3,8}/i);
    expect(html).toContain('var(--ios-on-brand)');
  });
});
