import { describe, expect, test } from 'bun:test';

import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import { skipLinkLabel } from './skip-link';

/* #9710 — recette du 2026-10-08 : sous une interface anglaise, le lien
   d'évitement de la coquille disait « Aller au contenu ». Il est le PREMIER
   arrêt du clavier et du lecteur d'écran sur chaque page. */
describe('skipLinkLabel — le lien d’évitement parle la langue d’interface (#9710)', () => {
  test('anglais et français', () => {
    expect(skipLinkLabel('en')).toBe('Skip to content');
    expect(skipLinkLabel('fr')).toBe('Aller au contenu');
  });

  test('les sept langues ont chacune leur libellé, aucun vide, aucun emprunté au français', () => {
    const labels = SUPPORTED_INTERFACE_LANGUAGES.map((language) => skipLinkLabel(language));
    expect(labels.every((label) => label.trim() !== '')).toBe(true);
    expect(new Set(labels).size).toBe(SUPPORTED_INTERFACE_LANGUAGES.length);
  });
});
