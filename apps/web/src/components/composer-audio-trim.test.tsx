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

const tenSeconds = (level = 0): DecodedAudio => ({ sampleRate: 8000, numberOfChannels: 1, length: 80_000, getChannelData: () => new Float32Array(80_000).fill(level) });
const vocal = () => pendingAttachmentOf(new File([new Uint8Array([1, 2])], 'vocal.webm', { type: 'audio/webm' }));

async function mountTrim(audio: DecodedAudio = tenSeconds()) {
  const done: File[] = [];
  let cancelled = 0;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  await act(async () => {
    root.render(<ComposerAudioTrim attachment={vocal()} decode={async () => audio} onDone={(file) => done.push(file)} onCancel={() => (cancelled += 1)} />);
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

const tool = (host: HTMLElement, name: string) => host.querySelector<HTMLButtonElement>(`[data-audio-tool="${name}"]`)!;
const firstSample = async (file: File) => new DataView(await file.arrayBuffer()).getInt16(44, true) / 0x7fff;

describe('les outils de l’éditeur audio (#9164, ordre d’iOS)', () => {
  test('les outils se suivent comme sur iOS, « Rogner » d’abord', async () => {
    const { host } = await mountTrim();
    expect([...host.querySelectorAll('[data-audio-tool]')].map((node) => node.getAttribute('data-audio-tool'))).toEqual(['trim', 'volume']);
    expect(tool(host, 'trim').getAttribute('aria-pressed')).toBe('true');
  });

  test('Volume à 150 % : la pièce rendue porte le gain sur ses échantillons', async () => {
    const { host, done } = await mountTrim(tenSeconds(0.2));
    act(() => tool(host, 'volume').click());
    expect(host.textContent).toContain('Normal');
    slide(host.querySelector<HTMLInputElement>('[data-audio-volume]'), 1.5);
    expect(host.textContent).toContain('150');
    act(() => host.querySelector<HTMLButtonElement>('[data-audio-trim-done]')!.click());
    expect(done).toHaveLength(1);
    expect(await firstSample(done[0]!)).toBeCloseTo(0.3, 3);
  });

  test('la coupe et le volume se cuisent ensemble', async () => {
    const { host, done } = await mountTrim(tenSeconds(0.2));
    slide(host.querySelector<HTMLInputElement>('[data-audio-trim-start]'), 2);
    act(() => tool(host, 'volume').click());
    slide(host.querySelector<HTMLInputElement>('[data-audio-volume]'), 0.5);
    act(() => host.querySelector<HTMLButtonElement>('[data-audio-trim-done]')!.click());
    const view = new DataView(await done[0]!.arrayBuffer());
    expect(view.getUint32(40, true) / view.getUint32(28, true)).toBeCloseTo(8, 2);
    expect(await firstSample(done[0]!)).toBeCloseTo(0.1, 3);
  });
});
