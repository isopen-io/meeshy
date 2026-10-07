import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { FeedMedia } from '@/lib/api/feed-pages';
import { mediaCoordinator } from '@/lib/view/media-coordinator';

import { CommentMedia } from './comment-media';

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

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

const piece = (id: string, mimeType: string): FeedMedia => ({ id, mimeType, fileUrl: `https://cdn.meeshy.me/${id}` });

const mount = (media: readonly FeedMedia[]): HTMLDivElement => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<CommentMedia media={media} />);
  });
  return container;
};

const playingElsewhere = (): { readonly pauses: () => number } => {
  let pauses = 0;
  mediaCoordinator.claim(`ailleurs:${Math.random()}`, () => {
    pauses += 1;
  });
  return { pauses: () => pauses };
};

describe('CommentMedia — un média de commentaire ne joue pas par-dessus un autre (#9575)', () => {
  test('lancer la vidéo d’un commentaire met en pause ce qui jouait ailleurs', () => {
    const host = mount([piece('clip.mp4', 'video/mp4')]);
    const elsewhere = playingElsewhere();

    host.querySelector('video')!.dispatchEvent(new Event('play'));

    expect(elsewhere.pauses()).toBe(1);
  });

  test('lancer le son d’un commentaire met en pause ce qui jouait ailleurs', () => {
    const host = mount([piece('note.webm', 'audio/webm')]);
    const elsewhere = playingElsewhere();

    host.querySelector('audio')!.dispatchEvent(new Event('play'));

    expect(elsewhere.pauses()).toBe(1);
  });

  test('un autre média qui démarre met en pause la vidéo du commentaire', () => {
    const host = mount([piece('clip.mp4', 'video/mp4')]);
    const video = host.querySelector('video')!;
    let pauses = 0;
    video.pause = () => {
      pauses += 1;
      video.dispatchEvent(new Event('pause'));
    };
    video.dispatchEvent(new Event('play'));

    playingElsewhere();

    expect(pauses).toBe(1);
  });
});
