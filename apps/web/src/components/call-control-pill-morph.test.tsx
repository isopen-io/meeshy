import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallScreen } from './call-screen';

/**
 * LE VERRE DE LA PILULE SE DÉFORME, IL NE SE REMPLACE PAS (G2.11, G3.4, #17490, #17536 ;
 * loi 17 de `docs/product/appels-vue-finale.md`) — ouvrir une option, un panneau ou les rangées
 * d'un groupe allonge et agrandit le même verre ; le fermer le resserre, et ce qui part repart
 * en fondu depuis sa place. Ni le panneau ni le verre ne changent d'un coup. Seules la
 * transformation et l'opacité se jouent ; sous « Réduire les animations », un fondu court.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const said = { id: 'w-1', speakerId: 'u-awa', speakerName: 'Awa', original: 'Line 1', translated: 'Ligne 1', pair: { from: 'en', to: 'fr' }, isFinal: true, at: 1, mine: false };

const member = (userId: string, name: string): CallMember => ({ userId, name, avatar: null, micMuted: false, cameraOn: true, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected' });

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-1',
  conversationId: 'c-1',
  media: 'video',
  direction: 'outgoing',
  isGroup: true,
  title: 'Équipe',
  avatar: null,
  callerName: null,
  phase: { kind: 'connected' },
  connectedAt: 0,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: true,
  facing: 'user',
  screenSharing: false,
  members: { 'u-awa': member('u-awa', 'Awa'), 'u-karim': member('u-karim', 'Karim'), 'u-lina': member('u-lina', 'Lina') },
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
  await loadPillMotion();
  await loadCallControlsCatalog('fr');
  renderToStaticMarkup(<CallScreen call={call()} canShare initiallyExpanded />);
  await import('./call-control-actions');
  await import('./call-captions-panel');
  await new Promise((resolve) => setTimeout(resolve, 0));
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

type Played = { readonly on: HTMLElement; readonly frames: readonly Keyframe[]; readonly options: KeyframeAnimationOptions; finish: () => void };

/** Un moteur sans mise en page : la pilule mesure 100 px de haut au repos, 300 quand elle a grandi ; `animate` est espionné. */
async function withProbe(run: (played: Played[]) => Promise<void>, { reducedMotion = false }: { readonly reducedMotion?: boolean } = {}): Promise<void> {
  const played: Played[] = [];
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  const saved = ['animate', 'offsetHeight', 'offsetWidth'].map((name) => [name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)] as const);
  const savedMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  proto.animate = function animate(this: HTMLElement, frames: readonly Keyframe[], options: KeyframeAnimationOptions) {
    const animation = { cancel: () => undefined, onfinish: null as null | (() => void) };
    played.push({ on: this, frames, options, finish: () => animation.onfinish?.() });
    return animation;
  };
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return this.hasAttribute('data-call-control-pill') ? (this.getAttribute('data-call-control-pill') === 'grown' ? 300 : 100) : 20; } });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 400; } });
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: reducedMotion, addEventListener: () => undefined, removeEventListener: () => undefined }) });
  try {
    await run(played);
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor === undefined) Reflect.deleteProperty(HTMLElement.prototype, name);
      else Object.defineProperty(HTMLElement.prototype, name, descriptor);
    }
    if (savedMedia === undefined) Reflect.deleteProperty(window, 'matchMedia');
    else Object.defineProperty(window, 'matchMedia', savedMedia);
  }
}

const mount = (overrides: Partial<ActiveCall> = {}) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<CallScreen call={call(overrides)} canShare effectsSupport={{ color: false, blur: false }} wide={false} />));
  const find = (selector: string) => host.querySelector<HTMLElement>(selector);
  const press = (selector: string) => act(() => find(selector)?.click());
  const settle = () => act(async () => {});
  const done = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { host, find, press, settle, done };
};

describe('le verre qui grandit pour contenir les rangées (G2.11)', () => {
  test('ouvrir (…) en groupe : le verre part de sa taille d’avant, vue comme une échelle, depuis son bord du bas, et rejoint sa forme', async () => {
    await withProbe(async (played) => {
      const view = mount();
      await view.settle();
      played.length = 0;
      view.press('[data-call-more]');
      await view.settle();
      const skin = view.find('[data-call-pill-skin]');
      const morph = played.find((entry) => entry.on === skin);
      expect(morph?.frames).toEqual([{ transform: 'scale(1, 0.3333333333333333)' }]);
      expect(Object.keys(morph?.frames[0] ?? {})).toEqual(['transform']);
      expect(morph?.options.duration).toBeLessThanOrEqual(300);
      view.done();
    });
  });

  test('les rangées qui arrivent entrent depuis la rangée de base, par la transformation et l’opacité (la feuille)', () => {
    const css = readFileSync(new URL('../styles/call-motion.css', import.meta.url), 'utf8');
    expect(css).toContain("[data-call-deck-content='rows']");
  });
});

describe('le morphisme est interruptible', () => {
  test('refermer pendant l’ouverture part de la taille que le verre a à cet instant, pas de celle d’où il était parti', async () => {
    await withProbe(async (played) => {
      const view = mount();
      await view.settle();
      view.press('[data-call-more]');
      await view.settle();
      const rect = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getBoundingClientRect');
      Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', { configurable: true, value: () => ({ width: 400, height: 150, left: 0, top: 0, right: 400, bottom: 150, x: 0, y: 0, toJSON: () => ({}) }) });
      try {
        played.length = 0;
        view.press('[data-call-more]');
        await view.settle();
        expect(played.find((entry) => entry.on === view.find('[data-call-pill-skin]'))?.frames).toEqual([{ transform: 'scale(1, 1.5)' }]);
      } finally {
        if (rect === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'getBoundingClientRect');
        else Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', rect);
      }
      view.done();
    });
  });
});

describe('fermer une option : le verre se resserre et le contenu repart en fondu (G3.4)', () => {
  test('refermer (…) : le verre revient à sa taille, et les rangées laissent un double qui s’efface depuis sa place, inerte et muet', async () => {
    await withProbe(async (played) => {
      const view = mount();
      await view.settle();
      view.press('[data-call-more]');
      await view.settle();
      played.forEach((entry) => entry.finish());
      played.length = 0;
      view.press('[data-call-more]');
      await view.settle();
      const skin = view.find('[data-call-pill-skin]');
      expect(played.find((entry) => entry.on === skin)?.frames).toEqual([{ transform: 'scale(1, 3)' }]);
      const ghost = view.find('[data-call-pill-ghost]');
      expect(ghost).not.toBeNull();
      expect(ghost?.hasAttribute('inert')).toBe(true);
      expect(ghost?.getAttribute('aria-hidden')).toBe('true');
      expect(ghost?.querySelector('[id]')).toBeNull();
      expect(ghost?.style.pointerEvents).toBe('none');
      const leaving = played.find((entry) => entry.on === ghost);
      expect(leaving?.frames.map((frame) => frame.opacity)).toEqual([1, 0]);
      expect(Object.keys(leaving?.frames[1] ?? {}).sort()).toEqual(['opacity', 'transform']);
      leaving?.finish();
      expect(view.find('[data-call-pill-ghost]')).toBeNull();
      view.done();
    });
  });

  test('le double ne rejoue pas l’arrivée du contenu : aucune animation CSS sur lui', async () => {
    await withProbe(async () => {
      const view = mount();
      await view.settle();
      view.press('[data-call-more]');
      await view.settle();
      view.press('[data-call-more]');
      await view.settle();
      const ghost = view.find('[data-call-pill-ghost]');
      expect(ghost?.style.animation).toBe('none');
      view.done();
    });
  });

  test('sous « Réduire les animations », le verre ne se déforme pas et rien ne se déplace : un fondu court, rien d’autre', async () => {
    await withProbe(
      async (played) => {
        const view = mount();
        await view.settle();
        view.press('[data-call-more]');
        await view.settle();
        played.length = 0;
        view.press('[data-call-more]');
        await view.settle();
        expect(played.some((entry) => entry.frames.some((frame) => 'transform' in frame && entry.on.hasAttribute('data-call-pill-skin')))).toBe(false);
        const ghost = view.find('[data-call-pill-ghost]');
        const leaving = played.find((entry) => entry.on === ghost);
        expect(leaving?.frames).toEqual([{ opacity: 1 }, { opacity: 0 }]);
        expect(leaving?.options.duration).toBe(150);
        const pill = played.find((entry) => entry.on === view.find('[data-call-control-pill]'));
        expect(pill?.frames).toEqual([{ opacity: 0 }, { opacity: 1 }]);
        view.done();
      },
      { reducedMotion: true },
    );
  });
});

describe('ranger les commandes, sous « Réduire les animations » : un fondu court, sans déplacement (G1.11, G2.8)', () => {
  test('le toucher qui range joue un fondu de 150 ms sur l’en-tête, la pilule et les bandeaux ; le suivant les rend de même', async () => {
    await withProbe(
      async (played) => {
        const view = mount();
        await view.settle();
        played.length = 0;
        act(() => view.find('[data-call-stage-surface]')?.click());
        await view.settle();
        const stowed = played.filter((entry) => entry.options.duration === 150);
        expect(stowed.some((entry) => entry.on.hasAttribute('data-call-plane') && entry.on.getAttribute('data-call-stow') === 'top')).toBe(true);
        expect(stowed.some((entry) => entry.on.getAttribute('data-call-stow') === 'bottom')).toBe(true);
        expect(stowed.every((entry) => entry.frames.every((frame) => !('transform' in frame) && !('translate' in frame)))).toBe(true);
        expect(stowed[0]?.frames).toEqual([
          { opacity: 1, visibility: 'visible' },
          { opacity: 0, visibility: 'hidden' },
        ]);
        played.length = 0;
        act(() => view.find('[data-call-stage-surface]')?.click());
        await view.settle();
        expect(played.filter((entry) => entry.options.duration === 150).every((entry) => entry.frames.length === 2 && entry.frames[0]?.opacity === 0)).toBe(true);
        view.done();
      },
      { reducedMotion: true },
    );
  });

  test('hors de ce régime, rien ne se joue en script : c’est la feuille qui mène le chrome vers son bord', async () => {
    await withProbe(async (played) => {
      const view = mount();
      await view.settle();
      played.length = 0;
      act(() => view.find('[data-call-stage-surface]')?.click());
      await view.settle();
      expect(played.filter((entry) => entry.options.duration === 150)).toHaveLength(0);
      view.done();
    });
  });
});

describe('un seul verre se resserre autour des sous-titres (G1.3)', () => {
  test('rangée, la pilule mesure son verre et ses sous-titres : le verre garde son bord du bas, les sous-titres descendent d’autant qu’il perd', async () => {
    await withProbe(async () => {
      const heights = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
      const tops = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop');
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return this.hasAttribute('data-call-control-pill') ? 200 : this.hasAttribute('data-call-captions-panel') ? 80 : 20; } });
      Object.defineProperty(HTMLElement.prototype, 'offsetTop', { configurable: true, get(this: HTMLElement) { return this.hasAttribute('data-call-captions-panel') ? 12 : 0; } });
      try {
        const view = mount({ isGroup: false, captionsMode: 'translated', captions: [said], members: { 'u-awa': member('u-awa', 'Awa') } });
        await view.settle();
        act(() => view.find('[data-call-stage-surface]')?.click());
        await view.settle();
        const pill = view.find('[data-call-control-pill]');
        expect(pill?.style.getPropertyValue('--stow-scale')).toBe(String(92 / 200));
        expect(pill?.style.getPropertyValue('--stow-shift')).toBe(`${200 - 6 - 92}px`);
        view.done();
      } finally {
        if (heights !== undefined) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', heights);
        if (tops === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'offsetTop');
        else Object.defineProperty(HTMLElement.prototype, 'offsetTop', tops);
      }
    });
  });
});
