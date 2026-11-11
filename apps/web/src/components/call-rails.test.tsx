import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { RAILS_BESIDE_PILL_WIDTH, RAILS_PILL_CLEARANCE, RAILS_TOP, railLength, railsClearance } from '@/lib/calls/call-rails-clearance';
import { callViewport, DEFAULT_SELF_TILE, selfTileFootprint, selfTileStore, setSelfTileCorner, type SelfTileCorner } from '@/lib/calls/call-self-tile';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallScreen } from './call-screen';

/**
 * **LE RAIL « L'APPEL » NE RECOUVRE PLUS MA VIGNETTE** (#17327, #17429) — la
 * planche P2 pose ma vignette en haut à droite, au-dessus du rail. Le `(…)`
 * ouvert en duo vidéo, le rail du côté de ma vignette se décale (sous elle, au-
 * dessus d'elle en coin bas, ou à côté d'elle) ; l'autre rail ne bouge pas, et
 * sans vignette rien ne bouge. La géométrie est celle de `call-rails-clearance.ts`.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const camera = { kind: 'video', readyState: 'live', getCapabilities: () => ({}), getSettings: () => ({}), applyConstraints: async () => undefined };

/* Une piste vivante, sur le prototype de `MediaStream` que le DOM du témoin fournit : `srcObject` ne prend rien d'autre. */
const stream = (): MediaStream => Object.assign(Object.create(MediaStream.prototype) as MediaStream, { getVideoTracks: () => [camera], getAudioTracks: () => [], getTracks: () => [camera] });

const member = (overrides: Partial<CallMember> = {}): CallMember => ({ userId: 'u-peer', name: 'Awa', avatar: null, micMuted: false, cameraOn: true, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected', ...overrides });

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-rails-tile',
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
  members: { 'u-peer': member() },
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

beforeAll(async () => {
  await loadCallControlsCatalog('fr');
  renderToStaticMarkup(<CallScreen call={call({ cameraOn: false, members: { 'u-peer': member({ cameraOn: false }) } })} canShare initiallyExpanded />);
  await import('./call-control-actions');
  await import('./call-rails');
  await new Promise((resolve) => setTimeout(resolve, 0));
  /* Le cadre des rails arrivé, un second rendu amorce le contenu d'un rail, qu'il charge à son tour. */
  renderToStaticMarkup(<CallScreen call={call({ cameraOn: false, members: { 'u-peer': member({ cameraOn: false }) } })} canShare initiallyExpanded />);
  await new Promise((resolve) => setTimeout(resolve, 0));
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => selfTileStore.setState({ callId: null, scale: DEFAULT_SELF_TILE, corner: 'top-right' }));

const mount = (overrides: Partial<ActiveCall> = {}) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<CallScreen call={call({ localStream: stream(), remoteStreams: { 'u-peer': stream() }, ...overrides })} canShare initiallyExpanded />));
  const side = (name: 'leading' | 'trailing') => host.querySelector<HTMLElement>(`[data-call-rails] > [data-call-rail-slot="${name}"]`);
  const done = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { host, side, done };
};

/** Ce que la loi demande pour ma vignette dans ce coin, à l'écran du témoin : « Mon image » porte Caméra, Retourner et Écran, « L'appel » ses six actions et le PiP absent. */
const expected = (corner: SelfTileCorner, counts: { readonly leading: number; readonly trailing: number }) => {
  const viewport = callViewport();
  const tile = selfTileFootprint({ layout: 'video-duo', cameraOn: true, swapped: false, framed: false, immersive: false, corner, scale: DEFAULT_SELF_TILE, viewport, topInset: 0 });
  return railsClearance({ tile, viewport, rtl: false, lengths: { leading: railLength(counts.leading), trailing: railLength(counts.trailing) } });
};

const railCount = (host: HTMLElement, family: 'mine' | 'call') => host.querySelectorAll(`[data-call-rail="${family}"] button`).length;

describe('CallScreen — les rails du duo laissent ma vignette visible (#17429)', () => {
  test('ma vignette en haut à droite : le rail « l’appel » se pose SOUS elle, « mon image » ne bouge pas', () => {
    const view = mount();
    const counts = { leading: railCount(view.host, 'mine'), trailing: railCount(view.host, 'call') };
    expect(counts.trailing).toBeGreaterThan(0);
    const clearance = expected('top-right', counts);
    expect(clearance.trailing.top).toBeGreaterThan(0);
    expect(view.side('trailing')?.style.paddingTop).toBe(`${clearance.trailing.top}px`);
    expect(view.side('leading')?.style.paddingTop ?? '').toBe('');
    expect(view.side('leading')?.style.paddingBottom ?? '').toBe('');
    view.done();
  });

  test('glissée en bas à gauche, ma vignette décale le rail « mon image » au-dessus d’elle, « l’appel » revient au centre', () => {
    setSelfTileCorner('call-rails-tile', 'bottom-left');
    const view = mount();
    const counts = { leading: railCount(view.host, 'mine'), trailing: railCount(view.host, 'call') };
    const clearance = expected('bottom-left', counts);
    expect(clearance.leading.bottom).toBeGreaterThan(0);
    expect(view.side('leading')?.style.paddingBottom).toBe(`${clearance.leading.bottom}px`);
    expect(view.side('trailing')?.style.paddingTop ?? '').toBe('');
    view.done();
  });

  test('la zone des rails est celle que la loi mesure : 3,5 rem sous la zone sûre, 6,5 rem au-dessus d’elle, jusqu’en bas dès 35 rem', () => {
    const view = mount();
    const zone = view.host.querySelector('[data-call-rails]')?.className ?? '';
    expect(zone).toContain(`top-${RAILS_TOP / 4}`);
    expect(zone).toContain(`bottom-[${RAILS_PILL_CLEARANCE / 16}rem]`);
    expect(zone).toContain(`min-[${RAILS_BESIDE_PILL_WIDTH / 16}rem]:bottom-0`);
    view.done();
  });

  test('caméra coupée et l’autre sans image : aucune vignette, aucun rail ne bouge', () => {
    const view = mount({ cameraOn: false, members: { 'u-peer': member({ cameraOn: false }) }, remoteStreams: {} });
    expect(view.side('trailing')).not.toBeNull();
    expect(view.side('trailing')?.style.paddingTop ?? '').toBe('');
    expect(view.side('leading')?.style.paddingBottom ?? '').toBe('');
    view.done();
  });
});

describe('CallScreen — (…) nomme ce qu’il ouvre, à deux aussi', () => {
  test('aria-controls du (…) désigne les rails qu’il fait sortir', () => {
    const view = mount();
    const more = view.host.querySelector('[data-call-more]');
    expect(more?.getAttribute('aria-expanded')).toBe('true');
    const target = view.host.querySelector(`[id="${more?.getAttribute('aria-controls') ?? ''}"]`);
    expect(target).not.toBeNull();
    expect(target?.querySelectorAll('[data-call-rail]').length).toBe(2);
    view.done();
  });
});

describe('CallScreen — un rail qui défile s’efface en fondu à ses deux bords (facture #17406)', () => {
  test('le verre du rail reste entier ; ce qui défile dedans s’estompe en haut comme en bas, au-delà de ses 8 px de bord', () => {
    const view = mount();
    for (const family of ['mine', 'call']) {
      const rail = view.host.querySelector<HTMLElement>(`[data-call-rail="${family}"]`);
      expect(rail?.className).toContain('glass-call');
      expect(rail?.style.maskImage ?? '').toBe('');
      const scroller = rail?.querySelector<HTMLElement>('[data-call-rail-scroll]');
      expect(scroller?.className).toContain('overflow-y-auto');
      expect(scroller?.className).toContain('p-2');
      expect(scroller?.style.maskImage).toBe('linear-gradient(to bottom, transparent, #000 8px, #000 calc(100% - 8px), transparent)');
      expect(scroller?.querySelectorAll('button').length).toBeGreaterThan(0);
    }
    view.done();
  });
});

describe('CallScreen — tourner l’écran replace le rail (#17429)', () => {
  const resize = (width: number, height: number) =>
    act(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
      Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height });
      window.dispatchEvent(new Event('resize'));
    });

  test('du portrait au paysage, le rail « l’appel » passe de sous ma vignette à côté d’elle, et ma vignette suit l’écran', () => {
    const real = { width: window.innerWidth, height: window.innerHeight };
    resize(390, 844);
    const view = mount();
    const counts = { leading: railCount(view.host, 'mine'), trailing: railCount(view.host, 'call') };
    expect(view.side('trailing')?.style.paddingTop).toBe(`${expected('top-right', counts).trailing.top}px`);
    resize(568, 320);
    const turned = expected('top-right', counts);
    expect(turned.trailing.inline).toBeGreaterThan(0);
    expect(view.side('trailing')?.style.paddingTop ?? '').toBe('');
    expect(view.side('trailing')?.style.paddingInlineEnd).toBe(`${turned.trailing.inline}px`);
    expect(view.host.querySelector<HTMLElement>('[data-call-corner-frame]')?.style.height).toBe(`${selfTileFootprint({ layout: 'video-duo', cameraOn: true, swapped: false, framed: false, immersive: false, corner: 'top-right', scale: DEFAULT_SELF_TILE, viewport: { width: 568, height: 320 }, topInset: 0 })?.height}px`);
    view.done();
    resize(real.width, real.height);
  });
});
