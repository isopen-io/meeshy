import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import lentilleTokens from '@meeshy/shared/design/lentille-tokens.json';

import { LensSection, LensSticker } from './lens-sticker';

describe('le sticker de section', () => {
  test('rend un <h2 data-sticker> en casse normale, transformé en capitales par le rendu', () => {
    const html = renderToStaticMarkup(<LensSticker id="lentille.today" />);
    expect(html).toContain('data-sticker="lentille.today"');
    expect(html).toMatch(/<h2[^>]*class="[^"]*uppercase[^"]*"[^>]*>Aujourd&#x27;hui<\/h2>/);
  });

  test("n'est ni un bouton ni une rangée : aucun tabindex, aucun <button>, aucun data-row", () => {
    const html = renderToStaticMarkup(<LensSticker id="pinned" />);
    expect(html).not.toContain('<button');
    expect(html).not.toContain('tabindex');
    expect(html).not.toContain('data-row');
  });

  test('les cotes proviennent EXACTEMENT de lentille-tokens.json — aucun littéral recopié', () => {
    const html = renderToStaticMarkup(<LensSticker id="lentille.older" />);
    const sticker = lentilleTokens.list.sticker;
    expect(html).toContain(`font-size:${sticker.size}px`);
    expect(html).toContain(`font-weight:${sticker.weight}`);
    expect(html).toContain(`letter-spacing:${sticker.letterSpacingEm}em`);
    expect(html).toContain(`padding:${sticker.padding.vertical}px ${sticker.padding.horizontal}px`);
  });

  const allIds = ['pinned', 'lentille.live', 'lentille.today', 'lentille.yesterday', 'lentille.thisWeek', 'lentille.older'] as const;
  for (const id of allIds) {
    test(`l'en-tête ${id} est COLLANT plein largeur, pas les rangées`, () => {
      const html = renderToStaticMarkup(<LensSticker id={id} />);
      expect(html).toContain('sticky');
      expect(html).toContain('top-0');
    });
  }
});

/**
 * LE BLOC DE SECTION BORNE LE COLLANT (revue #5694) — sans lui, tous les
 * en-têtes s'empilent en haut du scrollport au lieu de se chasser l'un
 * l'autre : `position: sticky` est borné par le bloc CONTENEUR, et à plat ce
 * conteneur est la liste ENTIÈRE. Le témoin épingle donc la STRUCTURE : le
 * `<h2>` collant est le premier enfant du bloc de section, et les rangées
 * vivent dans une liste qui lui est PROPRE.
 */
describe('le bloc de section', () => {
  const html = renderToStaticMarkup(
    <LensSection id="lentille.today">
      <li data-row="c1">rangée</li>
    </LensSection>,
  );

  test("l'en-tête collant est DANS le bloc de section, avant sa liste de rangées", () => {
    expect(html).toContain('data-section="lentille.today"');
    expect(html.indexOf('data-section')).toBeLessThan(html.indexOf('data-sticker'));
    expect(html.indexOf('data-sticker')).toBeLessThan(html.indexOf('data-row'));
  });

  test('les rangées sont dans une liste PROPRE à la section, jamais frères de son en-tête', () => {
    expect(html).toMatch(/<\/h2><ul><li data-row=/);
  });

  test("le bloc ne rétrécit pas — il est l'élément flex de la liste, comme les rangées l'étaient", () => {
    expect(html).toMatch(/data-section="[^"]*"[^>]*class="[^"]*shrink-0/);
  });

  /**
   * TOUTE section porte la jonction, la PREMIÈRE comprise (#5694, correction
   * défaut 3) — le scrollport ne porte plus `pt-2` : `position: sticky`
   * n'accepte de repère qu'à la boîte de PADDING de son ascendant défilant,
   * jamais à une marge d'enfant, donc c'est désormais la seule façon d'ouvrir
   * l'espace sans décaler le point où l'en-tête colle. Voir le doc-comment
   * de `LensSection`.
   */
  test('la jonction — y compris pour la PREMIÈRE section — vaut la cote `list.row.marginVertical`, jamais un littéral', () => {
    expect(html).toContain(`margin-top:${lentilleTokens.list.row.marginVertical}px`);

    const suivante = renderToStaticMarkup(
      <LensSection id="lentille.yesterday">
        <li data-row="c2">rangée</li>
      </LensSection>,
    );
    expect(suivante).toContain(`margin-top:${lentilleTokens.list.row.marginVertical}px`);
  });
});
