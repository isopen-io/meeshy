import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { FeedPost } from '@/lib/api/feed-pages';
import type { ReportReason } from '@/lib/api/reports';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { FeedPostCard } from './feed-post-card';
import type { PostMenuHost } from './feed-post-menu';

/**
 * LE « ⋯ » EN HAUT À DROITE DES CARTES DU FIL (#7533, directive porteur du
 * 2026-09-23) — sur la carte POST comme sur la carte RÉEL, et chaque entrée a
 * un effet (loi 4).
 */
describe('FeedPostCard — le menu « ⋯ »', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
    await loadInterfaceCatalog('fr');
  });
  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.querySelectorAll('[role="menu"]').forEach((node) => node.remove());
  });

  const post = (overrides: Partial<FeedPost> = {}): FeedPost => ({
    id: 'p1',
    type: 'POST',
    createdAt: '2026-09-13T11:55:00.000Z',
    content: 'Bonjour le fil',
    originalLanguage: 'fr',
    author: { id: 'u-other', displayName: 'Nour', username: 'nour' },
    ...overrides,
  });

  const host = (viewerId: string | null) => {
    const journal: string[] = [];
    const menu: PostMenuHost = {
      viewerId,
      onCopyText: (text) => journal.push(`copy:${text}`),
      onPin: (id) => journal.push(`pin:${id}`),
      onDelete: (id) => journal.push(`delete:${id}`),
      onReport: (id, reason: ReportReason) => journal.push(`report:${id}:${reason}`),
    };
    return { menu, journal };
  };

  const monte = (feedPost: FeedPost, menu?: PostMenuHost) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <FeedPostCard
          model={resolveFeedCardModel(feedPost, { preferredLanguages: ['fr'], now: new Date('2026-09-13T12:00:00.000Z') })}
          onShare={() => {}}
          onGesture={() => {}}
          {...(menu === undefined ? {} : { menu })}
        />,
      );
    });
  };

  /* Le panneau se charge À LA DEMANDE (`lazy`) : l'import se résout avant
     que le menu ne se peigne. */
  const ouvre = async () => {
    const bouton = container.querySelector<HTMLButtonElement>('[data-feed-post-menu]');
    expect(bouton?.getAttribute('aria-label')).toBe('Plus d’options');
    act(() => bouton?.click());
    await act(async () => {
      await import('./publication-menu-panel');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return [...document.querySelectorAll<HTMLButtonElement>('[data-feed-post-action]')];
  };

  test('sans hôte de menu, aucun bouton — un contrôle sans effet n’existe pas', () => {
    monte(post());
    expect(container.querySelector('[data-feed-post-menu]')).toBeNull();
  });

  test('la publication d’un autre : les entrées d’iOS, et « Copier » copie le texte', async () => {
    const { menu, journal } = host('u-me');
    monte(post(), menu);

    const entrees = await ouvre();
    expect(entrees.map((e) => e.dataset.feedPostAction)).toEqual(['open', 'copyText', 'share', 'save', 'report']);

    act(() => entrees.find((e) => e.dataset.feedPostAction === 'copyText')?.click());
    expect(journal).toEqual(['copy:Bonjour le fil']);
  });

  test('MA publication : « Supprimer » part vers l’hôte', async () => {
    const { menu, journal } = host('u-other');
    monte(post(), menu);

    const supprimer = (await ouvre()).find((e) => e.dataset.feedPostAction === 'delete');
    expect(supprimer?.textContent).toContain('Supprimer');
    act(() => supprimer?.click());
    expect(journal).toEqual(['delete:p1']);
  });

  test('« Signaler » demande un MOTIF, et c’est le motif qui part', async () => {
    const { menu, journal } = host('u-me');
    monte(post(), menu);

    const signaler = (await ouvre()).find((e) => e.dataset.feedPostAction === 'report');
    act(() => signaler?.click());
    const motif = document.querySelector<HTMLButtonElement>('[data-report-reason="harassment"]');
    expect(motif).not.toBeNull();
    act(() => motif?.click());
    expect(journal).toEqual(['report:p1:harassment']);
  });

  test('la carte RÉEL porte le même bouton, en haut à droite', () => {
    const { menu } = host('u-me');
    monte(post({ type: 'REEL' }), menu);

    expect(container.querySelector('[data-feed-card="reel"] [data-feed-post-menu]')).not.toBeNull();
  });
});
