import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { CaptureEnv } from '@/lib/calls/call-capture';
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
 * LA BARRE DU MONTAGE EST CELLE D'EFFETS (#17903, décision porteur du 2026-11-13 sur #16979) —
 * `‹ · Réglages · (+)` dans un verre, sous les puces de tri dont « Cadres » est pressée ; ni
 * « Quitter » ni « Valider » ; ce qui est touché s'applique aussitôt ; au plus trois couches,
 * dont l'appui long sur (+) liste les effets pour en annuler un. « Chaque visage » et la vidéo au
 * clavier restent atteignables.
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

describe('CallMontageMode — la barre d’Effets', () => {
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

  const mount = async (options: { readonly hold?: LiveFrameHold; readonly effects?: VideoEffects } = {}) => {
    videoEffectsStore.setState({ effects: options.effects ?? NO_EFFECTS });
    const env: CaptureEnv = { canvas: () => ({ context: recorder().context as CanvasRenderingContext2D, image: {} as CanvasImageSource }), detector: null, now: () => new Date(2026, 10, 8) };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const shown = stage();
    const module = pairModule();
    const exits: string[] = [];
    const adds: string[] = [];
    const applied: Array<Partial<VideoEffects>> = [];
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
          colorAvailable
          blurAvailable
          apply={(patch) => {
            applied.push(patch);
            videoEffectsStore.setState((state) => ({ effects: { ...state.effects, ...patch } }));
          }}
          onAddLook={(genre) => void adds.push(genre)}
          {...(options.hold === undefined ? {} : { hold: options.hold })}
        />,
      ),
    );
    await act(async () => {});
    const find = (selector: string) => host.querySelector<HTMLElement>(selector);
    const all = (selector: string) => [...host.querySelectorAll<HTMLElement>(selector)];
    const press = async (selector: string) => {
      await act(async () => find(selector)?.click());
      await act(async () => {});
    };
    const hold = async (selector: string) => {
      await act(async () => void find(selector)?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })));
      await later(CAPTURE_HOLD_MS + 60);
      await act(async () => void find(selector)?.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
    };
    const pickFrame = async () => {
      await press('[data-call-frame-mood="jovial"]');
      await press('[data-carousel-item="jovial.direct.duo"]');
    };
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { find, all, press, hold, pickFrame, exits, adds, applied, done };
  };

  const holdOf = (heldFrameId: string | null) => {
    const toggled: string[] = [];
    return { hold: { heldFrameId, offered: true, toggle: (id: string) => void toggled.push(id) } satisfies LiveFrameHold, toggled };
  };

  test('la barre est celle d’Effets : un verre ‹ Retour à l’appel · Réglages · (+) — ni « Quitter » ni « Valider »', async () => {
    const view = await mount();
    const bar = view.find('[data-call-mode-bar]');
    expect(bar?.querySelector('[data-call-mode-bar-skin]')?.className).toContain('glass-call');
    expect(bar?.querySelector('[data-call-mode-quit]')?.getAttribute('aria-label')).toBe('Retour à l’appel');
    expect(bar?.querySelector('[data-call-effects-settings-toggle]')?.textContent).toBe('Réglages');
    expect(bar?.querySelector('[data-call-effects-add-look]')?.getAttribute('aria-label')).toBe('Ajouter un autre look');
    const order = [...(bar?.querySelectorAll('[data-call-mode-quit], [data-call-effects-settings-toggle], [data-call-effects-add-look]') ?? [])].map((button) => (button.hasAttribute('data-call-mode-quit') ? 'back' : button.hasAttribute('data-call-effects-add-look') ? 'add' : 'settings'));
    expect(order).toEqual(['back', 'settings', 'add']);
    expect(view.find('[data-call-effects-validate]')).toBeNull();
    expect(view.all('button').some((button) => button.getAttribute('aria-label') === 'Quitter' || button.textContent === 'Valider')).toBe(false);
    view.done();
  });

  test('‹ rend l’appel, et Échap aussi, sans rien restaurer', async () => {
    const view = await mount();
    await view.press('[data-call-mode-quit]');
    act(() => view.find('[data-call-mode="montage"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(view.exits).toEqual(['exit', 'exit']);
    view.done();
  });

  test('sous la barre, les puces de tri : « Cadres » est pressée', async () => {
    const view = await mount();
    const chip = view.find('[data-call-mode-bar] [data-call-effects-category="frames"]');
    expect(chip?.textContent).toBe('Cadres');
    expect(chip?.getAttribute('aria-pressed')).toBe('true');
    view.done();
  });

  test('« Chaque visage » et la vidéo au clavier restent atteignables, hors de la barre', async () => {
    const view = await mount();
    expect(view.find('[data-call-capture-faces]')).not.toBeNull();
    expect(view.find('[data-call-record-key]')).not.toBeNull();
    expect(view.find('[data-call-mode-bar] [data-call-capture-faces]')).toBeNull();
    view.done();
  });

  test('« Réglages » ouvre Luminosité · Flou du fond dans un verre séparé, à la place du carrousel ; retoucher les rend', async () => {
    const view = await mount();
    await view.press('[data-call-effects-settings-toggle]');
    const panel = view.find('[data-call-effects-settings]');
    expect(panel?.className).toContain('glass-call');
    expect(view.find('[data-call-mode-bar]')?.contains(panel ?? null)).toBe(false);
    await later(260);
    expect(view.find('[data-call-mode-carousel]')).toBeNull();
    await view.press('[data-call-effects-settings-toggle]');
    expect(view.find('[data-call-mode-carousel]')).not.toBeNull();
    view.done();
  });

  test('#17947 — au Montage aussi, régler la luminosité ou le flou laisse le panneau ouvert ; seuls « Réglages » et ‹ le referment', async () => {
    const view = await mount();
    await view.press('[data-call-effects-settings-toggle]');
    const slider = view.find('input[type="range"]') as HTMLInputElement;
    for (const value of ['10', '25']) {
      await act(async () => {
        slider.value = value;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    await view.press('[data-call-effects-blur]');
    await later(260);
    expect(view.applied).toEqual([{ brightness: 0.1 }, { brightness: 0.25 }, { blur: true }]);
    expect(view.find('[data-call-effects-settings]')).not.toBeNull();
    expect(view.find('[data-call-effects-settings-toggle]')?.getAttribute('aria-pressed')).toBe('true');
    await view.press('[data-call-effects-settings-toggle]');
    await later(260);
    expect(view.find('[data-call-effects-settings]')).toBeNull();
    await view.press('[data-call-effects-settings-toggle]');
    await view.press('[data-call-mode-quit]');
    expect(view.exits).toEqual(['exit']);
    view.done();
  });

  test('choisir un cadre le pose dans la pile : l’appui long sur (+) liste l’effet, annuler le retire, referme la liste et rend le menu de base', async () => {
    const view = await mount();
    await view.pickFrame();
    await later(260);
    expect(view.find('[data-call-effect-layers]')).toBeNull();
    await view.hold('[data-call-effects-add-look]');
    const list = view.find('[data-call-effect-layers]');
    expect(list?.getAttribute('aria-label')).toBe('Effets appliqués');
    expect(view.all('[data-call-effect-layer]').map((entry) => entry.getAttribute('data-call-effect-layer'))).toEqual(['frame']);
    expect(view.find('[data-call-effect-layer-undo="frame"]')?.getAttribute('aria-label')).toContain('Annuler');
    await view.press('[data-call-effect-layer-undo="frame"]');
    await later(260);
    expect(view.find('[data-call-effect-layers]')).toBeNull();
    expect(view.find('[data-call-mode-carousel] [aria-checked="true"]')?.getAttribute('data-carousel-item')).toBe('grid');
    expect(view.find('[data-call-effects-settings-toggle]')?.getAttribute('aria-pressed')).toBe('false');
    view.done();
  });

  test('le clavier ouvre la même liste : menu contextuel, ou Maj + Entrée sur (+), annoncé au lecteur d’écran', async () => {
    const view = await mount();
    await view.pickFrame();
    const add = view.find('[data-call-effects-add-look]') as HTMLElement;
    expect(add.getAttribute('aria-keyshortcuts')).toBe('Shift+Enter');
    expect(add.getAttribute('aria-description')).toContain('Appui long');
    await act(async () => void add.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
    expect(view.find('[data-call-effect-layers]')).not.toBeNull();
    await act(async () => void add.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await later(260);
    expect(view.find('[data-call-effect-layers]')).toBeNull();
    expect(view.exits).toEqual([]);
    await act(async () => void add.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true })));
    expect(view.find('[data-call-effect-layers]')).not.toBeNull();
    view.done();
  });

  test('une tape sur (+) ouvre un genre absent de la pile, dans Effets : Visage d’abord, Couleur si Visage est déjà posé', async () => {
    const view = await mount();
    await view.press('[data-call-effects-add-look]');
    expect(view.adds).toEqual(['face']);
    videoEffectsStore.setState((state) => ({ effects: { ...state.effects, faceEffect: 'toad' } }));
    await act(async () => {});
    await view.press('[data-call-effects-add-look]');
    expect(view.adds).toEqual(['face', 'color']);
    view.done();
  });

  test('les puces Visage et Couleur sont touchables au Montage et ouvrent Effets sur leur genre', async () => {
    const view = await mount();
    await view.press('[data-call-effects-category="color"]');
    await view.press('[data-call-effects-category="face"]');
    expect(view.adds).toEqual(['color', 'face']);
    view.done();
  });

  test('retirer la couche « cadre » retire aussi le cadre gardé en direct, par le chemin de « Cadre » (loi 16)', async () => {
    const { hold, toggled } = holdOf('jovial.direct.duo');
    const view = await mount({ hold });
    await view.pickFrame();
    await view.hold('[data-call-effects-add-look]');
    await view.press('[data-call-effect-layer-undo="frame"]');
    expect(toggled).toEqual(['jovial.direct.duo']);
    view.done();
  });

  test('retirer un cadre qu’on ne garde pas ne touche pas au direct', async () => {
    const { hold, toggled } = holdOf(null);
    const view = await mount({ hold });
    await view.pickFrame();
    await view.hold('[data-call-effects-add-look]');
    await view.press('[data-call-effect-layer-undo="frame"]');
    expect(toggled).toEqual([]);
    view.done();
  });

  test('avec trois couches, (+) n’ajoute plus et le dit ; son appui long garde sa liste ; un nouveau cadre est refusé', async () => {
    setEffectLayers([{ genre: 'landscape', choice: 'beach' }]);
    const view = await mount({ effects: { ...NO_EFFECTS, faceEffect: 'toad', preset: 'golden' } });
    const add = view.find('[data-call-effects-add-look]') as HTMLElement;
    expect(add.getAttribute('aria-disabled')).toBe('true');
    expect(add.getAttribute('aria-label')).toBe('Trois effets au plus : retirez-en un pour en ajouter');
    await view.press('[data-call-effects-add-look]');
    expect(view.adds).toEqual([]);
    await view.pickFrame();
    expect(view.find('[data-call-mode-carousel] [aria-checked="true"]')?.getAttribute('data-carousel-item')).not.toBe('jovial.direct.duo');
    expect(view.find('[data-call-capture-status]')?.textContent).toBe('Trois effets au plus : retirez-en un pour en ajouter');
    await view.hold('[data-call-effects-add-look]');
    expect(view.all('[data-call-effect-layer]').map((entry) => entry.getAttribute('data-call-effect-layer'))).toEqual(['color', 'face', 'landscape']);
    view.done();
  });

  test('annuler un filtre ou un effet de visage défait son réglage ; la liste est lue de la couche du dessus à celle du dessous', async () => {
    const view = await mount({ effects: { ...NO_EFFECTS, faceEffect: 'toad', preset: 'golden' } });
    await view.hold('[data-call-effects-add-look]');
    expect(view.all('[data-call-effect-layer]').map((entry) => entry.getAttribute('data-call-effect-layer'))).toEqual(['color', 'face']);
    await view.press('[data-call-effect-layer-undo="face"]');
    expect(view.applied).toEqual([{ faceEffect: 'none' }]);
    view.done();
  });

  test('les cibles de la barre et de la liste font au moins 44 px', async () => {
    const view = await mount();
    await view.pickFrame();
    await view.hold('[data-call-effects-add-look]');
    const small = view.all('[data-call-mode="montage"] button').filter((button) => !/min-h-11|min-h-12|h-12|size-12|sr-only|focus:not-sr-only/.test(button.className) && !button.hasAttribute('data-carousel-item') && !button.hasAttribute('data-call-frame-mood') && !button.hasAttribute('data-call-frame-scope') && (button as HTMLElement).style.height === '');
    expect(small).toEqual([]);
    view.done();
  });
});
