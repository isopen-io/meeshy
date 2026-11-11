import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { speakerColor } from '@/lib/calls/call-speaker-color';
import type { CallCaption } from '@/lib/calls/call-captions';
import { DEFAULT_SELF_CORNER, DEFAULT_SELF_TILE, selfTileStore } from '@/lib/calls/call-self-tile';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';

import { CallStage } from './call-stage';

/** G4 — la caméra de l'autre est coupée : la scène noire porte son avatar à SA couleur, l'icône caméra, et l'anneau + le halo à la seule parole. L'image cède la place à l'avatar (et revient) en fondu. */

const video = { kind: 'video', readyState: 'live', getCapabilities: () => ({}), getSettings: () => ({}), applyConstraints: async () => undefined };
const stream = (): MediaStream => Object.assign(Object.create(MediaStream.prototype) as MediaStream, { getVideoTracks: () => [video], getAudioTracks: () => [], getTracks: () => [video] });
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

const wait = (ms: number) => act(async () => new Promise<void>((resolve) => setTimeout(resolve, ms)));

describe('G4.1 — la scène noire de la caméra coupée', () => {
  test('fond noir, avatar à la couleur de la personne, icône caméra à côté du texte', () => {
    const view = mount(call());
    const off = view.find('[data-call-camera-off]');
    expect(off).not.toBeNull();
    expect(off?.className).toContain('bg-black');
    expect(off?.innerHTML).toContain(speakerColor('u-peer', 'Awa Diallo'));
    expect(view.find('[data-call-camera-off-label] svg')).not.toBeNull();
    expect(view.find('[data-call-camera-off-label]')?.textContent).toBe('Caméra désactivée');
    view.done();
  });
});

describe('G4.2 — anneau et halo (un seul calque, une ombre) : à la parole seulement', () => {
  test('au repos, aucun anneau ni halo visible ; à la parole, ils prennent la couleur de la personne', () => {
    const view = mount(call());
    expect(view.find('[data-call-camera-off-speech]')?.style.opacity).toBe('0');
    view.render(call({ captions: [speech(false)] }));
    expect(view.find('[data-call-camera-off-speech]')?.style.opacity).toBe('1');
    expect(view.find('[data-call-camera-off-speech]')?.getAttribute('style')).toContain('box-shadow');
    view.render(call({ captions: [speech(true)] }));
    expect(view.find('[data-call-camera-off-speech]')?.style.opacity).toBe('0');
    view.done();
  });

  test('ne bouge qu’en opacité : l’anneau garde sa place, son fondu suit la durée de la loi', () => {
    const view = mount(call());
    expect(view.find('[data-call-camera-off-speech]')?.style.transitionDuration).toBe('250ms');
    view.done();
    const reduced = mount(call(), { reducedMotion: true });
    expect(reduced.find('[data-call-camera-off-speech]')?.style.transitionDuration).toBe('120ms');
    reduced.done();
  });
});

describe('G4.6 — l’image cède la place à l’avatar (et revient) en fondu', () => {
  test('caméra qui se coupe : l’avatar monte en opacité PAR-DESSUS l’image, qui ne part qu’une fois couverte', async () => {
    const view = mount(call({ members: { 'u-peer': member({ cameraOn: true }) } }), { reducedMotion: true });
    expect(view.find('[data-call-camera-off]')).toBeNull();
    view.render(call());
    const veil = view.find('[data-call-camera-off]');
    expect(veil).not.toBeNull();
    expect(view.find('[data-call-duo-stage] video:not([data-call-self])')).not.toBeNull();
    await wait(60);
    expect(view.find('[data-call-camera-off]')?.style.opacity).toBe('1');
    expect(view.find('[data-call-duo-stage] video:not([data-call-self])')).not.toBeNull();
    await wait(160);
    expect(view.find('[data-call-duo-stage] video:not([data-call-self])')).toBeNull();
    view.done();
  });

  test('caméra qui revient : l’image se monte sous l’avatar, qui s’efface puis part', async () => {
    const view = mount(call(), { reducedMotion: true });
    view.render(call({ members: { 'u-peer': member({ cameraOn: true }) } }));
    expect(view.find('[data-call-camera-off]')).not.toBeNull();
    expect(view.find('[data-call-duo-stage] video:not([data-call-self])')).not.toBeNull();
    await wait(60);
    expect(view.find('[data-call-camera-off]')?.style.opacity).toBe('0');
    await wait(160);
    expect(view.find('[data-call-camera-off]')).toBeNull();
    view.done();
  });

  test('interruptible : une caméra qui se rallume pendant le fondu repart aussitôt', async () => {
    const view = mount(call({ members: { 'u-peer': member({ cameraOn: true }) } }), { reducedMotion: true });
    view.render(call());
    await wait(30);
    view.render(call({ members: { 'u-peer': member({ cameraOn: true }) } }));
    await wait(60);
    expect(view.find('[data-call-camera-off]')?.style.opacity).toBe('0');
    await wait(160);
    expect(view.find('[data-call-camera-off]')).toBeNull();
    expect(view.find('[data-call-duo-stage] video:not([data-call-self])')).not.toBeNull();
    view.done();
  });
});
