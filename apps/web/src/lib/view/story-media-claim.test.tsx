import { readFileSync } from 'node:fs';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { createMediaCoordinator, type MediaCoordinator } from './media-coordinator';
import { coordinateNativeMedia } from './native-media-coordination';
import { useStoryMediaClaim } from './story-media-claim';

/**
 * TÉMOIN (#9586) — ouvrir une story arrête ce qui jouait ailleurs, miroir de
 * `StoryMediaCoordinator.shared.activate` à l'apparition de `StoryViewerView`
 * (iOS) : une tuile sonore ou un vocal lancé avant ne continue pas derrière le
 * lecteur.
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

function StoryViewerProbe({ coordinator }: { readonly coordinator: MediaCoordinator }) {
  useStoryMediaClaim(coordinator);
  return null;
}

const mount = (coordinator: MediaCoordinator): Root => {
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<StoryViewerProbe coordinator={coordinator} />));
  return root;
};

const playingTile = (coordinator: MediaCoordinator): { readonly pauses: () => number } => {
  const element = document.createElement('video');
  let pauses = 0;
  element.pause = () => {
    pauses += 1;
    element.dispatchEvent(new Event('pause'));
  };
  coordinateNativeMedia(element, coordinator);
  element.dispatchEvent(new Event('play'));
  return { pauses: () => pauses };
};

describe('useStoryMediaClaim — une story ne joue pas en même temps qu’une autre surface (#9586)', () => {
  test('ouvrir la story met en pause la tuile qui jouait', () => {
    const coordinator = createMediaCoordinator();
    const tile = playingTile(coordinator);

    const root = mount(coordinator);

    expect(tile.pauses()).toBe(1);
    act(() => root.unmount());
  });

  test('un vocal lancé avant s’arrête à l’ouverture', () => {
    const coordinator = createMediaCoordinator();
    let paused = 0;
    coordinator.claim('vocal', () => {
      paused += 1;
    });

    const root = mount(coordinator);

    expect(paused).toBe(1);
    expect(coordinator.active()).not.toBe('vocal');
    act(() => root.unmount());
  });

  test('fermer la story rend l’exclusivité', () => {
    const coordinator = createMediaCoordinator();
    const root = mount(coordinator);
    expect(coordinator.active()).not.toBeNull();

    act(() => root.unmount());

    expect(coordinator.active()).toBeNull();
  });

  test('une surface lancée après l’ouverture garde sa lecture, et la fermeture de la story ne la lui retire pas', () => {
    const coordinator = createMediaCoordinator();
    const root = mount(coordinator);
    const tile = playingTile(coordinator);

    act(() => root.unmount());

    expect(tile.pauses()).toBe(0);
    expect(coordinator.active()).not.toBeNull();
  });

  test('le lecteur de story réclame la lecture', () => {
    const source = readFileSync(new URL('../../routes/story.tsx', import.meta.url), 'utf8');

    expect(/\buseStoryMediaClaim\(\)/.test(source)).toBe(true);
  });
});
