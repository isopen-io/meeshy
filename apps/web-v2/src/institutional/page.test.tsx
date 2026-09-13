/** @jsxImportSource preact */
import { describe, expect, test } from 'bun:test';
import { render } from 'preact-render-to-string';

import { PAGE_ABOUT } from './about';
import { InstitutionalPage } from './page';

/**
 * LES PAGES INSTITUTIONNELLES SERVENT LE LOGO ET LA SIGNATURE (#5606).
 *
 * `InstitutionalPage` est le rendu partagé des cinq pages — un seul test
 * suffit à prouver « au moins un écran » (§ critère de fin, ligne 2) ; les
 * quatre autres contenus (`contact.ts`, `partners.ts`, `privacy.ts`,
 * `terms.ts`) traversent exactement le même composant.
 */
describe('InstitutionalPage — en-tête (logo) et pied (signature)', () => {
  const html = render(<InstitutionalPage page={PAGE_ABOUT} version="3.1.0" />);

  test('l’en-tête sert le logo — décoratif, le mot « Meeshy » adjacent porte le nom', () => {
    // `preact-render-to-string` sérialise un `alt=""` en attribut nu `alt`
    // (sans `=""`) — le témoin lit donc le TAG entier plutôt que de chercher
    // une sous-chaîne dont la forme dépend du moteur de rendu.
    expect(html).toContain('<img src="/brand/logo.png" width="40" height="40" alt/>');
  });

  test('le pied porte la signature de marque', () => {
    expect(html).toContain('Meeshy 3.1.0');
    expect(html).toContain('Services CEO');
  });
});
