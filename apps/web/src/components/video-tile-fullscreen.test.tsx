import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Attachment } from '@/lib/api/types';

import { Attachments } from './attachment-blocks';
import { VideoTile } from './video-tile';

/**
 * #8234 (jumelle web de #8231, directive porteur du 2026-09-27, amendée) —
 * « Au touché d'une vidéo reçue, ouvrir en plein écran DIRECTEMENT », et « il
 * faut permettre de jouer en inline mais avec peu de contrôleurs : son,
 * pause/play et plein écran ».
 *
 * Toucher la SURFACE (hors contrôles) ouvre le plein écran, avant ET pendant
 * la lecture ; le bouton ▶︎ lit dans le fil avec EXACTEMENT trois contrôles.
 * Un geste, un effet.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const calls = { play: 0, pause: 0 };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
    calls.play += 1;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function pause(this: HTMLMediaElement) {
    calls.pause += 1;
    this.dispatchEvent(new Event('pause'));
  };
  HTMLMediaElement.prototype.load = function load(this: HTMLMediaElement) {
    this.dispatchEvent(new Event('emptied'));
  };
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

const video = (id: string): Attachment => ({
  ...attachmentDefaults,
  id,
  messageId: 'm-video',
  fileName: 'clip.mp4',
  originalName: 'clip.mp4',
  mimeType: 'video/mp4',
  fileSize: 4096,
  fileUrl: `https://cdn.meeshy.me/${id}.mp4`,
  thumbnailUrl: `https://cdn.meeshy.me/${id}.jpg`,
  duration: 12_000,
  width: 1280,
  height: 720,
  uploadedBy: 'u-amina',
  createdAt: '2026-09-27T09:00:00.000Z',
});

const mountTile = (attachment: Attachment, onExpand: () => void = () => {}): HTMLElement => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<VideoTile attachment={attachment} solo onExpand={onExpand} />);
  });
  return container;
};

const click = async (element: Element | null) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
};

const controlsOf = (host: HTMLElement): readonly string[] =>
  [...host.querySelectorAll('[data-video-control]')].map((control) => control.getAttribute('data-video-control') ?? '');

describe('VideoTile — toucher la surface ouvre le plein écran (#8234)', () => {
  test('la surface est un bouton libellé « Ouvrir en plein écran » : Entrée et Espace l’activent nativement', () => {
    const host = mountTile(video('a-1'));
    const surface = host.querySelector<HTMLElement>('[data-video-surface]');
    expect(surface?.tagName).toBe('BUTTON');
    expect(surface?.getAttribute('aria-label')).toBe('Ouvrir en plein écran');
  });

  test('AVANT la lecture : toucher la surface ouvre le plein écran, et ne lit rien dans le fil', async () => {
    let expanded = 0;
    const host = mountTile(video('a-2'), () => {
      expanded += 1;
    });
    const before = calls.play;
    await click(host.querySelector('[data-video-surface]'));
    expect(expanded).toBe(1);
    expect(calls.play).toBe(before);
  });

  test('PENDANT la lecture : toucher la surface ouvre le plein écran et met la lecture du fil en pause', async () => {
    let expanded = 0;
    const host = mountTile(video('a-3'), () => {
      expanded += 1;
    });
    await click(host.querySelector('[data-video-control="play-pause"]'));
    expect(host.querySelector('[data-attachment]')?.getAttribute('data-video-status')).toBe('playing');
    await click(host.querySelector('[data-video-surface]'));
    expect(expanded).toBe(1);
    expect(host.querySelector('[data-attachment]')?.getAttribute('data-video-status')).toBe('paused');
  });

  test('toucher ▶︎ lit dans le fil, sans ouvrir le plein écran', async () => {
    let expanded = 0;
    const host = mountTile(video('a-4'), () => {
      expanded += 1;
    });
    await click(host.querySelector('[data-video-control="play-pause"]'));
    expect(expanded).toBe(0);
    expect(host.querySelector('[data-attachment]')?.getAttribute('data-video-status')).toBe('playing');
  });
});

describe('VideoTile — la lecture dans le fil ne garde que trois contrôles (#8234)', () => {
  test('au repos, un seul contrôle : ▶︎', () => {
    const host = mountTile(video('a-5'));
    expect(controlsOf(host)).toEqual(['play-pause']);
    expect(host.querySelector('[data-video-control="play-pause"]')?.getAttribute('aria-label')).toBe('Lire la vidéo');
  });

  test('en lecture : EXACTEMENT son, pause/lecture et plein écran — ni barre, ni temps, ni vitesse, ni PiP', async () => {
    const host = mountTile(video('a-6'));
    await click(host.querySelector('[data-video-control="play-pause"]'));
    expect([...controlsOf(host)].sort()).toEqual(['expand', 'mute', 'play-pause']);
    expect(host.querySelector('[data-video-progress]')).toBeNull();
    expect(host.querySelector('[role="slider"]')).toBeNull();
    expect(host.textContent).not.toContain('0:12');
    const buttons = [...host.querySelectorAll('button')].filter((button) => !button.hasAttribute('data-video-surface'));
    expect(buttons.map((button) => button.getAttribute('data-video-control')).sort()).toEqual(['expand', 'mute', 'play-pause']);
  });

  test('chaque contrôle est libellé', async () => {
    const host = mountTile(video('a-7'));
    await click(host.querySelector('[data-video-control="play-pause"]'));
    expect(host.querySelector('[data-video-control="play-pause"]')?.getAttribute('aria-label')).toBe('Pause');
    expect(host.querySelector('[data-video-control="mute"]')?.getAttribute('aria-label')).toBe('Couper le son');
    expect(host.querySelector('[data-video-control="expand"]')?.getAttribute('aria-label')).toBe('Ouvrir en plein écran');
  });

  test('le son se coupe et se rétablit, sans ouvrir ni arrêter la vidéo', async () => {
    let expanded = 0;
    const host = mountTile(video('a-8'), () => {
      expanded += 1;
    });
    await click(host.querySelector('[data-video-control="play-pause"]'));
    await click(host.querySelector('[data-video-control="mute"]'));
    expect(host.querySelector('video')?.muted).toBe(true);
    expect(host.querySelector('[data-video-control="mute"]')?.getAttribute('aria-label')).toBe('Réactiver le son');
    await click(host.querySelector('[data-video-control="mute"]'));
    expect(host.querySelector('video')?.muted).toBe(false);
    expect(expanded).toBe(0);
    expect(host.querySelector('[data-attachment]')?.getAttribute('data-video-status')).toBe('playing');
  });

  test('pause/lecture met en pause sans ouvrir le plein écran', async () => {
    let expanded = 0;
    const host = mountTile(video('a-9'), () => {
      expanded += 1;
    });
    await click(host.querySelector('[data-video-control="play-pause"]'));
    await click(host.querySelector('[data-video-control="play-pause"]'));
    expect(host.querySelector('[data-attachment]')?.getAttribute('data-video-status')).toBe('paused');
    expect(expanded).toBe(0);
    expect([...controlsOf(host)].sort()).toEqual(['expand', 'mute', 'play-pause']);
  });

  test('le bouton plein écran ouvre UNE fois', async () => {
    let expanded = 0;
    const host = mountTile(video('a-10'), () => {
      expanded += 1;
    });
    await click(host.querySelector('[data-video-control="play-pause"]'));
    await click(host.querySelector('[data-video-control="expand"]'));
    expect(expanded).toBe(1);
  });
});

describe('VideoTile — le plein écran reprend à la même position (#8234)', () => {
  test('toucher la surface pendant la lecture ouvre la visionneuse sur l’image qu’on regardait', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Attachments attachments={[video('a-11')]} languages={['fr']} fallbackLanguage="fr" mediaFrame="box" />);
    });
    await click(container.querySelector('[data-video-control="play-pause"]'));
    const inline = container.querySelector<HTMLVideoElement>('video')!;
    inline.currentTime = 4.2;
    await click(container.querySelector('[data-video-surface]'));
    for (let attempt = 0; attempt < 50 && document.querySelector('[role="dialog"] video') === null; attempt += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
    const fullscreen = document.querySelector<HTMLVideoElement>('[role="dialog"] video');
    expect(fullscreen).not.toBeNull();
    expect(fullscreen?.currentTime).toBeCloseTo(4.2, 1);
  });
});
