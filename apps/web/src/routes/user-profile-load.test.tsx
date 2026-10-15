import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ProfilePeekSheet } from '@/components/profile-peek-sheet';
import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import { fixturePublicProfile } from '@/lib/api/fixtures-rich-text';
import { publicProfileQueryKey, publicProfileStatsQueryKey, type PublicProfileView } from '@/lib/api/public-profile';
import { appQueryClient } from '@/lib/api/query-client';
import { sharedConversationsQueryKey } from '@/lib/api/shared-conversations';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { forgetKnownPeople } from '@/lib/profile/known-people';
import { knownPersonInConversations } from '@/lib/profile/known-people-cache';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { UserProfileView } from './user-profile';

/**
 * **LE PROFIL D'AUTRUI NE RESTE PLUS SUR SON SQUELETTE** (coque Android, plus
 * de 9 s observées sur `/u/jcnm` en production).
 *
 * Trois causes, trois témoins :
 *
 * 1. l'identité attendait les COMPTEURS — un seul `?expand=stats,relation,…`,
 *    dont `stats` est le seul calcul coûteux de la route. Elle part désormais
 *    à côté d'eux, DANS LE MÊME TOUR, et la fiche se peint sans eux ;
 * 2. une adresse ouverte sans toucher (lien, notification, démarrage de la
 *    coque) n'avait RIEN pour son premier rendu, alors que la personne est
 *    souvent dans la liste des conversations en cache ;
 * 3. les conversations partagées s'enchaînaient DERRIÈRE la fiche, faute
 *    d'identifiant — que cette même liste porte déjà.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/u/kwame-mensah' });
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
  forgetKnownPeople();
});

const settle = async (turns = 4): Promise<void> => {
  for (let i = 0; i < turns; i += 1) await act(() => new Promise<void>((resolve) => setTimeout(resolve, 25)));
};

/** Le PREMIER rendu, synchrone : ce que l'utilisateur voit avant toute réponse. */
function mountNow(node: ReactNode): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() => root.render(<QueryClientProvider client={appQueryClient}>{node}</QueryClientProvider>));
  return container;
}

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/gu, ' ').trim();
const heroName = (el: Element) => text(el.querySelector('[data-user-hero] p'));
const fetching = (queryKey: readonly unknown[]) => appQueryClient.getQueryState(queryKey)?.fetchStatus === 'fetching';

const KWAME_ID = 'u-rich-kwame';

/** La liste des conversations TELLE QUE LE CACHE LA GARDE — la charge brute de
 * `core-list.ts` : chaque participant porte son `user`. */
const cacheConversationsWith = (user: { readonly id: string; readonly username: string; readonly displayName: string }): void => {
  appQueryClient.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pages: [
      {
        conversations: [
          {
            id: 'c-direct',
            type: 'direct',
            participants: [
              { id: 'p-moi', userId: 'u-viewer', displayName: 'Moi', user: { id: 'u-viewer', username: 'moi' } },
              { id: 'p-kwame', userId: user.id, displayName: 'Participant', avatar: 'media:avatar-liste', user: { ...user, avatar: 'media:avatar-liste' } },
            ],
          },
        ],
      },
    ],
    pageParams: [undefined],
  });
};

describe('un profil qui m\u2019a bloqu\u00e9 ne reste pas affich\u00e9 depuis le cache (#10740)', () => {
  for (const [surface, render] of Object.entries({
    'la page': (handle: string) => <UserProfileView username={handle} />,
    'la feuille d\u2019aper\u00e7u': (handle: string) => <ProfilePeekSheet username={handle} onClose={() => {}} />,
  })) {
    test(`${surface} : un 404 de revalidation remplace la fiche en cache par l\u2019\u00e9tat indisponible, sans d\u00e9cor`, async () => {
      const view = fixturePublicProfile('kwame-mensah') as PublicProfileView;
      appQueryClient.setQueryData(publicProfileQueryKey('bloqueur'), { ...view, profile: { ...view.profile, username: 'bloqueur' } });
      const el = mountNow(render('bloqueur'));
      expect(el.querySelector('[data-user-hero]') === null).toBe(false);
      await settle();
      expect(el.querySelector('[data-user-hero]') === null).toBe(true);
      expect(el.querySelector('[data-profile-failure="refused"]') === null).toBe(false);
      expect(appQueryClient.getQueryData(publicProfileQueryKey('bloqueur'))).toBeUndefined();
    });
  }
});

const surfaces = {
  'la page': (handle: string) => <UserProfileView username={handle} />,
  'la feuille d’aperçu': (handle: string) => <ProfilePeekSheet username={handle} onClose={() => {}} />,
} as const;

for (const [surface, render] of Object.entries(surfaces)) {
  describe(`${surface} — la fiche et ses compteurs partent ensemble`, () => {
    test('les deux lectures sont EN VOL au premier rendu : aucune n’attend l’autre', () => {
      mountNow(render('kwame-mensah'));
      expect(fetching(publicProfileQueryKey('kwame-mensah'))).toBe(true);
      expect(fetching(publicProfileStatsQueryKey('kwame-mensah'))).toBe(true);
    });

    test('la fiche se peint sans les compteurs, qui la rejoignent ensuite', async () => {
      const view = fixturePublicProfile('kwame-mensah') as PublicProfileView;
      /* Une fiche servie SANS compteurs, et aucun compteur en cache : c'est
         l'état exact d'une identité revenue avant le calcul des compteurs. */
      appQueryClient.setQueryData(publicProfileQueryKey('kwame-mensah'), { ...view, stats: null });
      const el = mountNow(render('kwame-mensah'));
      expect(heroName(el)).toBe('Kwame Mensah');
      expect(el.querySelector('[data-profile-skeleton]') === null).toBe(true);
      expect(el.querySelector('[data-profile-stats] [aria-busy="true"]') !== null).toBe(true);
      await settle();
      expect(el.querySelector('[data-profile-stats] [aria-busy="true"]') === null).toBe(true);
      expect(el.querySelector('[data-profile-stat="languagesUsed"]') !== null).toBe(true);
    });
  });

  describe(`${surface} — premier rendu depuis la liste des conversations`, () => {
    test('une adresse ouverte SANS toucher se peint avec le nom que la liste porte, sans geste deviné', async () => {
      cacheConversationsWith({ id: KWAME_ID, username: 'Kwame-Mensah', displayName: 'Kwame (liste)' });
      const el = mountNow(render('kwame-mensah'));
      expect(heroName(el)).toBe('Kwame (liste)');
      expect(el.querySelector('[data-profile-skeleton]') === null).toBe(true);
      expect(el.querySelector('[data-profile-action]') === null).toBe(true);
      await settle();
      expect(heroName(el)).toBe('Kwame Mensah');
      expect(el.querySelector('[data-profile-action]') !== null).toBe(true);
    });
  });
}

describe('la page — les conversations partagées n’attendent plus la fiche', () => {
  test('l’identifiant connu par la liste les lance DANS LE MÊME TOUR que la fiche', () => {
    cacheConversationsWith({ id: KWAME_ID, username: 'kwame-mensah', displayName: 'Kwame (liste)' });
    mountNow(<UserProfileView username="kwame-mensah" />);
    /* La fiche n'est pas revenue — et la question des conversations est déjà posée. */
    expect(fetching(publicProfileQueryKey('kwame-mensah'))).toBe(true);
    expect(fetching(sharedConversationsQueryKey(KWAME_ID))).toBe(true);
  });

  test('sans identifiant connu, rien n’est inventé : la question attend la fiche servie', async () => {
    mountNow(<UserProfileView username="kwame-mensah" />);
    expect(fetching(sharedConversationsQueryKey(''))).toBe(false);
    expect(appQueryClient.getQueryState(sharedConversationsQueryKey(''))?.dataUpdateCount ?? 0).toBe(0);
    await settle();
    expect(appQueryClient.getQueryState(sharedConversationsQueryKey(KWAME_ID))?.status).toBe('success');
  });
});

describe('knownPersonInConversations — ce que la liste en cache dit d’une personne', () => {
  test('le pseudo se compare sans la casse, comme le serveur ; l’identité du `user` prime', () => {
    cacheConversationsWith({ id: KWAME_ID, username: 'Kwame-Mensah', displayName: 'Kwame (liste)' });
    expect(knownPersonInConversations(appQueryClient, ' kwame-mensah ')).toEqual({
      username: 'Kwame-Mensah',
      displayName: 'Kwame (liste)',
      avatar: 'media:avatar-liste',
      id: KWAME_ID,
    });
  });

  test('personne d’inconnu, et un cache mal formé ne fait rien tomber', () => {
    expect(knownPersonInConversations(appQueryClient, 'kwame-mensah')).toBeNull();
    appQueryClient.setQueryData(CONVERSATIONS_QUERY_KEY, { pages: [null, { conversations: [{ participants: [null, { user: 3 }] }] }] });
    expect(knownPersonInConversations(appQueryClient, 'kwame-mensah')).toBeNull();
  });
});
