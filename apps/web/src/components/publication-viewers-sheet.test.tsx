import { QueryClientProvider } from '@tanstack/react-query';
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

async function mountSheet(props: { readonly postId: string; readonly viewCount: number }): Promise<HTMLElement> {
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

  test('une story d’AUTRUI ⇒ état d’ERREUR avec réessayer, jamais la liste', async () => {
    const host = await mountSheet({ postId: 'st-amie-1', viewCount: 5 });
    expect(host.querySelector('[data-viewers-error]')).not.toBeNull();
    expect(host.querySelector('[data-viewers-retry]')).not.toBeNull();
    expect(host.querySelectorAll('[data-story-viewer]')).toHaveLength(0);
  });

  test('aucune vue ⇒ l’état VIDE, titre et sous-titre', async () => {
    const host = await mountSheet({ postId: 'st-mienne-sans-vue', viewCount: 0 });
    expect(host.querySelector('[data-story-viewer]')).toBeNull();
    expect(host.querySelector('[data-viewers-empty]')).not.toBeNull();
    expect(host.textContent).toContain('Aucune vue pour le moment');
    expect(host.textContent).toContain('Les personnes qui regardent votre story apparaîtront ici.');
  });
});
