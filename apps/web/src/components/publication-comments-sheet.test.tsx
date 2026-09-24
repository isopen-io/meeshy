import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';

import { PublicationCommentsSheet } from './publication-comments-sheet';

/**
 * LA FEUILLE DE COMMENTAIRES PARTAGÉE (#6484, D-89) — ce que ses DEUX hôtes
 * (lecteur de stories, lecteur des Réels) reçoivent à l'identique.
 *
 * L'ENCOCHE BASSE (revue-correction #6484, défaut de coque 5a). La feuille
 * se pose au BAS d’un écran plein cadre sous `viewport-fit=cover`
 * (`index.html`) : sans inset, son composeur — la dernière rangée — passait
 * SOUS l'indicateur d'accueil d'un iPhone, en coque comme en PWA. Chromium de
 * bureau rend un inset NUL, donc aucun gate navigateur ne le voit : ce témoin
 * garde l'écriture, la recette simulateur garde le rendu (même doctrine que
 * `routes/safe-area.test.ts`).
 */
const sheet = () =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <PublicationCommentsSheet postId="reel-portrait" onClose={() => undefined} />
    </QueryClientProvider>,
  );

const sheetStyle = (html: string): string => /data-story-comments-sheet="reel-portrait"[^>]*style="([^"]*)"/.exec(html)?.[1] ?? '';

describe('PublicationCommentsSheet — posée au bas de l’écran', () => {
  test('un dialogue nommé, sur la publication demandée', () => {
    const html = sheet();
    expect(html).toContain('data-story-comments-sheet="reel-portrait"');
    expect(html).toContain('role="dialog"');
  });

  test('sa dernière rangée — le composeur — reste AU-DESSUS de l’indicateur d’accueil', () => {
    expect(sheetStyle(sheet())).toContain('padding-bottom:env(safe-area-inset-bottom, 0px)');
  });
});
