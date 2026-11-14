import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { JOURNAL_COLUMN_RESERVE } from '@/lib/calls/call-journal-dock';
import { NO_LIVE_FRAME, callLiveFrameStore } from '@/lib/calls/call-live-frame-store';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallLiveFrameSurface, liveFramePaintSize } from './call-live-frame-layer';
import { CallScreen } from './call-screen';

/**
 * LE CADRE EN DIRECT SUIT LA SCÈNE QUAND LA COLONNE DU JOURNAL S'OUVRE (#17929, vue W1) — la surface
 * peinte du cadre (`CallLiveFrameSurfaceSlot`) ne couvre plus toute la fenêtre, colonne comprise : elle se
 * borne à la scène réduite, se repeint à la taille de cette place, et rejoint son nouveau centre par la
 * transformation seule, comme la scène (W1.20).
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const CALL_ID = '6650c0ffee0000000000c411';

const BOUNDS = '[data-call-live-frame-bounds]';

beforeAll(async () => {
  await loadPillMotion();
  await loadCallControlsCatalog('fr');
  await import('./call-control-actions');
  await import('./call-journal-panel');
  await import('./call-live-frame-layer');
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => callLiveFrameStore.setState(NO_LIVE_FRAME, true));

const member = (userId: string, name: string): CallMember => ({ userId, name, avatar: null, micMuted: false, cameraOn: true, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected' });

const duoCall = (): ActiveCall => ({
  callId: CALL_ID,
  conversationId: 'c-1',
  media: 'video',
  direction: 'outgoing',
  isGroup: false,
  title: 'Awa',
  avatar: null,
  callerName: null,
  initiatorId: null,
  invitedBy: null,
  phase: { kind: 'connected' },
  connectedAt: 0,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: true,
  facing: 'user',
  screenSharing: false,
  members: { 'u-awa': member('u-awa', 'Awa') },
  display: 'full',
  localStream: null,
  remoteStreams: {},
  captions: [{ id: 'w-1', speakerId: 'u-awa', speakerName: 'Awa', original: 'Line 1', translated: 'Ligne 1', pair: { from: 'en', to: 'fr' }, isFinal: true, at: 1, mine: false }],
  captionsMode: 'translated',
  captionPeers: [],
  transcription: 'idle',
  quality: null,
  preview: null,
  previewed: false,
});

const mount = () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<CallScreen call={duoCall()} canShare effectsSupport={{ color: false, blur: false }} wide />));
  const find = (selector: string) => [...host.querySelectorAll<HTMLElement>(selector)].find((node) => node.closest('[data-call-pill-ghost]') === null) ?? null;
  const press = (selector: string) => act(() => find(selector)?.click());
  const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 25)));
  const done = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { host, find, press, settle, done };
};

const keepFrame = async (view: ReturnType<typeof mount>) => {
  act(() => callLiveFrameStore.setState({ callId: CALL_ID, frameId: 'jovial.fete.duo' }));
  await act(async () => {
    await import('@/lib/calls/frames/frame-studio');
  });
  for (let tries = 0; tries < 40 && view.find('[data-call-live-frame-surface]') === null; tries += 1) await view.settle();
};

const toggleJournal = async (view: ReturnType<typeof mount>) => {
  view.press('[data-call-more]');
  await view.settle();
  view.press('[data-call-control="journal"]');
  await view.settle();
};

const canvasWidth = (view: ReturnType<typeof mount>): number => Number(view.find('canvas[data-call-live-frame-surface]')?.getAttribute('width'));

const paintedWidth = (reserve: number): number => liveFramePaintSize({ width: window.innerWidth - reserve, height: window.innerHeight }, window.devicePixelRatio).width;

describe('le cadre gardé et la colonne du journal (W1, #17929)', () => {
  test('colonne fermée, la surface couvre la fenêtre entière, à sa taille', async () => {
    const view = mount();
    await keepFrame(view);
    const bounds = view.find(BOUNDS);
    expect(bounds).not.toBeNull();
    expect(bounds?.style.insetInlineEnd ?? '').toBe('');
    expect(canvasWidth(view)).toBe(paintedWidth(0));
    view.done();
  });

  test('colonne ouverte, la surface se borne à la scène réduite : sa case lâche le bord de fin et sa toile se repeint à cette place', async () => {
    const view = mount();
    await keepFrame(view);
    await toggleJournal(view);
    expect(view.find('[data-call-journal-column]:not([data-leaving])')).not.toBeNull();
    expect(view.find(BOUNDS)?.style.insetInlineEnd).toBe(`${JOURNAL_COLUMN_RESERVE}px`);
    expect(view.find(BOUNDS)?.className.split(' ')).toContain('pointer-events-none');
    expect(view.find(BOUNDS)?.querySelector('[data-call-live-frame-surface-host]')).not.toBeNull();
    expect(canvasWidth(view)).toBe(paintedWidth(JOURNAL_COLUMN_RESERVE));
    expect(canvasWidth(view)).toBeLessThan(paintedWidth(0));
    view.done();
  });

  test('la colonne qui repart rend la fenêtre entière à la surface', async () => {
    const view = mount();
    await keepFrame(view);
    await toggleJournal(view);
    await toggleJournal(view);
    expect(view.find('[data-call-journal-column]:not([data-leaving])')).toBeNull();
    expect(view.find(BOUNDS)?.style.insetInlineEnd ?? '').toBe('');
    expect(canvasWidth(view)).toBe(paintedWidth(0));
    view.done();
  });

  test('la surface rejoint son nouveau centre par la transformation seule, comme la scène (W1.20)', async () => {
    const played: { readonly element: Element; readonly frames: Keyframe[] }[] = [];
    const animate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    const measure = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect');
    const half = JOURNAL_COLUMN_RESERVE / 2;
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value(this: Element, frames: Keyframe[]) {
        played.push({ element: this, frames });
        return { finished: Promise.resolve(), cancel: () => undefined, effect: null };
      },
    });
    Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
      configurable: true,
      value(this: Element) {
        const left = this.closest('[data-call-live-frame-bounds]') !== null && this.closest<HTMLElement>('[data-call-live-frame-bounds]')?.style.insetInlineEnd ? -half : 0;
        return { left, right: left, top: 0, bottom: 0, x: left, y: 0, width: 0, height: 0, toJSON: () => ({}) };
      },
    });
    const view = mount();
    await keepFrame(view);
    await toggleJournal(view);
    const bounds = view.find(BOUNDS);
    const slid = played.filter((move) => move.element === bounds).map((move) => move.frames.map((frame) => frame.transform));
    expect(slid).toContainEqual([`translateX(${half}px)`, 'none']);
    expect(played.filter((move) => move.element === bounds).every((move) => move.frames.every((frame) => Object.keys(frame).every((key) => key === 'transform' || key === 'offset' || key === 'easing' || key === 'composite')))).toBe(true);
    if (animate === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    else Object.defineProperty(HTMLElement.prototype, 'animate', animate);
    if (measure !== undefined) Object.defineProperty(Element.prototype, 'getBoundingClientRect', measure);
    view.done();
  });
});

describe('la surface peint à la taille de la place qu’on lui rend', () => {
  test('une réserve de fin retire sa largeur à la toile', async () => {
    const studio = (await import('@/lib/calls/frames/frame-studio')).createFrameStudio();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<CallLiveFrameSurface language="fr" studio={studio} shown={{ frameId: 'jovial.fete.duo', remoteSharedName: null }} call={duoCall()} stage={() => null} bleed={JOURNAL_COLUMN_RESERVE} />));
    expect(Number(host.querySelector('canvas')?.getAttribute('width'))).toBe(paintedWidth(JOURNAL_COLUMN_RESERVE));
    act(() => root.unmount());
    host.remove();
  });
});
