import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { speakerColor } from '@/lib/calls/call-speaker-color';
import type { CallCaption } from '@/lib/calls/call-captions';
import { DEFAULT_SELF_CORNER, DEFAULT_SELF_TILE, selfTileStore } from '@/lib/calls/call-self-tile';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { loadPillMotion } from '@/lib/calls/use-pill-motion';

import { CallStage } from './call-stage';

/** G4 — la caméra de l'autre est coupée : la scène noire porte son avatar à SA couleur, l'icône caméra, et l'anneau + le halo à la seule parole. L'image cède la place à l'avatar (et revient) en fondu. */

const video = { kind: 'video', readyState: 'live', getCapabilities: () => ({}), getSettings: () => ({}), applyConstraints: async () => undefined };
const voice = { kind: 'audio', readyState: 'live' };
const stream = (): MediaStream => Object.assign(Object.create(MediaStream.prototype) as MediaStream, { getVideoTracks: () => [video], getAudioTracks: () => [voice], getTracks: () => [video, voice] });

/* Le niveau reçu que le témoin règle : l'analyseur rend un signal dont la valeur efficace vaut `level.now` (comme le duo audio). */
const level = { now: 0 };
const metered: MediaStream[] = [];
class FakeAudioContext {
  state = 'running';
  createMediaStreamSource(source: MediaStream) {
    metered.push(source);
    return { connect: () => undefined, disconnect: () => undefined };
  }
  createAnalyser() {
    return { fftSize: 0, connect: () => undefined, disconnect: () => undefined, getFloatTimeDomainData: (into: Float32Array) => into.fill(level.now) };
  }
  resume = async () => undefined;
  close = async () => undefined;
}
const member = (overrides: Partial<CallMember> = {}): CallMember => ({ userId: 'u-peer', name: 'Awa Diallo', avatar: null, micMuted: false, cameraOn: false, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected', ...overrides }) as CallMember;
const speech = (isFinal: boolean): CallCaption => ({ id: 's', speakerId: 'u-peer', speakerName: 'Awa', original: '…', translated: null, pair: null, isFinal, at: 1, mine: false }) as CallCaption;

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall =>
  ({
    callId: 'call-off', conversationId: 'c-1', media: 'video', direction: 'outgoing', isGroup: false, title: 'Awa', avatar: null, callerName: null, phase: { kind: 'connected' }, connectedAt: 0, endedDurationSec: null,
    micMuted: false, cameraOn: true, facing: 'user', screenSharing: false, members: { 'u-peer': member() }, display: 'full', localStream: stream(), remoteStreams: { 'u-peer': stream() }, captions: [], captionsMode: 'off',
    captionPeers: [], preview: null, previewed: false, transcription: 'idle', initiatorId: null, invitedBy: null, quality: null, ...overrides,
  }) as ActiveCall;

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
beforeAll(async () => {
  await loadCallControlsCatalog('fr');
  await loadPillMotion();
  await import('@/lib/calls/peer-audio-meter');
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const self = { full: false, onToggle: () => undefined, zoom: 'step' as const, column: () => null };
const stage = (active: ActiveCall) => <CallStage call={active} layout="video-duo" language="fr" choice={null} onChoose={() => undefined} immersive={false} onToggleImmersive={() => undefined} moderation={null} self={self} chromeVisible />;

const mount = (active: ActiveCall, { reducedMotion = false }: { readonly reducedMotion?: boolean } = {}) => {
  selfTileStore.setState({ callId: null, scale: DEFAULT_SELF_TILE, corner: DEFAULT_SELF_CORNER });
  const saved = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: reducedMotion }) });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(stage(active)));
  return {
    find: (selector: string) => host.querySelector(selector) as HTMLElement | null,
    render: (next: ActiveCall) => act(() => root.render(stage(next))),
    done: () => {
      act(() => root.unmount());
      host.remove();
      if (saved === undefined) Reflect.deleteProperty(window, 'matchMedia');
      else Object.defineProperty(window, 'matchMedia', saved);
    },
  };
};

/**
 * Le fondu se joue par Web Animations : la règle générale de « Réduire les animations »
 * (`app.css`, `transition-duration: 0s !important`) éteindrait une transition CSS, et le
 * fondu court promis deviendrait une coupe sèche. Le témoin tient donc chaque animation
 * demandée — d'où, vers où, en combien de temps — et décide quand elle finit.
 */
type Run = { readonly target: Element; readonly frames: readonly Keyframe[]; readonly duration: number; readonly finish: () => void; cancelled: boolean };
const runs: Run[] = [];
const animateSaved: { descriptor?: PropertyDescriptor | undefined } = {};
const audioSaved: { descriptor?: PropertyDescriptor | undefined } = {};
beforeEach(() => {
  level.now = 0;
  metered.length = 0;
  audioSaved.descriptor = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, writable: true, value: FakeAudioContext });
  runs.length = 0;
  animateSaved.descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(this: Element, frames: Keyframe[], options: KeyframeAnimationOptions) {
      const settle: { resolve: () => void; reject: (reason: unknown) => void } = { resolve: () => undefined, reject: () => undefined };
      const finished = new Promise<void>((resolve, reject) => Object.assign(settle, { resolve, reject }));
      const run: Run = { target: this, frames, duration: Number(options.duration), finish: () => settle.resolve(), cancelled: false };
      runs.push(run);
      return { finished, cancel: () => { run.cancelled = true; settle.reject(new DOMException('cancelled', 'AbortError')); } };
    },
  });
});
afterEach(() => {
  jest.useRealTimers();
  if (audioSaved.descriptor === undefined) Reflect.deleteProperty(globalThis, 'AudioContext');
  else Object.defineProperty(globalThis, 'AudioContext', audioSaved.descriptor);
  if (animateSaved.descriptor === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  else Object.defineProperty(HTMLElement.prototype, 'animate', animateSaved.descriptor);
});

const runsOf = (selector: string) => runs.filter((run) => run.target.matches(selector));
const finish = (run: Run | undefined) => act(async () => run?.finish());
const remoteVideo = '[data-call-duo-stage] video:not([data-call-self])';
const cameraOn = () => call({ members: { 'u-peer': member({ cameraOn: true }) } });

describe('G4.1 — la scène noire de la caméra coupée', () => {
  test('fond noir, avatar à la couleur de la personne, icône caméra à côté du texte', () => {
    const view = mount(call());
    const off = view.find('[data-call-camera-off]');
    expect(off).not.toBeNull();
    expect(off?.className).toContain('bg-media-backdrop');
    expect(off?.outerHTML).toContain(speakerColor('u-peer', 'Awa Diallo'));
    expect(view.find('[data-call-camera-off] > div > span svg')).not.toBeNull();
    expect(view.find('[data-call-camera-off] > div > span')?.textContent).toBe('Caméra désactivée');
    view.done();
  });
});

/**
 * **G4.2 · P9.6 (#17637) — L'ANNEAU S'ALLUME AU NIVEAU AUDIO REÇU, JAMAIS AUX SOUS-TITRES** : la même loi à hystérésis que
 * le disque du duo audio (`usePeerSpeaking`, `hearing`, mesure chargée à la demande), sous-titres éteints comme allumés.
 * La mesure ne tourne que tant que la scène noire se montre : l'image revenue, elle se clôt.
 */
describe('G4.2 — anneau et halo (un seul calque, une ombre) : à la parole seulement', () => {
  const settle = () => act(async () => {});
  const tick = (ms: number) => act(() => void jest.advanceTimersByTime(ms));
  const ringOf = (view: ReturnType<typeof mount>) => view.find('[data-call-camera-off-speech]');

  test('au repos, aucun anneau ni halo visible ; le niveau reçu au-dessus du seuil les monte en opacité, sous-titres éteints', async () => {
    jest.useFakeTimers();
    const view = mount(call({ captionsMode: 'off', captions: [] }));
    await settle();
    expect(ringOf(view)?.style.opacity).toBe('0');
    expect(runsOf('[data-call-camera-off-speech]')).toHaveLength(0);
    level.now = 0.2;
    tick(400);
    expect(ringOf(view)?.style.opacity).toBe('1');
    expect(runsOf('[data-call-camera-off-speech]').at(-1)?.frames).toEqual([{ opacity: '0' }, { opacity: 1 }]);
    view.done();
  });

  test('un silence bref ne l’éteint pas (hystérésis) ; un silence tenu l’éteint en fondu', async () => {
    jest.useFakeTimers();
    const view = mount(call());
    await settle();
    level.now = 0.2;
    tick(400);
    level.now = 0;
    tick(400);
    expect(ringOf(view)?.style.opacity).toBe('1');
    tick(1200);
    expect(ringOf(view)?.style.opacity).toBe('0');
    expect(runsOf('[data-call-camera-off-speech]').at(-1)?.frames).toEqual([{ opacity: '1' }, { opacity: 0 }]);
    view.done();
  });

  test('un sous-titre en cours n’allume rien : seul le niveau audio dit la parole', async () => {
    jest.useFakeTimers();
    const view = mount(call({ captions: [speech(false)] }));
    await settle();
    tick(1000);
    expect(ringOf(view)?.style.opacity).toBe('0');
    view.done();
  });

  test('la mesure porte sur le flux de l’autre, et seulement tant que son avatar se montre', async () => {
    const remote = stream();
    const view = mount(call({ members: { 'u-peer': member({ cameraOn: true }) }, remoteStreams: { 'u-peer': remote } }));
    await settle();
    expect(metered).toHaveLength(0);
    view.render(call({ remoteStreams: { 'u-peer': remote } }));
    await settle();
    expect(metered).toEqual([remote]);
    view.done();
  });

  test('l’anneau et le halo sont un seul calque d’ombres, à la couleur que la scène lui remet', () => {
    const css = readFileSync(new URL('../styles/call-motion.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(css).toMatch(/\[data-call-camera-off-speech\]\s*\{\s*box-shadow:\s*0 0 0 3px var\(--call-tint\),\s*0 0 24px 6px color-mix\(in srgb, var\(--call-tint\) 50%, transparent\);/);
    const view = mount(call());
    expect(view.find('[data-call-camera-off]')?.style.getPropertyValue('--call-tint')).toBe(speakerColor('u-peer', 'Awa Diallo'));
    view.done();
  });

  test('ne bouge qu’en opacité : son fondu suit la durée de la loi, plus court — jamais coupé — sous « Réduire les animations »', async () => {
    jest.useFakeTimers();
    const view = mount(call());
    await settle();
    level.now = 0.2;
    tick(400);
    expect(runsOf('[data-call-camera-off-speech]').at(-1)?.duration).toBe(250);
    view.done();
    runs.length = 0;
    level.now = 0;
    const reduced = mount(call(), { reducedMotion: true });
    await settle();
    level.now = 0.2;
    tick(400);
    expect(runsOf('[data-call-camera-off-speech]').at(-1)?.duration).toBe(120);
    reduced.done();
  });
});

describe('G4.6 — l’image cède la place à l’avatar (et revient) en fondu', () => {
  test('la première peinture ne joue rien : image seule, scène noire rangée hors de la vue et du lecteur d’écran', () => {
    const view = mount(cameraOn());
    expect(runs).toHaveLength(0);
    expect(view.find(remoteVideo)).not.toBeNull();
    expect(view.find('[data-call-camera-off]')?.className).toContain('invisible');
    view.done();
  });

  test('caméra qui se coupe : l’avatar monte en opacité PAR-DESSUS l’image, qui ne part qu’une fois couverte', async () => {
    const view = mount(cameraOn(), { reducedMotion: true });
    view.render(call());
    expect(view.find('[data-call-camera-off]')?.className).not.toContain('invisible');
    const veil = runsOf('[data-call-camera-off]').at(-1);
    expect(veil?.frames).toEqual([{ opacity: '0' }, { opacity: 1 }]);
    expect(veil?.duration).toBe(120);
    expect(view.find(remoteVideo)).not.toBeNull();
    await finish(veil);
    expect(view.find(remoteVideo)).toBeNull();
    view.done();
  });

  test('caméra qui revient : l’image se monte sous l’avatar, qui s’efface puis se range', async () => {
    const view = mount(call());
    view.render(cameraOn());
    expect(view.find(remoteVideo)).not.toBeNull();
    const veil = runsOf('[data-call-camera-off]').at(-1);
    expect(veil?.frames).toEqual([{ opacity: '1' }, { opacity: 0 }]);
    expect(veil?.duration).toBe(250);
    expect(view.find('[data-call-camera-off]')?.className).not.toContain('invisible');
    await finish(veil);
    expect(view.find('[data-call-camera-off]')?.className).toContain('invisible');
    view.done();
  });

  test('interruptible : une caméra qui se rallume pendant le fondu repart de là où il en est, l’image jamais démontée', async () => {
    const view = mount(cameraOn());
    view.render(call());
    const going = runsOf('[data-call-camera-off]').at(-1);
    view.render(cameraOn());
    expect(going?.cancelled).toBe(true);
    const back = runsOf('[data-call-camera-off]').at(-1);
    expect(back).not.toBe(going);
    expect(back?.frames.at(-1)).toEqual({ opacity: 0 });
    await act(async () => undefined);
    expect(view.find(remoteVideo)).not.toBeNull();
    await finish(back);
    expect(view.find('[data-call-camera-off]')?.className).toContain('invisible');
    expect(view.find(remoteVideo)).not.toBeNull();
    view.done();
  });
});
