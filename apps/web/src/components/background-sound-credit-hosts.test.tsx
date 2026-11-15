import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { FeedPost } from '@/lib/api/feed-pages';
import { REEL_SCENE_LOOP, REEL_STUDIO } from '@/lib/api/fixtures-reels';
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
const reelOf = (source: FeedPost, options: { readonly soundOn?: boolean; readonly onToggleSound?: () => void } = {}) => (
  <ReelPage
    model={resolveFeedCardModel(source, { preferredLanguages: ['fr'], now: NOW })}
    index={0}
    count={1}
    mode="far"
    soundOn={options.soundOn ?? false}
    language="fr"
    preferredLanguages={['fr']}
    onToggleSound={options.onToggleSound ?? (() => undefined)}
    onGesture={() => undefined}
    onShare={() => undefined}
    onSoundBlocked={() => undefined}
  />
);
const reel = (storyEffects: unknown, options: { readonly soundOn?: boolean; readonly onToggleSound?: () => void } = {}) =>
  reelOf({ ...REEL_SCENE_LOOP, storyEffects } as FeedPost, options);

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

/**
 * LA NOTE EST LE CONTRÔLE, PLUS DE BAFFLE POUR LE SON DE FOND (#9698, directive
 * porteur 2026-10-08) — sur le réel, la note du crédit coupe et rétablit le son
 * de fond ; le bouton son du rail ne reste que là où aucun crédit ne peut le
 * porter : la piste propre d'une vidéo.
 */
describe('la note coupe le son de fond', () => {
  const borrowed = sceneEffects({ soundId: 'snd1', name: 'Pluie en forêt', soundAuthorUsername: 'sam' });
  const note = (el: Element) => el.querySelector<HTMLButtonElement>('[data-sound-toggle]');
  const railSound = (el: Element) => el.querySelector('[data-reel-rail] [data-reel-gesture="sound"]');

  test('le réel à son de fond : la note est le bouton (prise du gate comprise), le rail n’a plus de baffle', async () => {
    let toggles = 0;
    const el = await mount(reel(borrowed, { soundOn: true, onToggleSound: () => (toggles += 1) }), '[data-sound-toggle]');
    expect(note(el)?.getAttribute('aria-pressed')).toBe('false');
    expect(note(el)?.getAttribute('aria-label')).toBe('Couper le son de fond');
    expect(note(el)?.getAttribute('data-reel-gesture')).toBe('sound');
    expect(railSound(el)).toBeNull();
    await act(async () => note(el)?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(toggles).toBe(1);
  });

  test('son coupé ⇒ la note est barrée et enfoncée', async () => {
    const el = await mount(reel(borrowed, { soundOn: false }), '[data-sound-toggle]');
    expect(note(el)?.getAttribute('aria-pressed')).toBe('true');
    expect(note(el)?.getAttribute('aria-label')).toBe('Réactiver le son de fond');
    expect(note(el)?.querySelector('[data-sound-note="barred"]')).not.toBeNull();
  });

  test('une piste que rien n’adresse ⇒ la note reste un dessin : ni bouton, ni baffle (aucun contrôle inerte)', async () => {
    const unaddressed = { ...sceneEffects(null), sound: { source: { t: 'library', soundId: 'snd' }, volume: 1 } };
    const el = await mount(reel(unaddressed), '[data-sound-credit]');
    expect(el.querySelector('[data-sound-credit="credit"] [data-sound-note]')).not.toBeNull();
    expect(note(el)).toBeNull();
    expect(railSound(el)).toBeNull();
  });

  test('un réel VIDÉO sans scène garde le baffle du rail : c’est la piste propre de la vidéo', async () => {
    const el = await mount(reelOf(REEL_STUDIO), '[data-reel-rail]');
    expect(railSound(el)).not.toBeNull();
    expect(note(el)).toBeNull();
  });

  test('une scène dont SEULE la vidéo de fond sonne garde le baffle du rail, sans crédit', async () => {
    const videoScene = {
      v: 3,
      scenes: [
        {
          id: 's1',
          objects: [
            {
              id: 'bg1',
              kind: 'media',
              anchor: { t: 'free', x: 0.5, y: 0.5 },
              plane: 'bg',
              z: 0,
              transform: { scale: 1, rotation: 0, opacity: 1 },
              payload: { postMediaId: 'media-reel-scene-video', mediaType: 'video/webm' },
            },
          ],
        },
      ],
    };
    const el = await mount(reel(videoScene), '[data-reel-rail]');
    expect(railSound(el)).not.toBeNull();
    expect(el.querySelector('[data-sound-credit]')).toBeNull();
  });

  test('la carte du fil ne joue rien : sa note n’est jamais un bouton', async () => {
    const el = await mount(card(borrowed), '[data-sound-credit]');
    expect(el.querySelector('[data-sound-credit="credit"] [data-sound-note="plain"]')).not.toBeNull();
    expect(note(el)).toBeNull();
  });
});
