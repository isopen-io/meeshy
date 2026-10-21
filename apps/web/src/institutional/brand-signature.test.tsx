import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup as render } from 'react-dom/server';

import { BrandSignature } from './brand-signature';

/**
 * LA SIGNATURE WEB REPRODUIT `BrandSignature.swift` (#5606).
 *
 * Rendue par `react-dom/server` — le MÊME moteur que le préchauffage
 * (`scripts/prerender-institutional.tsx`) depuis que les pages statiques
 * partagent l'en-tête de la landing (#10071).
 */
describe('BrandSignature — pied de marque des pages institutionnelles', () => {
  const html = render(<BrandSignature version="3.1.0" language="fr" />);
  const creditLink = () => html.match(/<a [^>]*>.*?<\/a>/)?.[0] ?? '';

  test('porte la ligne de version', () => {
    expect(html).toContain('Meeshy 3.1.0');
  });

  test('porte le crédit « by services.ceo », en poids medium comme BrandSignature.swift', () => {
    expect(html).toContain('>by services.ceo<');
    expect(html).not.toContain('Services CEO');
    expect(creditLink()).toContain('font-medium');
  });

  /**
   * LE CRÉDIT MÈNE À LA PLATEFORME (#10096) — un VRAI lien externe, nommé
   * par son texte visible PUIS par ce qu'il fait, et touchable sur 44 px sans
   * déplacer une ligne du pied : la zone grandit par son padding, et une marge
   * négative de même valeur rend au flux exactement la hauteur d'une ligne.
   */
  test('le crédit est un lien externe vers https://services.ceo, nouvel onglet, sans opener', () => {
    const a = creditLink();
    expect(a).toContain('href="https://services.ceo"');
    expect(a).toContain('target="_blank"');
    expect(a).toContain('rel="noopener noreferrer"');
  });

  test('son nom accessible dit le crédit PUIS la destination', () => {
    expect(creditLink()).toContain(
      '>by services.ceo<span class="sr-only"> — ouvre la plateforme services.ceo dans un nouvel onglet</span></a>',
    );
  });

  test('sa cible fait 44 px de haut sans changer la mise en page, et garde l’encre du crédit', () => {
    const a = creditLink();
    expect(a).toContain('min-h-[44px]');
    expect(a).toContain('-my-[12px]');
    expect(a).toContain('color:var(--color-ios-ink-3)');
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
