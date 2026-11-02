import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

// @ts-expect-error — le gate d'harmonie est un module d'outillage `.mjs` sans déclaration de types.
import { scanSource } from '../../../scripts/check-design-harmony.mjs';

/**
 * LES LITTÉRAUX QUE LE GATE D'HARMONIE PREND POUR DU CHROME, ET QUI N'EN SONT PAS
 * (#8879, piste 76w). Le `blanc`/`noir` d'un masque SVG est une LUMINANCE (blanc
 * = visible, noir = masqué) ; le `#ffffff`/`#000000` d'un QR est un CODE lu par
 * une caméra. Les thématiser ne les « harmoniserait » pas : cela CASSERAIT le
 * grattage et l'illisibilité du carré. Ils portent donc un marqueur
 * `harmony-exempt:` motivé, et ce témoin interdit qu'une couleur de chrome
 * NON motivée revienne s'y cacher — le fichier reste propre au gate, une fois
 * pour toutes, sans que la routine UI/UX ait à le réexaminer.
 *
 * (La valeur CANONIQUE du QR — noir pur sur blanc pur — est déjà épinglée par
 * `game-photo-frame.test.tsx`. La luminance du masque l'est par
 * `author-plate.test.tsx`. Ici : rien que la propreté au gate.)
 */
const scanOf = (relative: string): readonly unknown[] =>
  scanSource(readFileSync(new URL(relative, import.meta.url), 'utf8')) as readonly unknown[];

describe('les littéraux non-peinture restent propres au gate d’harmonie', () => {
  test('le QR du lien de parrainage (code noir-sur-blanc, pas du chrome) ne compte plus', () => {
    expect(scanOf('../../lib/game-photo/referral-qr.ts')).toEqual([]);
  });

  test('le masque de grattage de la plaque (luminance SVG, pas du chrome) ne compte plus', () => {
    expect(scanOf('./author-plate.tsx')).toEqual([]);
  });
});
