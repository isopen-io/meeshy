import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { pendingAttachmentOf, type PendingAttachment } from '@/lib/send/attachments';
import type { StudioRetouchDeps } from '@/lib/stories/studio-retouch';
import { flush, registerStudioBench } from '@/test-support/story-studio-bench';

import ComposerRetouch from './composer-retouch';
import ComposerTray from './composer-tray';

/**
 * « ÉDITER » UNE IMAGE DU FIL (#8416) — la vignette d'une image en attente
 * ouvre le studio plein écran en mode RETOUCHE ; seuls les contrôles qui
 * peignent y restent ; « Terminé » rend un JPEG qui remplace la pièce.
 */
registerStudioBench();

beforeAll(async () => {
  await Promise.all([import('@/routes/story-compose'), import('./composer-retouch'), import('@/lib/stories/studio-retouch')]);
});

const mounted: Array<{ root: Root; host: HTMLElement }> = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach(({ root, host }) => (root.unmount(), host.remove())));
});

function mount(element: React.ReactElement): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  act(() => root.render(element));
  return host;
}

const photo = (): PendingAttachment => pendingAttachmentOf(new File([new Uint8Array([1, 2, 3])], 'plage.png', { type: 'image/png' }));

/** Un canvas factice : la retouche rend un JPEG sans navigateur. */
const fakeRender: StudioRetouchDeps = {
  createCanvas: () => ({
    context: new Proxy({}, { get: (_t, key) => (key === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true }) as never,
    toBlob: async (type) => new Blob(['jpeg'], { type }),
  }),
  loadImage: async () => ({ naturalWidth: 4, naturalHeight: 3 }) as unknown as CanvasImageSource,
};

describe('la vignette d’une IMAGE en attente propose « Éditer »', () => {
  test('une image : le bouton ; un fichier : aucun', () => {
    const pdf = pendingAttachmentOf(new File([new Uint8Array([1])], 'notes.pdf', { type: 'application/pdf' }));
    const el = mount(
      <ComposerTray variant="above" pending={[photo(), pdf]} onRemove={() => undefined} onReplace={() => undefined} notice={null} place={null} onRemovePlace={() => undefined} />,
    );
    expect(el.querySelectorAll('[data-composer-edit]')).toHaveLength(1);
    expect(el.querySelector('[data-composer-edit]')?.getAttribute('aria-label')).toBe('Éditer plage.png');
  });

  test('toucher la vignette ouvre le studio en RETOUCHE, par-dessus le fil', async () => {
    const el = mount(
      <ComposerTray variant="above" pending={[photo()]} onRemove={() => undefined} onReplace={() => undefined} notice={null} place={null} onRemovePlace={() => undefined} />,
    );
    act(() => el.querySelector<HTMLButtonElement>('[data-composer-edit]')!.click());
    await flush(() => document.querySelector('[data-composer-retouch] [data-story-studio]') !== null);
    expect(document.querySelector('[data-composer-retouch] [data-story-retouch-done]')).not.toBeNull();
  });
});

describe('le studio en RETOUCHE — seulement ce qui peint', () => {
  test('ni audience, ni formats, ni Animé, ni ⋯, ni nouvelle scène, ni son, ni texte du post, ni légende', async () => {
    const el = mount(<ComposerRetouch attachment={photo()} onDone={() => undefined} onCancel={() => undefined} render={fakeRender} />);
    await flush(() => el.querySelector('[data-scene-player]') !== null);
    for (const absent of [
      '[data-story-audience]',
      '[data-story-publish]',
      '[data-story-animated]',
      '[data-story-studio-more]',
      '[data-story-option="add-page"]',
      'input[data-door="sound"]',
      '[data-story-post-text]',
      '#story-studio-caption-visual',
    ]) {
      expect(el.querySelector(absent)).toBeNull();
    }
    for (const present of ['input[data-door="visual"]', 'input[data-door="overlay"]', '[data-story-option="add-text"]', '[data-story-option="frame"]', '[data-story-retouch-done]']) {
      expect(el.querySelector(present)).not.toBeNull();
    }
  });

  test('« Terminé » rend un JPEG nommé d’après l’image — et rien n’est téléversé', async () => {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response('{}');
    }) as typeof fetch;
    try {
      let done: File | null = null;
      const el = mount(<ComposerRetouch attachment={photo()} onDone={(file) => (done = file)} onCancel={() => undefined} render={fakeRender} />);
      await flush(() => el.querySelector('[data-story-retouch-done]') !== null);
      act(() => el.querySelector<HTMLButtonElement>('[data-story-retouch-done]')!.click());
      await flush(() => done !== null);
      expect((done as File | null)?.name).toBe('plage-retouche.jpg');
      expect((done as File | null)?.type).toBe('image/jpeg');
      expect(calls).toEqual([]);
    } finally {
      globalThis.fetch = original;
    }
  });

  test('✕ referme sans rien rendre', async () => {
    let cancelled = false;
    let done = false;
    const el = mount(<ComposerRetouch attachment={photo()} onDone={() => (done = true)} onCancel={() => (cancelled = true)} render={fakeRender} />);
    await flush(() => el.querySelector('[data-story-retouch-cancel]') !== null);
    act(() => el.querySelector<HTMLButtonElement>('[data-story-retouch-cancel]')!.click());
    expect(cancelled).toBe(true);
    expect(done).toBe(false);
  });
});
