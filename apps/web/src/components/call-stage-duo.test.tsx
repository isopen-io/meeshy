import { act, useState } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { AuthenticatedSession } from '@/lib/api/session';
import { sessionStore } from '@/lib/api/session';
import { speakerColor } from '@/lib/calls/call-speaker-color';
import { DEFAULT_SELF_CORNER, DEFAULT_SELF_TILE, selfTileRestingFactor, selfTileSize, selfTileStore } from '@/lib/calls/call-self-tile';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';

import { CallStage, duoCornerView } from './call-stage';

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
  await duoCornerView.load();
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const fresh = () => selfTileStore.setState({ callId: null, scale: DEFAULT_SELF_TILE, corner: DEFAULT_SELF_CORNER });

function Harness({ active, onSwap, onReveal = () => undefined, chromeVisible = true, topInset = 0, bleedEnd = 0 }: { readonly active: ActiveCall; readonly onSwap: () => void; readonly onReveal?: () => void; readonly chromeVisible?: boolean; readonly topInset?: number; readonly bleedEnd?: number }) {
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
  return <CallStage call={active} layout="video-duo" language="fr" choice={null} onChoose={() => undefined} immersive={false} onToggleImmersive={() => undefined} moderation={null} self={self} chromeVisible={chromeVisible} onRevealChrome={onReveal} bleedEnd={bleedEnd} />;
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
    if (this.hasAttribute('data-call-stage-surface')) {
      const width = window.innerWidth - Number(this.getAttribute('data-bleed') ?? 0);
      return { left: 0, top: 0, right: width, bottom: 800, width, height: 800, x: 0, y: 0, toJSON: () => ({}) };
    }
    const moved = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(this.style.transform);
    const left = (this.getAttribute('data-call-self-tile-corner') === 'top-left' ? 20 : 300) - Number(this.closest('[data-bleed]')?.getAttribute('data-bleed') ?? 0) + Number(moved?.[1] ?? 0);
    const lifted = /\+ (\d+(?:\.\d+)?)px\)/.exec(this.style.top);
    const top = 80 + Number(lifted?.[1] ?? 0) + Number(moved?.[2] ?? 0);
    const width = Number.parseFloat(this.style.width) || 0;
    const height = Number.parseFloat(this.style.height) || 0;
    return { left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) };
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

const mount = (active: ActiveCall = call(), { chromeVisible = true, bleedEnd = 0, surface = false }: { readonly chromeVisible?: boolean; readonly bleedEnd?: number; readonly surface?: boolean } = {}) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const swaps = { count: 0 };
  const reveals = { count: 0 };
  let inset = 0;
  let bleed = bleedEnd;
  let shown = active;
  const render = (visible: boolean, nextInset = inset, nextBleed = bleed, nextCall = shown) => {
    inset = nextInset;
    bleed = nextBleed;
    shown = nextCall;
    const stage = <Harness active={shown} onSwap={() => (swaps.count += 1)} onReveal={() => (reveals.count += 1)} chromeVisible={visible} topInset={inset} bleedEnd={bleed} />;
    act(() =>
      root.render(
        surface ? (
          <div data-call-stage-surface="" data-bleed={bleed}>
            {stage}
          </div>
        ) : (
          <div data-bleed={bleed}>{stage}</div>
        ),
      ),
    );
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

describe('W1.5 — ma vignette prend le coin de fin du sens de lecture', () => {
  test('en droite à gauche, un appel neuf la pose en haut à gauche, contre la colonne', () => {
    fresh();
    document.documentElement.dir = 'rtl';
    try {
      const view = mount();
      expect(view.frame().getAttribute('data-call-self-tile-corner')).toBe('top-left');
      view.done();
    } finally {
      document.documentElement.dir = '';
    }
  });

  test('colonne ouverte, la dépose s’élit sur la scène réduite : juste à gauche du milieu de la scène, elle va au coin de début', () => {
    fresh();
    const view = mount(call(), { bleedEnd: 360 });
    view.drag(-300, 0);
    expect(view.frame().getAttribute('data-call-self-tile-corner')).toBe('top-left');
    view.done();
  });

  test('la colonne qui s’ouvre ou se ferme fait GLISSER la vignette — transformation seule, jamais un saut', () => {
    fresh();
    const played = withFlipProbe(() => {
      const view = mount();
      view.render(true, 0, 360);
      view.render(true, 0, 0);
      view.done();
    });
    expect(played).toEqual([
      [{ transform: 'translate(360px, 0px)' }, { transform: 'none' }],
      [{ transform: 'translate(-360px, 0px)' }, { transform: 'none' }],
    ]);
  });
});

describe('W1.5 — la scène qui glisse vers son nouveau centre (W1.20) porte ma vignette : son propre glissé n’en joue que le reste', () => {
  test('la colonne s’ouvre puis se ferme : la vignette part de sa place vue, la scène qui la porte ayant déjà fait la moitié du chemin', () => {
    fresh();
    const played = withFlipProbe(() => {
      const view = mount(call(), { surface: true });
      view.render(true, 0, 360);
      view.render(true, 0, 0);
      view.done();
    });
    expect(played).toEqual([
      [{ transform: 'translate(180px, 0px)' }, { transform: 'none' }],
      [{ transform: 'translate(-180px, 0px)' }, { transform: 'none' }],
    ]);
  });

  test('un changement de coin, colonne ouverte, ne retire rien : la scène ne bouge pas', () => {
    fresh();
    const played = withFlipProbe(() => {
      const view = mount(call(), { surface: true, bleedEnd: 360 });
      view.key('ArrowLeft');
      view.done();
    });
    expect(played).toEqual([[{ transform: 'translate(280px, 0px)' }, { transform: 'none' }]]);
  });
});

describe('L1.5 — en paysage, ma vignette se couche en 130 × 96 à sa hauteur de coin', () => {
  const turn = (width: number, height: number) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height });
    act(() => window.dispatchEvent(new Event('resize')));
  };
  const upright = { width: 390, height: 844 };
  const real = { width: 0, height: 0 };
  beforeEach(() => {
    real.width = window.innerWidth;
    real.height = window.innerHeight;
  });
  afterEach(() => turn(real.width, real.height));

  test('fenêtre couchée : le cadre fait 130 × 96, à 60 sous la zone sûre ; debout, il garde 112 × 160 à 128', () => {
    fresh();
    turn(844, 390);
    const view = mount();
    expect(view.frame().style.width).toBe('130px');
    expect(view.frame().style.height).toBe('96px');
    expect(view.frame().style.top).toBe('calc(env(safe-area-inset-top) + 60px)');
    view.done();
    turn(upright.width, upright.height);
    const standing = mount();
    expect(standing.frame().style.width).toBe('112px');
    expect(standing.frame().style.top).toBe('calc(env(safe-area-inset-top) + 128px)');
    standing.done();
  });

  test('tourner l’écran joue le changement de taille en transform (translation + échelle autour du coin), sans saut', () => {
    fresh();
    turn(upright.width, upright.height);
    const played = withFlipProbe(() => {
      const view = mount();
      turn(844, 390);
      view.done();
    });
    const [first] = played;
    expect(first).toHaveLength(2);
    expect(first?.[0]?.transform).toMatch(/^translate\(.+\) scale\(.+\)$/);
    expect(first?.[1]).toEqual({ transform: 'none' });
    expect(Object.keys(first?.[0] ?? {})).toEqual(['transform']);
  });

  test('la scène qui suit la fenêtre qu’on tourne ne glisse pas : ma vignette joue tout son mouvement, rien ne s’en retire (W1.20)', () => {
    const rotate = (surface: boolean) => {
      fresh();
      turn(upright.width, upright.height);
      return withFlipProbe(() => {
        const view = mount(call(), { surface });
        turn(844, 390);
        view.done();
      });
    };
    const alone = rotate(false);
    expect(alone).toHaveLength(1);
    expect(rotate(true)).toEqual(alone);
  });

  test('redimensionner la fenêtre sans changer de forme ne rejoue rien : la vignette suit la fenêtre, aucune mesure ni animation à chaque image', () => {
    fresh();
    turn(568, 200);
    const played = withFlipProbe(() => {
      const view = mount();
      const before = view.frame().style.width;
      turn(568, 220);
      expect(view.frame().style.width).not.toBe(before);
      view.done();
    });
    expect(played).toEqual([]);
  });

  test('mouvement réduit : la rotation se remplace par un fondu court, opacité seule', () => {
    fresh();
    turn(upright.width, upright.height);
    const played = withFlipProbe(() => {
      const view = mount();
      turn(844, 390);
      view.done();
    }, { reducedMotion: true });
    expect(played).toEqual([[{ opacity: 0 }, { opacity: 1 }]]);
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

  test('vidéos permutées : le micro barré suit son image dans la vignette, dans sa plaque comme en groupe', () => {
    fresh();
    const view = mount(call({ members: { 'u-peer': member({ micMuted: true }) } }));
    act(() => view.tile().click());
    expect(view.find('[data-call-peer-muted-slot]:not([data-leaving]) [data-call-peer-muted="main"]')).toBeNull();
    expect(view.find('[data-call-corner] [data-call-tile-plate] [data-call-tile-muted] svg')).not.toBeNull();
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

/**
 * **MA VIGNETTE DE DUO PORTE LA PLAQUE « VOUS »** (#17982 ; P1.4, G1.2, W1.18, S2.5, L1.5, P16.8) — la MÊME plaque de
 * verre que les vignettes d'un groupe (`CallTileNameplate`, remise à la grille par son kit), au même mot (`call.you`,
 * sept langues), posée DANS le liseré, et lue par le lecteur d'écran. Elle suit la personne que la vignette montre :
 * permutée, la vignette montre l'autre et porte son nom, son micro coupé compris. Rangée au toucher (loi 11), elle
 * garde sa taille de petite vignette : contre-mise à l'échelle, comme le liseré.
 */
describe('P1.4 — ma vignette de duo porte la plaque « Vous »', () => {
  const plate = (view: ReturnType<typeof mount>) => view.find('[data-call-corner] [data-call-tile-plate]');

  test('la plaque de verre du groupe, « Vous », dans le liseré de ma vignette', () => {
    fresh();
    const view = mount();
    expect(plate(view)?.textContent).toBe('Vous');
    expect(plate(view)?.className.split(' ')).toContain('glass-tone');
    expect(plate(view)?.getAttribute('data-glass-tone')).toBe('deep');
    expect(plate(view)?.closest<HTMLElement>('[data-call-corner]')?.style.borderColor).not.toBe('');
    view.done();
  });

  test('le lecteur d’écran la lit : le nom de la vignette précède son geste', () => {
    fresh();
    const view = mount();
    expect(view.tile().getAttribute('aria-label')).toBe('Vous · Inverser les vidéos');
    view.done();
  });

  test('permutée, la vignette montre l’autre : la plaque porte son nom, et son micro coupé', () => {
    fresh();
    const view = mount(call({ members: { 'u-peer': member({ micMuted: true }) } }));
    act(() => view.tile().click());
    expect(plate(view)?.textContent).toBe('Amina');
    expect(plate(view)?.querySelector('[data-call-tile-muted] svg')).not.toBeNull();
    expect(view.tile().getAttribute('aria-label')).toBe('Amina · Inverser les vidéos');
    view.done();
  });

  test('G1.2 — rangée, ma vignette garde sa plaque, à la taille d’une petite vignette (contre-mise à l’échelle)', () => {
    fresh();
    const full = { width: window.innerWidth, height: window.innerHeight };
    const view = mount(call(), { chromeVisible: false });
    const factor = selfTileRestingFactor(DEFAULT_SELF_TILE, false, full);
    expect(plate(view)?.textContent).toBe('Vous');
    expect(Number(plate(view)?.style.getPropertyValue('scale')) * factor).toBeCloseTo(1, 3);
    view.render(true);
    expect(plate(view)?.style.getPropertyValue('scale')).toBe('1');
    view.done();
  });

  test('S2.5 · P16.8 — pendant MON partage, ma caméra en vignette garde sa plaque « Vous »', () => {
    fresh();
    const view = mount(call({ cameraOn: false, screenSharing: true, localStream: stream(), cameraPreview: stream(), remoteStreams: {}, members: { 'u-peer': member({ cameraOn: false }) } }));
    expect(plate(view)?.textContent).toBe('Vous');
    view.done();
  });

  test('la grille d’un groupe, la vignette du duo et celle de la sonnerie posent le MÊME composant de plaque, au même mot', async () => {
    const source = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
    for (const host of ['call-grid.tsx', 'call-incoming-answer.tsx', 'call-duo-corner.tsx']) expect({ host, poses: source(host).includes('<CallTileNameplate') }).toEqual({ host, poses: true });
    expect(source('call-grid.tsx')).not.toContain('function NameLabel');
    expect(source('call-incoming-answer.tsx')).toContain("translate(language, 'call.you')");
  });
});

/**
 * **LOI 17 — MA VIGNETTE ET LE MICRO COUPÉ NE PARAISSENT NI NE PARTENT D'UN COUP** (loi-17.1, loi-17.12) : ma caméra
 * qui se coupe fait repartir ma vignette en fondu (elle reste montée, sortante, le temps du mouvement, sans prendre le
 * doigt) ; la pastille du micro coupé du pair arrive et repart de même ; et la vignette qui montre l'autre passe de
 * son image à son avatar en fondu quand sa caméra se coupe.
 */
describe('loi 17 — ma vignette et le micro coupé du pair entrent et sortent en fondu', () => {
  /* Chaque mouvement demandé reste en cours jusqu'à ce que le témoin le finisse : on lit l'état PENDANT le fondu. */
  const finishers: Array<() => void> = [];
  const saved: { animate?: PropertyDescriptor | undefined } = {};
  beforeAll(async () => {
    const { loadPillMotion } = await import('@/lib/calls/use-pill-motion');
    await loadPillMotion();
  });
  beforeEach(() => {
    finishers.length = 0;
    saved.animate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: () => {
        const settle = { done: () => undefined as void };
        const finished = new Promise<void>((resolve) => (settle.done = resolve));
        finishers.push(() => settle.done());
        return { finished, cancel: () => undefined };
      },
    });
  });
  afterEach(() => {
    if (saved.animate === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    else Object.defineProperty(HTMLElement.prototype, 'animate', saved.animate);
  });

  test('loi-17.1 — ma caméra coupée : ma vignette repart en fondu, sortante et intouchable le temps du mouvement ; rallumée, elle revient', async () => {
    fresh();
    const view = mount();
    const slot = () => view.find('[data-call-corner-slot]');
    expect(slot()?.hasAttribute('data-leaving')).toBe(false);
    view.render(true, 0, 0, call({ cameraOn: false }));
    expect(slot()?.hasAttribute('data-leaving')).toBe(true);
    expect(slot()?.hasAttribute('inert')).toBe(true);
    expect(slot()?.querySelector('[data-call-tile-plate]')?.textContent).toBe('Vous');
    await act(async () => finishers.forEach((done) => done()));
    expect(slot()).toBeNull();
    view.render(true, 0, 0, call());
    expect(slot()?.hasAttribute('data-leaving')).toBe(false);
    expect(finishers.length).toBeGreaterThan(1);
    view.done();
  });

  test('loi-17.1 — le micro coupé du pair arrive et repart en fondu, monté le temps de sa sortie', () => {
    fresh();
    const view = mount();
    expect(view.find('[data-call-peer-muted-slot]')).toBeNull();
    view.render(true, 0, 0, call({ members: { 'u-peer': member({ micMuted: true }) } }));
    expect(view.find('[data-call-peer-muted-slot] [data-call-peer-muted="main"]')).not.toBeNull();
    view.render(true, 0, 0, call());
    expect(view.find('[data-call-peer-muted-slot]')?.hasAttribute('data-leaving')).toBe(true);
    view.done();
  });

  test('loi-17.12 — permutée, la caméra de l’autre qui se coupe : son avatar monte en fondu PAR-DESSUS son image dans la vignette', () => {
    fresh();
    const view = mount();
    act(() => view.tile().click());
    expect(view.find('[data-call-corner] video')).not.toBeNull();
    expect(view.find('[data-call-corner] [data-call-camera-off]')?.className).toContain('invisible');
    view.render(true, 0, 0, call({ members: { 'u-peer': member({ cameraOn: false }) } }));
    expect(view.find('[data-call-corner] [data-call-camera-off]')?.className).not.toContain('invisible');
    expect(view.find('[data-call-corner] video')).not.toBeNull();
    view.done();
  });
});
