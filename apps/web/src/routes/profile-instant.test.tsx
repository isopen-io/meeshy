import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { fixtureMyProfile } from '@/lib/api/fixtures-profile';
import { MY_PROFILE_QUERY_KEY, MY_STATS_QUERY_KEY } from '@/lib/api/profile';
import { STATUS_MOODS_QUERY_KEY, type StatusMoodPost } from '@/lib/api/stories';
import { appQueryClient } from '@/lib/api/query-client';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { gamePrefs } from '@/lib/game/preferences';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import ProfileScreen from './profile';

/**
 * **SA PROPRE FICHE, MÊMES RÈGLES** (#10092) — `/me` : les statistiques en
 * cache se peignent puis se synchronisent dès l'ouverture ; le niveau et le
 * rang se posent sur la bannière, sans bloc du jeu ni Flamme ; la photo et la
 * bannière s'ouvrent en plein écran.
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
  gamePrefs.set({ hidden: false });
});

const SETTLE_ROUNDS = 80;

/** Les tours demandés, PUIS tant qu'une requête de l'écran est en vol : une
 * réponse qui retombe après le dernier tour est une mise à jour hors `act`. */
const settle = async (turns = 2): Promise<void> => {
  for (let i = 0; i < turns || appQueryClient.isFetching() > 0; i += 1) {
    if (i === SETTLE_ROUNDS) throw new Error('une requête de la fiche n’a jamais reçu sa réponse');
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 25)));
  }
};

function mountNow(): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() =>
    root.render(
      <QueryClientProvider client={appQueryClient}>
        <ProfileScreen />
      </QueryClientProvider>,
    ),
  );
  return container;
}

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/gu, ' ').trim();

const withImages = (): void => {
  appQueryClient.setQueryData(MY_PROFILE_QUERY_KEY, { ...fixtureMyProfile(), avatar: '/u/me-avatar.jpg', banner: '/u/me-banner.jpg' });
};

describe('ma fiche', () => {
  test('les statistiques en cache se peignent, puis se synchronisent dès l’ouverture', async () => {
    withImages();
    appQueryClient.setQueryData(MY_STATS_QUERY_KEY, {
      totalMessages: 7,
      totalConversations: 1,
      totalTranslations: 1,
      languagesUsed: 1,
      memberDays: 1,
      friendRequestsReceived: 0,
    });
    const el = mountNow();
    expect(text(el.querySelector('[data-stat="totalMessages"]'))).toContain('7');
    await settle();
    expect(text(el.querySelector('[data-stat="totalMessages"]')).replace(/\D/gu, '').startsWith('1204')).toBe(true);
  });

  test('le niveau et le rang sur la bannière ; ni bloc du jeu, ni Flamme', async () => {
    withImages();
    const el = mountNow();
    await settle(8);
    const badge = el.querySelector('[data-profile-banner] [data-profile-banner-game]');
    expect(badge !== null).toBe(true);
    expect(badge?.querySelector('[data-game-level]') !== null).toBe(true);
    expect(badge?.querySelector('[data-game-rank]') !== null).toBe(true);
    expect(text(badge?.querySelector('[data-profile-banner-level] [data-profile-banner-level-name]')).length > 0).toBe(true);
    expect(text(badge?.querySelector('[data-profile-banner-rank-name]')).length > 0).toBe(true);
    expect(el.querySelector('#game-profile') === null).toBe(true);
    expect(text(el).includes('Flamme')).toBe(false);
  });

  for (const kind of ['avatar', 'banner'] as const) {
    test(`toucher ${kind === 'avatar' ? 'ma photo' : 'ma bannière'} l’ouvre en plein écran ; Échap la referme`, async () => {
      withImages();
      const el = mountNow();
      await settle();
      const open = el.querySelector(`[data-profile-open-image="${kind}"]`) as HTMLButtonElement | null;
      expect(open !== null).toBe(true);
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

/**
 * **MON PROFIL MONTRE MON HUMEUR** (#10530) — lue dans le corpus déjà servi
 * (`?scope=statuses`, la requête du rail), jamais demandée à part : l'humeur
 * d'un AUTRE n'atterrit pas sur ma photo.
 */
describe('mon humeur', () => {
  const me = (): string => fixtureMyProfile().id;
  const corpus = (posts: readonly StatusMoodPost[]): void => {
    appQueryClient.setQueryData(STATUS_MOODS_QUERY_KEY, posts);
  };

  test('l’humeur que j’ai posée se lit sur ma photo', async () => {
    withImages();
    corpus([
      { id: 'st-ines', authorId: 'u-ines', moodEmoji: '☕' },
      { id: 'st-moi', authorId: me(), moodEmoji: '🎉', content: 'On fête ça' },
    ]);
    const el = mountNow();
    await settle();

    expect(el.querySelector('[data-profile-hero] [data-mood]')?.getAttribute('data-mood')).toBe('🎉');
  });

  test('sans humeur de ma part, ma photo n’en porte aucune', async () => {
    withImages();
    corpus([{ id: 'st-ines', authorId: 'u-ines', moodEmoji: '☕' }]);
    const el = mountNow();
    await settle();

    expect(el.querySelector('[data-profile-hero] [data-mood]')).toBeNull();
  });
});
