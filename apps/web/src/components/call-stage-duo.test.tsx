import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { AuthenticatedSession } from '@/lib/api/session';
import { sessionStore } from '@/lib/api/session';
import { speakerColor } from '@/lib/calls/call-speaker-color';
import { DEFAULT_SELF_CORNER, DEFAULT_SELF_TILE, selfTileRestingFactor, selfTileSize, selfTileStore } from '@/lib/calls/call-self-tile';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';

import { CallStage } from './call-stage';

/**
 * LE DUO VIDÉO (#8747, #8787) — ma vignette se GLISSE vers l'un des quatre
 * coins (le cran du zoom, seule commande qu'elle porte, la suit — les
 * rails vivent sur les bords, #17327), un toucher reste un toucher, les
 * flèches la déplacent ; et le micro coupé du correspondant se
 * VOIT sur son image, et se dit dans le libellé de la scène.
 */

const camera = { kind: 'video', readyState: 'live', getCapabilities: () => ({}), getSettings: () => ({}), applyConstraints: async () => undefined };

const stream = (): MediaStream => Object.assign(Object.create(MediaStream.prototype) as MediaStream, { getVideoTracks: () => [camera], getAudioTracks: () => [], getTracks: () => [camera] });

const member = (overrides: Partial<CallMember> = {}): CallMember => ({ userId: 'u-peer', name: 'Amina', avatar: null, micMuted: false, cameraOn: true, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected', ...overrides });

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-duo',
  conversationId: 'c-1',
  media: 'video',
  direction: 'outgoing',
  isGroup: false,
  title: 'Amina',
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
  localStream: stream(),
  remoteStreams: { 'u-peer': stream() },
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

const fresh = () => selfTileStore.setState({ callId: null, scale: DEFAULT_SELF_TILE, corner: DEFAULT_SELF_CORNER });

function Harness({ active, onSwap, onReveal = () => undefined, chromeVisible = true, topInset = 0 }: { readonly active: ActiveCall; readonly onSwap: () => void; readonly onReveal?: () => void; readonly chromeVisible?: boolean; readonly topInset?: number }) {
  const [full, setFull] = useState(false);
  const self = {
    full,
    onToggle: () => {
      onSwap();
      setFull((value) => !value);
    },
    zoom: 'step' as const,
    column: () => null,
    topInset,
  };
  return <CallStage call={active} layout="video-duo" language="fr" choice={null} onChoose={() => undefined} immersive={false} onToggleImmersive={() => undefined} moderation={null} self={self} chromeVisible={chromeVisible} onRevealChrome={onReveal} />;
}

/** Espionne `animate` et pose un rectangle qui suit le coin : le FLIP se lit sans moteur de mise en page. */
function withFlipProbe(run: () => void, { reducedMotion = false }: { readonly reducedMotion?: boolean } = {}): (readonly Keyframe[])[] {
  const played: (readonly Keyframe[])[] = [];
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  const savedAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  const savedRect = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getBoundingClientRect');
  const savedMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  proto.animate = function animate(frames: readonly Keyframe[]) {
    played.push(frames);
    return { cancel: () => undefined };
  };
  proto.getBoundingClientRect = function rect(this: HTMLElement) {
    const moved = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(this.style.transform);
    const left = (this.getAttribute('data-call-self-tile-corner') === 'top-left' ? 20 : 300) + Number(moved?.[1] ?? 0);
    const lifted = /\+ (\d+(?:\.\d+)?)px\)/.exec(this.style.top);
    const top = 80 + Number(lifted?.[1] ?? 0) + Number(moved?.[2] ?? 0);
    return { left, top, right: left, bottom: top, width: 0, height: 0, x: left, y: top, toJSON: () => ({}) };
  };
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: reducedMotion }) });
  try {
    run();
  } finally {
    const restore = (name: string, saved: PropertyDescriptor | undefined, target: object) => {
      if (saved === undefined) Reflect.deleteProperty(target, name);
      else Object.defineProperty(target, name, saved);
    };
    restore('animate', savedAnimate, HTMLElement.prototype);
    restore('getBoundingClientRect', savedRect, HTMLElement.prototype);
    restore('matchMedia', savedMedia, window);
  }
  return played;
}

const mount = (active: ActiveCall = call(), { chromeVisible = true }: { readonly chromeVisible?: boolean } = {}) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const swaps = { count: 0 };
  const reveals = { count: 0 };
  let inset = 0;
  const render = (visible: boolean, nextInset = inset) => {
    inset = nextInset;
    act(() => root.render(<Harness active={active} onSwap={() => (swaps.count += 1)} onReveal={() => (reveals.count += 1)} chromeVisible={visible} topInset={inset} />));
  };
  render(chromeVisible);
  const find = (selector: string) => host.querySelector(selector) as HTMLElement | null;
  const tile = () => find('[data-call-corner]') as HTMLElement;
  const frame = () => find('[data-call-corner-frame]') as HTMLElement;
  const pointer = (type: string, clientX: number, clientY: number) => act(() => tile().dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX, clientY, button: 0, bubbles: true })));
  const drag = (dx: number, dy: number, { release = true }: { readonly release?: boolean } = {}) => {
    pointer('pointerdown', 500, 300);
    pointer('pointermove', 500 + dx / 2, 300 + dy / 2);
    pointer('pointermove', 500 + dx, 300 + dy);
    if (!release) return;
    pointer('pointerup', 500 + dx, 300 + dy);
    act(() => tile().click());
  };
  const key = (name: string) => act(() => tile().dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })));
  const done = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { find, tile, frame, drag, key, swaps, reveals, done, render };
};

describe('ma vignette se glisse de coin en coin (#8747)', () => {
  test('par défaut, en haut à droite', () => {
    fresh();
    const view = mount();
    expect(view.frame().getAttribute('data-call-self-tile-corner')).toBe('top-right');
    view.done();
  });

  test('glissée vers le bas à gauche, elle s’y aimante, sans permuter les vidéos', () => {
    fresh();
    const view = mount();
    view.drag(-2000, 2000);
    expect(view.frame().getAttribute('data-call-self-tile-corner')).toBe('bottom-left');
    expect(view.swaps.count).toBe(0);
    view.done();
  });

  test('pendant le glissé, la vignette suit le doigt, sans transition — et ne traîne aucune rangée de commandes (#17327)', () => {
    fresh();
    const view = mount();
    view.drag(-40, 60, { release: false });
    expect(view.frame().style.transform).toBe('translate(-40px, 60px)');
    expect(view.frame().getAttribute('data-call-self-tile-dragging')).toBe('');
    expect(view.find('[data-call-self-row]')).toBeNull();
    view.done();
  });

  test('un toucher reste un toucher : sous le seuil, elle ne bouge pas et permute les vidéos', () => {
    fresh();
    const view = mount();
    view.drag(3, -3);
    expect(view.frame().getAttribute('data-call-self-tile-corner')).toBe('top-right');
    expect(view.swaps.count).toBe(1);
    view.done();
  });

  test('au clavier, les flèches la déplacent de coin en coin et le disent', () => {
    fresh();
    const view = mount();
    view.key('ArrowLeft');
    expect(view.frame().getAttribute('data-call-self-tile-corner')).toBe('top-left');
    view.key('ArrowDown');
    expect(view.frame().getAttribute('data-call-self-tile-corner')).toBe('bottom-left');
    expect(view.find('[data-call-self-tile-status]')?.textContent).toBe('Ma vignette : en bas à gauche');
    expect(view.swaps.count).toBe(0);
    view.done();
  });

  test('la vignette dit comment la déplacer', () => {
    fresh();
    const view = mount();
    const hint = document.getElementById(view.tile().getAttribute('aria-describedby') ?? '');
    expect(hint?.textContent).toBe('Touchez pour inverser les vidéos ; faites-la glisser ou utilisez les flèches pour la déplacer');
    view.done();
  });

  test('le coin tient pour l’appel : la scène remontée la retrouve où on l’a laissée', () => {
    fresh();
    const first = mount();
    first.key('ArrowDown');
    first.done();
    const again = mount();
    expect(again.frame().getAttribute('data-call-self-tile-corner')).toBe('bottom-right');
    again.done();
  });

  test('changer de coin se joue en FLIP : un `transform` qui revient à zéro, jamais left/top/width/height (#11314)', () => {
    fresh();
    const played = withFlipProbe(() => {
      const view = mount();
      view.key('ArrowLeft');
      expect(view.frame().className).not.toMatch(/transition/);
      view.done();
    });
    expect(played).toEqual([[{ transform: 'translate(280px, 0px)' }, { transform: 'none' }]]);
  });

  test('lâchée près de son coin, elle y revient en FLIP depuis le doigt — ni saut, ni rien pendant le glissé', () => {
    fresh();
    const played = withFlipProbe(() => {
      const view = mount();
      view.drag(-40, 60);
      expect(view.frame().getAttribute('data-call-self-tile-corner')).toBe('top-right');
      view.done();
    });
    expect(played).toEqual([[{ transform: 'translate(-40px, 60px)' }, { transform: 'none' }]]);
  });

  test('un bandeau qui arrive sous l’en-tête fait GLISSER ma vignette de sa hauteur — transformation seule, jamais un saut (R1.6)', () => {
    fresh();
    const played = withFlipProbe(() => {
      const view = mount();
      view.render(true, 56);
      view.render(true, 0);
      view.done();
    });
    expect(played).toEqual([
      [{ transform: 'translate(0px, -56px)' }, { transform: 'none' }],
      [{ transform: 'translate(0px, 56px)' }, { transform: 'none' }],
    ]);
  });

  test('mouvement réduit : le retour au coin est sec', () => {
    fresh();
    const played = withFlipProbe(() => {
      const view = mount();
      view.key('ArrowLeft');
      view.done();
    }, { reducedMotion: true });
    expect(played).toEqual([]);
  });
});

describe('le micro coupé du correspondant se voit en vidéo (#8787)', () => {
  test('micro coupé : un micro barré sur son image, et la scène le dit', () => {
    fresh();
    const view = mount(call({ members: { 'u-peer': member({ micMuted: true }) } }));
    expect(view.find('[data-call-peer-muted="main"]')).not.toBeNull();
    expect(view.find('[data-call-peer-muted="main"] svg')).not.toBeNull();
    expect(view.find('[data-call-duo-stage]')?.getAttribute('aria-label')).toBe('Amina · Contact en sourdine');
    view.done();
  });

  test('micro ouvert : aucun glyphe, la scène ne porte que son nom', () => {
    fresh();
    const view = mount();
    expect(view.find('[data-call-peer-muted]')).toBeNull();
    expect(view.find('[data-call-duo-stage]')?.getAttribute('aria-label')).toBe('Amina');
    view.done();
  });

  test('sa caméra coupée, le micro barré reste sur son portrait', () => {
    fresh();
    const view = mount(call({ members: { 'u-peer': member({ micMuted: true, cameraOn: false }) } }));
    expect(view.find('[data-call-peer-muted="main"]')).not.toBeNull();
    view.done();
  });

  test('vidéos permutées : le micro barré suit son image dans la vignette', () => {
    fresh();
    const view = mount(call({ members: { 'u-peer': member({ micMuted: true }) } }));
    act(() => view.tile().click());
    expect(view.find('[data-call-peer-muted="main"]')).toBeNull();
    expect(view.find('[data-call-corner] [data-call-peer-muted="corner"]')).not.toBeNull();
    view.done();
  });
});

describe('la couleur de la vignette du coin (#16635)', () => {
  const asMe = () => sessionStore.setState({ session: { status: 'authenticated', token: 'jwt', sessionToken: 's', expiresAt: Number.MAX_SAFE_INTEGER, user: { id: 'u-moi', username: 'moi', displayName: 'Moi' } } as unknown as AuthenticatedSession });

  test('ma vignette porte MA couleur ; échangée, elle porte celle du correspondant', () => {
    fresh();
    asMe();
    const view = mount();
    expect(view.tile().style.borderColor).toBe(speakerColor('u-moi'));
    act(() => view.tile().click());
    expect(view.tile().style.borderColor).toBe(speakerColor('u-peer'));
    view.done();
    sessionStore.setState({ session: { status: 'anonymous' } });
  });
});

describe('un toucher range tout : ma vignette passe à sa petite taille (#16663)', () => {
  const screenOf = () => ({ width: window.innerWidth, height: window.innerHeight });

  test('G1.11 — rangée, ma vignette GARDE son cadre et se met à l’échelle de sa petite taille depuis son coin ; rendue, elle reprend son échelle', () => {
    fresh();
    const full = screenOf();
    const view = mount(call(), { chromeVisible: false });
    expect(view.frame().style.width).toBe(`${selfTileSize(DEFAULT_SELF_TILE, full).width}px`);
    expect(view.frame().style.height).toBe(`${selfTileSize(DEFAULT_SELF_TILE, full).height}px`);
    expect(view.frame().getAttribute('data-call-self-tile-compact')).toBe('');
    expect(Number(view.frame().style.getPropertyValue('scale'))).toBeCloseTo(selfTileRestingFactor(DEFAULT_SELF_TILE, false, full), 4);
    expect(view.frame().style.transformOrigin).toBe('top right');
    view.render(true);
    expect(view.frame().style.width).toBe(`${selfTileSize(DEFAULT_SELF_TILE, full).width}px`);
    expect(view.frame().getAttribute('data-call-self-tile-compact')).toBeNull();
    expect(view.frame().style.getPropertyValue('scale')).toBe('1');
    view.done();
  });

  test('G1.11 — le liseré et les coins gardent leur taille de petite vignette : ils sont contre-mis à l’échelle', () => {
    fresh();
    const full = screenOf();
    const view = mount(call(), { chromeVisible: false });
    const factor = selfTileRestingFactor(DEFAULT_SELF_TILE, false, full);
    expect(parseFloat(view.tile().style.borderWidth) * factor).toBeCloseTo(2, 3);
    view.done();
  });

  test('G1.11 — ranger ou rendre ne passe que par la transformation : le cadre ne change jamais de largeur ni de hauteur', () => {
    fresh();
    const view = mount(call(), { chromeVisible: true });
    const before = [view.frame().style.width, view.frame().style.height];
    view.render(false);
    expect([view.frame().style.width, view.frame().style.height]).toEqual(before);
    view.done();
  });
});

describe('toucher ma vignette contrôles cachés rend d’abord les contrôles (G1.9, loi 15)', () => {
  test('chrome rangé, le toucher rend les contrôles et ne permute pas les flux', () => {
    fresh();
    const view = mount(call(), { chromeVisible: false });
    act(() => view.tile().click());
    expect(view.reveals.count).toBe(1);
    expect(view.swaps.count).toBe(0);
    view.done();
  });

  test('chrome visible, le toucher permute les flux comme avant', () => {
    fresh();
    const view = mount(call(), { chromeVisible: true });
    act(() => view.tile().click());
    expect(view.swaps.count).toBe(1);
    expect(view.reveals.count).toBe(0);
    view.done();
  });

  test('le focus que le pointeur donne à la vignette rend le chrome AVANT le clic : le clic reste un toucher qui rend, il ne permute pas', () => {
    fresh();
    const view = mount(call(), { chromeVisible: false });
    act(() => {
      view.tile().dispatchEvent(new PointerEvent('pointerdown', { pointerId: 3, clientX: 10, clientY: 10, button: 0, bubbles: true }));
    });
    view.render(true);
    act(() => {
      view.tile().dispatchEvent(new PointerEvent('pointerup', { pointerId: 3, clientX: 10, clientY: 10, button: 0, bubbles: true }));
      view.tile().click();
    });
    expect(view.swaps.count).toBe(0);
    view.done();
  });

  test('au clavier, le focus a déjà rendu le chrome : Entrée permute (VoiceOver garde la permutation directe)', () => {
    fresh();
    const view = mount(call(), { chromeVisible: true });
    act(() => view.tile().click());
    expect(view.swaps.count).toBe(1);
    view.done();
  });

  test('pendant MON partage, ma caméra reste en vignette « moi » au liseré de ma couleur, sans le flux d’écran (S2.8)', () => {
    fresh();
    const screen = stream();
    const mine = stream();
    const view = mount(call({ cameraOn: false, screenSharing: true, localStream: screen, cameraPreview: mine, remoteStreams: {}, members: { 'u-peer': member({ cameraOn: false }) } }));
    const video = view.tile().querySelector('video') as HTMLVideoElement | null;
    expect(video).not.toBeNull();
    expect(video?.srcObject).toBe(mine);
    expect(view.tile().style.borderColor).not.toBe('');
    view.done();
  });

  test('pendant mon partage sans caméra avant, aucune vignette « moi »', () => {
    fresh();
    const view = mount(call({ cameraOn: false, screenSharing: true, remoteStreams: {}, members: { 'u-peer': member({ cameraOn: false }) } }));
    expect(view.frame()).toBeNull();
    view.done();
  });
});
