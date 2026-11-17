import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { RelationLevel } from '@meeshy/shared/types/relation';
import { resolveProfileCircleView, type ProfileCircleView } from '@meeshy/shared/utils/profile-circle-view';
import type { DeclaredAgeClass } from '@meeshy/shared/utils/age';

import { profileCircleQueryKey } from '@/lib/api/profile-circle';
import { resetFixtureFriendsForTests } from '@/lib/api/fixtures-friends';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { UserProfileView } from './user-profile';

/**
 * **LA FACE ACTIONS, MONTÉE AVEC UN VERDICT SERVI** (#18879) — les témoins de pièce
 * (`profile-relation-face.test.tsx`) prouvent ce que chaque composant peint ; ici on mesure le
 * CÂBLAGE : qu'un geste fermé par le cercle commun ne reste offert nulle part ailleurs sur la face,
 * que le verdict se relit quand la relation bouge, et que chaque face est nommée.
 *
 * Le verdict est amorcé dans le cache sous la clé du lecteur réel : la source des fixtures ne le
 * sert pas (une passerelle plus ancienne non plus), et c'est précisément ce que rejoue `null`.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const VIEWER = 'u-lecteur';

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/u/kwame-mensah' });
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
  resetFixtureFriendsForTests();
  sessionStore.getState().clearSession();
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const verdictOf = ({ granted, targetMinor = 'adult' }: { readonly granted: RelationLevel; readonly targetMinor?: DeclaredAgeClass }): ProfileCircleView =>
  resolveProfileCircleView({
    viewerId: VIEWER,
    targetId: 'u-kwame',
    grantedByViewer: granted,
    grantedByTarget: granted,
    sharesCommunity: false,
    viewerMinor: 'adult',
    targetMinor,
  });

async function mountActions(verdict: ProfileCircleView | null): Promise<HTMLDivElement> {
  sessionStore.getState().establish({ user: { id: VIEWER, username: 'lecteur', displayName: 'Lecteur' }, token: 't', sessionToken: 's', expiresIn: 3600 });
  if (verdict !== null) appQueryClient.setQueryData(profileCircleQueryKey('kwame-mensah', VIEWER), verdict);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(
      <QueryClientProvider client={appQueryClient}>
        <UserProfileView username="kwame-mensah" />
      </QueryClientProvider>,
    );
  });
  await settle();
  await settle();
  act(() => container.querySelector<HTMLButtonElement>('[data-profile-faces] [data-kit-chip="actions"]')?.click());
  await settle();
  return container;
}

describe('un geste que le cercle commun ferme ne reste offert nulle part', () => {
  test('appeler un mineur qui n’est pas un Ami : la rangée verrouillée, et AUCUN bouton d’appel à côté', async () => {
    const el = await mountActions(verdictOf({ granted: 'PUBLIC', targetMinor: 'minor' }));
    expect(el.querySelector('[data-relation-locked-action="call"]')).not.toBeNull();
    expect(el.querySelector('[data-profile-call]')).toBeNull();
  });

  test('appeler un adulte que le cercle ouvre : le bouton d’appel reste', async () => {
    const el = await mountActions(verdictOf({ granted: 'PUBLIC' }));
    expect(el.querySelector('[data-relation-locked-action="call"]')).toBeNull();
    expect(el.querySelector('[data-profile-call]')).not.toBeNull();
  });

  test('sans verdict servi (passerelle plus ancienne), la fiche d’avant : le bouton d’appel reste', async () => {
    const el = await mountActions(null);
    expect(el.querySelector('[data-profile-call]')).not.toBeNull();
  });
});

describe('le verdict suit la relation', () => {
  test('un geste qui change la relation fait relire le cercle commun : aucun verrou d’avant ne survit', async () => {
    const el = await mountActions(verdictOf({ granted: 'PUBLIC' }));
    const key = profileCircleQueryKey('kwame-mensah', VIEWER);
    expect(appQueryClient.getQueryState(key)?.isInvalidated).toBe(false);
    act(() => el.querySelector<HTMLButtonElement>('[data-profile-action="add"]')?.click());
    await settle();
    await settle();
    expect(appQueryClient.getQueryState(key)?.dataUpdateCount ?? 0).toBeGreaterThan(1);
  });
});

describe('chaque face est nommée', () => {
  test('le panneau ouvert porte le nom de sa face', async () => {
    const el = await mountActions(null);
    const panel = el.querySelector('[role="tabpanel"][data-profile-face]');
    expect(panel?.getAttribute('data-profile-face')).toBe('actions');
    expect(panel?.getAttribute('aria-label')).toBe('Actions');
  });
});
