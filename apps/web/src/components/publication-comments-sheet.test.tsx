import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

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

/**
 * **LE RETOUR MATÉRIEL FERME LA FEUILLE, PAS LE LECTEUR** (revue-correction
 * #6484, défaut majeur 1) — `PublicationCommentsSheet` promettait ce
 * comportement dans son commentaire (« ÉCHAP ET LE RETOUR FERMENT LA
 * FEUILLE ») sans jamais écouter `popstate` : sur la coque Android, le bouton
 * retour matériel fait reculer `history.back()` quand la WebView le peut, ce
 * qui remonte la route `/reels` ou `/story/…` SOUS la feuille ouverte —
 * exactement le motif déjà mesuré pour `MessageMenu`
 * (`AND-9-back-depuis-menu.png`, `message-menu.test.tsx`). Montée en DOM réel
 * (happy-dom + `createRoot` + `act`, patron `message-menu.test.tsx`) pour que
 * l'effet de `useBackDismiss` (posé au COMMIT, pas en effet passif) tourne
 * réellement — `renderToStaticMarkup` ci-dessus ne joue aucun effet.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

describe('PublicationCommentsSheet — retour matériel (Android)', () => {
  beforeAll(async () => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
    await loadInterfaceCatalog('fr');
  });

  afterAll(async () => {
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const mount = (onClose: () => void): void => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <PublicationCommentsSheet postId="reel-portrait" onClose={onClose} />
        </QueryClientProvider>,
      );
    });
  };

  test('ouverture ⇒ pose UNE entrée d’historique que le retour consomme', () => {
    const before = window.history.length;
    mount(() => undefined);
    expect(window.history.length).toBe(before + 1);
  });

  test('popstate (retour matériel) ⇒ onClose appelé (l’hôte referme la feuille, jamais le lecteur)', () => {
    let closed = false;
    mount(() => {
      closed = true;
    });
    expect(closed).toBe(false);
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(closed).toBe(true);
  });
});
