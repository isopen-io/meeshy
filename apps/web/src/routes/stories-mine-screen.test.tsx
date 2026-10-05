import { act } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiResult } from '@/lib/api/http';
import { deletePost, type PostActionOutcome } from '@/lib/api/publication-actions';
import { appQueryClient } from '@/lib/api/query-client';
import { STORY_TRAY_QUERY_KEY, type StoryTrayPost } from '@/lib/api/stories';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { scriptedTransport } from '@/test-support/scripted-transport';

import { StoriesMineView, type RemoveStory } from './stories-mine';

/**
 * **« MES STORIES », MONTÉ POUR DE VRAI** (revue-correction #6149) — le
 * critère de fin exige le RENDU de trois états et du geste : liste vide,
 * liste, suppression optimiste PUIS retour en arrière sur une `ApiResult`
 * refusée. Les témoins statiques de `stories-mine.test.tsx` ne montent ni le
 * cache ni la modale ; ceux-ci montent l'écran sur `appQueryClient` et les
 * fixtures (`st-mienne`, seule story ACTIVE du lecteur de fixtures), et font
 * répondre la passerelle par un geste injecté (`remove`).
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

const setOnline = (online: boolean): void => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
};

afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
  setOnline(true);
});

/** Une promesse dont le témoin décide QUAND et COMMENT la passerelle répond. */
const deferredRemove = () => {
  const calls: string[] = [];
  let answer: (outcome: PostActionOutcome) => void = () => undefined;
  const remove: RemoveStory = (postId) => {
    calls.push(postId);
    return new Promise<PostActionOutcome>((resolve) => {
      answer = resolve;
    });
  };
  return {
    remove,
    calls,
    answer: async (outcome: PostActionOutcome): Promise<void> => {
      await act(async () => {
        answer(outcome);
      });
    },
  };
};

async function mountScreen(remove?: RemoveStory): Promise<HTMLElement> {
  const host = await mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      {remove === undefined ? <StoriesMineView /> : <StoriesMineView remove={remove} />}
    </QueryClientProvider>,
  );
  /* Le corpus de fixtures se charge par `import()` : sur une machine lente,
     deux tours ne suffisent pas et la liste restait à l'état « chargement ».
     On laisse passer des tours jusqu'à ce que l'écran quitte cet état (borné). */
  for (let tour = 0; tour < 50 && !host.querySelector(SETTLED_STATE); tour++) {
    await mounter.settle();
  }
  return host;
}

const SETTLED_STATE = '[data-my-stories-list], [data-my-stories-empty], [data-my-stories-offline]';

const rows = (host: HTMLElement): readonly string[] =>
  [...host.querySelectorAll('[data-my-stories-list] li[data-my-story]')].map((li) => li.getAttribute('data-my-story') ?? '');

async function confirmDeleteOf(host: HTMLElement, postId: string): Promise<void> {
  await mounter.click(host.querySelector<HTMLButtonElement>(`li[data-my-story="${postId}"] [data-my-story-delete]`));
  await mounter.click(host.querySelector<HTMLButtonElement>('[data-confirm-dialog="my-story-delete"] [data-confirm="confirm"]'));
}

describe('StoriesMineView — les trois états', () => {
  test('LISTE : une rangée par story ACTIVE du lecteur, jamais celles des autres', async () => {
    const host = await mountScreen();
    expect(rows(host)).toEqual(['st-mienne']);
  });

  test('VIDE : aucune story de moi ⇒ l’état vide et sa porte vers le studio, jamais un écran blanc', async () => {
    const autrui: readonly StoryTrayPost[] = [
      { id: 'st-x', type: 'STORY', createdAt: new Date().toISOString(), author: { id: 'u-ines', username: 'ines' } },
    ];
    appQueryClient.setQueryData(STORY_TRAY_QUERY_KEY, autrui);
    const host = await mountScreen();
    expect(rows(host)).toEqual([]);
    expect(host.querySelector('[data-my-stories-empty]')?.textContent).toContain('Aucune story envoyée');
    expect(host.querySelector('[data-my-stories-empty] a')?.getAttribute('href')).toBe('/stories/new');
  });

  test('l’en-tête porte le (+) « Créer une story » — la barre d’iOS, même quand la liste n’est pas vide', async () => {
    const host = await mountScreen();
    const create = host.querySelector('[data-my-stories-create]');
    expect(create?.getAttribute('href')).toBe('/stories/new');
    expect(create?.getAttribute('aria-label')).toBe('Créer une story');
  });
});

describe('StoriesMineView — supprimer, optimiste', () => {
  test('la rangée ET la modale partent AVANT la réponse réseau', async () => {
    const gateway = deferredRemove();
    const host = await mountScreen(gateway.remove);

    await mounter.click(host.querySelector<HTMLButtonElement>('li[data-my-story="st-mienne"] [data-my-story-delete]'));
    expect(host.querySelectorAll('[data-confirm-dialog="my-story-delete"]').length).toBe(1);
    expect(gateway.calls).toEqual([]);

    await mounter.click(host.querySelector<HTMLButtonElement>('[data-confirm-dialog="my-story-delete"] [data-confirm="confirm"]'));

    expect(gateway.calls).toEqual(['st-mienne']);
    expect(host.querySelectorAll('[data-confirm-dialog="my-story-delete"]').length).toBe(0);
    /* Le geste injecté ne touche pas le cache : la rangée qui part ici est
       celle que le VRAI geste retire (`removeStoryFromCaches`) — voir le
       témoin suivant, qui passe par `deletePost` lui-même. */
    await gateway.answer('done');
    expect(host.querySelector('[data-my-stories-announce]')?.textContent).toBe('Story supprimée');
  });

  test('un refus de la passerelle RAMÈNE la rangée et le DIT, visiblement', async () => {
    const { transport } = scriptedTransport({
      'DELETE /api/v1/posts/st-mienne': { ok: false, status: 500, error: 'INTERNAL_ERROR' },
    });
    const remove: RemoveStory = (postId) =>
      deletePost({ postId, deps: { source: 'gateway', transport, queryClient: appQueryClient } });
    const host = await mountScreen(remove);
    expect(rows(host)).toEqual(['st-mienne']);

    await confirmDeleteOf(host, 'st-mienne');
    await mounter.settle();
    await mounter.settle();

    expect(rows(host)).toEqual(['st-mienne']);
    const annonce = host.querySelector('[data-my-stories-announce]');
    expect(annonce?.textContent).toBe('Échec de la suppression');
    expect(annonce?.getAttribute('data-announce-tone')).toBe('error');
    expect(annonce?.className).not.toContain('sr-only');
  });

  test('le retrait optimiste se VOIT dans le DOM avant la réponse', async () => {
    const { transport } = scriptedTransport({});
    let answer: () => void = () => undefined;
    transport.request = <T,>() =>
      new Promise<ApiResult<T>>((resolve) => {
        answer = () => resolve({ ok: true, data: null as T });
      });
    const remove: RemoveStory = (postId) =>
      deletePost({ postId, deps: { source: 'gateway', transport, queryClient: appQueryClient } });
    const host = await mountScreen(remove);

    await confirmDeleteOf(host, 'st-mienne');
    expect(rows(host)).toEqual([]);
    expect(host.querySelectorAll('[data-my-stories-empty]').length).toBe(1);

    await act(async () => {
      answer();
    });
    await mounter.settle();
    expect(rows(host)).toEqual([]);
    expect(host.querySelector('[data-my-stories-announce]')?.textContent).toBe('Story supprimée');
  });

  test('le focus rejoint le titre de l’écran, jamais `<body>`', async () => {
    const gateway = deferredRemove();
    const host = await mountScreen(gateway.remove);
    await confirmDeleteOf(host, 'st-mienne');
    await mounter.settle();
    expect(document.activeElement?.tagName).toBe('H1');
    expect(document.activeElement?.textContent).toBe('Mes stories');
    await gateway.answer('done');
  });
});

describe('StoriesMineView — hors ligne, l’écran le dit AVANT le geste', () => {
  test('« Supprimer » est éteint et un bandeau dit pourquoi ; rien ne part', async () => {
    const gateway = deferredRemove();
    setOnline(false);
    const host = await mountScreen(gateway.remove);

    expect(host.querySelector('[data-my-stories-offline]')?.textContent).toContain('Hors ligne');
    const button = host.querySelector<HTMLButtonElement>('li[data-my-story="st-mienne"] [data-my-story-delete]');
    expect(button?.disabled).toBe(true);
    await mounter.click(button ?? null);
    expect(host.querySelectorAll('[data-confirm-dialog="my-story-delete"]').length).toBe(0);
    expect(gateway.calls).toEqual([]);
  });

  test('le réseau revenu rallume « Supprimer » et retire le bandeau', async () => {
    setOnline(false);
    const host = await mountScreen(deferredRemove().remove);
    await act(async () => {
      setOnline(true);
    });
    await mounter.settle();
    expect(host.querySelectorAll('[data-my-stories-offline]').length).toBe(0);
    expect(host.querySelector<HTMLButtonElement>('[data-my-story-delete]')?.disabled).toBe(false);
  });
});
