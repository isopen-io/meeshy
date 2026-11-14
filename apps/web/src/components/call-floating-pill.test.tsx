import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { callActions } from '@/lib/calls/call-actions';
import type { ActiveCall } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { loadPillMotion, type ViewMotion } from '@/lib/calls/use-pill-motion';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallPillBar } from './call-floating-pill';

/**
 * **PENDANT MON PARTAGE, L'APPEL RÉDUIT RESTE LA CAPSULE** (P18.10, #17756) — la bulle n'offre pas « Arrêter » :
 * un glissé horizontal de la capsule ne la replie pas en bulle, et ce glissé n'est pas non plus le toucher qui
 * rouvrirait l'appel. Hors partage, le même glissé la replie, comme sur iOS.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadCallControlsCatalog('fr');
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-1',
  conversationId: '',
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
  display: 'pill',
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

const swipeThenRelease = async (active: ActiveCall) => {
  const seen: string[] = [];
  const original = { collapse: callActions.collapse, expand: callActions.expand };
  callActions.collapse = () => void seen.push('collapse');
  callActions.expand = () => void seen.push('expand');
  const host = document.createElement('div');
  document.body.append(host);
  const root: Root = createRoot(host);
  try {
    await act(async () => root.render(<CallPillBar call={active} away={false} />));
    const bar = host.querySelector('[data-call-pill-bar]');
    const body = host.querySelector('button');
    if (bar === null || body === null) throw new Error('capsule absente');
    const pointer = (type: string, clientX: number) => new PointerEvent(type, { bubbles: true, pointerId: 1, clientX, clientY: 20, button: 0, pointerType: 'mouse' });
    await act(async () => void body.dispatchEvent(pointer('pointerdown', 40)));
    await act(async () => void body.dispatchEvent(pointer('pointerup', 240)));
    await act(async () => void body.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 240, clientY: 20 })));
    return seen;
  } finally {
    await act(async () => root.unmount());
    host.remove();
    callActions.collapse = original.collapse;
    callActions.expand = original.expand;
  }
};

describe('le glissé de la capsule (P18.10)', () => {
  test('hors partage, il replie la capsule en bulle, sans rouvrir l’appel', async () => {
    expect(await swipeThenRelease(call())).toEqual(['collapse']);
  });

  test('pendant mon partage, il ne replie pas la capsule et ne rouvre pas l’appel non plus', async () => {
    expect(await swipeThenRelease(call({ screenSharing: true }))).toEqual([]);
  });
});

/**
 * **LA CAPSULE DE PARTAGE PREND LE VERRE ROUGE PARTAGÉ** (S1.9, #17774) — le bandeau « Vous partagez » de
 * la pile (`call-share-banner.tsx`) porte déjà `glass-call-danger` ; la capsule n'est plus un aplat rouge
 * posé en style, elle prend la même surface. Et quand le partage commence ou finit pendant qu'elle est là,
 * elle se refait par le mouvement de l'écran d'appel (S1.7) : une capsule ordinaire à « Arrêter », jamais
 * d'un coup.
 */
const mountBar = async (active: ActiveCall) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root: Root = createRoot(host);
  await act(async () => root.render(<CallPillBar call={active} away={false} />));
  return {
    bar: () => host.querySelector<HTMLElement>('[data-call-pill-bar]'),
    render: (next: ActiveCall, motion?: ViewMotion) => act(async () => root.render(<CallPillBar call={next} away={false} motion={motion} />)),
    done: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
};

type Played = { readonly element: Element; readonly frames: Keyframe[]; readonly options: KeyframeAnimationOptions };

function recordAnimations() {
  const played: Played[] = [];
  const real = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(this: Element, frames: Keyframe[], options: KeyframeAnimationOptions) {
      played.push({ element: this, frames, options });
      return { finished: new Promise<void>(() => undefined), cancel: () => undefined, effect: null };
    },
  });
  return { played, restore: () => (real === undefined ? Reflect.deleteProperty(HTMLElement.prototype, 'animate') : Object.defineProperty(HTMLElement.prototype, 'animate', real)) };
}

describe('la capsule de partage (S1.9)', () => {
  test('mon partage la pose sur le verre rouge du kit, sans aplat posé en style', async () => {
    const view = await mountBar(call({ screenSharing: true }));
    expect(view.bar()?.className.split(' ')).toContain('glass-call-danger');
    expect(view.bar()?.style.background ?? '').toBe('');
    await view.done();
  });

  test('hors partage, la pastille garde sa matière ordinaire : pas de verre rouge', async () => {
    const view = await mountBar(call());
    expect(view.bar()?.className.split(' ')).not.toContain('glass-call-danger');
    await view.done();
  });
});

describe('la capsule se refait en mouvement (S1.7)', () => {
  beforeAll(async () => {
    await loadPillMotion();
  });

  test('le partage qui commence ou finit pendant qu’elle est là la refait par le fondu et l’échelle de l’écran d’appel', async () => {
    const motion = recordAnimations();
    const view = await mountBar(call());
    motion.played.length = 0;
    await view.render(call({ screenSharing: true }));
    const arrival = motion.played.find((move) => move.element === view.bar());
    expect(arrival?.frames).toEqual([
      { opacity: 0, transform: 'scale(0.92)' },
      { opacity: 1, transform: 'none' },
    ]);
    expect(arrival?.options.duration).toBe(220);
    motion.played.length = 0;
    await view.render(call({ screenSharing: false }));
    expect(motion.played.some((move) => move.element === view.bar())).toBe(true);
    await view.done();
    motion.restore();
  });

  test('la première peinture ne joue rien', async () => {
    const motion = recordAnimations();
    const view = await mountBar(call({ screenSharing: true }));
    expect(motion.played.filter((move) => move.element === view.bar())).toEqual([]);
    await view.done();
    motion.restore();
  });

  test('qui repart est marqué sortant : ni focus ni clic, caché au lecteur d’écran', async () => {
    const view = await mountBar(call());
    await view.render(call(), { leaving: true, arrives: false, gone: () => undefined });
    expect(view.bar()?.hasAttribute('data-leaving')).toBe(true);
    expect(view.bar()?.hasAttribute('inert')).toBe(true);
    expect(view.bar()?.getAttribute('aria-hidden')).toBe('true');
    await view.done();
  });
});
