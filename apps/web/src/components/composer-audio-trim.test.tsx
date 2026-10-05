import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { typeInto } from '@/test-support/act-mount';
import { pendingAttachmentOf } from '@/lib/send/attachments';
import type { DecodedAudio } from '@/lib/media/audio-trim';

import ComposerAudioTrim from './composer-audio-trim';

/**
 * « ÉDITER » UN AUDIO EN ATTENTE LE COUPE (#9136) — début et fin choisis,
 * « Terminé » rend la pièce coupée à la bonne durée ; une fenêtre entière la
 * laisse telle quelle.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounted: Array<{ root: Root; host: HTMLElement }> = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach(({ root, host }) => (root.unmount(), host.remove())));
});

const tenSeconds: DecodedAudio = { sampleRate: 8000, numberOfChannels: 1, length: 80_000, getChannelData: () => new Float32Array(80_000) };
const vocal = () => pendingAttachmentOf(new File([new Uint8Array([1, 2])], 'vocal.webm', { type: 'audio/webm' }));

async function mountTrim() {
  const done: File[] = [];
  let cancelled = 0;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  await act(async () => {
    root.render(<ComposerAudioTrim attachment={vocal()} decode={async () => tenSeconds} onDone={(file) => done.push(file)} onCancel={() => (cancelled += 1)} />);
  });
  return { host, done, cancelled: () => cancelled };
}

const slide = (input: HTMLInputElement | null, value: number) => typeInto(input, String(value));

describe('couper un audio en attente', () => {
  test('début à 3 s, fin à 7 s : la pièce rendue dure 4 s', async () => {
    const { host, done } = await mountTrim();
    slide(host.querySelector<HTMLInputElement>('[data-audio-trim-start]'), 3);
    slide(host.querySelector<HTMLInputElement>('[data-audio-trim-end]'), 7);
    act(() => host.querySelector<HTMLButtonElement>('[data-audio-trim-done]')!.click());
    expect(done).toHaveLength(1);
    expect(done[0]!.type).toBe('audio/wav');
    const view = new DataView(await done[0]!.arrayBuffer());
    expect(view.getUint32(40, true) / view.getUint32(28, true)).toBeCloseTo(4, 2);
  });

  test('rien de coupé : « Terminé » laisse la pièce telle quelle', async () => {
    const { host, done, cancelled } = await mountTrim();
    act(() => host.querySelector<HTMLButtonElement>('[data-audio-trim-done]')!.click());
    expect(done).toHaveLength(0);
    expect(cancelled()).toBe(1);
  });
});
