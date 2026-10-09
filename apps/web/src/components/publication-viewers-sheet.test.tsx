import { QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { appQueryClient } from '@/lib/api/query-client';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadViewerEngagementCatalog } from '@/lib/i18n-viewer-engagement-catalog';
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
  await loadViewerEngagementCatalog('fr');
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

async function mountSheet(props: { readonly postId: string; readonly viewCount: number | null; readonly subject?: 'story' | 'publication' }): Promise<HTMLElement> {
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

  test('sous chaque nom, ce que la personne a fait — et rien pour qui n’a rien fait (#9727)', async () => {
    const host = await mountSheet({ postId: 'st-mienne', viewCount: 3 });
    const noor = host.querySelector('[data-story-viewer="u-viewer-noor"]');
    expect(noor?.querySelector('[data-story-viewer-reaction]')?.textContent).toBe('🔥 ❤️');
    expect([...(noor?.querySelectorAll('[data-story-viewer-mark]') ?? [])].map((mark) => [mark.getAttribute('data-story-viewer-mark'), mark.textContent])).toEqual([
      ['comments', '1'],
      ['replies', '2'],
      ['bookmarked', ''],
    ]);
    expect(host.querySelector('[data-story-viewer="u-viewer-elan"] [data-story-viewer-marks]')).toBeNull();
  });

  test('toucher une ligne ouvre SON détail, en toutes lettres, avec le lien vers son profil', async () => {
    const host = await mountSheet({ postId: 'st-mienne', viewCount: 3 });
    const row = host.querySelector<HTMLButtonElement>('[data-story-viewer="u-viewer-noor"] [data-story-viewer-open]');
    expect(row?.getAttribute('aria-label')).toBe('Voir ce que Noor Haddad a fait');
    row?.click();
    await mounter.settle();

    const detail = host.querySelector('[data-viewer-detail="u-viewer-noor"]');
    expect(host.querySelectorAll('[data-story-viewer]')).toHaveLength(0);
    expect([...(detail?.querySelectorAll('[data-viewer-detail-mark]') ?? [])].map((mark) => mark.textContent)).toEqual([
      'Réactions : 🔥 ❤️',
      '1 commentaire',
      '2 réponses',
      'Enregistré dans ses favoris',
    ]);
    expect(detail?.querySelector<HTMLAnchorElement>('[data-viewer-detail-profile]')?.getAttribute('href')).toBe('/u/noor.haddad');
    expect(document.activeElement).toBe(detail?.querySelector('[data-viewer-detail-back]') ?? null);
  });

  test('« Retour aux vues » rend la liste et le focus à la ligne d’où l’on venait', async () => {
    const host = await mountSheet({ postId: 'st-mienne', viewCount: 3 });
    host.querySelector<HTMLButtonElement>('[data-story-viewer="u-viewer-elan"] [data-story-viewer-open]')?.click();
    await mounter.settle();
    expect(host.querySelector('[data-viewer-detail-only-viewed]')?.textContent).toBe('A vu, sans autre interaction');
    host.querySelector<HTMLButtonElement>('[data-viewer-detail-back]')?.click();
    await mounter.settle();
    expect(host.querySelectorAll('[data-story-viewer]')).toHaveLength(3);
    expect(document.activeElement).toBe(host.querySelector('[data-story-viewer="u-viewer-elan"] [data-story-viewer-open]'));
  });

  test('sur un post, le refus parle de la publication, pas d’une story', async () => {
    const host = await mountSheet({ postId: 'st-amie-1', viewCount: 5, subject: 'publication' });
    expect(host.querySelector('[data-viewers-forbidden]')?.textContent).toBe('Seul l’auteur peut voir qui a vu cette publication.');
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
