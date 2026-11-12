import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from 'bun:test';

import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { speakerColor } from '@/lib/calls/call-speaker-color';
import type { CallMember } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallGrid, type CallGridProps } from './call-grid';
import { CALL_GRID_KIT } from './call-stage';

/**
 * LE HALO DE PAROLE D'UNE VIGNETTE DE GROUPE (P11.5, P14.4) — qui parle s'illumine de SA couleur, moi compris :
 * le calque unique de `SpeechRing`, au niveau reçu du flux de la personne, par son opacité seule (fondu, plus court
 * sous « Réduire les animations »). Une bascule ne rend que ce calque : la grille, elle, ne se rend pas.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const member = (userId: string, name: string, overrides: Partial<CallMember> = {}): CallMember => ({ userId, name, avatar: null, micMuted: false, cameraOn: false, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected', ...overrides }) as CallMember;

const voice = (): MediaStream => Object.defineProperty(new MediaStream(), 'getAudioTracks', { value: () => [{ kind: 'audio', readyState: 'live' }] });
let awa: MediaStream;
let bintou: MediaStream;
let mine: MediaStream;

/* Un niveau PAR flux que le témoin règle : l'analyseur rend un signal dont la valeur efficace vaut celle du flux que sa source lui branche (un contexte sert toutes les vignettes). */
const levels = new Map<MediaStream, number>();
type FakeAnalyser = { stream: MediaStream | null };
class FakeAudioContext {
  createMediaStreamSource(stream: MediaStream) {
    return { connect: (analyser: FakeAnalyser) => void (analyser.stream = stream), disconnect: () => undefined };
  }
  createAnalyser() {
    const analyser = { stream: null as MediaStream | null, fftSize: 0, connect: () => undefined, disconnect: () => undefined, getFloatTimeDomainData: (into: Float32Array) => into.fill(levels.get(analyser.stream as MediaStream) ?? 0) };
    return analyser;
  }
  resume = async () => undefined;
  close = async () => undefined;
}

const runs: { readonly target: Element; readonly frames: readonly Keyframe[]; readonly duration: number }[] = [];
const saved: { animate?: PropertyDescriptor | undefined; audio?: PropertyDescriptor | undefined; media?: PropertyDescriptor | undefined } = {};

beforeAll(async () => {
  await loadCallControlsCatalog('fr');
  await loadPillMotion();
  await import('@/lib/calls/peer-audio-meter');
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  [awa, bintou, mine] = [voice(), voice(), voice()] as [MediaStream, MediaStream, MediaStream];
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
beforeEach(() => {
  runs.length = 0;
  levels.clear();
  saved.animate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  saved.audio = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  saved.media = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, writable: true, value: FakeAudioContext });
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(this: Element, frames: Keyframe[], options: KeyframeAnimationOptions) {
      runs.push({ target: this, frames, duration: Number(options.duration) });
      return { finished: new Promise<void>(() => undefined), cancel: () => undefined, getAnimations: () => [] };
    },
  });
});
afterEach(() => {
  const restore = (target: object, key: string, descriptor: PropertyDescriptor | undefined) => (descriptor === undefined ? Reflect.deleteProperty(target, key) : Object.defineProperty(target, key, descriptor));
  restore(HTMLElement.prototype, 'animate', saved.animate);
  restore(globalThis, 'AudioContext', saved.audio);
  restore(window, 'matchMedia', saved.media);
  jest.useRealTimers();
});

let portraits = 0;
const kit = { ...CALL_GRID_KIT, Portrait: (props: Parameters<typeof CALL_GRID_KIT.Portrait>[0]) => ((portraits += 1), CALL_GRID_KIT.Portrait(props)) };

const props = (overrides: Partial<CallGridProps> = {}): CallGridProps => ({
  kit,
  members: [member('u-a', 'Awa'), member('u-b', 'Bintou')],
  remoteStreams: { 'u-a': awa, 'u-b': bintou },
  self: { id: 'u-me', stream: mine, cameraOn: false, mirrored: true, micMuted: false },
  choice: null,
  onChoose: () => undefined,
  immersive: false,
  onToggleImmersive: () => undefined,
  moderation: null,
  language: 'fr',
  ...overrides,
});

const mount = (overrides: Partial<CallGridProps> = {}, { reducedMotion = false }: { readonly reducedMotion?: boolean } = {}) => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: reducedMotion }) });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<CallGrid {...props(overrides)} />));
  return {
    ring: (slot: string) => host.querySelector(`[data-call-slot="${slot}"] [data-call-camera-off-speech]`) as HTMLElement | null,
    render: (next: Partial<CallGridProps>) => act(() => root.render(<CallGrid {...props(next)} />)),
    done: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

const settle = () => act(async () => {});
const tick = (ms: number) => act(() => jest.advanceTimersByTime(ms));

describe('CallGrid — le halo de qui parle (P11.5, P14.4)', () => {
  test('au repos, chaque calque est transparent et rien ne s’anime', async () => {
    jest.useFakeTimers();
    const view = mount();
    await settle();
    tick(1000);
    expect(['u-a', 'u-b', 'self'].map((slot) => view.ring(slot)?.style.opacity)).toEqual(['0', '0', '0']);
    expect(runs.filter((run) => run.target.hasAttribute('data-call-camera-off-speech'))).toHaveLength(0);
    view.done();
  });

  test('le niveau reçu d’une personne allume SA vignette, en fondu, à SA couleur — les autres restent éteintes', async () => {
    jest.useFakeTimers();
    const view = mount();
    await settle();
    levels.set(awa, 0.2);
    tick(400);
    expect(view.ring('u-a')?.style.opacity).toBe('1');
    expect(view.ring('u-b')?.style.opacity).toBe('0');
    expect(view.ring('self')?.style.opacity).toBe('0');
    expect(view.ring('u-a')?.style.getPropertyValue('--call-tint')).toBe(speakerColor('u-a'));
    expect(view.ring('u-a')?.getAttribute('data-call-speech-shape')).toBe('tile');
    expect(runs.at(-1)?.frames).toEqual([{ opacity: '0' }, { opacity: 1 }]);
    view.done();
  });

  test('ma vignette s’illumine aussi, à MA couleur, au niveau de mon micro', async () => {
    jest.useFakeTimers();
    const view = mount();
    await settle();
    levels.set(mine, 0.2);
    tick(400);
    expect(view.ring('self')?.style.opacity).toBe('1');
    expect(view.ring('self')?.style.getPropertyValue('--call-tint')).toBe(speakerColor('u-me'));
    view.done();
  });

  test('un silence bref ne l’éteint pas (hystérésis), un silence tenu l’éteint en fondu', async () => {
    jest.useFakeTimers();
    const view = mount();
    await settle();
    levels.set(awa, 0.2);
    tick(400);
    levels.set(awa, 0);
    tick(400);
    expect(view.ring('u-a')?.style.opacity).toBe('1');
    tick(1200);
    expect(view.ring('u-a')?.style.opacity).toBe('0');
    view.done();
  });

  test('le fondu dure 250 ms, 120 ms sous « Réduire les animations » (Web Animations, pas une transition CSS)', async () => {
    jest.useFakeTimers();
    const normal = mount();
    await settle();
    levels.set(awa, 0.2);
    tick(400);
    expect(runs.at(-1)?.duration).toBe(250);
    normal.done();
    runs.length = 0;
    levels.clear();
    const reduced = mount({}, { reducedMotion: true });
    await settle();
    levels.set(awa, 0.2);
    tick(400);
    expect(runs.at(-1)?.duration).toBe(120);
    reduced.done();
  });

  test('qui parle ne réagence ni ne rend la grille : seul le calque change (la vignette n’est pas rendue de nouveau)', async () => {
    jest.useFakeTimers();
    const view = mount();
    await settle();
    const rendered = portraits;
    levels.set(awa, 0.2);
    tick(400);
    levels.set(awa, 0);
    tick(2400);
    expect(portraits).toBe(rendered);
    view.done();
  });

  test('un invité qui sonne n’a pas de halo ; la vignette à la une et celles du bandeau gardent le leur', async () => {
    jest.useFakeTimers();
    const view = mount({ members: [member('u-a', 'Awa'), member('u-r', 'Rémi', { link: 'ringing' })], remoteStreams: { 'u-a': awa } });
    await settle();
    expect(view.ring('u-r')).toBeNull();
    view.render({ choice: { kind: 'member', userId: 'u-a' } });
    await settle();
    levels.set(awa, 0.2);
    tick(400);
    expect(view.ring('u-a')?.style.opacity).toBe('1');
    expect(view.ring('self')?.closest('[data-call-strip]')).not.toBeNull();
    view.done();
  });
});
