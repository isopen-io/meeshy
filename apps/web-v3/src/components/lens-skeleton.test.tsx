import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { LensSkeleton } from './lens-skeleton';
import { ROW_HEIGHT } from './lens-row';

describe('LensSkeleton — F5/§5 étape 9 (#5650)', () => {
  const html = renderToStaticMarkup(<LensSkeleton />);

  test('six lignes, chacune data-skeleton-row', () => {
    expect((html.match(/data-skeleton-row/g) ?? []).length).toBe(6);
  });

  test(`chaque ligne mesure ROW_HEIGHT (${ROW_HEIGHT}px), importé — jamais un littéral réécrit`, () => {
    expect((html.match(new RegExp(`height:${ROW_HEIGHT}px`, 'g')) ?? []).length).toBe(6);
  });

  test('aria-busy et aria-label sur la liste', () => {
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Chargement des conversations"');
  });

  test('aucun texte VISIBLE (seulement des barres décoratives et un bandeau de section invisible)', () => {
    // Le bandeau fantôme (`SkeletonSectionStub`, revue-correction) porte un
    // texte `visibility: hidden` — présent dans le MARKUP (c'est ce qui lui
    // donne la hauteur exacte de `LensSticker`, sans dupliquer le calcul de
    // ligne du navigateur) mais jamais LU ni vu : on l'exclut explicitement
    // plutôt que d'affaiblir l'assertion à « aucun texte du tout ».
    const withoutTags = html
      .replace(/<span style="visibility:hidden">Chargement<\/span>/, '')
      .replace(/<[^>]+>/g, '')
      .trim();
    expect(withoutTags).toBe('');
    expect(html).toContain('visibility:hidden');
  });
});
