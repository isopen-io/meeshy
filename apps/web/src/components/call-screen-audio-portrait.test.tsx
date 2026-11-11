import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from 'bun:test';

import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { speakerColor } from '@/lib/calls/call-speaker-color';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallScreen } from './call-screen';

/**
 * LE PORTRAIT DU DUO AUDIO (P9.4 à P9.7, P10.11, P10.12, #17611) — le disque de l'autre prend la couleur de SA
 * personne (l'identifiant primant, celle des sous-titres), l'anneau et le halo n'existent qu'à la parole (niveau
 * audio reçu, pas les sous-titres), en fondu ; la durée a un nom pour le lecteur d'écran et ne se relit pas chaque seconde.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const member = (overrides: Partial<CallMember> = {}): CallMember => ({ userId: 'u-peer', name: 'Awa Diallo', avatar: null, micMuted: false, cameraOn: false, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected', ...overrides }) as CallMember;

const audioTrack = { kind: 'audio', readyState: 'live' };
const heard = { getVideoTracks: () => [], getAudioTracks: () => [audioTrack], getTracks: () => [audioTrack] } as unknown as MediaStream;

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall =>
  ({
    callId: 'call-audio', conversationId: 'c-1', media: 'audio', direction: 'outgoing', isGroup: false, title: 'Awa Diallo', avatar: null, callerName: null, peerKey: 'u-peer', phase: { kind: 'connected' }, connectedAt: 0, endedDurationSec: null,
    micMuted: false, cameraOn: false, facing: 'user', screenSharing: false, members: { 'u-peer': member() }, display: 'full', localStream: null, remoteStreams: { 'u-peer': heard }, captions: [], captionsMode: 'off',
    captionPeers: [], preview: null, previewed: false, transcription: 'idle', initiatorId: null, invitedBy: null, quality: null, ...overrides,
  }) as ActiveCall;

/* Un niveau que le témoin règle : l'analyseur rend un signal dont la valeur efficace vaut `level.now`. */
const level = { now: 0 };
const metered: MediaStream[] = [];
class FakeAudioContext {
  state = 'running';
  createMediaStreamSource(stream: MediaStream) {
    metered.push(stream);
    return { connect: () => undefined, disconnect: () => undefined };
  }
  createAnalyser() {
    return { fftSize: 0, connect: () => undefined, disconnect: () => undefined, getFloatTimeDomainData: (into: Float32Array) => into.fill(level.now) };
  }
  resume = async () => undefined;
  close = async () => undefined;
}

const runs: { readonly target: Element; readonly frames: readonly Keyframe[]; readonly duration: number }[] = [];
const saved: { animate?: PropertyDescriptor | undefined; audio?: PropertyDescriptor | undefined; media?: PropertyDescriptor | undefined } = {};

beforeAll(async () => {
  await loadCallControlsCatalog('fr');
  await loadPillMotion();
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
beforeEach(() => {
  runs.length = 0;
  metered.length = 0;
  level.now = 0;
  saved.animate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  saved.audio = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  saved.media = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, writable: true, value: FakeAudioContext });
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(this: Element, frames: Keyframe[], options: KeyframeAnimationOptions) {
      runs.push({ target: this, frames, duration: Number(options.duration) });
      return { finished: new Promise<void>(() => undefined), cancel: () => undefined };
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

const mount = (active: ActiveCall, { reducedMotion = false }: { readonly reducedMotion?: boolean } = {}) => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: reducedMotion }) });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<CallScreen call={active} canShare={false} />));
  return {
    find: (selector: string) => host.querySelector(selector) as HTMLElement | null,
    render: (next: ActiveCall) => act(() => root.render(<CallScreen call={next} canShare={false} />)),
    done: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

const ring = '[data-call-incoming-portrait] [data-call-camera-off-speech]';
const ringRuns = () => runs.filter((run) => run.target.matches(ring));
const tick = (ms: number) => act(() => jest.advanceTimersByTime(ms));

describe('P9.5 / P10.11 — le disque du duo audio prend la couleur de la personne', () => {
  test('la couleur de l’anneau et du disque vient de l’identifiant (speakerColor), pas du nom affiché', () => {
    const view = mount(call({ title: 'Un autre nom', peerKey: 'u-peer' }));
    const tint = speakerColor('u-peer', 'Un autre nom');
    expect(view.find(ring)?.style.getPropertyValue('--call-tint')).toBe(tint);
    expect(view.find('[data-call-incoming-portrait] [data-avatar], [data-call-incoming-portrait] [style*="background"]')).not.toBeNull();
    view.done();
  });

  test('deux noms différents pour un même identifiant donnent la même couleur', () => {
    const one = mount(call({ title: 'Awa' }));
    const two = mount(call({ title: 'Awa Diallo' }));
    expect(one.find(ring)?.style.getPropertyValue('--call-tint')).toBe(two.find(ring)?.style.getPropertyValue('--call-tint') ?? '');
    one.done();
    two.done();
  });
});

describe('P9.6 / P10.12 — l’anneau et le halo n’existent qu’à la parole, sans dépendre des sous-titres', () => {
  test('au repos, l’anneau est transparent et rien ne s’anime', () => {
    jest.useFakeTimers();
    const view = mount(call());
    expect(view.find(ring)?.style.opacity).toBe('0');
    tick(1000);
    expect(view.find(ring)?.style.opacity).toBe('0');
    expect(ringRuns()).toHaveLength(0);
    view.done();
  });

  test('le niveau audio du pair allume l’anneau en fondu, sous-titres éteints', () => {
    jest.useFakeTimers();
    const view = mount(call({ captionsMode: 'off', captions: [] }));
    expect(metered).toContain(heard);
    level.now = 0.2;
    tick(400);
    expect(view.find(ring)?.style.opacity).toBe('1');
    expect(ringRuns().at(-1)?.frames).toEqual([{ opacity: '0' }, { opacity: 1 }]);
    view.done();
  });

  test('un silence bref ne l’éteint pas (hystérésis), un silence tenu l’éteint en fondu', () => {
    jest.useFakeTimers();
    const view = mount(call());
    level.now = 0.2;
    tick(400);
    level.now = 0;
    tick(400);
    expect(view.find(ring)?.style.opacity).toBe('1');
    tick(1200);
    expect(view.find(ring)?.style.opacity).toBe('0');
    expect(ringRuns().at(-1)?.frames).toEqual([{ opacity: '1' }, { opacity: 0 }]);
    view.done();
  });

  test('le fondu dure 250 ms, 120 ms sous « Réduire les animations » (Web Animations, pas une transition CSS)', () => {
    jest.useFakeTimers();
    const normal = mount(call());
    level.now = 0.2;
    tick(400);
    expect(ringRuns().at(-1)?.duration).toBe(250);
    normal.done();
    runs.length = 0;
    level.now = 0;
    const reduced = mount(call(), { reducedMotion: true });
    level.now = 0.2;
    tick(400);
    expect(ringRuns().at(-1)?.duration).toBe(120);
    reduced.done();
  });

  test('un sous-titre en cours n’allume pas l’anneau : seul le niveau audio parle', () => {
    jest.useFakeTimers();
    const caption = { id: 's', speakerId: 'u-peer', speakerName: 'Awa', original: '…', translated: null, pair: null, isFinal: false, at: 1, mine: false };
    const view = mount(call({ captions: [caption] as unknown as ActiveCall['captions'] }));
    tick(1000);
    expect(view.find(ring)?.style.opacity).toBe('0');
    view.done();
  });

  test('sonnerie : pas de mesure tant que l’appel n’est pas joint', () => {
    const view = mount(call({ phase: { kind: 'outgoing' } as ActiveCall['phase'] }));
    expect(metered).toHaveLength(0);
    view.done();
  });
});

describe('P9.4 — la durée a un nom pour le lecteur d’écran et sort de la région vivante', () => {
  test('le chrono est précédé de « Durée de l’appel » et n’est pas dans la région role=status', () => {
    const view = mount(call({ connectedAt: Date.now() }));
    const duration = view.find('[data-call-duration]');
    expect(duration?.textContent).toContain('Durée de l’appel');
    expect(duration?.textContent).toMatch(/0:0\d/);
    expect(duration?.closest('[role="status"]')).toBeNull();
    expect(duration?.closest('[aria-live]')).toBeNull();
    view.done();
  });

  test('les statuts textuels restent dans la région vivante', () => {
    const view = mount(call({ phase: { kind: 'reconnecting' } as ActiveCall['phase'] }));
    expect(view.find('[data-call-status] [role="status"][aria-live="polite"]')?.textContent).not.toBe('');
    view.done();
  });
});
