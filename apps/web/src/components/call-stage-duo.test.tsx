import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { DEFAULT_SELF_CORNER, DEFAULT_SELF_TILE, selfTileStore } from '@/lib/calls/call-self-tile';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';

import { CallStage } from './call-stage';

/**
 * LE DUO VIDÉO (#8747, #8787) — ma vignette se GLISSE vers l'un des quatre
 * coins, ses deux rangées de commandes la suivent, un toucher reste un
 * toucher, les flèches la déplacent ; et le micro coupé du correspondant se
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

const MINE = ['flip', 'camera', 'effects', 'screen'] as const;

function Harness({ active, onSwap }: { readonly active: ActiveCall; readonly onSwap: () => void }) {
  const [full, setFull] = useState(false);
  const self = {
    full,
    onToggle: () => {
      onSwap();
      setFull((value) => !value);
    },
    controls: true,
    mine: MINE,
    row: (group?: string) => <div data-test-row={group ?? 'all'} />,
    column: () => null,
  };
  return <CallStage call={active} layout="video-duo" language="fr" choice={null} onChoose={() => undefined} immersive={false} onToggleImmersive={() => undefined} moderation={null} self={self} />;
}

const mount = (active: ActiveCall = call()) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const swaps = { count: 0 };
  act(() => root.render(<Harness active={active} onSwap={() => (swaps.count += 1)} />));
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
  return { find, tile, frame, drag, key, swaps, done };
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

  test('pendant le glissé, la vignette et ses deux rangées suivent le doigt, sans transition', () => {
    fresh();
    const view = mount();
    view.drag(-40, 60, { release: false });
    expect(view.frame().style.transform).toBe('translate(-40px, 60px)');
    expect(view.frame().getAttribute('data-call-self-tile-dragging')).toBe('');
    expect(view.find('[data-call-corner-frame] [data-call-self-row="effects"] [data-test-row="effects"]')).not.toBeNull();
    expect(view.find('[data-call-corner-frame] [data-call-self-row="camera"] [data-test-row="camera"]')).not.toBeNull();
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

  test('le retour au coin s’anime, sauf mouvement réduit', () => {
    fresh();
    const view = mount();
    const classes = view.frame().className.split(' ');
    expect(classes).toContain('transition-[left,top,transform,width,height]');
    expect(classes).toContain('motion-reduce:transition-none');
    view.done();
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
