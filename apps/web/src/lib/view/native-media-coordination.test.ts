import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { createMediaCoordinator } from './media-coordinator';
import { coordinateNativeMedia } from './native-media-coordination';

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const nativeVideo = (): { readonly element: HTMLVideoElement; readonly pauses: () => number } => {
  const element = document.createElement('video');
  let pauses = 0;
  element.pause = () => {
    pauses += 1;
    element.dispatchEvent(new Event('pause'));
  };
  return { element, pauses: () => pauses };
};

describe('coordinateNativeMedia — un lecteur aux contrôles natifs ne joue pas par-dessus un autre (#9575)', () => {
  test('sa lecture met en pause le média qui jouait', () => {
    const coordinator = createMediaCoordinator();
    let paused = 0;
    coordinator.claim('tuile', () => {
      paused += 1;
    });
    const { element } = nativeVideo();
    coordinateNativeMedia(element, coordinator);

    element.dispatchEvent(new Event('play'));

    expect(paused).toBe(1);
  });

  test('un autre média qui démarre le met en pause', () => {
    const coordinator = createMediaCoordinator();
    const { element, pauses } = nativeVideo();
    coordinateNativeMedia(element, coordinator);
    element.dispatchEvent(new Event('play'));

    coordinator.claim('visionneuse', () => {});

    expect(pauses()).toBe(1);
  });

  test('deux lecteurs natifs de la même source s’arbitrent entre eux', () => {
    const coordinator = createMediaCoordinator();
    const first = nativeVideo();
    const second = nativeVideo();
    first.element.src = 'https://cdn.meeshy.me/clip.mp4';
    second.element.src = 'https://cdn.meeshy.me/clip.mp4';
    coordinateNativeMedia(first.element, coordinator);
    coordinateNativeMedia(second.element, coordinator);

    first.element.dispatchEvent(new Event('play'));
    second.element.dispatchEvent(new Event('play'));

    expect(first.pauses()).toBe(1);
    expect(second.pauses()).toBe(0);
  });

  test('en pause ou terminé, il rend l’exclusivité', () => {
    const coordinator = createMediaCoordinator();
    const { element } = nativeVideo();
    coordinateNativeMedia(element, coordinator);

    element.dispatchEvent(new Event('play'));
    expect(coordinator.active()).not.toBeNull();
    element.dispatchEvent(new Event('pause'));
    expect(coordinator.active()).toBeNull();

    element.dispatchEvent(new Event('play'));
    element.dispatchEvent(new Event('ended'));
    expect(coordinator.active()).toBeNull();
  });

  test('entrer en image dans l’image met en pause le média qui jouait dans la page', () => {
    const coordinator = createMediaCoordinator();
    let paused = 0;
    coordinator.claim('tuile', () => {
      paused += 1;
    });
    const { element } = nativeVideo();
    coordinateNativeMedia(element, coordinator);

    element.dispatchEvent(new Event('enterpictureinpicture'));

    expect(paused).toBe(1);
  });

  test('lié deux fois (un rendu qui rappelle le ref), il ne réclame qu’une fois', () => {
    const coordinator = createMediaCoordinator();
    const { element, pauses } = nativeVideo();
    coordinateNativeMedia(element, coordinator);
    coordinateNativeMedia(element, coordinator);
    coordinateNativeMedia(null, coordinator);

    element.dispatchEvent(new Event('play'));

    expect(pauses()).toBe(0);
    expect(coordinator.active()).not.toBeNull();
  });
});
