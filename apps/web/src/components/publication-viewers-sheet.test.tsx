import { QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { appQueryClient } from '@/lib/api/query-client';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { PublicationViewersSheet } from './publication-viewers-sheet';

/**
 * **« QUI A VU MA STORY »** (#7116) — patron `message-receipts-sheet.test.tsx` :
 * les fixtures (`fixtures-viewers.ts`) rendent des cartes DÉTERMINISTES, ce
 * fichier mesure que le montage React descend jusqu'au DOM et respecte la
 * porte AUTEUR (`getPostInteractions`, 403/404), pas la loi elle-même.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
});

async function mountSheet(props: { readonly postId: string; readonly viewCount: number | null }): Promise<HTMLElement> {
  const host = await mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <ul>
        <PublicationViewersSheet {...props} onClose={() => {}} />
      </ul>
    </QueryClientProvider>,
  );
  await mounter.settle();
  return host;
}

describe('PublicationViewersSheet — la liste des lecteurs de MA story', () => {
  test('« st-mienne » rend ses trois vues, avec réaction et repli sur le pseudo', async () => {
    const host = await mountSheet({ postId: 'st-mienne', viewCount: 3 });

    const rows = host.querySelectorAll('[data-story-viewer]');
    expect(rows).toHaveLength(3);
    expect(host.querySelectorAll('[data-story-viewer-reaction]')).toHaveLength(1);
    // Une ligne sans `displayName` affiche le pseudo — jamais une case vide.
    expect(host.textContent).toContain('elan.roy');
  });

  test('le TITRE porte le compte AUTORITATIF, jamais la longueur de la page (C4)', async () => {
    const host = await mountSheet({ postId: 'st-mienne', viewCount: 8 });
    expect(host.querySelector('h2')?.textContent).toContain('8');
  });

  test('une story d’AUTRUI (403) ⇒ l’état REFUS dit pourquoi — « réessayer » n’y changerait rien', async () => {
    const host = await mountSheet({ postId: 'st-amie-1', viewCount: 5 });
    expect(host.querySelector('[data-viewers-forbidden]')?.textContent).toBe('Seul l’auteur peut voir qui a regardé cette story.');
    expect(host.querySelector('[data-viewers-retry]')).toBeNull();
    expect(host.querySelectorAll('[data-story-viewer]')).toHaveLength(0);
  });

  test('une story INTROUVABLE (404) ⇒ l’erreur avec « Réessayer », et réessayer REFAIT la requête', async () => {
    const host = await mountSheet({ postId: 'st-inconnue', viewCount: null });
    expect(host.querySelector('[data-viewers-error]')).not.toBeNull();
    expect(host.querySelectorAll('[data-story-viewer]')).toHaveLength(0);
    const before = appQueryClient.getQueryState(['stories', 'viewers', 'st-inconnue'])?.dataUpdateCount ?? 0;
    const errorsBefore = appQueryClient.getQueryState(['stories', 'viewers', 'st-inconnue'])?.errorUpdateCount ?? 0;
    host.querySelector<HTMLButtonElement>('[data-viewers-retry]')?.click();
    await mounter.settle();
    const errorsAfter = appQueryClient.getQueryState(['stories', 'viewers', 'st-inconnue'])?.errorUpdateCount ?? 0;
    expect(before).toBe(0);
    expect(errorsAfter).toBeGreaterThan(errorsBefore);
  });

  test('chaque lecteur est un LIEN vers son profil (iOS : `onOpenProfile(viewer)`)', async () => {
    const host = await mountSheet({ postId: 'st-mienne', viewCount: 8 });
    const links = [...host.querySelectorAll<HTMLAnchorElement>('[data-story-viewer] a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/u/noor.haddad', '/u/elan.roy', '/u/mika.sorel']);
  });

  test('compte AUTORITATIF absent ⇒ l’en-tête retombe sur la liste servie, jamais « 0 vue » au-dessus de trois lecteurs', async () => {
    const host = await mountSheet({ postId: 'st-mienne', viewCount: null });
    expect(host.querySelector('h2')?.textContent).toBe('3 vues');
  });

  test('HORS LIGNE sans cache ⇒ l’état hors-ligne, jamais « Aucune vue » (un mensonge)', async () => {
    /* TanStack met la requête EN PAUSE hors ligne — ni données, ni erreur
       (`lib/view/cold-state.ts`). Le premier jet lisait ce couple comme une
       liste VIDE et annonçait « Aucune vue pour le moment » à un auteur que
       huit personnes avaient vu. */
    onlineManager.setOnline(false);
    try {
      const host = await mountSheet({ postId: 'st-mienne', viewCount: 8 });
      expect(host.querySelector('[data-viewers-offline]')?.textContent).toBe('Hors ligne — la liste s’affichera au retour du réseau.');
      expect(host.querySelector('[data-viewers-empty]')).toBeNull();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  test('aucune vue ⇒ l’état VIDE, titre et sous-titre', async () => {
    const host = await mountSheet({ postId: 'st-mienne-sans-vue', viewCount: 0 });
    expect(host.querySelector('[data-story-viewer]')).toBeNull();
    expect(host.querySelector('[data-viewers-empty]')).not.toBeNull();
    expect(host.textContent).toContain('Aucune vue pour le moment');
    expect(host.textContent).toContain('Les personnes qui regardent votre story apparaîtront ici.');
  });
});
