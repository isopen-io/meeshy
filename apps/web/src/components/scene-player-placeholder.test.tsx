import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { SceneCarrier } from '@/lib/canvas/carrier';
import { parseCanvasDocument, type CanvasDocument } from '@/lib/canvas/document';

import ScenePlayer from './scene-player';
import { SceneWaitingSurface } from './scene-waiting-surface';

/**
 * #5047 — UNE SCÈNE NE S'OUVRE PAS SUR DU VIDE. L'empreinte (`thumbHash`) du
 * média de fond, à défaut celle du composite, se peint SOUS le média tant que
 * ses pixels n'ont pas paru, puis s'efface en fondu ; un média déjà peint dans
 * la session se repose sans placeholder ni fondu (miroir
 * `StoryBackgroundLayer.swift`, cache chaud ⇒ aucun placeholder).
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

function mount(node: ReactElement): HTMLDivElement {
  container = window.document.createElement('div');
  window.document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return container;
}

const HASH = '3nQFFAT4WIiod4WYZ6joeo+u9w==';

function documentOf(payload: Record<string, unknown>, sceneHash?: string): CanvasDocument {
  const fond = { id: 'bg', kind: 'media', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'bg', z: 0, transform: { scale: 1, rotation: 0, opacity: 1 }, payload };
  const doc = parseCanvasDocument({ v: 3, scenes: [{ id: 's1', objects: [fond], ...(sceneHash !== undefined ? { thumbHash: sceneHash } : {}) }] });
  if (doc === null) throw new Error('document invalide');
  return doc;
}

const player = (document: CanvasDocument, src: string, mediaType?: string) => {
  const carrier: SceneCarrier = { postId: 'p1', media: [{ id: 'm', src, ...(mediaType !== undefined ? { mimeType: mediaType } : {}) }] };
  return <ScenePlayer document={document} sceneIndex={0} mode="card" playing={false} carrier={carrier} preferredLanguages={['fr']} />;
};

const placeholderOf = (el: HTMLElement) => el.querySelector('[data-scene-placeholder]') as HTMLImageElement | null;
const imageOf = (el: HTMLElement) => el.querySelector('img:not([data-scene-placeholder]):not([data-scene-letterbox])') as HTMLImageElement | null;

describe('ScenePlayer — le placeholder ThumbHash du fond', () => {
  test('un fond IMAGE pas encore chargé ⇒ son empreinte COMPLÈTE peinte SOUS le média, qui attend voilé', () => {
    const el = mount(player(documentOf({ postMediaId: 'm', thumbHash: HASH }), 'https://cdn/a.jpg'));
    const placeholder = placeholderOf(el);
    const media = imageOf(el);
    expect(placeholder?.getAttribute('src')).toMatch(/^data:image\/bmp;base64,/);
    expect(placeholder?.style.opacity).toBe('1');
    expect(media?.style.opacity).toBe('0');
    const position = placeholder !== null && media !== null ? placeholder.compareDocumentPosition(media) : 0;
    expect((position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
  });

  test('à l’arrivée des pixels, le média paraît en fondu et le placeholder s’efface', () => {
    const el = mount(player(documentOf({ postMediaId: 'm', thumbHash: HASH }), 'https://cdn/b.jpg'));
    act(() => {
      imageOf(el)?.dispatchEvent(new window.Event('load'));
    });
    expect(imageOf(el)?.style.opacity).toBe('1');
    expect(imageOf(el)?.style.transition).toContain('opacity');
    expect(placeholderOf(el)?.style.opacity).toBe('0');
  });

  test('un média DÉJÀ peint dans la session se repose sans placeholder ni voile — aucun clignotement', () => {
    const first = mount(player(documentOf({ postMediaId: 'm', thumbHash: HASH }), 'https://cdn/c.jpg'));
    act(() => {
      imageOf(first)?.dispatchEvent(new window.Event('load'));
    });
    act(() => {
      root.unmount();
    });
    container.remove();
    const again = mount(player(documentOf({ postMediaId: 'm', thumbHash: HASH }), 'https://cdn/c.jpg'));
    expect(placeholderOf(again)).toBeNull();
    expect(imageOf(again)?.style.opacity).toBe('');
  });

  test('une image en ÉCHEC garde son placeholder — un état dessiné, jamais une icône cassée', () => {
    const el = mount(player(documentOf({ postMediaId: 'm', thumbHash: HASH }), 'https://cdn/d.jpg'));
    act(() => {
      imageOf(el)?.dispatchEvent(new window.Event('error'));
    });
    expect(placeholderOf(el)?.style.opacity).toBe('1');
  });

  test('sans empreinte de média, celle du COMPOSITE de la scène', () => {
    const el = mount(player(documentOf({ postMediaId: 'm' }, HASH), 'https://cdn/e.jpg'));
    expect(placeholderOf(el)?.getAttribute('src')).toMatch(/^data:image\/bmp;base64,/);
  });

  test('aucune empreinte ⇒ aucun placeholder, et le média n’est pas voilé', () => {
    const el = mount(player(documentOf({ postMediaId: 'm' }), 'https://cdn/f.jpg'));
    expect(placeholderOf(el)).toBeNull();
    expect(imageOf(el)?.style.opacity).toBe('');
  });

  test('un fond VIDÉO : le placeholder dessous, la vidéo jamais voilée (son poster doit rester visible), effacé à `loadeddata`', () => {
    const el = mount(player(documentOf({ postMediaId: 'm', mediaType: 'video/mp4', thumbHash: HASH }), 'https://cdn/g.mp4', 'video/mp4'));
    const video = el.querySelector('video');
    expect(placeholderOf(el)?.style.opacity).toBe('1');
    expect(video?.style.opacity).toBe('');
    act(() => {
      video?.dispatchEvent(new window.Event('loadeddata'));
    });
    expect(placeholderOf(el)?.style.opacity).toBe('0');
  });
});

describe('SceneWaitingSurface — la scène avant que le moteur ne soit chargé', () => {
  test('l’empreinte du composite, peinte sur la couleur de fond', () => {
    const el = mount(<SceneWaitingSurface scene={documentOf({ postMediaId: 'm' }, HASH).scenes[0]!} />);
    const surface = el.querySelector('[data-scene-waiting]') as HTMLElement | null;
    expect(surface?.style.background).toBe('var(--color-ios-card)');
    expect(surface?.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/bmp;base64,/);
  });

  test('sans empreinte : la couleur du fond seule, jamais une image vide', () => {
    const el = mount(<SceneWaitingSurface scene={documentOf({ background: '4338CA' }).scenes[0]!} />);
    const surface = el.querySelector('[data-scene-waiting]') as HTMLElement | null;
    expect(surface?.style.background).toBe('#4338CA');
    expect(surface?.querySelector('img')).toBeNull();
  });
});
