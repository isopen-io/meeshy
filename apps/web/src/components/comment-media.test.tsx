import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { FeedMedia } from '@/lib/api/feed-pages';
import { mediaCoordinator } from '@/lib/view/media-coordinator';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { SceneExportSubject } from '@/lib/export/scene/scene-export-subject';

import { CommentMedia } from './comment-media';
import CommentMediaViewer from './comment-media-viewer';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
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
    root.render(<CommentMedia media={media} commentId="c-1" authorUsername="alice" />);
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

const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

const viewerLayer = (): Element | null => document.querySelector('[data-media-viewer]');

describe('CommentMedia — une photo ou une vidéo s’ouvre en plein écran (#13881, miroir CommentMediaView iOS)', () => {
  test('toucher la photo ouvre la visionneuse SUR elle ; un son n’a pas de plein écran', async () => {
    const host = mount([piece('a.png', 'image/png'), piece('b.png', 'image/png'), piece('son.m4a', 'audio/mp4')]);
    const opens = Array.from(host.querySelectorAll('[data-comment-media-open]')).map((el) => el.getAttribute('data-comment-media-open'));
    expect(opens).toEqual(['a.png', 'b.png']);
    const second = host.querySelector<HTMLButtonElement>('[data-comment-media-open="b.png"]')!;
    expect(second.getAttribute('aria-label')).toBe('Ouvrir en plein écran');
    expect(second.querySelector('img')).not.toBeNull();
    act(() => {
      second.click();
    });
    await settle();
    expect(viewerLayer()?.getAttribute('data-viewer-attachment')).toBe('b.png');
  });

  test('la vidéo garde sa lecture sur place ET porte un bouton plein écran', async () => {
    const host = mount([piece('clip.mp4', 'video/mp4')]);
    expect(host.querySelector('video')).not.toBeNull();
    act(() => {
      host.querySelector<HTMLButtonElement>('[data-comment-media-open="clip.mp4"]')!.click();
    });
    await settle();
    expect(viewerLayer()?.getAttribute('data-viewer-attachment')).toBe('clip.mp4');
  });
});

describe('CommentMediaViewer — « Imager » compose la pièce et referme la couche (#13881)', () => {
  test('« … » offre Partager et Imager ; Imager lance la composition de CETTE pièce et ferme la visionneuse', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const launched: SceneExportSubject[] = [];
    let closed = 0;
    act(() => {
      root.render(
        <CommentMediaViewer
          media={[piece('a.png', 'image/png'), piece('clip.mp4', 'video/mp4')]}
          startIndex={1}
          commentId="c-9"
          authorUsername="alice"
          onClose={() => {
            closed += 1;
          }}
          launcher={async ({ subject }) => {
            launched.push(subject);
          }}
        />,
      );
    });
    await settle();
    act(() => {
      document.querySelector<HTMLButtonElement>('[data-media-viewer] [data-viewer-menu-button]')!.click();
    });
    const keys = Array.from(document.querySelectorAll('[data-media-viewer] [role="menuitem"]')).map((el) => el.getAttribute('data-viewer-menu-item'));
    expect(keys).toEqual(['share', 'imager']);
    act(() => {
      document.querySelector<HTMLElement>('[data-viewer-menu-item="imager"]')!.click();
    });
    await settle();
    expect(closed).toBe(1);
    expect(launched.map((subject) => subject.key)).toEqual(['comment:c-9:clip.mp4']);
    expect(launched[0]?.watermark).toBe('@alice');
  });
});
