import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Attachment } from '@/lib/api/types';

import { VideoFallback, VideoTile } from './video-tile';

/**
 * T8 (#6221) — `VideoTile`, la lecture vidéo inline. Patron `use-media-
 * playback.test.tsx` : l'élément est RÉEL, `play`/`pause`/`load` bouchonnés.
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

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function stubVideo(el: HTMLVideoElement): { playCalls: number; pauseCalls: number; loadCalls: number } {
  const calls = { playCalls: 0, pauseCalls: 0, loadCalls: 0 };
  el.play = () => {
    calls.playCalls += 1;
    el.dispatchEvent(new Event('play'));
    return Promise.resolve();
  };
  el.pause = () => {
    calls.pauseCalls += 1;
    el.dispatchEvent(new Event('pause'));
  };
  el.load = () => {
    calls.loadCalls += 1;
    el.dispatchEvent(new Event('emptied'));
  };
  return calls;
}

const video: Attachment = {
  ...attachmentDefaults,
  id: 'a-video-1',
  messageId: 'm-video-1',
  fileName: 'clip.webm',
  originalName: 'clip-marina.webm',
  mimeType: 'video/webm',
  fileSize: 929,
  fileUrl: 'data:video/webm;base64,AAAA',
  thumbnailUrl: 'data:image/png;base64,AAAA',
  duration: 7_000,
  uploadedBy: 'u-amina',
  createdAt: new Date().toISOString(),
};

function mount(attachment: Attachment, solo: boolean, onExpand: () => void): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<VideoTile attachment={attachment} solo={solo} onExpand={onExpand} />);
  });
  return container;
}

describe('VideoTile — la vignette et la lecture inline (#6221)', () => {
  test('<video preload="none" playsinline> avec le poster et la source servis', () => {
    const el = mount(video, true, () => {});
    const videoEl = el.querySelector('video')!;
    expect(videoEl.getAttribute('preload')).toBe('none');
    expect(videoEl.hasAttribute('playsinline') || (videoEl as unknown as { playsInline: boolean }).playsInline).toBeTruthy();
    // `thumbnailUrl` est un `data:` — traverse `attachmentSrc` INCHANGÉ (site
    // unique, `media-url.ts`), jamais préfixé par la base de la passerelle.
    expect(videoEl.getAttribute('poster')).toBe('data:image/png;base64,AAAA');
  });

  test('le bouton porte le vocabulaire iOS, cible ≥ 44, diamètre 64 en solo / 44 en multi', () => {
    const solo = mount(video, true, () => {});
    const soloButton = solo.querySelector('button')!;
    expect(soloButton.getAttribute('aria-label')).toBe('Lire la vidéo');
    expect(soloButton.getAttribute('data-play-diameter')).toBe('64');

    const multi = mount(video, false, () => {});
    expect(multi.querySelector('button')!.getAttribute('data-play-diameter')).toBe('44');
  });

  test('le badge de durée affiche 0:07 pour 7000 ms', () => {
    const el = mount(video, true, () => {});
    expect(el.textContent).toContain('0:07');
  });

  test('clic sur le bouton : play() UNE fois, data-video-status="playing" ; second clic : pause(), "paused"', async () => {
    const el = mount(video, true, () => {});
    const calls = stubVideo(el.querySelector('video')!);
    const button = el.querySelector('button')!;

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(calls.playCalls).toBe(1);
    expect(el.querySelector('[data-attachment]')!.getAttribute('data-video-status')).toBe('playing');

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(calls.pauseCalls).toBe(1);
    expect(el.querySelector('[data-attachment]')!.getAttribute('data-video-status')).toBe('paused');
  });

  test('clic sur le bouton n’ouvre PAS la visionneuse (stopPropagation)', async () => {
    let expanded = 0;
    const el = mount(video, true, () => {
      expanded += 1;
    });
    stubVideo(el.querySelector('video')!);
    const button = el.querySelector('button')!;
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(expanded).toBe(0);
  });

  test('tap HORS du bouton ⇒ onExpand()', () => {
    let expanded = 0;
    const el = mount(video, true, () => {
      expanded += 1;
    });
    stubVideo(el.querySelector('video')!);
    const tile = el.querySelector('[data-attachment]')!;
    tile.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(expanded).toBe(1);
  });

  test('fileUrl vide ⇒ VideoFallback (D-42 intact)', () => {
    const withoutUrl: Attachment = { ...video, fileUrl: '' };
    const el = mount(withoutUrl, true, () => {});
    expect(el.querySelector('[data-video-fallback]')).not.toBeNull();
    expect(el.querySelector('video')).toBeNull();
  });

  test('error natif ⇒ data-video-status="error" + "Lecture impossible — Réessayer" qui rappelle load() puis play()', async () => {
    const el = mount(video, true, () => {});
    const videoEl = el.querySelector('video')!;
    const calls = stubVideo(videoEl);

    await act(async () => {
      videoEl.dispatchEvent(new Event('error'));
    });
    expect(el.querySelector('[data-attachment]')!.getAttribute('data-video-status')).toBe('error');
    const retry = el.querySelector('[data-video-error-band] button')!;
    expect(retry.textContent).toBe('Lecture impossible — Réessayer');

    await act(async () => {
      retry.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(calls.loadCalls).toBe(1);
    expect(calls.playCalls).toBe(1);
  });
});

describe('VideoFallback (D-42, déménagé #6221)', () => {
  test('rend le repli lisible pour une pièce sans fichier', () => {
    const withoutUrl: Attachment = { ...video, fileUrl: '' };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<VideoFallback attachment={withoutUrl} />);
    });
    expect(container.querySelector('[data-video-fallback]')).not.toBeNull();
    expect(container.textContent).toContain('0:07');
  });
});

/**
 * LA VIDÉO REPREND LÀ OÙ ON L'AVAIT LAISSÉE (#7225, W6 — revue).
 *
 * Le lot ne câblait que le VOCAL : la vidéo, pourtant nommée dans le résultat
 * attendu du lot, repartait de zéro et ne rapportait rien. Le témoin interroge
 * ce que l'utilisateur VOIT — la position réelle de l'élément — et non la
 * présence d'un appel.
 */
describe('VideoTile — la reprise de lecture (#7225)', () => {
  const watchedTo = (positionMs: number | null, complete: boolean): Attachment => ({
    ...video,
    currentUserConsumption: {
      lastPlayPositionMs: null,
      listenedComplete: false,
      lastWatchPositionMs: positionMs,
      watchedComplete: complete,
    },
  });

  test('une vidéo vue jusqu’à 4 s reprend à 4 s', () => {
    const el = mount(watchedTo(4_000, false), true, () => {});
    expect(el.querySelector('video')!.currentTime).toBe(4);
  });

  test('une vidéo déjà terminée repart de zéro (rien à rejouer)', () => {
    const el = mount(watchedTo(6_500, true), true, () => {});
    expect(el.querySelector('video')!.currentTime).toBe(0);
  });

  test('la position AUDIO ne sert jamais de reprise à une vidéo', () => {
    const el = mount(
      { ...video, currentUserConsumption: { lastPlayPositionMs: 5_000, listenedComplete: false, lastWatchPositionMs: null, watchedComplete: false } },
      true,
      () => {},
    );
    expect(el.querySelector('video')!.currentTime).toBe(0);
  });
});
