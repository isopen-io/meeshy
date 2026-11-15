import { describe, expect, test } from 'bun:test';

import { BRAND_CREDIT, BRAND_CREDIT_LINK, brandCreditHint, BRAND_LOGO_PATH, BRAND_SIGNATURE_MASK_PATH, brandVersionLine } from './brand';

/**
 * LE CŒUR DE MARQUE EST UNIQUE ET AGNOSTIQUE DU RUNTIME (#5606).
 *
 * TS pur, sans JSX : c'est ce que l'écran de connexion (à venir) et les
 * pages institutionnelles (aujourd'hui) importeront tous les deux, plutôt que
 * de recopier chacun le chemin des actifs ou le crédit de marque.
 */
describe('src/lib/brand.ts', () => {
  test('BRAND_LOGO_PATH pointe l’actif servi par generate-icons.py', () => {
    expect(BRAND_LOGO_PATH).toBe('/brand/logo.png');
  });

  test('BRAND_SIGNATURE_MASK_PATH pointe le glyphe-gabarit de la signature', () => {
    expect(BRAND_SIGNATURE_MASK_PATH).toBe('/brand/signature-mask.png');
  });

  test('BRAND_CREDIT se lit « by services.ceo » — une marque, jamais traduite (#10096)', () => {
    expect(BRAND_CREDIT).toBe('by services.ceo');
  });

  test('BRAND_CREDIT_LINK ouvre la plateforme dans un nouvel onglet, sans lien de retour (#10096)', () => {
    expect(BRAND_CREDIT_LINK).toEqual({
      href: 'https://services.ceo',
      target: '_blank',
      rel: 'noopener noreferrer',
    });
  });

  test('brandCreditHint dit où mène le crédit, à la suite du texte visible, dans la langue servie (#10096, #10827)', () => {
    expect(brandCreditHint('fr')).toBe(' — ouvre la plateforme services.ceo dans un nouvel onglet');
  });

  test('brandVersionLine reproduit "Meeshy {version}" (BrandSignature.swift, sans build web)', () => {
    expect(brandVersionLine('3.1.0')).toBe('Meeshy 3.1.0');
  });
});
