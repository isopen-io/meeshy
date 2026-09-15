import { describe, expect, test } from 'bun:test';

import { averageColorOfThumbHash, averageColorToHex, thumbHashPlaceholder } from './thumbhash';

/**
 * Encode des octets bruts en base64 STANDARD — le même format que
 * `PostMedia.thumbHash` sur le wire. `btoa`/`String.fromCharCode` plutôt
 * qu'une dépendance : ce fichier ne fabrique que de très petits tableaux.
 */
const base64Of = (bytes: readonly number[]): string => btoa(String.fromCharCode(...bytes));

describe('averageColorOfThumbHash — le décodage de l’en-tête, octet par octet', () => {
  test('un hash trop court (moins de 3 octets) rend null, jamais une couleur inventée', () => {
    expect(averageColorOfThumbHash('')).toBeNull();
    expect(averageColorOfThumbHash(base64Of([1, 2]))).toBeNull();
  });

  test('un caractère hors de l’alphabet base64 rend null plutôt que de lever', () => {
    expect(averageColorOfThumbHash('€€€€')).toBeNull();
  });

  /**
   * VECTEUR CALCULÉ À LA MAIN à partir de la formule du fichier — `l=1`
   * (`l_raw=63`), `p=-1` (`p_raw=0`), `q=1` (`q_raw=63`) :
   *   b = l - 2/3·p = 5/3 → clampé à 1
   *   r = l + p/3 + q/2  = 7/6 → clampé à 1
   *   g = r - q          = 1/6 (avant clamp de r) → 43/255 arrondi
   * Sans canal alpha (3 octets seulement) ⇒ opaque.
   */
  test('l=1, p=-1, q=1 ⇒ rouge et bleu saturés, vert à 1/6, opaque', () => {
    const header = 63 | (0 << 6) | (63 << 12);
    const bytes = [header & 0xff, (header >> 8) & 0xff, (header >> 16) & 0xff];
    const color = averageColorOfThumbHash(base64Of(bytes));
    expect(color).not.toBeNull();
    expect(color?.r).toBe(1);
    expect(color?.b).toBe(1);
    expect(color?.g).toBeCloseTo(1 / 6, 3);
    expect(color?.a).toBe(1);
    expect(averageColorToHex(color!)).toBe('#ff2bff');
  });

  test('un 6ᵉ octet avec le bit de poids fort posé porte un alpha PARTIEL', () => {
    const header = 63 | (0 << 6) | (63 << 12);
    const bytes = [header & 0xff, (header >> 8) & 0xff, (header >> 16) & 0xff, 0, 0, 0b1_1000000];
    const color = averageColorOfThumbHash(base64Of(bytes));
    expect(color?.a).toBeCloseTo(64 / 127, 3);
    // L'alpha partiel ajoute un cinquième couple hexadécimal.
    expect(averageColorToHex(color!)).toMatch(/^#ff2bff[0-9a-f]{2}$/);
  });

  test('un 6ᵉ octet SANS le bit de poids fort reste opaque, même non nul', () => {
    const header = 0; // l=0, p=-1, q=-1 — peu importe ici, seul l'alpha est visé.
    const bytes = [header & 0xff, 0, 0, 0, 0, 0b0_1000000];
    const color = averageColorOfThumbHash(base64Of(bytes));
    expect(color?.a).toBe(1);
  });
});

describe('thumbHashPlaceholder — le SITE UNIQUE que la carte de post appelle', () => {
  test('absent ou vide ⇒ aucun placeholder, jamais une chaîne creuse', () => {
    expect(thumbHashPlaceholder(undefined)).toBeUndefined();
    expect(thumbHashPlaceholder('')).toBeUndefined();
  });

  test('un hash illisible ⇒ aucun placeholder — l’appelant retombe sur SA teinte', () => {
    expect(thumbHashPlaceholder(base64Of([1]))).toBeUndefined();
  });

  test('un hash valide rend un data: URI SVG peint de la couleur moyenne, jamais un rectangle noir', () => {
    const header = 63 | (0 << 6) | (63 << 12);
    const bytes = [header & 0xff, (header >> 8) & 0xff, (header >> 16) & 0xff];
    const uri = thumbHashPlaceholder(base64Of(bytes));
    expect(uri).toBeDefined();
    expect(uri?.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    expect(decodeURIComponent(uri ?? '')).toContain('#ff2bff');
    expect(uri).not.toContain('black');
    expect(uri).not.toContain('%23000000');
  });
});
