import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallScreen } from './call-screen';

/**
 * #18488 — EN APPEL VOCAL, À HAUTEUR COMPACTE, LA PILULE ENTIÈRE RESTE DANS L'ÉCRAN : la scène audio prend la
 * forme compacte de P9b (avatar de 56, ou de 40 sous 340 px de haut ; le nom et la durée à côté) et la marge
 * sous la pilule se resserre. Le témoin de GÉOMÉTRIE est celui du navigateur (`check-calls-controls.mjs` § 10) :
 * ici, la forme que l'écran choisit selon la hauteur de la fenêtre.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const member = (): CallMember => ({ userId: 'u-awa', name: 'Awa Diallo', avatar: null, micMuted: false, cameraOn: false, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected' }) as CallMember;

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall =>
  ({
    callId: 'call-audio-low', conversationId: 'c-1', media: 'audio', direction: 'outgoing', isGroup: false, title: 'Awa Diallo', avatar: null, callerName: null, peerKey: 'u-awa', phase: { kind: 'connected' }, connectedAt: 0, endedDurationSec: null,
    micMuted: false, cameraOn: false, facing: 'user', screenSharing: false, members: { 'u-awa': member() }, display: 'full', localStream: null, remoteStreams: {}, captions: [], captionsMode: 'off',
    captionPeers: [], preview: null, previewed: false, transcription: 'idle', initiatorId: null, invitedBy: null, quality: null, ...overrides,
  }) as ActiveCall;

const STAGE = '[data-call-audio-stage]';
const PORTRAIT = '[data-call-incoming-portrait]';

const saved: { height?: PropertyDescriptor | undefined; media?: PropertyDescriptor | undefined } = {};

beforeAll(async () => {
  await loadPillMotion();
  await loadCallControlsCatalog('fr');
  renderToStaticMarkup(<CallScreen call={call()} canShare initiallyExpanded />);
  await import('./call-control-actions');
  await new Promise((resolve) => setTimeout(resolve, 0));
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
beforeEach(() => {
  saved.height = Object.getOwnPropertyDescriptor(window, 'innerHeight');
  saved.media = Object.getOwnPropertyDescriptor(window, 'matchMedia');
});
afterEach(() => {
  const restore = (key: 'innerHeight' | 'matchMedia', descriptor: PropertyDescriptor | undefined) => (descriptor === undefined ? Reflect.deleteProperty(window, key) : Object.defineProperty(window, key, descriptor));
  restore('innerHeight', saved.height);
  restore('matchMedia', saved.media);
});

const mount = (height: number, overrides: Partial<ActiveCall> = {}) => {
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height });
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }) });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<CallScreen call={call(overrides)} canShare effectsSupport={{ color: false, blur: false }} wide={false} />));
  const find = (selector: string) => host.querySelector<HTMLElement>(selector);
  return {
    find,
    stage: () => find(STAGE)?.getAttribute('data-call-audio-stage') ?? null,
    portraitSize: () => find(`${PORTRAIT} > div`)?.style.width ?? null,
    plane: () => find('[data-call-controls]')?.parentElement?.className ?? '',
    resize: (next: number) => {
      Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: next });
      act(() => void window.dispatchEvent(new Event('resize')));
    },
    settle: () => act(async () => {}),
    done: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

describe('#18488 — la scène audio du duo prend la forme compacte quand la hauteur manque', () => {
  test('sur une fenêtre haute, la scène est pleine : avatar de 120', async () => {
    const view = mount(844);
    await view.settle();
    expect(view.stage()).toBe('full');
    expect(view.portraitSize()).toBe('144px');
    expect(view.plane()).toContain('pb-6');
    view.done();
  });

  test('à 400 de haut, la scène est compacte : avatar de 56, marge sous la pilule resserrée', async () => {
    const view = mount(400);
    await view.settle();
    expect(view.stage()).toBe('compact');
    expect(view.portraitSize()).toBe('80px');
    expect(view.plane()).toContain('pb-2');
    expect(view.plane()).not.toContain('pb-6');
    view.done();
  });

  test('à 320 de haut, l’avatar passe à 40, le nom et la durée restent à côté de lui', async () => {
    const view = mount(320);
    await view.settle();
    expect(view.stage()).toBe('compact');
    expect(view.portraitSize()).toBe('64px');
    const row = view.find(STAGE);
    expect(row?.querySelector('h2')?.textContent).toBe('Awa Diallo');
    expect(row?.querySelector('[data-call-duration]')).not.toBeNull();
    view.done();
  });

  test('la fenêtre qui change de hauteur change la forme, dans les deux sens', async () => {
    const view = mount(844);
    await view.settle();
    view.resize(320);
    await view.settle();
    expect(view.stage()).toBe('compact');
    view.resize(844);
    await view.settle();
    expect(view.stage()).toBe('full');
    view.done();
  });

  test('la sonnerie garde son portrait plein : elle n’a pas de pilule à protéger', async () => {
    const view = mount(844, { phase: { kind: 'outgoing' } });
    await view.settle();
    expect(view.stage()).toBe('full');
    view.done();
  });
});
