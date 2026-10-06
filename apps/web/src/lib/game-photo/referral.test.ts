import { beforeAll, describe, expect, test } from 'bun:test';

import { loadGameCatalog } from '@/lib/i18n-game-catalog';

import { fitBannerLine, REFERRAL_PLACEHOLDER, referralDisplay, referralOf, referralPlaceholder, referralShareText } from './referral';

beforeAll(async () => {
  await loadGameCatalog('en');
});

/**
 * LE LIEN DE PARRAINAGE SUR LA CARTE (#7742) — ce que le bandeau en bas de la
 * carte dit : le lien court de l'utilisateur et sa Flamme. Sans lien, la carte
 * part sans bandeau ; une Flamme éteinte ne s'affiche pas.
 */
describe('referralDisplay — le lien tel qu’il se lit sur la carte', () => {
  test('sans le protocole ni la barre finale', () => {
    expect(referralDisplay('https://meeshy.me/signup/affiliate/aff_abc/')).toBe('meeshy.me/signup/affiliate/aff_abc');
    expect(referralDisplay('http://localhost:3100/signup/affiliate/x')).toBe('localhost:3100/signup/affiliate/x');
  });
});

describe('referralOf — il n’y a un bandeau que s’il y a un lien', () => {
  test('pas de lien (ou un lien vide) : aucun bandeau', () => {
    expect(referralOf(null, 6)).toBeNull();
    expect(referralOf('', 6)).toBeNull();
    expect(referralOf('   ', 6)).toBeNull();
  });

  test('le lien complet est gardé pour le texte du partage, l’affichage pour la carte', () => {
    expect(referralOf('https://meeshy.me/signup/affiliate/aff_abc', 23)).toEqual({
      url: 'https://meeshy.me/signup/affiliate/aff_abc',
      display: 'meeshy.me/signup/affiliate/aff_abc',
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
 * l'aperçu montre l'EMPLACEMENT « meeshy.me/r/… » ; ce n'est pas un lien, rien
 * ne le recopie dans un texte de partage.
 */
describe('referralPlaceholder — l’emplacement du lien', () => {
  test('l’emplacement porte la Flamme, s’affiche « meeshy.me/r/… » et se déclare tel', () => {
    expect(REFERRAL_PLACEHOLDER).toBe('meeshy.me/r/…');
    expect(referralPlaceholder(23)).toEqual({ url: '', display: 'meeshy.me/r/…', flameDays: 23, placeholder: true });
    expect(referralPlaceholder(0).flameDays).toBeNull();
  });

  test('un vrai lien ne se déclare jamais emplacement', () => {
    expect(referralOf('https://meeshy.me/x', 3)?.placeholder).toBeUndefined();
  });
});
