import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { CaptureEnv } from '@/lib/calls/call-capture';
import { montageCircle, type MontageCall } from '@/lib/calls/call-montage-circle';
import type { CallMember } from '@/lib/calls/call-store';
import { recorder } from '@/lib/calls/frames/frame-recorder.test-support';
import { loadCallStudioCatalog } from '@/lib/i18n-call-studio-catalog';
import { loadFrameUsageCatalog } from '@/lib/i18n-frame-usage-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallMontageMode, type LiveFrameHold } from './call-montage-mode';
import type { FrameStudioModule } from './use-montage-frames';

/**
 * « CADRE » DANS LE MONTAGE (#16943, loi 16, vue C1) — sur un cadre du
 * DIRECT, à deux en vidéo, l'option « Cadre en direct » garde ce cadre autour
 * des deux vidéos pendant tout l'appel et le propose à l'autre ; retouchée,
 * elle le retire. Un cadre de capture seule, les classiques ou un appel qui
 * n'est pas un duo vidéo ne la montrent pas.
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

describe('CallMontageMode — l’interrupteur du cadre en direct', () => {
  const loaded: { module: FrameStudioModule | null } = { module: null };

  beforeAll(async () => {
    await loadCallStudioCatalog('fr');
    await loadFrameUsageCatalog('fr');
    loaded.module = await import('@/lib/calls/frames/frame-studio');
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
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

  const mount = async (hold: LiveFrameHold | undefined) => {
    const env: CaptureEnv = { canvas: () => ({ context: recorder().context as CanvasRenderingContext2D, image: {} as CanvasImageSource }), detector: null, now: () => new Date(2026, 10, 8) };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const shown = stage();
    const module = pairModule();
    const render = (next: LiveFrameHold | undefined) =>
      root.render(
        <CallMontageMode
          language="fr"
          quitGlyph={null}
          onExit={() => undefined}
          stage={() => shown}
          env={env}
          viewport={() => ({ width: 390, height: 844 })}
          call={duo}
          loadFrames={async () => module}
          circleOf={circleOf}
          loadShelf={async () => null}
          {...(next === undefined ? {} : { hold: next })}
        />,
      );
    await act(async () => render(hold));
    await act(async () => {});
    const find = (selector: string) => host.querySelector<HTMLElement>(selector);
    const press = async (selector: string) => {
      await act(async () => find(selector)?.click());
      await act(async () => {});
    };
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { find, press, rerender: (next: LiveFrameHold) => act(async () => render(next)), done };
  };

  const holdOf = (heldFrameId: string | null, offered = true) => {
    const toggled: string[] = [];
    return { hold: { heldFrameId, offered, toggle: (id: string) => void toggled.push(id) }, toggled };
  };

  test('sur un cadre du direct, « Cadre en direct » se montre, dit ce qu’il fait, et le toucher garde ce cadre', async () => {
    const { hold, toggled } = holdOf(null);
    const view = await mount(hold);
    await view.press('[data-call-frame-mood="jovial"]');
    await view.press('[data-carousel-item="jovial.direct.duo"]');
    const option = view.find('[data-call-live-frame-hold]');
    expect(option?.getAttribute('aria-label')).toBe('Cadre en direct');
    expect(option?.getAttribute('title')).toBe("Garde ce cadre autour des deux vidéos pendant tout l'appel, et le propose à votre correspondant");
    expect(option?.getAttribute('aria-pressed')).toBe('false');
    await view.press('[data-call-live-frame-hold]');
    expect(toggled).toEqual(['jovial.direct.duo']);
    view.done();
  });

  test('le cadre gardé est pressé : disque blanc, comme tout bouton actif', async () => {
    const { hold } = holdOf('jovial.direct.duo');
    const view = await mount(hold);
    await view.press('[data-call-frame-mood="jovial"]');
    await view.press('[data-carousel-item="jovial.direct.duo"]');
    expect(view.find('[data-call-live-frame-hold]')?.getAttribute('aria-pressed')).toBe('true');
    view.done();
  });

  test('un cadre de capture seule, ou les classiques : pas d’interrupteur', async () => {
    const { hold } = holdOf(null);
    const view = await mount(hold);
    expect(view.find('[data-call-live-frame-hold]')).toBeNull();
    await view.press('[data-call-frame-mood="jovial"]');
    await view.press('[data-carousel-item="jovial.photo.duo"]');
    expect(view.find('[data-call-live-frame-hold]')).toBeNull();
    view.done();
  });

  test('hors d’un duo vidéo, ou sans session de cadre, le Montage ne fait que capturer', async () => {
    const { hold } = holdOf(null, false);
    const view = await mount(hold);
    await view.press('[data-call-frame-mood="jovial"]');
    await view.press('[data-carousel-item="jovial.direct.duo"]');
    expect(view.find('[data-call-live-frame-hold]')).toBeNull();
    view.done();
    const bare = await mount(undefined);
    await bare.press('[data-call-frame-mood="jovial"]');
    await bare.press('[data-carousel-item="jovial.direct.duo"]');
    expect(bare.find('[data-call-live-frame-hold]')).toBeNull();
    bare.done();
  });
});
