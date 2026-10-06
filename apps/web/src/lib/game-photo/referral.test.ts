import { beforeAll, describe, expect, test } from 'bun:test';

import { loadGameCatalog } from '@/lib/i18n-game-catalog';

import { fitBannerLine, referralOf, referralPlaceholder, referralShareText } from './referral';

beforeAll(async () => {
  await loadGameCatalog('en');
});

/**
 * LE LIEN DE PARRAINAGE SUR LA CARTE (#7742) — ce que le bandeau en bas de la
 * carte porte : le lien de l'utilisateur (en carré QR, #9554) et sa Flamme. Sans
 * lien, la carte part sans bandeau ; une Flamme éteinte ne s'affiche pas.
 */
describe('referralOf — il n’y a un bandeau que s’il y a un lien', () => {
  test('pas de lien (ou un lien vide) : aucun bandeau', () => {
    expect(referralOf(null, 6)).toBeNull();
    expect(referralOf('', 6)).toBeNull();
    expect(referralOf('   ', 6)).toBeNull();
  });

  test('le lien complet est gardé tel quel — le carré QR l’encode, le texte du partage le dit ; la carte n’en garde aucune forme écrite (#9554)', () => {
    expect(referralOf('  https://meeshy.me/signup/affiliate/aff_abc ', 23)).toEqual({
      url: 'https://meeshy.me/signup/affiliate/aff_abc',
      flameDays: 23,
    });
  });

  test('une Flamme à zéro, négative ou illisible ne s’affiche pas ; un nombre à virgule est ramené à l’entier', () => {
    expect(referralOf('https://meeshy.me/x', 0)?.flameDays).toBeNull();
    expect(referralOf('https://meeshy.me/x', -4)?.flameDays).toBeNull();
    expect(referralOf('https://meeshy.me/x', Number.NaN)?.flameDays).toBeNull();
    expect(referralOf('https://meeshy.me/x', null)?.flameDays).toBeNull();
    expect(referralOf('https://meeshy.me/x', 6.9)?.flameDays).toBe(6);
  });
});

describe('referralShareText — le lien voyage aussi en texte', () => {
  test('la phrase et le lien COMPLET, dans la langue demandée', () => {
    const referral = referralOf('https://meeshy.me/signup/affiliate/aff_abc', 3);
    if (referral === null) throw new Error('lien attendu');
    expect(referralShareText(referral, 'fr')).toBe('Rejoins-moi sur Meeshy : https://meeshy.me/signup/affiliate/aff_abc');
    expect(referralShareText(referral, 'en')).toContain('Join me on Meeshy');
    expect(referralShareText(referral, 'en')).toContain('https://meeshy.me/signup/affiliate/aff_abc');
  });
});

describe('fitBannerLine — une ligne qui doit tenir dans la place du bandeau', () => {
  const fit = (text: string, size = 30, maxWidth = 700) => fitBannerLine({ text, size, maxWidth, minSize: 20, advance: 0.6 });

  test('une ligne qui tient garde sa taille et son texte', () => {
    expect(fit('meeshy.me/signup/aff_abc')).toEqual({ text: 'meeshy.me/signup/aff_abc', size: 30 });
  });

  test('une ligne trop longue rétrécit, proportionnellement, sans changer son texte', () => {
    const line = fit('a'.repeat(50));
    expect(line.text).toBe('a'.repeat(50));
    expect(line.size).toBeLessThan(30);
    expect(line.size).toBeGreaterThanOrEqual(20);
    expect(line.size * 0.6 * 50).toBeLessThanOrEqual(700);
  });

  test('au-delà du plus petit corps lisible, le milieu s’efface : le début (l’hôte) et la fin (le code) restent', () => {
    const line = fit(`meeshy.me/signup/affiliate/${'x'.repeat(80)}END`);
    expect(line.size).toBe(20);
    expect(line.text).toContain('…');
    expect(line.text.startsWith('meeshy.me')).toBe(true);
    expect(line.text.endsWith('END')).toBe(true);
    expect(line.text.length * 20 * 0.6).toBeLessThanOrEqual(700);
  });

  test('une place nulle ou illisible ne produit ni NaN ni texte négatif', () => {
    for (const maxWidth of [0, -5, Number.NaN]) {
      const line = fit('meeshy.me/x', 30, maxWidth);
      expect(Number.isFinite(line.size)).toBe(true);
      expect(line.text.length).toBeGreaterThan(0);
    }
  });
});

/**
 * AUCUN JETON SANS GESTE (#7742, décision porteur) — sans jeton existant,
 * l'aperçu montre un EMPLACEMENT vide ; ce n'est pas un lien, il n'a aucune
 * adresse à encoder ni à recopier dans un texte de partage.
 */
describe('referralPlaceholder — l’emplacement du lien', () => {
  test('l’emplacement porte la Flamme, n’a AUCUNE adresse et se déclare tel', () => {
    expect(referralPlaceholder(23)).toEqual({ url: '', flameDays: 23, placeholder: true });
    expect(referralPlaceholder(0).flameDays).toBeNull();
  });

  test('un vrai lien ne se déclare jamais emplacement', () => {
    expect(referralOf('https://meeshy.me/x', 3)?.placeholder).toBeUndefined();
  });
});
