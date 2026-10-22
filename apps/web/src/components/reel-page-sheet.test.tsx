import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { REEL_STUDIO } from '@/lib/api/fixtures-reels';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import type { SceneYield } from '@/lib/view/scene-yields';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { renderToStaticMarkup } from 'react-dom/server';

import { ReelPage } from './reel-page';
import { ReelVeil } from './reel-veil';

/**
 * #11307 (défaut retenu de #11253, parité iOS) — SOUS LA FEUILLE DE
 * COMMENTAIRES, LE RÉEL VISIBLE SE MET EN PAUSE SOUS SON AFFICHE FLOUTÉE. Le
 * flou posé sur le pager se recalculait à chaque image de la vidéo en
 * lecture ; il vit désormais sur une image FIXE, et la vidéo s'arrête.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const NOW = new Date('2026-09-14T09:00:00.000Z');
const MODEL = resolveFeedCardModel(REEL_STUDIO, { preferredLanguages: ['fr'], now: NOW });

const mounted: { readonly root: Root; readonly container: HTMLElement }[] = [];

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    act(() => root.unmount());
    container.remove();
  });
});

function page(sceneYield: SceneYield) {
  return (
    <ReelPage
      model={MODEL}
      index={0}
      count={3}
      mode="active"
      sceneYield={sceneYield}
      soundOn={false}
      language="fr"
      preferredLanguages={['fr']}
      onToggleSound={() => undefined}
      onGesture={() => undefined}
      onShare={() => undefined}
      onSoundBlocked={() => undefined}
    />
  );
}

async function mountPlaying(): Promise<{ readonly root: Root; readonly container: HTMLElement; readonly calls: string[] }> {
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  const calls: string[] = [];
  await act(async () => {
    root.render(page('full'));
  });
  const video = container.querySelector('video')!;
  Object.defineProperty(video, 'pause', {
    configurable: true,
    value: () => {
      calls.push('pause');
      video.dispatchEvent(new Event('pause'));
    },
  });
  Object.defineProperty(video, 'play', {
    configurable: true,
    value: () => {
      calls.push('play');
      video.dispatchEvent(new Event('play'));
      return Promise.resolve();
    },
  });
  await act(async () => {
    video.dispatchEvent(new Event('play'));
  });
  calls.splice(0);
  return { root, container, calls };
}

const veilOf = (container: HTMLElement): HTMLElement | null => container.querySelector<HTMLElement>('[data-reel-veil]');

describe('ReelPage — sous la feuille, en pause sous son affiche floutée (#11307)', () => {
  test('feuille fermée : aucun voile, la vidéo joue', async () => {
    const { container, calls } = await mountPlaying();
    expect(veilOf(container)).toBeNull();
    expect(calls).toEqual([]);
  });

  test('lire le fil : la vidéo se met en pause, et l’affiche floutée la recouvre', async () => {
    const { root, container, calls } = await mountPlaying();
    await act(async () => {
      root.render(page('reading'));
    });
    expect(calls).toEqual(['pause']);
    const veil = veilOf(container);
    expect(veil).not.toBeNull();
    expect(veil?.getAttribute('aria-hidden')).toBe('true');
    expect(veil?.style.filter).toContain('blur(');
    expect(veil?.getAttribute('data-reel-veil')).toBe('poster');
    expect(veil?.style.transition ?? '').not.toContain('filter');
  });

  test('écrire : la vidéo reste en pause, NETTE — aucun voile', async () => {
    const { root, container, calls } = await mountPlaying();
    await act(async () => {
      root.render(page('writing'));
    });
    expect(calls).toEqual(['pause']);
    expect(veilOf(container)).toBeNull();
  });

  test('fermer la feuille rend la lecture et retire le voile', async () => {
    const { root, container, calls } = await mountPlaying();
    await act(async () => {
      root.render(page('reading'));
    });
    await act(async () => {
      root.render(page('full'));
    });
    expect(calls).toEqual(['pause', 'play']);
    expect(veilOf(container)).toBeNull();
  });
});

describe('ReelVeil — le flou vit sur une image FIXE (#11307)', () => {
  test('l’affiche est l’image floutée', () => {
    const html = renderToStaticMarkup(<ReelVeil src="https://cdn.example/poster.jpg" />);
    expect(html).toContain('data-reel-veil="poster"');
    expect(html).toContain('https://cdn.example/poster.jpg');
    expect(html).toMatch(/filter:\s*blur\(/);
  });

  test('sans affiche, il floute l’image ARRÊTÉE dessous, jamais un noir', () => {
    const html = renderToStaticMarkup(<ReelVeil src={undefined} />);
    expect(html).toContain('data-reel-veil="backdrop"');
    expect(html).toMatch(/backdrop-filter:\s*blur\(/);
    expect(html).not.toContain('background-image');
  });
});
