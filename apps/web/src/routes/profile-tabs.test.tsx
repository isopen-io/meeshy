import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { authorPostsQueryKey } from '@/lib/api/author-posts';
import { VIEWER_ID } from '@/lib/api/fixtures';
import { appQueryClient } from '@/lib/api/query-client';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import ProfileScreen from './profile';

/**
 * **SON PROFIL, PAR ONGLETS** (#6330) — l'essentiel d'un coup (bannière,
 * identité, compteurs) puis Détails · Publications · Activité. Ce qui se
 * mesure ici est le CÂBLAGE de l'écran : les lois des sections sont dans
 * `profile.test.tsx`, celle des onglets dans `lib/profile/tabs.test.ts`.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let mounted: { readonly container: HTMLDivElement; readonly root: Root } | null = null;

afterEach(() => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = null;
  appQueryClient.clear();
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function mount(): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(
      <QueryClientProvider client={appQueryClient}>
        <ProfileScreen />
      </QueryClientProvider>,
    );
  });
  await settle();
  await settle();
  return container;
}

const open = async (el: HTMLElement, tab: string) => {
  act(() => (el.querySelector(`[data-profile-tab="${tab}"]`) as HTMLButtonElement).click());
  await settle();
  await settle();
};

const selected = (el: Element) => el.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('data-profile-tab');

describe('son profil se lit par onglets', () => {
  test('Détails, Publications, Activité — Détails ouvert d’abord', async () => {
    const el = await mount();
    expect([...el.querySelectorAll('[role="tab"]')].map((node) => node.getAttribute('data-profile-tab'))).toEqual(['details', 'posts', 'activity']);
    expect(selected(el)).toBe('details');
  });

  test('les compteurs se lisent d’un coup, au-dessus des onglets, quel que soit l’onglet ouvert', async () => {
    const el = await mount();
    expect(el.querySelectorAll('[data-stat]').length).toBe(4);
    await open(el, 'activity');
    expect(el.querySelectorAll('[data-stat]').length).toBe(4);
    const stats = el.querySelector('#profile-stats');
    const tablist = el.querySelector('[role="tablist"]');
    expect(stats !== null && tablist !== null && (stats.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
  });

  test('Détails porte l’identité, le contact, les langues et l’ancienneté', async () => {
    const el = await mount();
    const panel = el.querySelector('[role="tabpanel"]');
    expect(panel?.querySelector('#profile-identity')).not.toBeNull();
    expect(panel?.querySelector('#profile-contact')).not.toBeNull();
    expect(panel?.querySelector('#profile-languages')).not.toBeNull();
    expect(panel?.querySelector('#profile-member-since')).not.toBeNull();
    expect(panel?.querySelector('[data-profile-progression]')).toBeNull();
  });

  test('Publications demande SES publications — par son identifiant de compte, jamais un pseudo', async () => {
    const el = await mount();
    await open(el, 'posts');
    expect(selected(el)).toBe('posts');
    expect(el.querySelector('[data-profile-posts]')).not.toBeNull();
    expect(appQueryClient.getQueryState(authorPostsQueryKey(VIEWER_ID))?.status).toBe('success');
    /* La fixture ne publie rien au nom du lecteur : l'état vide se DIT. */
    expect(el.querySelector('[data-profile-posts-empty]')).not.toBeNull();
  });

  test('Activité mène à la progression et aux demandes', async () => {
    const el = await mount();
    await open(el, 'activity');
    expect(el.querySelector('[data-profile-progression]')).not.toBeNull();
    expect(el.querySelector('[data-profile-requests]')).not.toBeNull();
    expect(el.querySelector('#profile-identity')).toBeNull();
  });

  test('« Modifier » ramène sur Détails, où vivent les champs qu’il ouvre', async () => {
    const el = await mount();
    await open(el, 'activity');
    act(() => (el.querySelector('[data-profile-edit]') as HTMLButtonElement).click());
    await settle();
    expect(selected(el)).toBe('details');
    expect(el.querySelector('[data-profile-save]')).not.toBeNull();
    expect(el.querySelectorAll('[role="tabpanel"] input').length).toBe(3);
    expect(el.querySelector('[role="tabpanel"] textarea')).not.toBeNull();
  });
});
