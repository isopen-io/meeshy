import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { StarredMessageItem } from '@meeshy/shared/types/message-star';

import { fixtureStarredRows, resetStarredFixturesForTests } from '@/lib/api/fixtures-starred';
import { appQueryClient } from '@/lib/api/query-client';
import {
  STARRED_LIST_QUERY_KEY,
  STARRED_MEMBERSHIP_QUERY_KEY,
  type StarredListData,
  type StarredMembership,
} from '@/lib/api/starred-messages-cache';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import StarredMessagesScreen, { StarredMessagesError } from './starred-messages';

/**
 * **L'ÉCRAN DES MESSAGES FAVORIS, MONTÉ EN ENTIER** (#7286, second lot) — les
 * quatre états, le cache d'abord, le Prisme, le placeholder, le tap et le
 * retrait. Servi en fixtures par `fixtures-starred.ts` : trois étoiles, la plus
 * récente d'abord — `m1` (anglais traduit en français), `m-amina` (conversation
 * directe) et le témoin FLOUTÉ de la salle protégée (placeholder).
 *
 * `appQueryClient` : le client que le geste écrit — un client local ne verrait
 * pas le retrait.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/starred-messages' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let mounted: { readonly container: HTMLDivElement; readonly root: Root } | null = null;

afterEach(() => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = null;
  appQueryClient.clear();
  resetStarredFixturesForTests();
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

function mountNow(): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() => {
    root.render(
      <QueryClientProvider client={appQueryClient}>
        <StarredMessagesScreen />
      </QueryClientProvider>,
    );
  });
  return container;
}

const listOf = (items: readonly StarredMessageItem[]): StarredListData => ({
  pages: [{ items, pagination: { limit: 20, hasMore: false, nextCursor: null } }],
  pageParams: [undefined],
});

const rowIds = (el: HTMLElement): readonly string[] =>
  Array.from(el.querySelectorAll('[data-starred-row]')).map((row) => row.getAttribute('data-starred-row') ?? '');

const row = (el: HTMLElement, id: string) => el.querySelector(`[data-starred-row="${id}"]`);

describe('les quatre états', () => {
  test('CHARGEMENT — cache vide : le squelette, annoncé occupé, avant toute réponse', () => {
    const el = mountNow();
    expect(el.querySelector('#contenu')?.getAttribute('aria-busy')).toBe('true');
    expect(rowIds(el)).toEqual([]);
  });

  test('PEUPLÉ — les favoris servis, la plus récente étoile d’abord', async () => {
    const el = mountNow();
    await settle();
    expect(rowIds(el)).toEqual(['m1', 'm-amina', 'prot-2']);
    expect(el.querySelector('#contenu')?.hasAttribute('aria-busy')).toBe(false);
  });

  test('VIDE — l’état qui apprend le geste, et mène aux conversations', () => {
    appQueryClient.setQueryData(STARRED_LIST_QUERY_KEY, listOf([]));
    const el = mountNow();
    expect(el.querySelector('[data-starred-empty]')?.textContent).toContain('Ajouter aux favoris');
    expect(el.querySelector('[data-starred-empty] a[href="/"]')).not.toBeNull();
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  test('ERREUR — la panne et le hors-ligne se disent autrement, et « Réessayer » reste', () => {
    const panne = renderToStaticMarkup(<StarredMessagesError online onRetry={() => undefined} />);
    const horsLigne = renderToStaticMarkup(<StarredMessagesError online={false} onRetry={() => undefined} />);
    expect(panne).toContain('Impossible de charger vos messages favoris');
    expect(horsLigne).toContain('Vos messages favoris s’afficheront à la reconnexion.');
    expect(panne).toContain('role="alert"');
    expect(panne).toContain('Réessayer');
    expect(horsLigne).toContain('Réessayer');
  });

  test('CACHE D’ABORD — une liste en cache, même PÉRIMÉE et relue en fond, se peint à la PREMIÈRE image, sans squelette', async () => {
    appQueryClient.setQueryData(STARRED_LIST_QUERY_KEY, listOf(fixtureStarredRows().slice(0, 1)), { updatedAt: Date.now() - 60 * 60_000 });
    const el = mountNow();
    expect(appQueryClient.getQueryState(STARRED_LIST_QUERY_KEY)?.fetchStatus).toBe('fetching');
    expect(el.querySelector('#contenu')?.hasAttribute('aria-busy')).toBe(false);
    expect(rowIds(el)).toEqual(['m1']);
    await settle();
    expect(rowIds(el)).toEqual(['m1', 'm-amina', 'prot-2']);
  });
});

describe('une ligne', () => {
  test('le Prisme : l’extrait de `m1` (écrit en anglais) se lit en FRANÇAIS, langue dite', async () => {
    const el = mountNow();
    await settle();
    const extrait = row(el, 'm1')?.querySelector('[data-starred-excerpt]');
    expect(extrait?.textContent).toBe('Bonjour ! Est-ce que le déploiement a fini cette nuit ?');
    expect(extrait?.getAttribute('lang')).toBe('fr');
  });

  test('l’auteur, la date, et le nom de la conversation — celui du PAIR pour une directe', async () => {
    const el = mountNow();
    await settle();
    const directe = row(el, 'm-amina');
    expect(directe?.textContent).toContain('Amina Diallo');
    expect(directe?.querySelector('time')?.getAttribute('datetime')).not.toBeNull();
    expect(directe?.querySelector('[data-starred-conversation]')?.textContent).toBe('Amina Diallo');
    expect(row(el, 'm1')?.querySelector('[data-starred-conversation]')?.textContent).toBe('Équipe déploiement');
  });

  test('un message PROTÉGÉ est un placeholder : ni son texte ni son sens n’atteignent le DOM', async () => {
    const el = mountNow();
    await settle();
    expect(row(el, 'prot-2')?.querySelector('[data-starred-excerpt]')?.getAttribute('data-starred-excerpt')).toBe('protected');
    expect(el.textContent).not.toContain('4817');
    expect(el.textContent).not.toContain('coffre');
  });

  test('la barre porte l’accent de SA conversation', async () => {
    const el = mountNow();
    await settle();
    const barre = (id: string) => row(el, id)?.querySelector<HTMLElement>('[data-starred-accent]')?.style.backgroundColor ?? '';
    expect(barre('m1')).not.toBe('');
    expect(barre('m1')).not.toBe(barre('m-amina'));
  });

  test('le TAP ouvre la conversation du message', async () => {
    const el = mountNow();
    await settle();
    expect(row(el, 'm1')?.querySelector('a[data-starred-open]')?.getAttribute('href')).toBe('/c/c-deploiement');
    expect(row(el, 'm-amina')?.querySelector('a[data-starred-open]')?.getAttribute('href')).toBe('/c/c-amina');
  });
});

describe('retirer DEPUIS l’écran', () => {
  test('la ligne part sur-le-champ, l’étoile du fil s’éteint, et le retrait s’annonce', async () => {
    appQueryClient.setQueryData<StarredMembership>(STARRED_MEMBERSHIP_QUERY_KEY, {
      m1: '2026-09-22T09:00:00.000Z',
      'm-amina': '2026-09-22T08:00:00.000Z',
    });
    const el = mountNow();
    await settle();

    const bouton = row(el, 'm-amina')?.querySelector<HTMLButtonElement>('button[data-starred-remove]');
    expect(bouton?.getAttribute('aria-label')).toBe('Retirer le message de Amina Diallo des favoris');
    await act(async () => {
      bouton?.click();
    });
    expect(rowIds(el)).toEqual(['m1', 'prot-2']);
    await settle();

    expect(rowIds(el)).toEqual(['m1', 'prot-2']);
    expect(appQueryClient.getQueryData<StarredMembership>(STARRED_MEMBERSHIP_QUERY_KEY)).toEqual({ m1: '2026-09-22T09:00:00.000Z' });
    expect(el.querySelector('[role="status"]')?.textContent).toBe('Retiré des favoris');
    expect(fixtureStarredRows().map((line) => line.message.id)).toEqual(['m1', 'prot-2']);
  });

  test('le dernier retiré laisse l’état VIDE, jamais une liste muette', async () => {
    appQueryClient.setQueryData(STARRED_LIST_QUERY_KEY, listOf(fixtureStarredRows().slice(0, 1)));
    const el = mountNow();
    await act(async () => {
      row(el, 'm1')?.querySelector<HTMLButtonElement>('button[data-starred-remove]')?.click();
    });
    expect(el.querySelector('[data-starred-empty]')).not.toBeNull();
  });
});
