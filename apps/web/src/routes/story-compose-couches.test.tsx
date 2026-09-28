import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, test } from 'bun:test';

import { createStudioDraftStore } from '@/lib/stories/studio-draft-store';
import { pendingAttachmentOf } from '@/lib/send/attachments';
import type { StudioRetouchDeps } from '@/lib/stories/studio-retouch';
import { VIEWER_ID, flush, harness, image, mount, onePageSnapshot, registerStudioBench, selectFile, typeText } from '@/test-support/story-studio-bench';

import ComposerRetouch from '@/components/composer-retouch';

/**
 * LES COUCHES DU STUDIO (#8517) — Cadre, plaque d'édition, frise, texte du
 * post et menu d'un objet sont des COUCHES : le retour matériel de la coque
 * Android (un `popstate`) et Échap ferment la plus HAUTE, jamais le studio ni
 * la retouche qui les porte. Au bureau, les plaques restent bornées et
 * centrées (la géométrie est mesurée au navigateur) ; l'invite « Ajouter du
 * texte » ne se peint pas sous un calque sélectionné.
 */
registerStudioBench();

const click = (element: Element | null) => {
  if (element === null) throw new Error('élément absent');
  act(() => (element as HTMLElement).click());
};

const elements: Array<{ root: Root; host: HTMLElement }> = [];
afterEach(() => {
  act(() => elements.splice(0).forEach(({ root, host }) => (root.unmount(), host.remove())));
});

function mountElement(element: React.ReactElement): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  elements.push({ root, host });
  act(() => root.render(element));
  return host;
}

const back = () => act(() => window.dispatchEvent(new PopStateEvent('popstate')));
const escape = () => act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));

const seeded = () => {
  const drafts = createStudioDraftStore(null);
  drafts.set(
    VIEWER_ID,
    onePageSnapshot({
      texts: [],
      background: { postMediaId: 'pm-bg', fileUrl: '2026/09/u/bg.jpg', mediaType: 'image', aspectRatio: 9 / 16 },
      overlay: { postMediaId: 'pm-ov', fileUrl: '2026/09/u/ov.jpg', mediaType: 'image', aspectRatio: 1 },
    }),
  );
  return harness({ drafts });
};

const tokens = (element: Element | null) => (element?.className ?? '').split(/\s+/);
/** La borne commune des plaques (`STUDIO_PLATE`) : 36 rem au plus, centrée. */
const bounded = (element: Element | null) => ['max-w-xl', 'mx-auto', 'w-full'].filter((token) => !tokens(element).includes(token));

describe('au bureau, les plaques restent BORNÉES et centrées', () => {
  test('le Cadre, la plaque d’édition et la frise portent la même borne', async () => {
    const el = mount(harness({}).deps);
    selectFile(el, 'visual', image());
    click(el.querySelector('[data-story-option="frame"]'));
    await flush(() => el.querySelector('[data-story-frame-panel]') !== null);
    expect(bounded(el.querySelector('[data-story-frame-panel]'))).toEqual([]);
    click(el.querySelector('[data-story-frame-done]'));

    typeText(el, 'Bonjour');
    click(el.querySelector('[data-story-object-edit="text-1"]'));
    await flush(() => el.querySelector('[data-story-edit-plaque]') !== null);
    expect(bounded(el.querySelector('[data-story-edit-plaque]'))).toEqual([]);
    click(el.querySelector('[data-story-edit-done]'));

    click(el.querySelector('[data-story-animated]'));
    await flush(() => el.querySelector('[data-story-timeline]') !== null);
    expect(bounded(el.querySelector('[data-story-timeline]'))).toEqual([]);
  });

  test('le texte du post aussi', async () => {
    const el = mount(harness({}).deps, 'POST');
    typeText(el, 'Sur la scène');
    click(el.querySelector('[data-story-post-text]'));
    await flush(() => el.querySelector('[data-story-post-text-frame]') !== null);
    expect(bounded(el.querySelector('[data-story-post-text-frame]'))).toEqual([]);
  });
});

describe('le retour matériel ferme la couche du DESSUS, jamais le studio', () => {
  test('Cadre ouvert : le retour ferme le Cadre, le studio reste', async () => {
    const el = mount(harness({}).deps);
    selectFile(el, 'visual', image());
    click(el.querySelector('[data-story-option="frame"]'));
    await flush(() => el.querySelector('[data-story-frame-panel]') !== null);
    back();
    await flush(() => el.querySelector('[data-story-frame-panel]') === null);
    expect(el.querySelector('[data-story-frame-panel]')).toBeNull();
    expect(el.querySelector('[data-story-studio]')).not.toBeNull();
  });

  test('plaque d’édition ouverte : le retour la ferme', async () => {
    const el = mount(harness({}).deps);
    typeText(el, 'Bonjour');
    click(el.querySelector('[data-story-object-edit="text-1"]'));
    await flush(() => el.querySelector('[data-story-edit-plaque]') !== null);
    back();
    await flush(() => el.querySelector('[data-story-edit-plaque]') === null);
    expect(el.querySelector('[data-story-edit-plaque]')).toBeNull();
  });

  test('frise ouverte : le retour la referme, la scène garde son texte', async () => {
    const el = mount(harness({}).deps);
    typeText(el, 'Bonjour');
    click(el.querySelector('[data-story-animated]'));
    await flush(() => el.querySelector('[data-story-timeline]') !== null);
    back();
    await flush(() => el.querySelector('[data-story-timeline]') === null);
    expect(el.querySelector('[data-story-timeline]')).toBeNull();
    expect(el.querySelector('[data-story-animated]')?.getAttribute('data-story-animated')).toBe('off');
  });

  test('texte du post ouvert : le retour le ferme', async () => {
    const el = mount(harness({}).deps, 'POST');
    typeText(el, 'Sur la scène');
    click(el.querySelector('[data-story-post-text]'));
    await flush(() => el.querySelector('[data-story-post-text-frame]') !== null);
    back();
    await flush(() => el.querySelector('[data-story-post-text-frame]') === null);
    expect(el.querySelector('[data-story-post-text-frame]')).toBeNull();
  });

  test('menu d’un objet ouvert : le retour le ferme', async () => {
    const el = mount(harness({}).deps);
    typeText(el, 'Un');
    await flush(() => el.querySelector('[data-scene-object-id="text-1"]') !== null);
    const layer = el.querySelector<HTMLElement>('[data-story-stage-gestures]')!;
    const painted = el.querySelector<HTMLElement>('[data-scene-object-id="text-1"]')!;
    painted.getBoundingClientRect = () => ({ left: 10, top: 10, width: 100, height: 40, right: 110, bottom: 50, x: 10, y: 10, toJSON: () => ({}) }) as DOMRect;
    act(() => layer.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 30 })));
    await flush(() => document.querySelector('[data-story-object-menu]') !== null);
    back();
    await flush(() => document.querySelector('[data-story-object-menu]') === null);
    expect(document.querySelector('[data-story-object-menu]')).toBeNull();
    expect(el.querySelector('[data-story-studio]')).not.toBeNull();
  });
});

/** Un canvas factice : la retouche rend un JPEG sans navigateur. */
const fakeRender: StudioRetouchDeps = {
  createCanvas: () => ({
    context: new Proxy({}, { get: (_t, key) => (key === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true }) as never,
    toBlob: async (type) => new Blob(['jpeg'], { type }),
  }),
  loadImage: async () => ({ naturalWidth: 4, naturalHeight: 3 }) as unknown as CanvasImageSource,
};

describe('Échap ferme la couche du DESSUS seule', () => {
  test('retouche + Cadre : Échap ferme le Cadre, la retouche reste ouverte', async () => {
    const cancels: string[] = [];
    const photo = pendingAttachmentOf(new File([new Uint8Array([1, 2, 3])], 'plage.png', { type: 'image/png' }));
    const el = mountElement(<ComposerRetouch attachment={photo} onDone={() => undefined} onCancel={() => cancels.push('cancel')} render={fakeRender} />);
    await flush(() => el.querySelector('[data-story-option="frame"]') !== null);
    click(el.querySelector('[data-story-option="frame"]'));
    await flush(() => el.querySelector('[data-story-frame-panel]') !== null);
    escape();
    await flush(() => el.querySelector('[data-story-frame-panel]') === null);
    expect(el.querySelector('[data-story-frame-panel]')).toBeNull();
    expect(cancels).toEqual([]);
    escape();
    expect(cancels).toEqual(['cancel']);
  });

  test('menu d’un objet par-dessus la plaque d’édition : Échap ferme le menu, la plaque reste', async () => {
    const el = mount(seeded().deps, 'STORY');
    await flush(() => el.querySelector('[data-story-object-edit="overlay"]') !== null);
    click(el.querySelector('[data-story-object-edit="overlay"]'));
    await flush(() => el.querySelector('[data-story-edit-plaque]') !== null);
    const layer = el.querySelector<HTMLElement>('[data-story-stage-gestures]')!;
    const painted = el.querySelector<HTMLElement>('[data-scene-object-id="overlay"]')!;
    painted.getBoundingClientRect = () => ({ left: 10, top: 10, width: 100, height: 40, right: 110, bottom: 50, x: 10, y: 10, toJSON: () => ({}) }) as DOMRect;
    act(() => layer.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 30 })));
    await flush(() => document.querySelector('[data-story-object-menu]') !== null);
    escape();
    await flush(() => document.querySelector('[data-story-object-menu]') === null);
    expect(document.querySelector('[data-story-object-menu]')).toBeNull();
    expect(el.querySelector('[data-story-edit-plaque]')).not.toBeNull();
  });
});

describe('l’invite « Ajouter du texte » ne se peint pas sous un calque', () => {
  test('le calque sélectionné : aucune invite sur la saisie de texte', async () => {
    const el = mount(seeded().deps, 'STORY');
    await flush(() => el.querySelector('[data-story-object-edit="overlay"]') !== null);
    click(el.querySelector('[data-story-object-edit="overlay"]'));
    await flush(() => el.querySelector('[data-story-overlay-editor]') !== null);
    expect(el.querySelector('#story-studio-text')?.getAttribute('placeholder') ?? null).toBeNull();
  });
});
