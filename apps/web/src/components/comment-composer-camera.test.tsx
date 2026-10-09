import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { MAX_POST_MEDIA } from '@meeshy/shared/types/attachment';

import { appQueryClient } from '@/lib/api/query-client';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { pendingAttachmentOf } from '@/lib/send/attachments';
import type { CameraEngine } from '@/lib/stories/studio-camera-engine';
import type { StudioRetouchDeps } from '@/lib/stories/studio-retouch';
import { flush, registerStudioBench } from '@/test-support/story-studio-bench';

import { CommentComposer } from './comment-composer';
import { CommentThread } from './comment-thread';
import { PublicationCommentsSheet } from './publication-comments-sheet';

/**
 * #9736 — **LA CAMÉRA DU COMPOSEUR DE COMMENTAIRE** (décision porteur du
 * 2026-10-09) : à DROITE de la rangée d'outils, le glyphe et le libellé de la
 * caméra du message, et le MÊME studio de capture (`ComposerCapture`) ; la
 * prise retombe dans le plateau des pièces, sous la borne du serveur.
 */
registerStudioBench();

beforeAll(async () => {
  await Promise.all([
    loadInterfaceCatalog('fr'),
    loadInterfaceCatalog('ar'),
    import('@/routes/story-compose'),
    import('./composer-retouch'),
    import('./composer-tray'),
    import('@/lib/stories/studio-retouch'),
    import('@/routes/story-compose-camera'),
  ]);
});

const mounted: Array<{ root: Root; host: HTMLElement }> = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach(({ root, host }) => (root.unmount(), host.remove())));
  appQueryClient.clear();
});

function mount(element: React.ReactElement): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  act(() => root.render(element));
  return host;
}

const taken = new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' });

function camera(): CameraEngine {
  return {
    open: async () => ({ ok: true, stream: new MediaStream(), torch: false, zoom: { mode: 'hardware', min: 1, max: 8, step: 0.1 } }),
    live: async () => undefined,
    lit: async () => undefined,
    setTorch: async () => undefined,
    setZoom: async () => undefined,
    photo: async () => taken,
    startRecording: () => undefined,
    stopRecording: async () => new File(['mp4'], 'video.mp4', { type: 'video/mp4' }),
    release: () => undefined,
    maxBrightness: async () => null,
  };
}

const render: StudioRetouchDeps = {
  createCanvas: () => ({
    context: new Proxy({}, { get: (_t, key) => (key === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true }) as never,
    toBlob: async (type) => new Blob(['jpeg'], { type }),
  }),
  loadImage: async () => ({ naturalWidth: 4, naturalHeight: 3 }) as unknown as CanvasImageSource,
};

const composeur = (language: 'fr' | 'ar' = 'fr', draft?: { text: string; pending: ReturnType<typeof pendingAttachmentOf>[] }) => (
  <CommentComposer language={language} canWrite onSend={async () => ({ ok: true })} capture={{ camera: camera(), render }} {...(draft === undefined ? {} : { draft })} />
);

async function prendre(host: HTMLElement): Promise<void> {
  act(() => host.querySelector<HTMLButtonElement>('[data-comment-camera]')?.click());
  await flush(() => document.querySelector('[data-composer-capture] [data-story-camera="live"]') !== null);
  act(() => document.querySelector<HTMLElement>('[data-story-camera-preview]')?.click());
  await flush(() => document.querySelector('[data-story-camera]') === null && document.querySelector('[data-story-option="frame"]') !== null);
  act(() => document.querySelector<HTMLButtonElement>('[data-story-retouch-done]')?.click());
  await flush(() => document.querySelector('[data-composer-capture]') === null);
}

describe('la caméra du composeur de commentaire (#9736)', () => {
  test('un BOUTON nommé, le dernier de la rangée d’outils, poussé au bord de fin', () => {
    const host = mount(composeur());
    const door = host.querySelector<HTMLButtonElement>('[data-comment-tools] [data-comment-camera]');
    expect(door?.tagName).toBe('BUTTON');
    expect(door?.type).toBe('button');
    expect(door?.getAttribute('aria-label')).toBe('Prendre une photo');
    expect(door?.querySelector('svg')).not.toBeNull();
    expect(host.querySelector('[data-comment-tools]')?.lastElementChild).toBe(door ?? null);
    expect(door?.style.marginInlineStart).toBe('auto');
  });

  test('nommé dans la langue du lecteur', () => {
    const host = mount(composeur('ar'));
    expect(host.querySelector('[data-comment-camera]')?.getAttribute('aria-label')).toBe('التقاط صورة');
  });

  test('il ouvre le studio de capture du message, viseur armé ; la prise retombe dans le plateau', async () => {
    const host = mount(composeur());
    await prendre(host);
    await flush(() => host.querySelector('[data-pending-tile]') !== null);
    expect(host.querySelectorAll('[data-pending-tile]')).toHaveLength(1);
    expect(host.querySelector('[data-pending-tile] img')).not.toBeNull();
    expect(host.querySelector<HTMLButtonElement>('[data-comment-send]')?.disabled).toBe(false);
  });

  test('plateau plein : la prise est écartée EN LE DISANT', async () => {
    const pleine = Array.from({ length: MAX_POST_MEDIA }, (_, i) => pendingAttachmentOf(new File([new Uint8Array([i])], `p${i}.jpg`, { type: 'image/jpeg' })));
    const host = mount(composeur('fr', { text: '', pending: pleine }));
    await flush(() => host.querySelectorAll('[data-pending-tile]').length === MAX_POST_MEDIA);
    await prendre(host);
    expect(host.querySelectorAll('[data-pending-tile]')).toHaveLength(MAX_POST_MEDIA);
    expect(host.querySelector('[data-comment-notice]')?.textContent).toBe(`Pas plus de ${MAX_POST_MEDIA} pièces jointes par commentaire.`);
  });

  test('« Annuler » referme sans rien joindre', async () => {
    const host = mount(composeur());
    act(() => host.querySelector<HTMLButtonElement>('[data-comment-camera]')?.click());
    await flush(() => document.querySelector('[data-story-retouch-done]') !== null);
    act(() => document.querySelector<HTMLButtonElement>('[data-story-retouch-done]')?.click());
    await flush(() => document.querySelector('[data-composer-capture]') === null);
    expect(host.querySelector('[data-pending-tile]')).toBeNull();
  });
});

describe('la caméra est montée chez les hôtes de commentaire (#9736)', () => {
  const dans = (node: React.ReactElement) => <QueryClientProvider client={appQueryClient}>{node}</QueryClientProvider>;

  test('le détail d’un post (`CommentThread`)', async () => {
    const host = mount(dans(<CommentThread postId="post-text-rank2" />));
    await flush(() => host.querySelector('[data-comment-camera]') !== null);
    expect(host.querySelector('[data-comment-camera]')).not.toBeNull();
  });

  test('la feuille d’une story ou d’un réel (`PublicationCommentsSheet`)', async () => {
    mount(dans(<PublicationCommentsSheet postId="post-text-rank2" onClose={() => undefined} />));
    await flush(() => document.querySelector('[data-comment-camera]') !== null);
    expect(document.querySelector('[data-comment-camera]')).not.toBeNull();
  });
});
