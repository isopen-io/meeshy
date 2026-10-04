import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { StoryMediaLayer } from './story-parts';

/**
 * LA VIDÉO D'UNE STORY OBÉIT AU LECTEUR (#9277, #6925) — mesuré sous Chromium
 * bridé : l'appui long gelait la barre et laissait la vidéo courir, et un
 * buffer laissait la barre avancer sur une image figée (0,33 de barre en
 * 3 s). La vidéo suit désormais la pause, et DIT son buffer à l'hôte.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const lecture = new WeakMap<HTMLMediaElement, 'lit' | 'pause'>();
const ready = new WeakMap<HTMLMediaElement, number>();
const PATCHED = ['play', 'pause', 'paused', 'readyState'] as const;
let originals: ReadonlyArray<readonly [string, PropertyDescriptor | undefined]> = [];

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  const proto = window.HTMLMediaElement.prototype;
  originals = PATCHED.map((name) => [name, Object.getOwnPropertyDescriptor(proto, name)] as const);
  proto.play = function play(this: HTMLMediaElement) {
    lecture.set(this, 'lit');
    this.dispatchEvent(new window.Event('play'));
    return Promise.resolve();
  };
  proto.pause = function pause(this: HTMLMediaElement) {
    lecture.set(this, 'pause');
    this.dispatchEvent(new window.Event('pause'));
  };
  Object.defineProperty(proto, 'paused', { configurable: true, get(this: HTMLMediaElement) { return lecture.get(this) !== 'lit'; } });
  Object.defineProperty(proto, 'readyState', { configurable: true, get(this: HTMLMediaElement) { return ready.get(this) ?? 4; } });
});

afterAll(async () => {
  await act(async () => {});
  const proto = window.HTMLMediaElement.prototype;
  for (const [name, descriptor] of originals) {
    if (descriptor !== undefined) Object.defineProperty(proto, name, descriptor);
    else Reflect.deleteProperty(proto, name);
  }
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const base = {
  storyId: 's-1',
  mediaSrc: 'https://gate.meeshy.me/story.mp4',
  mimeType: 'video/mp4',
  showsMedia: true,
  hasMedia: true,
  background: {},
  caption: null,
  onReady: () => undefined,
  onFailed: () => undefined,
};

function render(props: Partial<Parameters<typeof StoryMediaLayer>[0]>): HTMLVideoElement {
  act(() => root.render(<StoryMediaLayer {...base} {...props} />));
  const video = container.querySelector('video');
  if (video === null) throw new Error('vidéo attendue');
  return video;
}

function setup(): void {
  container = window.document.createElement('div');
  window.document.body.appendChild(container);
  root = createRoot(container);
}

describe('StoryMediaLayer — la vidéo suit le lecteur', () => {
  test('la pause du lecteur (appui long, feuille) met la VIDÉO en pause, la reprise la relance', () => {
    setup();
    const video = render({ playing: true });
    expect(video.paused).toBe(false);
    render({ playing: false });
    expect(video.paused).toBe(true);
    render({ playing: true });
    expect(video.paused).toBe(false);
  });

  test('un buffer en pleine lecture est annoncé, puis sa fin', () => {
    setup();
    const seen: boolean[] = [];
    const video = render({ playing: true, onPlaybackProgressing: (p) => seen.push(p) });
    act(() => {
      ready.set(video, 2);
      video.dispatchEvent(new window.Event('waiting'));
    });
    act(() => {
      ready.set(video, 4);
      video.dispatchEvent(new window.Event('playing'));
    });
    expect(seen).toEqual([false, true]);
  });
});
