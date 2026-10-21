import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ProfilePeekSheet } from '@/components/profile-peek-sheet';
import { fixturePublicProfile } from '@/lib/api/fixtures-rich-text';
import { ENGAGEMENT_PROGRESS_QUERY_KEY } from '@/lib/api/engagement';
import { userGameQueryKey } from '@/lib/api/game-v2-queries';
import { userGameFixture } from '@/lib/api/game-v2-queries-fixture';
import { publicProfileQueryKey, type PublicProfileView } from '@/lib/api/public-profile';
import { appQueryClient, persistableQuery } from '@/lib/api/query-client';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { forgetKnownPeople, rememberPerson } from '@/lib/profile/known-people';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { UserProfileView } from './user-profile';

/**
 * **LA FICHE S'OUVRE DEPUIS CE QU'ON SAIT DÉJÀ** (#10092) — page `/u/:username`
 * et feuille d'aperçu : la fiche en cache se peint au PREMIER rendu, sans
 * squelette, puis se synchronise dès l'ouverture ; ce qu'on savait de la
 * personne touchée (nom, avatar) amorce une fiche jamais vue ; un échec de
 * synchro ne remplace jamais une fiche affichée. Sur la bannière, le niveau et
 * le rang — et plus de bloc du jeu, ni de Flamme. La photo et la bannière
 * s'ouvrent en plein écran.
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

const settle = async (turns = 2): Promise<void> => {
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

const kwame = (): PublicProfileView => {
  const view = fixturePublicProfile('kwame-mensah');
  if (view === null) throw new Error('témoin introuvable : kwame-mensah');
  return view;
};

const cachedAs = (handle: string, displayName: string): void => {
  const view = kwame();
  appQueryClient.setQueryData(publicProfileQueryKey(handle), { ...view, profile: { ...view.profile, username: handle, displayName } });
};

const surfaces = {
  'la page': (handle: string) => <UserProfileView username={handle} />,
  'la feuille d’aperçu': (handle: string) => <ProfilePeekSheet username={handle} onClose={() => {}} />,
} as const;

for (const [surface, render] of Object.entries(surfaces)) {
  describe(`${surface} — cache d’abord, synchro à l’ouverture`, () => {
    test('la fiche en cache se peint au premier rendu, sans squelette, puis se synchronise dès l’ouverture', async () => {
      cachedAs('kwame-mensah', 'Kwame (en cache)');
      const el = mountNow(render('kwame-mensah'));
      expect(el.querySelector('[data-profile-skeleton]') === null).toBe(true);
      expect(heroName(el)).toBe('Kwame (en cache)');
      await settle();
      expect(heroName(el)).toBe('Kwame Mensah');
    });

    test('un refus de synchro (404) ne laisse pas la fiche en cache affichée (#10740)', async () => {
      cachedAs('fantome-en-cache', 'Fantôme');
      const el = mountNow(render('fantome-en-cache'));
      await settle();
      expect(el.querySelector('[data-user-hero]') === null).toBe(true);
      expect(el.querySelector('[data-profile-failure="refused"]') === null).toBe(false);
    });

    test('une fiche jamais vue s’amorce avec ce qu’on savait de la personne touchée', async () => {
      rememberPerson({ username: 'kwame-mensah', displayName: 'Kwame M.', avatar: null });
      const el = mountNow(render('kwame-mensah'));
      expect(heroName(el)).toBe('Kwame M.');
      /* Les gestes attendent la relation SERVIE : aucun « Ajouter » deviné. */
      expect(el.querySelector('[data-profile-action]') === null).toBe(true);
      await settle();
      expect(heroName(el)).toBe('Kwame Mensah');
      expect(el.querySelector('[data-profile-action]') !== null).toBe(true);
    });
  });

  describe(`${surface} — le jeu sur la bannière, sans bloc ni Flamme`, () => {
    test('le niveau et le rang se posent SUR la bannière ; aucun bloc du jeu, aucune Flamme', async () => {
      const el = mountNow(render('kwame-mensah'));
      await settle(8);
      const badge = el.querySelector('[data-user-banner] [data-profile-banner-game]');
      expect(badge !== null).toBe(true);
      expect(badge?.querySelector('[data-game-level]') !== null).toBe(true);
      expect(badge?.querySelector(`[data-game-rank="${userGameFixture().standing?.rank ?? 'absent'}"]`) !== null).toBe(true);
      expect(text(badge?.querySelector('[data-profile-banner-level] [data-profile-banner-level-name]')).length > 0).toBe(true);
      expect(text(badge?.querySelector('[data-profile-banner-rank-name]')).length > 0).toBe(true);
      expect(el.querySelector('#game-profile-visitor') === null).toBe(true);
      expect(el.querySelector('#game-profile') === null).toBe(true);
      expect(text(el).includes('Flamme')).toBe(false);
    });
  });

  describe(`${surface} — la photo et la bannière en plein écran`, () => {
    for (const kind of ['avatar', 'banner'] as const) {
      test(`toucher ${kind === 'avatar' ? 'la photo' : 'la bannière'} l’ouvre en plein écran ; Échap la referme`, async () => {
        const el = mountNow(render('kwame-mensah'));
        await settle();
        const open = el.querySelector(`[data-profile-open-image="${kind}"]`) as HTMLButtonElement | null;
        expect(open !== null).toBe(true);
        expect((open?.getAttribute('aria-label') ?? '').length > 0).toBe(true);
        act(() => open?.click());
        await settle(4);
        const viewer = document.querySelector('[data-media-viewer]');
        expect(viewer !== null).toBe(true);
        act(() => {
          viewer?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        await settle();
        expect(document.querySelector('[data-media-viewer]') === null).toBe(true);
      });
    }
  });
}

describe('la fiche survit au rechargement', () => {
  test('la fiche, le jeu d’un autre et sa propre progression s’écrivent sur le disque', () => {
    for (const queryKey of [publicProfileQueryKey('kwame-mensah'), userGameQueryKey('u-rich-kwame'), ENGAGEMENT_PROGRESS_QUERY_KEY]) {
      expect(persistableQuery({ state: { status: 'success' }, queryKey })).toBe(true);
    }
  });
});
