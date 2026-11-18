import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { fixtureMyProfile } from '@/lib/api/fixtures-profile';
import { MY_PROFILE_QUERY_KEY } from '@/lib/api/profile';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AccountScopedTree } from '@/lib/view/account-scoped-tree';

import ProfileScreen from './profile';

/**
 * UN BROUILLON APPARTIENT AU COMPTE QUI L'ÉCRIT (audit #19352). Ada modifie son
 * profil ; un autre onglet passe l'appareil à Bob et cet onglet le suit
 * (`session-follow.ts`). Monté comme l'application monte chaque écran (sous
 * `AccountScopedTree`), le brouillon d'Ada ne reste pas à l'écran sous Bob, et
 * « Enregistrer » ne l'écrit pas sur le compte de Bob.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/me' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
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
  sessionStore.getState().clearSession({ device: true });
});

const settle = async (turns = 4): Promise<void> => {
  for (let i = 0; i < turns; i += 1) await act(() => new Promise<void>((resolve) => setTimeout(resolve, 25)));
};

function mountNow(): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() => root.render(<QueryClientProvider client={appQueryClient}><AccountScopedTree><ProfileScreen /></AccountScopedTree></QueryClientProvider>));
  return container;
}

function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  act(() => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('le brouillon de profil d’Ada ne survit pas au passage de l’onglet à Bob', () => {
  test('Ada modifie son profil, l’onglet suit Bob : le brouillon d’Ada ne s’affiche pas sous Bob, et Enregistrer ne l’écrit pas sur Bob', async () => {
    sessionStore.getState().establish({ user: { id: 'u-ada', username: 'ada', displayName: 'Ada L.' }, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
    appQueryClient.setQueryData(MY_PROFILE_QUERY_KEY, { ...fixtureMyProfile(), id: 'u-ada', username: 'ada', displayName: 'Ada L.', firstName: 'Ada', lastName: 'Lovelace', bio: 'Bio privée d’Ada' });
    const el = mountNow();
    await settle();
    act(() => (el.querySelector('[data-profile-edit]') as HTMLButtonElement | null)?.click());
    await settle(2);
    const name = el.querySelector('#profile-displayName') as HTMLInputElement | null;
    expect(name).not.toBeNull();
    typeInto(name!, 'Ada brouillon');
    await settle(2);

    act(() => {
      sessionStore.getState().establish({ user: { id: 'u-bob', username: 'bob', displayName: 'Bob B.' }, token: 'jwt-bob', sessionToken: 'sess-bob', expiresIn: 3600 });
      appQueryClient.setQueryData(MY_PROFILE_QUERY_KEY, { ...fixtureMyProfile(), id: 'u-bob', username: 'bob', displayName: 'Bob B.', firstName: 'Bob', lastName: 'Builder', bio: '' });
    });
    await settle();

    const shownName = (el.querySelector('#profile-displayName') as HTMLInputElement | null)?.value ?? null;
    const shownBio = (el.querySelector('#profile-bio') as HTMLTextAreaElement | null)?.value ?? null;
    act(() => (el.querySelector('[data-profile-save]') as HTMLButtonElement | null)?.click());
    await settle(6);
    const state = sessionStore.getState().session;
    const bobNow = state.status === 'authenticated' ? { id: state.user.id, displayName: state.user.displayName ?? null } : null;

    expect(shownName === 'Ada brouillon' || shownBio === 'Bio privée d’Ada').toBe(false);
    expect(bobNow?.displayName).not.toBe('Ada brouillon');
  });
});
