import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import type { ActiveCall } from '@/lib/calls/call-store';
import { loadModeMotion } from '@/lib/calls/use-mode-motion';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallScreenHeader } from './call-screen-header';

/**
 * LA CAPSULE DE L'EN-TÊTE ENTRE ET SORT PAR UNE MISE À L'ÉCHELLE ANCRÉE À DROITE (P9.8, #17509) —
 * `.scale(scale: 0.8, anchor: .trailing)` d'iOS ; sous « Réduire les animations », un fondu court
 * joué par le moteur Web Animations (la règle générale d'`app.css` coupe les animations CSS).
 */
const video = (overrides: Partial<ActiveCall> = {}): ActiveCall =>
  ({
    callId: 'call-1',
    conversationId: 'c-1',
    media: 'video',
    direction: 'outgoing',
    isGroup: false,
    title: 'Amina Diallo',
    avatar: null,
    callerName: null,
    phase: { kind: 'connected' },
    connectedAt: 0,
    endedDurationSec: null,
    micMuted: false,
    cameraOn: true,
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
  }) as ActiveCall;

describe('la capsule de l’en-tête (P9.8)', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const proto = (): { animate?: unknown } => HTMLElement.prototype as unknown as { animate?: unknown };
  const played: Array<{ what: string; keyframes: Keyframe[]; duration: unknown }> = [];
  let before: PropertyDescriptor | undefined;
  let media: PropertyDescriptor | undefined;
  const cleanups: Array<() => void> = [];

  beforeAll(async () => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
    await loadModeMotion();
  });
  beforeEach(() => {
    before = Object.getOwnPropertyDescriptor(proto(), 'animate');
    media = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    played.length = 0;
    Object.defineProperty(proto(), 'animate', {
      configurable: true,
      writable: true,
      value: function (this: HTMLElement, keyframes: Keyframe[], options: { duration: number }) {
        played.push({ what: this.hasAttribute('data-call-capsule') ? 'capsule' : 'other', keyframes, duration: options.duration });
        return { cancel: () => undefined, finished: Promise.resolve(), onfinish: null };
      },
    });
  });
  afterEach(() => {
    cleanups.splice(0).forEach((done) => done());
    if (before === undefined) Reflect.deleteProperty(proto(), 'animate');
    else Object.defineProperty(proto(), 'animate', before);
    if (media === undefined) Reflect.deleteProperty(window, 'matchMedia');
    else Object.defineProperty(window, 'matchMedia', media);
  });
  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  const mount = async (joined: boolean) => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const render = async (next: boolean) => {
      await act(async () => root.render(<CallScreenHeader call={video()} language="fr" joined={next} prominent={false} />));
      await act(async () => {});
    };
    await render(joined);
    cleanups.push(() => {
      act(() => root.unmount());
      host.remove();
    });
    return { render, capsule: () => host.querySelector<HTMLElement>('[data-call-capsule]') };
  };

  test('elle arrive en fondu et à l’échelle, de 0,8 à 1', async () => {
    const view = await mount(false);
    expect(view.capsule()).toBeNull();
    await view.render(true);
    expect(view.capsule()).not.toBeNull();
    expect(played.filter((entry) => entry.what === 'capsule')).toEqual([
      { what: 'capsule', keyframes: [{ opacity: 0, transform: 'scale(0.8)' }, { opacity: 1, transform: 'scale(1)' }], duration: 200 },
    ]);
  });

  test('elle repart de même, restée à sa place le temps du mouvement, inerte, puis démontée', async () => {
    const view = await mount(true);
    played.length = 0;
    await view.render(false);
    const leaving = view.capsule();
    expect(leaving).not.toBeNull();
    expect(leaving?.hasAttribute('data-leaving')).toBe(true);
    expect(leaving?.hasAttribute('inert')).toBe(true);
    expect(leaving?.getAttribute('aria-hidden')).toBe('true');
    expect(played.filter((entry) => entry.what === 'capsule').map((entry) => entry.keyframes[0])).toEqual([{ opacity: 1, transform: 'scale(1)' }]);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 260));
    });
    expect(view.capsule()).toBeNull();
  });

  test('sous « Réduire les animations » : un fondu court, sans échelle, à l’arrivée comme au départ', async () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true }) });
    const view = await mount(false);
    await view.render(true);
    await view.render(false);
    const entries = played.filter((entry) => entry.what === 'capsule');
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.duration === 150)).toBe(true);
    expect(entries.every((entry) => entry.keyframes.every((frame) => frame.transform === undefined))).toBe(true);
  });

  test('la feuille ancre l’échelle au bord de fin (à droite, à gauche en droite à gauche) et ne la rejoue plus en CSS', () => {
    const css = readFileSync(new URL('../styles/call-motion.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(css).toMatch(/\[data-call-capsule\]\s*\{[^}]*transform-origin:\s*100% 50%/);
    expect(css).toMatch(/\[data-call-capsule\]:dir\(rtl\)\s*\{[^}]*transform-origin:\s*0% 50%/);
    const shared = css.slice(css.indexOf('[data-call-pill-text],'), css.indexOf('}', css.indexOf('[data-call-pill-text],')));
    expect(shared).not.toContain('[data-call-capsule]');
  });
});
