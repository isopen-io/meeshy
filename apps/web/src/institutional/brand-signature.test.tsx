/** @jsxImportSource preact */
import { describe, expect, test } from 'bun:test';
import { render } from 'preact-render-to-string';

import { BrandSignature } from './brand-signature';

/**
 * LA SIGNATURE WEB REPRODUIT `BrandSignature.swift` (#5606).
 *
 * Rendue par `preact-render-to-string` — le MÊME moteur que le préchauffage
 * (`scripts/prerender-institutional.tsx`), pas `react-dom/server` : ce fichier
 * porte le pragma preact (comme `src/institutional/page.tsx`), donc son JSX
 * compile déjà vers de vrais éléments Preact. `react-dom/server` y rendrait
 * une chaîne vide sans erreur (même précédent que #5554).
 */
describe('BrandSignature — pied de marque des pages institutionnelles', () => {
  const html = render(<BrandSignature version="3.1.0" />);

  test('porte la ligne de version', () => {
    expect(html).toContain('Meeshy 3.1.0');
  });

  test('porte le crédit "Services CEO", en poids medium comme BrandSignature.swift:29-33', () => {
    expect(html).toContain('Services CEO');
    expect(html).toContain('class="font-medium"');
  });

  test('le glyphe est un masque CSS 28×28 teinté var(--ios-error), caché au lecteur d’écran', () => {
    expect(html).toContain('mask-image');
    expect(html).toContain('/brand/signature-mask.png');
    expect(html).toContain('var(--ios-error)');
    // Le glyphe est le SEUL nœud `aria-hidden` du bloc — il porte le masque
    // dans le MÊME élément, pas un enfant ou un frère séparé.
    expect(html).toContain('width:28px;height:28px');
    expect((html.match(/aria-hidden="true"/g) ?? []).length).toBe(1);
  });

  /**
   * LE TÉMOIN DE LA CORRECTION DE REVUE (#5606) — la hiérarchie de lecture
   * passe par l'ENCRE, jamais par l'opacité.
   *
   * La première version reprenait littéralement les opacités d'iOS (0,9 et
   * 0,7 sur `textMuted`) : mesuré sur les jetons dérivés, 4,44:1 et 3,09:1 en
   * sombre, 4,12:1 et 2,86:1 en clair — sous AA dans les deux schémas. Ce
   * témoin épingle les DEUX encres pleines ET l'absence de toute opacité de
   * texte : une opacité réintroduite sur l'une des deux lignes le fait
   * rougir, ce qu'aucune lecture de couleur seule n'aurait attrapé.
   */
  test('les deux lignes portent des encres PLEINES — aucune opacité de texte', () => {
    expect(html).toContain('var(--color-ios-ink-2)');
    expect(html).toContain('var(--color-ios-ink-3)');
    expect(html).not.toContain('opacity-90');
    expect(html).not.toContain('opacity-70');
    // `opacity:0.9` ne subsiste QUE sur le glyphe décoratif (iOS
    // `BrandSignature.swift:41`), exempté du seuil de contraste.
    expect((html.match(/opacity:0\.9/g) ?? []).length).toBe(1);
  });

  /**
   * `aria-label` sur un conteneur générique est IGNORÉ (« ARIA in HTML » :
   * nommage interdit sur le rôle `generic`). Le bloc n'en porte donc AUCUN —
   * son texte visible est son texte lu. Ce témoin garde la porte : le
   * réintroduire peindrait une conformité sans effet, exactement le défaut
   * que la revue de #5606 a retiré.
   */
  test('aucun nom ARIA posé sur un conteneur sans rôle', () => {
    expect(html).not.toContain('aria-label');
  });
});
