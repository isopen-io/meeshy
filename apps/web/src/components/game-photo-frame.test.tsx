import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { photoLayout } from '@/lib/game-photo/layout';
import { referralOf, referralPlaceholder } from '@/lib/game-photo/referral';
import { flameMoment, levelHundredMoment, meeshMoment, photoMomentOfEmblemV2, rankMoment, startMoment, tierMoment, treasuryMoment, type PhotoMoment } from '@/lib/game-photo/moments';

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

/**
 * LE BANDEAU DE PARRAINAGE (#7742) — l'aperçu en direct porte le même bandeau
 * que l'image finale : la Signature, « Rejoins-moi sur Meeshy », le lien court
 * et la Flamme. Sans lien, le cadre est celui d'avant, à l'identique.
 */
describe('le bandeau de parrainage', () => {
  const moment = rankMoment({ rank: 'voix', division: 2 });
  const referral = referralOf('https://meeshy.me/signup/affiliate/aff_abc', 23);
  const withBanner = (format: 'story' | 'square' = 'story', link = referral): string =>
    renderToStaticMarkup(<GamePhotoFrame moment={moment} dateLabel="5 octobre 2026" format={format} referral={link} />);

  test('la phrase, le lien court et les jours de Flamme se lisent dans le cadre', () => {
    const page = text(withBanner());
    expect(page).toContain('Rejoins-moi sur Meeshy');
    expect(page).toContain('meeshy.me/signup/affiliate/aff_abc');
    expect(page).toContain('23 j');
  });

  test('le fond du bandeau est posé à la place que la mise en page lui donne', () => {
    const layout = photoLayout('story', { banner: true });
    const html = withBanner();
    const percent = (n: number, of: number) => `${((n / of) * 100).toFixed(2)}%`;
    const frame = layout.banner?.frame;
    if (frame === undefined) throw new Error('bandeau attendu');
    expect(html).toMatch(new RegExp(`data-photo-banner=""[^>]*left:${percent(frame.x, layout.width).replace('.', '\\.')}`));
  });

  test('la Flamme est un cinquième dessin de la composition, avec le sien', () => {
    expect(withBanner()).toMatch(/data-photo-art="flame"[^>]*>\s*<svg/);
    expect(withBanner()).toContain('data-game-flame=');
  });

  test('il n’y a qu’UNE Signature : celle du bandeau, plus celle du pied de carte', () => {
    expect(withBanner().match(/data-photo-art="signature"/g)).toHaveLength(1);
  });

  test('sans lien, aucun bandeau : le cadre d’avant', () => {
    const html = withBanner('story', null);
    expect(html).not.toContain('data-photo-banner');
    expect(html).not.toContain('data-photo-art="flame"');
    expect(text(html)).not.toContain('Rejoins-moi');
    expect(html).toBe(render(moment));
  });

  test('Flamme éteinte : le lien reste, la Flamme et ses jours s’effacent', () => {
    const html = withBanner('story', referralOf('https://meeshy.me/signup/affiliate/aff_abc', 0));
    expect(text(html)).toContain('meeshy.me/signup/affiliate/aff_abc');
    expect(html).not.toContain('data-photo-art="flame"');
    expect(text(html)).not.toMatch(/\d+ j\b/);
  });

  test('le carré porte aussi le bandeau', () => {
    expect(text(withBanner('square'))).toContain('Rejoins-moi sur Meeshy');
  });

  test('aucun jeton encore : l’emplacement « meeshy.me/r/… », cerné de pointillés ; un vrai lien ne l’est pas', () => {
    const html = withBanner('story', referralPlaceholder(23));
    expect(text(html)).toContain('meeshy.me/r/…');
    expect(html).toMatch(/data-photo-banner-placeholder=""[^>]*dashed/);
    expect(withBanner()).not.toContain('data-photo-banner-placeholder');
  });

  test('aucune couleur écrite dans le bandeau', () => {
    expect(withBanner()).not.toMatch(/(?:color|background)[^;"]*:[^;"]*#[0-9a-f]{3,8}/i);
  });
});

/**
 * LES EMBLÈMES DE LA VAGUE 2 (#9481) — le trophée, la gemme de la ligue gagnée,
 * la coupe de saison et celle de Prestige se posent dans le MÊME cadre que les
 * autres moments : Mee et Meo les frappent en place.
 */
describe('les emblèmes de la vague 2', () => {
  test('un trophée de ligue : la coupe de sa matière, sa plaque, le texte du moment', () => {
    const html = render(photoMomentOfEmblemV2({ kind: 'trophy', trophyKey: 'trophy.league-cup.2026-10-26.jade.silver' }));
    expect(html).toContain('data-game-trophy="league"');
    expect(html).toContain('-p-silver)');
    expect(html).toContain('>JADE · S44<');
    expect(text(html)).toContain('Nouveau trophée');
  });

  test('une montée de ligue : la gemme de la ligue atteinte', () => {
    const html = render(photoMomentOfEmblemV2({ kind: 'league-up', league: 'saphir', weekKey: '2026-11-09' }));
    expect(html).toContain('data-game-league-gem="saphir"');
    expect(text(html)).toContain('Ligue Saphir');
  });

  test('une saison terminée et un Prestige : leur coupe, plaque numérotée', () => {
    expect(render(photoMomentOfEmblemV2({ kind: 'season', season: 1 }))).toContain('>SAISON 1<');
    const prestige = render(photoMomentOfEmblemV2({ kind: 'prestige', number: 2 }));
    expect(prestige).toContain('data-game-trophy="prestige"');
    expect(prestige).toContain('>PRESTIGE 2<');
  });

  test('un trophée d’une version plus récente : la coupe neutre, jamais une erreur', () => {
    expect(() => render(photoMomentOfEmblemV2({ kind: 'trophy', trophyKey: 'trophy.cometa.9' }))).not.toThrow();
  });
});
