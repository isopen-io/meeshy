import { describe, expect, test } from 'bun:test';

import {
  REFERRAL_SEARCH_KEYS,
  isReferralCodeShaped,
  normalizeReferralCode,
  referralCodeFromSearch,
} from './referral-code';

/**
 * LE CODE DE PARRAINAGE LU DANS L'ADRESSE (#6584) — question porteur
 * 2026-09-14 : « la possibilité d'entrer le code du référer lors de
 * l'inscription ».
 */

const search = (query: string) => new URLSearchParams(query);

describe('d’où vient le code', () => {
  test('sans paramètre : rien', () => {
    expect(referralCodeFromSearch(search(''))).toBe('');
  });

  test('`?ref=` le porte', () => {
    expect(referralCodeFromSearch(search('ref=aff_abc123'))).toBe('aff_abc123');
  });

  /** Un lien partagé en français dira « parrain » ; les deux ouvrent la même
   * porte plutôt que d'exiger de connaître la bonne orthographe. */
  test('`?parrain=` aussi', () => {
    expect(referralCodeFromSearch(search('parrain=ref_zoe'))).toBe('ref_zoe');
  });

  /** La clé du LEGACY (`apps/web/middleware.ts:63` capte `/?affiliate=TOKEN`
   * sur n'importe quelle adresse). Des liens la portant sont déjà partagés. */
  test('`?affiliate=` — celle du legacy — est lue aussi', () => {
    expect(referralCodeFromSearch(search('affiliate=aff_legacy'))).toBe('aff_legacy');
  });

  test('l’ORDRE des clés est fixé, pas laissé au hasard de l’adresse', () => {
    expect(REFERRAL_SEARCH_KEYS).toEqual(['ref', 'parrain', 'affiliate']);
    expect(referralCodeFromSearch(search('parrain=second&ref=premier'))).toBe('premier');
  });

  test('une clé VIDE ne masque pas la suivante', () => {
    expect(referralCodeFromSearch(search('ref=&parrain=ref_zoe'))).toBe('ref_zoe');
  });

  test('les espaces d’un copier-coller sont retirés', () => {
    expect(referralCodeFromSearch(search('ref=%20aff_abc%20'))).toBe('aff_abc');
  });
});

describe('la FORME d’un code', () => {
  test('un code plausible passe', () => {
    expect(isReferralCodeShaped('aff_1234567890_abc')).toBe(true);
    expect(isReferralCodeShaped('ref_zoe')).toBe(true);
  });

  test('vide, espacé ou démesuré : non', () => {
    expect(isReferralCodeShaped('')).toBe(false);
    expect(isReferralCodeShaped('   ')).toBe(false);
    expect(isReferralCodeShaped('aff abc')).toBe(false);
    expect(isReferralCodeShaped('a'.repeat(200))).toBe(false);
  });

  /**
   * La CASSE est conservée : un jeton est un identifiant opaque servi par
   * `generateUniquePublicIdentifier`, pas un mot. Le minuscule-iser rendrait
   * introuvable un jeton qui porterait une majuscule — un refus fabriqué par
   * le client pour une valeur que la passerelle accepte.
   */
  test('la normalisation ne fait que retirer les espaces de bord', () => {
    expect(normalizeReferralCode('  aff_AbC  ')).toBe('aff_AbC');
  });
});
