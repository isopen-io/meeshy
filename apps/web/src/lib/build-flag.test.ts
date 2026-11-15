import { describe, expect, test } from 'bun:test';

import { declaredBuildFlag } from './build-flag';

/**
 * TÉMOIN DU DÉFAUT MESURÉ le 2026-09-10 : le build de l'image `web-v31` a
 * échoué sur `VITE_READING_MODES=` — la chaîne vide que produit
 * `ENV VITE_X=${VITE_X}` quand l'`ARG` a un défaut vide et que personne ne le
 * surcharge.
 *
 * Rien ne pouvait l'attraper en amont : le build Docker de `web-v31` ne tourne
 * PAS dans les contrôles de PR, seulement au push sur `dev`. Les seize
 * contrôles de la PR étaient verts.
 */
describe('declaredBuildFlag — la chaîne vide est une ABSENCE', () => {
  const ADMISES = ['on', 'off'] as const;

  test('absente ⇒ undefined', () => {
    expect(declaredBuildFlag('VITE_X', undefined, ADMISES)).toBeUndefined();
  });

  test('CHAÎNE VIDE ⇒ undefined — le cas qui a cassé le build de l’image', () => {
    expect(declaredBuildFlag('VITE_X', '', ADMISES)).toBeUndefined();
  });

  test('une valeur admise passe telle quelle', () => {
    expect(declaredBuildFlag('VITE_X', 'off', ADMISES)).toBe('off');
  });

  /**
   * LE SENS INVERSE, et c'est lui qui justifie la garde : sans ce refus,
   * `VITE_DATA_SOURCE=gatway` construirait un déploiement servant des fixtures
   * en croyant parler à la passerelle. La tolérance à la chaîne vide ne doit
   * PAS devenir une tolérance aux fautes de frappe.
   */
  test('une valeur INCONNUE fait échouer la construction', () => {
    expect(() => declaredBuildFlag('VITE_X', 'On', ADMISES)).toThrow('VITE_X=On');
  });

  test('un espace n’est pas une absence — c’est une faute de frappe', () => {
    expect(() => declaredBuildFlag('VITE_X', ' ', ADMISES)).toThrow();
  });

  test('le message nomme la variable ET les valeurs admises', () => {
    try {
      declaredBuildFlag('VITE_DATA_SOURCE', 'gatway', ['fixtures', 'gateway']);
      throw new Error('aurait dû lever');
    } catch (e) {
      const m = (e as Error).message;
      expect(m).toContain('VITE_DATA_SOURCE=gatway');
      expect(m).toContain('« fixtures »');
      expect(m).toContain('« gateway »');
    }
  });
});
