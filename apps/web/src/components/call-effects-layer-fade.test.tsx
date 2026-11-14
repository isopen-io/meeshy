import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { loadCallStudioCatalog } from '@/lib/i18n-call-studio-catalog';
import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallScreen, loadColdCallViews } from './call-screen';

/**
 * **LA COUCHE EFFETS ARRIVE ET REPART EN FONDU** (P8.14, #17831 ; iOS `.transition(.opacity)`, Android #18451) — la
 * loi 17 excepte Effets de la montée du bas (le Montage seul monte : `CallModeChromeMotion.risesFromBottom`), pas du
 * fondu : la couche entière se fond, 200 ms (150 ms sous « Réduire les animations »), reste montée le temps de sa
 * sortie, touchable (loi 17.11), et rouverte pendant ce fondu elle reprend sans être remontée.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-effects',
  conversationId: 'c-1',
  media: 'audio',
  direction: 'outgoing',
  isGroup: false,
  title: 'Amina Diallo',
  avatar: null,
  callerName: null,
  phase: { kind: 'connected' },
  connectedAt: 0,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: false,
  facing: 'user',
  screenSharing: false,
  members: {},
  display: 'full',
  localStream: null,
  remoteStreams: {},
  captions: [],
  captionsMode: 'off',
  captionPeers: [],
  preview: null,
  previewed: false,
  transcription: 'idle',
  initiatorId: null,
  invitedBy: null,
  quality: null,
  ...overrides,
});

const member = (overrides: Partial<CallMember> = {}): CallMember => ({ userId: 'u-peer', name: 'Amina Diallo', avatar: null, micMuted: false, cameraOn: false, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected', ...overrides });

beforeAll(async () => {
  await loadPillMotion();
  await loadCallControlsCatalog('fr');
  await loadColdCallViews();
  renderToStaticMarkup(<CallScreen call={call({ members: { 'u-peer': member() } })} canShare initiallyExpanded />);
  await import('./call-control-actions');
  await import('./call-rails');
  await import('./call-effects-mode');
  await new Promise((resolve) => setTimeout(resolve, 0));
  renderToStaticMarkup(<CallScreen call={call({ members: { 'u-peer': member() } })} canShare initiallyExpanded />);
  await new Promise((resolve) => setTimeout(resolve, 0));
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mount = (overrides: Partial<ActiveCall>, effectsSupport: { readonly color: boolean; readonly blur: boolean }) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<CallScreen call={call(overrides)} canShare effectsSupport={effectsSupport} />));
  const find = (selector: string) => [...host.querySelectorAll(selector)].find((node) => node.closest('[data-call-pill-ghost]') === null) ?? null;
  const press = (selector: string) => act(() => (find(selector) as HTMLElement | null)?.click());
  const done = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { host, find, press, done };
};

const frame = () => act(async () => void (await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))));

const settle = async (chunk: () => Promise<unknown>) => {
  await act(async () => {
    await chunk();
    await loadCallStudioCatalog('fr');
  });
  await act(async () => {});
  await act(async () => {});
};

describe('la couche Effets se fond à l’entrée et à la sortie (P8.14)', () => {
  type Played = { readonly what: string; readonly keyframes: Keyframe[]; readonly duration: unknown };
  const proto = (): { animate?: unknown } => HTMLElement.prototype as unknown as { animate?: unknown };
  const played: Played[] = [];
  const finishers: Array<() => void> = [];
  let before: PropertyDescriptor | undefined;
  let media: PropertyDescriptor | undefined;
  const labelOf = (element: HTMLElement): string =>
    element.getAttribute('data-call-mode') === 'effects' ? 'effects-layer' : element.closest('[data-call-mode="effects"]') !== null ? 'effects' : element.hasAttribute('data-call-controls') ? 'pill' : 'other';

  beforeEach(() => {
    before = Object.getOwnPropertyDescriptor(proto(), 'animate');
    media = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    played.length = 0;
    finishers.length = 0;
    Object.defineProperty(proto(), 'animate', {
      configurable: true,
      writable: true,
      value: function (this: HTMLElement, keyframes: Keyframe[], options: { duration: number }) {
        played.push({ what: labelOf(this), keyframes, duration: options.duration });
        const finished = new Promise<void>((resolve) => finishers.push(resolve));
        return { cancel: () => undefined, finished, onfinish: null };
      },
    });
  });
  afterEach(() => {
    if (before === undefined) Reflect.deleteProperty(proto(), 'animate');
    else Object.defineProperty(proto(), 'animate', before);
    if (media === undefined) Reflect.deleteProperty(window, 'matchMedia');
    else Object.defineProperty(window, 'matchMedia', media);
  });

  const finish = () => act(async () => void finishers.splice(0).forEach((resolve) => resolve()));
  const of = (what: string) => played.filter((entry) => entry.what === what);

  const enterEffects = async () => {
    const view = mount({ cameraOn: true, members: { 'u-peer': member() } }, { color: true, blur: false });
    view.press('[data-call-more]');
    await frame();
    view.press('[data-call-rail="mine"] [data-call-control="effects"]');
    await settle(() => import('./call-effects-mode'));
    return view;
  };
  const fadeOf = (entry: Played) => entry.keyframes.map((frame) => [frame.opacity, frame.transform]);

  test('Effets ne monte pas du bas : la couche arrive en fondu, l’en-tête et la pilule partent par leurs bords', async () => {
    const view = await enterEffects();
    expect(view.find('[data-call-mode="effects"]')).not.toBeNull();
    const rises = (entry: Played) => entry.keyframes.some((frame) => frame.transform === 'translateY(100%)');
    expect(played.filter((entry) => entry.what.startsWith('effects') && rises(entry))).toEqual([]);
    expect(of('effects-layer').map((entry) => [fadeOf(entry), entry.duration])).toEqual([
      [
        [
          [0, 'none'],
          [1, 'none'],
        ],
        200,
      ],
    ]);
    expect(of('pill').map((entry) => entry.keyframes[1]?.transform)).toEqual(['translateY(100%)']);
    view.done();
  });

  test('P8.14 — à la sortie, la couche Effets reste montée le temps de son fondu, touchable, puis se retire ; la pilule revient', async () => {
    const view = await enterEffects();
    await finish();
    played.length = 0;
    view.press('[data-call-mode-quit]');
    const leaving = view.find('[data-call-mode="effects"]');
    expect(leaving).not.toBeNull();
    expect(leaving?.hasAttribute('data-leaving')).toBe(true);
    expect(leaving?.hasAttribute('inert')).toBe(false);
    expect(of('effects-layer').map((entry) => [fadeOf(entry), entry.duration])).toEqual([
      [
        [
          [1, 'none'],
          [0, 'none'],
        ],
        200,
      ],
    ]);
    expect(view.find('[data-call-control-pill]')).not.toBeNull();
    await finish();
    expect(view.find('[data-call-mode="effects"]')).toBeNull();
    view.done();
  });

  test('P8.14 — sous « Réduire les animations », la couche Effets fond en 150 ms, à l’entrée comme à la sortie, sans aucun déplacement', async () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true }) });
    const view = await enterEffects();
    await finish();
    view.press('[data-call-mode-quit]');
    const layer = of('effects-layer');
    expect(layer.map((entry) => entry.duration)).toEqual([150, 150]);
    expect(layer.map((entry) => entry.keyframes.map((frame) => frame.opacity))).toEqual([
      [0, 1],
      [1, 0],
    ]);
    expect(layer.every((entry) => entry.keyframes.every((frame) => frame.transform === undefined))).toBe(true);
    await finish();
    expect(view.find('[data-call-mode="effects"]')).toBeNull();
    view.done();
  });

  test('P8.14 — revenir à Effets pendant son fondu de sortie le reprend sans le remonter, rouvert sur son menu d’entrée', async () => {
    const view = await enterEffects();
    await finish();
    const root = view.find('[data-call-mode="effects"]');
    expect(root?.querySelector('[data-call-effects-looks]')).not.toBeNull();
    view.press('[data-call-effects-category="face"]');
    await act(() => new Promise((resolve) => setTimeout(resolve, 260)));
    expect(root?.querySelector('[data-call-effects-looks]')).toBeNull();
    view.press('[data-call-mode-quit]');
    expect(view.find('[data-call-mode="effects"]')?.hasAttribute('data-leaving')).toBe(true);
    view.press('[data-call-more]');
    await frame();
    view.press('[data-call-rail="mine"] [data-call-control="effects"]');
    await act(async () => {});
    expect(view.find('[data-call-mode="effects"]')).toBe(root);
    expect(root?.hasAttribute('data-leaving')).toBe(false);
    expect(root?.querySelector('[data-call-effects-looks]')).not.toBeNull();
    view.done();
  });
});
