import { describe, expect, test } from 'bun:test';

import type { SceneCarrier } from '@/lib/canvas/carrier';
import { parseCanvasDocument, type CanvasDocument } from '@/lib/canvas/document';

import { prepareSceneExport, type SceneAssetDeps } from './scene-export-assets';

const object = (raw: Record<string, unknown>) => ({ anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'content', z: 1, transform: {}, ...raw });

function documentOf(objects: readonly Record<string, unknown>[]): CanvasDocument {
  const parsed = parseCanvasDocument({ v: 3, scenes: [{ id: 's', objects: objects.map(object) }] });
  if (parsed === null) throw new Error('document de témoin invalide');
  return parsed;
}

const carrier: SceneCarrier = { postId: 'p', media: [] };

/** Un document qui charge ses éléments comme un navigateur : `load` / `loadeddata` après `src`. */
function fakeDocument(videoSeconds: ReadonlyMap<string, number>): Document {
  const element = (tag: string) => {
    const target = new EventTarget();
    let src = '';
    const node = Object.assign(target, {
      tag,
      decoding: '',
      muted: false,
      playsInline: false,
      preload: '',
      duration: Number.NaN,
      pause: () => undefined,
      removeAttribute: () => undefined,
      load: () => {
        node.duration = videoSeconds.get(src) ?? Number.NaN;
        setTimeout(() => target.dispatchEvent(new Event('loadeddata')), 0);
      },
    });
    Object.defineProperty(node, 'src', {
      get: () => src,
      set: (value: string) => {
        src = value;
        if (tag === 'img') setTimeout(() => target.dispatchEvent(new Event('load')), 0);
      },
    });
    return node;
  };
  return { createElement: element } as unknown as Document;
}

function depsOf(params: { readonly missing?: readonly string[]; readonly videoSeconds?: ReadonlyMap<string, number> }): SceneAssetDeps & { readonly fetched: string[] } {
  const fetched: string[] = [];
  return {
    fetched,
    doc: fakeDocument(params.videoSeconds ?? new Map()),
    fetchBlob: async (src) => {
      fetched.push(src);
      return params.missing?.includes(src) === true ? null : new Blob([src]);
    },
    createObjectURL: (blob) => `blob:${blob.size}`,
    revokeObjectURL: () => undefined,
    decodeAudio: async (data) => ({ duration: data.byteLength }) as AudioBuffer,
    timeoutMs: 200,
  };
}

describe('préparer l’export — les vraies durées des médias fixent le plan', () => {
  test('une vidéo de fond de 4 min fait une story de 4 min', async () => {
    const doc = documentOf([{ id: 'bg', kind: 'media', plane: 'bg', z: 0, payload: { mediaType: 'video/mp4', mediaURL: 'https://cdn/long.mp4', isBackground: true } }]);
    const deps = depsOf({ videoSeconds: new Map([['blob:20', 240]]) });
    const prepared = await prepareSceneExport({ document: doc, carrier, deps, signal: new AbortController().signal });
    if (prepared === 'cancelled') throw new Error('annulé');
    expect(prepared.plan.totalMs).toBe(240_000);
    expect(prepared.assets.video('https://cdn/long.mp4')).not.toBeNull();
  });

  test('chaque fichier ne se télécharge qu’une fois, même s’il sert l’image ET le son', async () => {
    const doc = documentOf([{ id: 'bg', kind: 'media', plane: 'bg', z: 0, payload: { mediaType: 'video/mp4', mediaURL: 'https://cdn/long.mp4', isBackground: true } }]);
    const deps = depsOf({ videoSeconds: new Map([['blob:20', 8]]) });
    const prepared = await prepareSceneExport({ document: doc, carrier, deps, signal: new AbortController().signal });
    expect(deps.fetched).toEqual(['https://cdn/long.mp4']);
    if (prepared === 'cancelled') throw new Error('annulé');
    expect(prepared.buffers.has('https://cdn/long.mp4')).toBe(true);
  });

  test('une pièce absente est nommée, et le reste se rend quand même', async () => {
    const doc = documentOf([
      { id: 'img', kind: 'media', payload: { mediaType: 'image/jpeg', mediaURL: 'https://cdn/gone.jpg' } },
      { id: 'voice', kind: 'audio', payload: { mediaURL: 'https://cdn/voice.m4a' } },
    ]);
    const prepared = await prepareSceneExport({ document: doc, carrier, deps: depsOf({ missing: ['https://cdn/gone.jpg'] }), signal: new AbortController().signal });
    if (prepared === 'cancelled') throw new Error('annulé');
    expect(prepared.missing).toEqual(['https://cdn/gone.jpg']);
    expect(prepared.plan.sounds.map((sound) => sound.src)).toEqual(['https://cdn/voice.m4a']);
  });

  test('annulé pendant le chargement, rien ne se rend', async () => {
    const controller = new AbortController();
    controller.abort();
    const doc = documentOf([{ id: 't', kind: 'text', payload: { text: 'x' } }]);
    expect(await prepareSceneExport({ document: doc, carrier, deps: depsOf({}), signal: controller.signal })).toBe('cancelled');
  });
});

describe('préparer l’export — une image animée s’anime (#13880)', () => {
  function twoFrameDecoder(closed: string[]) {
    class Decoder {
      static isTypeSupported = async (type: string) => type === 'image/gif';
      readonly tracks = { ready: Promise.resolve(), selectedTrack: { frameCount: 2 } };
      async decode({ frameIndex }: { frameIndex: number }) {
        return { image: { name: `frame-${frameIndex}`, duration: 100_000, close: () => closed.push(`frame-${frameIndex}`) } };
      }
      close() {}
    }
    return Decoder as unknown as typeof ImageDecoder;
  }

  const stickerDoc = () => documentOf([{ id: 'stk', kind: 'sticker', payload: { mediaURL: 'https://cdn/party.gif' } }]);

  test('un sticker GIF : la scène n’est plus une image fixe, et chaque instant a son image', async () => {
    const closed: string[] = [];
    const deps: SceneAssetDeps = {
      ...depsOf({}),
      fetchBlob: async () => new Blob([new Uint8Array([1])], { type: 'image/gif' }),
      imageDecoder: twoFrameDecoder(closed),
    };
    const prepared = await prepareSceneExport({ document: stickerDoc(), carrier, deps, signal: new AbortController().signal });
    if (prepared === 'cancelled') throw new Error('annulé');
    expect(prepared.plan.still).toBe(false);
    const nameAt = (ms: number) => (prepared.assets.imageAt?.('https://cdn/party.gif', ms) as unknown as { name?: string } | null)?.name;
    expect(nameAt(50)).toBe('frame-0');
    expect(nameAt(150)).toBe('frame-1');
    expect(nameAt(250)).toBe('frame-0');
    prepared.dispose();
    expect(closed.sort()).toEqual(['frame-0', 'frame-1']);
  });

  test('sans décodeur, le même sticker reste une image fixe', async () => {
    const deps: SceneAssetDeps = { ...depsOf({}), fetchBlob: async () => new Blob([new Uint8Array([1])], { type: 'image/gif' }) };
    const prepared = await prepareSceneExport({ document: stickerDoc(), carrier, deps, signal: new AbortController().signal });
    if (prepared === 'cancelled') throw new Error('annulé');
    expect(prepared.plan.still).toBe(true);
    expect(prepared.assets.imageAt?.('https://cdn/party.gif', 150) ?? null).toBeNull();
  });
});
