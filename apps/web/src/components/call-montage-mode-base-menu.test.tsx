import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { CaptureEnv, CaptureFile } from '@/lib/calls/call-capture';
import type { ClipEnv } from '@/lib/calls/call-capture-live';
import { CAPTURE_HOLD_MS } from '@/lib/calls/call-capture-gesture';
import { setEffectLayers } from '@/lib/calls/call-effect-layers-store';
import { montageCircle, type MontageCall } from '@/lib/calls/call-montage-circle';
import type { CallMember } from '@/lib/calls/call-store';
import { recorder } from '@/lib/calls/frames/frame-recorder.test-support';
import { NO_EFFECTS, videoEffectsStore, type VideoEffects } from '@/lib/calls/video-effects';
import { loadModeMotion } from '@/lib/calls/use-mode-motion';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { loadCallStudioCatalog } from '@/lib/i18n-call-studio-catalog';
import { loadFrameUsageCatalog } from '@/lib/i18n-frame-usage-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallMontageMode, type LiveFrameHold } from './call-montage-mode';
import type { FrameStudioModule } from './use-montage-frames';

/**
 * C1 PARTOUT, AU MONTAGE (directive porteur du 2026-11-14 sur #16979 et #17962, qui REMPLACE « le carrousel
 * reste en Montage » ; #18186) — je touche le cadre « Doré » : il s'applique aussitôt et la barre revient à
 * `‹ · Réglages · (+)`, le carrousel refermé. « Cadres » le rouvre. L'option « Cadre » reste sur le menu de base
 * pour garder le cadre choisi ; « Chaque visage » vit dans Réglages (#17962, iOS) et le referme ; ‹ referme le
 * panneau, un second ‹ quitte (#17947). Photo à deux tapes et film à l'appui long du carrousel restent.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const member = (userId: string, name: string): CallMember => ({ userId, name, avatar: null, micMuted: false, cameraOn: true, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected' });

const duo: MontageCall = { conversationId: 'c1', isGroup: false, title: 'Awa', members: { 'u-awa': member('u-awa', 'Awa') } };

const circleOf = (call: MontageCall) => montageCircle({ call, viewer: { id: 'u-me', handle: 'moi', displayName: 'Sam' }, conversation: undefined, date: '8 nov. 2026' });

const stage = (): Element => {
  const element = document.createElement('div');
  Object.defineProperty(element, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 400, height: 800, x: 0, y: 0, right: 400, bottom: 800 }) });
  return element;
};

const later = (ms: number) => act(async () => void (await new Promise((resolve) => setTimeout(resolve, ms))));

const GONE_MS = 260;

const clipEnv = (): ClipEnv => ({
  isTypeSupported: (mime) => mime === 'video/webm',
  record: (_stream, _mime, push, end) => ({ stop: () => queueMicrotask(() => (push(new Blob(['clip'])), end())) }),
  mixAudio: () => ({ track: null, close: () => undefined }),
  createStream: (tracks) => ({ getTracks: () => tracks }) as unknown as MediaStream,
  now: () => new Date(2026, 10, 14, 9, 0, 0),
});

describe('CallMontageMode — après un choix, le menu de base', () => {
  const loaded: { module: FrameStudioModule | null } = { module: null };

  beforeAll(async () => {
    await loadCallStudioCatalog('fr');
    await loadCallControlsCatalog('fr');
    await loadFrameUsageCatalog('fr');
    await loadModeMotion();
    loaded.module = await import('@/lib/calls/frames/frame-studio');
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => setEffectLayers([]));

  afterEach(() => {
    setEffectLayers([]);
    videoEffectsStore.setState({ effects: NO_EFFECTS });
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  const pairModule = (): FrameStudioModule => {
    const module = loaded.module as FrameStudioModule;
    const base = module.createFrameStudio({ fonts: undefined }).frames.find((frame) => frame.mood === 'jovial' && frame.bucket === 'duo');
    if (base === undefined) throw new Error('aucun cadre jovial de duo');
    const { surfaces: _ignored, ...plain } = base;
    const pair = [
      { ...plain, id: 'jovial.photo.duo', motif: 'jovial.photo', name: 'Photo', surfaces: ['capture' as const] },
      { ...plain, id: 'jovial.direct.duo', motif: 'jovial.direct', name: 'Direct', surfaces: ['capture' as const, 'live' as const] },
    ];
    return { createFrameStudio: (options) => module.createFrameStudio({ ...(options ?? {}), frames: pair, fonts: undefined }) };
  };

  const mount = async (options: { readonly hold?: LiveFrameHold; readonly color?: boolean } = {}) => {
    videoEffectsStore.setState({ effects: NO_EFFECTS });
    const env: CaptureEnv = { canvas: () => ({ context: recorder().context as CanvasRenderingContext2D, image: {} as CanvasImageSource }), detector: null, now: () => new Date(2026, 10, 8) };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const shown = stage();
    const module = pairModule();
    const exits: string[] = [];
    const saved: Array<readonly CaptureFile[]> = [];
    const color = options.color ?? true;
    await act(async () =>
      root.render(
        <CallMontageMode
          language="fr"
          onExit={() => void exits.push('exit')}
          stage={() => shown}
          env={env}
          viewport={() => ({ width: 390, height: 844 })}
          call={duo}
          loadFrames={async () => module}
          circleOf={circleOf}
          loadShelf={async () => null}
          save={async (files) => (saved.push(files), { saved: files.length, failed: 0, cancelled: 0 })}
          clipEnv={clipEnv}
          audio={() => []}
          colorAvailable={color}
          blurAvailable={color}
          apply={(patch: Partial<VideoEffects>) => videoEffectsStore.setState((state) => ({ effects: { ...state.effects, ...patch } }))}
          onAddLook={() => undefined}
          {...(options.hold === undefined ? {} : { hold: options.hold })}
        />,
      ),
    );
    await act(async () => {});
    const find = (selector: string) => host.querySelector<HTMLElement>(selector);
    const press = async (selector: string) => {
      await act(async () => find(selector)?.click());
      await act(async () => {});
    };
    const hold = async (selector: string) => {
      await act(async () => void find(selector)?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })));
      await later(CAPTURE_HOLD_MS + 60);
      await act(async () => void find(selector)?.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
    };
    const carousel = () => find('[data-call-mode-carousel]');
    const atBase = () => carousel() === null && find('[data-call-frame-moods]') === null && find('[data-call-effects-settings]') === null &&  find('[data-call-mode-bar] [data-call-effects-category="frames"]')?.getAttribute('aria-pressed') === 'false' && find('[data-call-effects-settings-toggle]')?.getAttribute('aria-pressed') === 'false';
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { find, press, hold, carousel, atBase, exits, saved, done };
  };

  test('« Capturer » entre sur le carrousel des montages', async () => {
    const view = await mount();
    expect(view.carousel()).not.toBeNull();
    view.done();
  });

  test('toucher un montage l’applique, referme le carrousel et rend `‹ · Réglages · (+)` sous « Cadres »', async () => {
    const view = await mount();
    await view.press('[data-carousel-item="cover"]');
    expect(view.find('[data-call-capture-preview]')?.getAttribute('data-call-capture-preview')).toBe('cover');
    await later(GONE_MS);
    expect(view.atBase()).toBe(true);
    expect(view.exits).toEqual([]);
    view.done();
  });

  test('toucher un cadre l’applique et rend le menu de base ; l’option « Cadre » y reste pour le garder en direct', async () => {
    const toggled: string[] = [];
    const view = await mount({ hold: { heldFrameId: null, offered: true, toggle: (id) => void toggled.push(id) } });
    await view.press('[data-call-frame-mood="jovial"]');
    expect(view.carousel()).not.toBeNull();
    await view.press('[data-carousel-item="jovial.direct.duo"]');
    await later(GONE_MS);
    expect(view.atBase()).toBe(true);
    expect(view.find('[data-call-capture-preview]')?.getAttribute('data-call-capture-preview')).toBe('jovial.direct.duo');
    await view.press('[data-call-live-frame-hold="jovial.direct.duo"]');
    expect(toggled).toEqual(['jovial.direct.duo']);
    expect(view.atBase()).toBe(true);
    view.done();
  });

  test('une ambiance touchée n’est pas un choix final : le carrousel reste pour feuilleter ses cadres', async () => {
    const view = await mount();
    await view.press('[data-call-frame-mood="jovial"]');
    await later(GONE_MS);
    expect(view.carousel()).not.toBeNull();
    expect(view.find('[data-call-frame-moods]')).not.toBeNull();
    view.done();
  });

  test('« Cadres », touchée sur le menu de base, rouvre le carrousel sur le choix appliqué', async () => {
    const view = await mount();
    await view.press('[data-carousel-item="cover"]');
    await later(GONE_MS);
    await view.press('[data-call-effects-category="frames"]');
    expect(view.find('[data-call-mode-carousel] [aria-checked="true"]')?.getAttribute('data-carousel-item')).toBe('cover');
    view.done();
  });

  test('retoucher « Cadres » ouvert referme le carrousel, sans rien appliquer', async () => {
    const view = await mount();
    expect(view.find('[data-call-effects-category="frames"]')?.getAttribute('aria-pressed')).toBe('true');
    await view.press('[data-call-effects-category="frames"]');
    await later(GONE_MS);
    expect(view.atBase()).toBe(true);
    expect(view.find('[data-call-capture-preview]')?.getAttribute('data-call-capture-preview')).toBe('grid');
    view.done();
  });

  test('« Chaque visage » vit dans Réglages ; le toucher capture les visages et rend le menu de base', async () => {
    const view = await mount();
    expect(view.find('[data-call-capture-faces]')).toBeNull();
    await view.press('[data-call-effects-settings-toggle]');
    const faces = view.find('[data-call-effects-settings] [data-call-capture-faces]');
    expect(faces?.textContent).toContain('Chaque visage');
    await view.press('[data-call-capture-faces]');
    await later(GONE_MS);
    expect(view.atBase()).toBe(true);
    view.done();
  });

  test('sans traitement d’images, Réglages reste offert au Montage : « Chaque visage » y vit', async () => {
    const view = await mount({ color: false });
    await view.press('[data-call-effects-settings-toggle]');
    expect(view.find('[data-call-effects-settings] [data-call-capture-faces]')).not.toBeNull();
    expect(view.find('[data-call-effects-settings] input[type="range"]')).toBeNull();
    view.done();
  });

  test('#17947 — au Montage, ‹ referme le panneau et rend la barre de base ; un second ‹ quitte', async () => {
    const view = await mount();
    await view.press('[data-call-effects-settings-toggle]');
    await view.press('[data-call-mode-quit]');
    expect(view.exits).toEqual([]);
    await later(GONE_MS);
    expect(view.atBase()).toBe(true);
    await view.press('[data-call-mode-quit]');
    expect(view.exits).toEqual(['exit']);
    view.done();
  });

  test('rien ne régresse : deux tapes sur le montage choisi le photographient, le carrousel reste ouvert', async () => {
    const view = await mount();
    await view.press('[data-carousel-item="grid"]');
    await view.press('[data-carousel-item="grid"]');
    await later(40);
    expect(view.saved.length).toBe(1);
    await later(GONE_MS);
    expect(view.carousel()).not.toBeNull();
    view.done();
  });

  test('rien ne régresse : l’appui long sur le montage choisi le filme, le carrousel reste ouvert', async () => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', { configurable: true, value: () => ({ getVideoTracks: () => [{ kind: 'video', stop: () => undefined }] }) });
    try {
      const view = await mount();
      await view.hold('[data-carousel-item="grid"]');
      expect(view.find('[data-call-record-stop]')).not.toBeNull();
      await later(GONE_MS);
      expect(view.carousel()).not.toBeNull();
      await view.press('[data-call-record-stop]');
      await act(async () => {});
      view.done();
    } finally {
      delete (HTMLCanvasElement.prototype as { captureStream?: unknown }).captureStream;
    }
  });
});
