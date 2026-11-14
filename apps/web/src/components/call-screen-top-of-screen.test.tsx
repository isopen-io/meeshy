import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { callChromeStore } from '@/lib/calls/call-chrome-store';
import { callRecordingStore } from '@/lib/calls/call-recording-store';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallScreen, loadColdCallViews } from './call-screen';

/**
 * **LE HAUT DE L'ÉCRAN D'APPEL SUIT LA PLANCHE** (#17963, #17965) — en groupe, l'en-tête flotte sur la grille (P11.1,
 * comme iOS #18395 et Android #18414) ; en paysage, la pile des bannières est bornée à 560 et centrée, ma vignette
 * gardant son coin à côté d'elle (L1.8, comme iOS #18247 et Android #18251).
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const member = (overrides: Partial<CallMember> = {}): CallMember => ({ userId: 'u-peer', name: 'Amina Diallo', avatar: null, micMuted: false, cameraOn: false, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected', ...overrides });

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-top',
  conversationId: 'c-1',
  media: 'video',
  direction: 'outgoing',
  isGroup: false,
  title: 'Awa',
  avatar: null,
  callerName: null,
  phase: { kind: 'connected' },
  connectedAt: 0,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: true,
  facing: 'user',
  screenSharing: false,
  members: { 'u-peer': member({ cameraOn: true }) },
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

const group = (overrides: Partial<ActiveCall> = {}): Partial<ActiveCall> => ({ media: 'audio', cameraOn: false, isGroup: true, title: 'Équipe', members: { 'u-peer': member(), 'u-b': member({ userId: 'u-b', name: 'Bintou' }) }, ...overrides });

const real = { width: 0, height: 0 };

beforeAll(async () => {
  await loadPillMotion();
  await loadCallControlsCatalog('fr');
  await loadColdCallViews();
  renderToStaticMarkup(<CallScreen call={call(group())} canShare={false} />);
  await new Promise((resolve) => setTimeout(resolve, 0));
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  real.width = window.innerWidth;
  real.height = window.innerHeight;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const windowOf = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height });
};

const mount = async (overrides: Partial<ActiveCall>) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<CallScreen call={call(overrides)} canShare={false} effectsSupport={{ color: false, blur: false }} />);
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  const find = (selector: string) => [...host.querySelectorAll<HTMLElement>(selector)].find((node) => node.closest('[data-call-pill-ghost]') === null) ?? null;
  return {
    host,
    find,
    press: (selector: string) => act(() => find(selector)?.click()),
    done: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

const headerSlot = (view: Awaited<ReturnType<typeof mount>>) => view.find('[data-call-header-slot]');

describe('P11.1 — en groupe, l’en-tête flotte sur la grille', () => {
  test('debout, la grille part de la zone sûre et l’en-tête se pose sur ses vignettes du haut', async () => {
    windowOf(390, 844);
    const view = await mount(group());
    expect(headerSlot(view)?.getAttribute('data-call-header-floats')).toBe('');
    expect(headerSlot(view)?.className.split(' ')).toContain('absolute');
    expect(view.find('[data-call-stage-surface]')?.getAttribute('data-call-stage-top')).toBe('safe-area');
    view.done();
    windowOf(real.width, real.height);
  });

  test('flottant, l’en-tête ne prend le doigt que sur ses boutons : une vignette du haut se touche à travers lui, et son menu de modération descend sous lui', async () => {
    windowOf(390, 844);
    const view = await mount(group());
    const slot = headerSlot(view)?.className.split(' ') ?? [];
    expect(slot).toContain('pointer-events-none');
    expect(slot).toContain('[&_button]:pointer-events-auto');
    expect(view.find('[data-call-stage-surface]')?.className).toContain('[&_[data-call-tile-menu]]:top-14');
    view.done();
    windowOf(real.width, real.height);
  });

  test('à la une, l’en-tête reprend sa place au-dessus de la scène (P14)', async () => {
    windowOf(390, 844);
    const view = await mount(group());
    view.press('[data-call-tile-self]');
    await act(async () => {});
    expect(view.find('[data-call-spotlight]')).not.toBeNull();
    expect(headerSlot(view)?.hasAttribute('data-call-header-floats')).toBe(false);
    expect(headerSlot(view)?.className.split(' ')).not.toContain('absolute');
    expect(view.find('[data-call-stage-surface]')?.getAttribute('data-call-stage-top')).toBe('under-header');
    view.done();
    windowOf(real.width, real.height);
  });

  test('en hauteur compacte, la rangée de quatre reste sous l’en-tête (L4)', async () => {
    windowOf(844, 390);
    const view = await mount(group());
    expect(headerSlot(view)?.hasAttribute('data-call-header-floats')).toBe(false);
    view.done();
    windowOf(real.width, real.height);
  });

  test('un bandeau dans la pile garde l’en-tête dans le flux, et la grille passe sous la pile (L4.11)', async () => {
    windowOf(390, 844);
    const view = await mount(group({ screenSharing: true }));
    expect(headerSlot(view)?.hasAttribute('data-call-header-floats')).toBe(false);
    expect(view.find('[data-call-stage-surface]')?.getAttribute('data-call-stage-top')).toBe('under-header');
    view.done();
    windowOf(real.width, real.height);
  });

  test('un duo n’est pas touché : l’en-tête reste au-dessus de sa scène', async () => {
    windowOf(390, 844);
    const view = await mount({});
    expect(headerSlot(view)?.hasAttribute('data-call-header-floats')).toBe(false);
    view.done();
    windowOf(real.width, real.height);
  });
});

describe('L1.8 — en paysage, la pile des bannières est bornée à 560 et centrée, ma vignette à côté', () => {
  const topOf = (view: Awaited<ReturnType<typeof mount>>) => view.find('[data-call-corner-frame]')?.style.top ?? '';

  test('couchée : « Vous partagez votre écran » se borne à côté de ma vignette, qui garde son coin', async () => {
    windowOf(852, 393);
    const view = await mount({ screenSharing: true });
    const stack = view.find('[data-call-banner-stack]');
    expect(stack?.style.getPropertyValue('--call-banner-max')).toBe('568px');
    expect(stack?.className).toContain('[&>*]:max-w-[var(--call-banner-max)]');
    expect(topOf(view)).toBe('calc(env(safe-area-inset-top) + 60px)');
    view.done();
    windowOf(real.width, real.height);
  });

  test('couchée, sans ma vignette (caméra coupée) : la pile est bornée à 560', async () => {
    windowOf(852, 393);
    const view = await mount({ screenSharing: true, cameraOn: false, media: 'audio', members: { 'u-peer': member() } });
    expect(view.find('[data-call-banner-stack]')?.style.getPropertyValue('--call-banner-max')).toBe('584px');
    view.done();
    windowOf(real.width, real.height);
  });

  test('couchée, la capsule d’enregistrement puis la carte d’accord se posent à côté de ma vignette, qui garde son coin (R3.10 debout seulement)', async () => {
    windowOf(852, 393);
    const view = await mount({});
    const rest = topOf(view);
    act(() => callRecordingStore.setState({ view: { kind: 'recording', callId: 'call-top', recordingKind: 'audio', recordingId: 'rec-1', recorderId: 'u-peer', mine: false }, notice: null }));
    expect(topOf(view)).toBe(rest);
    act(() => {
      callRecordingStore.setState({ view: { kind: 'pending', callId: 'call-top', recordingKind: 'audio', recordingId: 'rec-2', requesterId: 'u-peer', mine: false, mustAnswer: true }, notice: null });
      callChromeStore.setState({ recordingCard: 132 });
    });
    expect(topOf(view)).toBe(rest);
    act(() => {
      callRecordingStore.setState({ view: { kind: 'idle' }, notice: null });
      callChromeStore.setState({ recordingCard: 0 });
    });
    view.done();
    windowOf(real.width, real.height);
  });

  test('debout, rien ne change : la pile tient la largeur et ma vignette descend sous elle (P16.8)', async () => {
    windowOf(390, 844);
    const view = await mount({ screenSharing: true });
    expect(view.find('[data-call-banner-stack]')?.style.getPropertyValue('--call-banner-max')).toBe('');
    expect(topOf(view)).toBe('calc(env(safe-area-inset-top) + 188px)');
    view.done();
    windowOf(real.width, real.height);
  });
});
