import { describe, expect, test } from 'bun:test';

import type { MessageCardInput } from './message-card-layout';
import { recordCardGif, recordCardVideo } from './message-card-motion';

const input: MessageCardInput = {
  quoted: null,
  reply: { author: 'Jacques', text: 'Regarde' },
  handle: 'jacques',
  template: 'aurore.rond.orbite',
  media: [{ kind: 'video', width: 16, height: 9 }],
};

const unusedDocument = { createElement: () => ({ getContext: () => null }) } as unknown as Document;

describe('l’export animé — ce qui manque rend null, jamais une exception', () => {
  test('sans enregistreur, pas de vidéo', async () => {
    const blob = await recordCardVideo({
      input,
      sources: [null],
      track: { url: 'blob:v', kind: 'video', index: 0 },
      durationMs: 1000,
      env: { doc: unusedDocument, requestFrame: () => undefined, MediaRecorder: undefined, AudioContext: undefined },
    });
    expect(blob).toBeNull();
  });

  test('un enregistreur qui ne sait écrire aucun conteneur ne filme rien', async () => {
    const Recorder = { isTypeSupported: () => false } as unknown as typeof MediaRecorder;
    const blob = await recordCardVideo({
      input,
      sources: [null],
      track: { url: 'blob:v', kind: 'video', index: 0 },
      durationMs: 1000,
      env: { doc: unusedDocument, requestFrame: () => undefined, MediaRecorder: Recorder, AudioContext: undefined },
    });
    expect(blob).toBeNull();
  });

  test('un GIF ne se fait jamais d’un audio', async () => {
    const blob = await recordCardGif({ input, sources: [null], track: { url: 'blob:a', kind: 'audio', index: null }, durationMs: 1000, env: { doc: unusedDocument } });
    expect(blob).toBeNull();
  });

  test('un canvas refusé ne donne pas de GIF', async () => {
    const blob = await recordCardGif({ input, sources: [null], track: { url: 'blob:v', kind: 'video', index: 0 }, durationMs: 1000, env: { doc: unusedDocument } });
    expect(blob).toBeNull();
  });
});

class FakeVideo extends EventTarget {
  muted = false;
  playsInline = false;
  preload = '';
  src = '';
  videoWidth = 16;
  videoHeight = 9;
  load(): void {
    queueMicrotask(() => this.dispatchEvent(new Event('loadeddata')));
  }
  set currentTime(_: number) {
    queueMicrotask(() => this.dispatchEvent(new Event('seeked')));
  }
}

const recordingDocument = (calls: string[]): Document => {
  const gradient = { addColorStop: () => undefined };
  const ctx = new Proxy(
    {
      measureText: (text: string) => ({ width: text.length * 18 }),
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      drawImage: (source: { readonly id?: string }) => void calls.push(`draw:${source.id ?? '?'}`),
      clip: () => void calls.push('clip'),
    } as Record<string, unknown>,
    { get: (target, key: string) => (key in target ? target[key] : () => undefined), set: () => true },
  );
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  return { createElement: (tag: string) => (tag === 'video' ? new FakeVideo() : canvas) } as unknown as Document;
};

describe('l’export animé pose un sticker comme l’image fixe', () => {
  test('un PNG sans dimensions déclarées, reconnu sticker sur ses pixels, se peint ajusté — sans clip', async () => {
    const calls: string[] = [];
    const sticker: MessageCardInput = { ...input, media: [{ kind: 'image', width: 0, height: 0, mimeType: 'image/png' }] };
    const pixels = { id: 'sticker', width: 400, height: 200, naturalWidth: 400, naturalHeight: 200 } as unknown as HTMLImageElement;
    const blob = await recordCardGif({
      input: sticker,
      sources: [pixels],
      track: { url: 'blob:v', kind: 'video', index: null },
      durationMs: 100,
      env: { doc: recordingDocument(calls) },
      yieldFrame: () => Promise.resolve(),
    });
    expect(blob).not.toBeNull();
    const drawn = calls.indexOf('draw:sticker');
    expect(drawn).toBeGreaterThan(-1);
    expect(calls[drawn - 1]).not.toBe('clip');
  });
});
