import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { FeedPost } from '@/lib/api/feed-pages';
import { REEL_SCENE_LOOP } from '@/lib/api/fixtures-reels';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { FeedPostCard } from './feed-post-card';
import { ReelPage } from './reel-page';

/**
 * LE CRÉDIT DU SON SUR SES HÔTES (#9678) — la carte du fil et le réel le
 * chargent À LA DEMANDE (aucun nom de plus dans la table de l'entrée) : le
 * témoin rend donc côté client et attend le chunk, comme le lecteur.
 */

const NOW = new Date('2026-09-14T09:00:00.000Z');
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement | undefined;
let root: Root | undefined;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await import('./background-sound-credit');
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

async function mount(node: ReactElement, ready: string): Promise<HTMLDivElement> {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  root = createRoot(c);
  await act(async () => root?.render(node));
  for (let i = 0; i < 20 && c.querySelector(ready) === null; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return c;
}

const sceneEffects = (payload: Record<string, unknown> | null) => ({
  v: 3,
  scenes: [
    {
      id: 's1',
      objects: [
        ...(payload === null
          ? []
          : [
              {
                id: 'bgsound',
                kind: 'audio',
                anchor: { t: 'free', x: 0.5, y: 0.5 },
                plane: 'bg',
                z: 0,
                transform: { scale: 1, rotation: 0, opacity: 1 },
                payload: { isBackground: true, mediaURL: 'sounds/a.m4a', ...payload },
              },
            ]),
        {
          id: 't1',
          kind: 'text',
          anchor: { t: 'free', x: 0.5, y: 0.5 },
          plane: 'content',
          z: 1,
          transform: { scale: 1, rotation: 0, opacity: 1 },
          payload: { content: 'Bonjour' },
        },
      ],
    },
  ],
});

const post = (storyEffects: unknown): FeedPost => ({ id: 'p1', type: 'POST', createdAt: '2026-09-14T08:55:00.000Z', storyEffects } as FeedPost);
const card = (storyEffects: unknown) => <FeedPostCard model={resolveFeedCardModel(post(storyEffects), { preferredLanguages: ['fr'], now: NOW })} />;
const reel = (storyEffects: unknown) => (
  <ReelPage
    model={resolveFeedCardModel({ ...REEL_SCENE_LOOP, storyEffects } as FeedPost, { preferredLanguages: ['fr'], now: NOW })}
    index={0}
    count={1}
    mode="far"
    soundOn={false}
    language="fr"
    preferredLanguages={['fr']}
    onToggleSound={() => undefined}
    onGesture={() => undefined}
    onShare={() => undefined}
    onSoundBlocked={() => undefined}
  />
);

describe('la carte du fil', () => {
  test('un son emprunté ⇒ le crédit « titre · @auteur », sous le nom', async () => {
    const el = await mount(card(sceneEffects({ soundId: 'snd1', name: 'Pluie en forêt', soundAuthorUsername: 'sam' })), '[data-sound-credit]');
    const credit = el.querySelector('[data-sound-credit="credit"]');
    expect(credit?.textContent).toContain('Son : Pluie en forêt · @sam');
  });

  test('un son original ⇒ la sinusoïde, aucun crédit', async () => {
    const el = await mount(card(sceneEffects({ name: 'Ma voix' })), '[data-sound-credit]');
    expect(el.querySelector('[data-sound-credit="original"]')).not.toBeNull();
    expect(el.querySelector('[data-sound-credit="credit"]')).toBeNull();
  });

  test('une scène sans fond sonore ⇒ aucune annonce', async () => {
    const el = await mount(card(sceneEffects(null)), '[data-sound-credit]');
    expect(el.querySelector('[data-feed-card]')).not.toBeNull();
    expect(el.querySelector('[data-sound-credit]')).toBeNull();
  });
});

describe('le réel', () => {
  test('un son emprunté ⇒ le crédit sur sa propre ligne, sous le nom de l’auteur', async () => {
    const el = await mount(reel(sceneEffects({ soundId: 'snd1', name: 'Pluie en forêt', soundAuthorUsername: 'sam' })), '[data-sound-credit]');
    const credit = el.querySelector('[data-sound-credit="credit"]');
    expect(credit?.textContent).toContain('Son : Pluie en forêt · @sam');
    expect(el.querySelector('[data-reel-author]')?.contains(credit ?? null)).toBe(false);
  });
});
