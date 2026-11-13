import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { CAPTURE_HOLD_MS } from '@/lib/calls/call-capture-gesture';
import { effectLayersStore, setEffectLayers } from '@/lib/calls/call-effect-layers-store';
import { NO_EFFECTS, videoEffectsStore, type VideoEffects } from '@/lib/calls/video-effects';
import { loadCallStudioCatalog } from '@/lib/i18n-call-studio-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallEffectsMode } from './call-effects-mode';

/**
 * LA PILE DE TROIS COUCHES EN EFFETS (#17903, #16979) — le même (+), la même liste que le Montage :
 * l'appui long (ou le menu contextuel, ou Maj + Entrée) liste les effets appliqués, du dessus au
 * dessous ; en annuler un le défait, referme la liste et rend le menu de base ; à trois couches,
 * (+) n'ajoute plus.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const later = (ms: number) => act(async () => void (await new Promise((resolve) => setTimeout(resolve, ms))));

describe('CallEffectsMode — la pile de trois couches', () => {
  beforeAll(async () => {
    await loadCallStudioCatalog('fr');
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

  const mount = (options: { readonly effects?: VideoEffects; readonly heldFrameId?: string | null } = {}) => {
    videoEffectsStore.setState({ effects: options.effects ?? NO_EFFECTS });
    const applied: Array<Partial<VideoEffects>> = [];
    const toggled: string[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <CallEffectsMode
          language="fr"
          colorAvailable
          blurAvailable={false}
          preview={<video data-testid="self-preview" />}
          selfVideo={() => host.querySelector<HTMLVideoElement>('[data-testid="self-preview"]')}
          onExit={() => undefined}
          apply={(patch) => {
            applied.push(patch);
            videoEffectsStore.setState((state) => ({ effects: { ...state.effects, ...patch } }));
          }}
          {...(options.heldFrameId === undefined ? {} : { hold: { heldFrameId: options.heldFrameId, offered: true, toggle: (id: string) => void toggled.push(id) } })}
        />,
      ),
    );
    const find = (selector: string) => host.querySelector<HTMLElement>(selector);
    const all = (selector: string) => [...host.querySelectorAll<HTMLElement>(selector)];
    const press = (selector: string) => act(() => find(selector)?.click());
    const hold = async (selector: string) => {
      await act(async () => void find(selector)?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })));
      await later(CAPTURE_HOLD_MS + 60);
      await act(async () => void find(selector)?.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
    };
    const genres = () => all('[data-call-effect-layer]').map((entry) => entry.getAttribute('data-call-effect-layer'));
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { find, all, press, hold, genres, applied, toggled, done };
  };

  test('l’appui long sur (+) liste les effets appliqués, du dessus au dessous ; rien d’appliqué, rien à lister', async () => {
    const view = mount({ effects: { ...NO_EFFECTS, faceEffect: 'toad', preset: 'golden' } });
    await later(260);
    expect(view.find('[data-call-effect-layers]')).toBeNull();
    await view.hold('[data-call-effects-add-look]');
    expect(view.find('[data-call-effect-layers]')?.getAttribute('aria-label')).toBe('Effets appliqués');
    expect(view.genres()).toEqual(['color', 'face']);
    expect(view.find('[data-call-effect-layer="face"]')?.textContent).toContain('Crapaud');
    expect(view.find('[data-call-effect-layer="color"]')?.textContent).toContain('Doré');
    view.done();
    const empty = mount();
    await empty.hold('[data-call-effects-add-look]');
    expect(empty.genres()).toEqual([]);
    expect(empty.find('[data-call-effect-layers]')?.textContent).toContain('Aucun effet appliqué');
    empty.done();
  });

  test('annuler un effet de visage le défait, referme la liste et rend le menu de base ; le filtre reste', async () => {
    const view = mount({ effects: { ...NO_EFFECTS, faceEffect: 'toad', preset: 'golden' } });
    await view.hold('[data-call-effects-add-look]');
    await view.press('[data-call-effect-layer-undo="face"]');
    expect(view.applied).toEqual([{ faceEffect: 'none' }]);
    await later(260);
    expect(view.find('[data-call-effect-layers]')).toBeNull();
    expect(view.find('[data-call-effects-settings-toggle]')?.getAttribute('aria-pressed')).toBe('false');
    expect(view.find('[data-call-effects-categories]')).not.toBeNull();
    await view.hold('[data-call-effects-add-look]');
    expect(view.genres()).toEqual(['color']);
    await view.press('[data-call-effect-layer-undo="color"]');
    expect(view.applied).toEqual([{ faceEffect: 'none' }, { preset: 'natural' }]);
    view.done();
  });

  test('menu contextuel ou Maj + Entrée : la même liste, annoncée au lecteur d’écran ; Échap la referme sans quitter le mode', async () => {
    const view = mount({ effects: { ...NO_EFFECTS, faceEffect: 'angel' } });
    const add = view.find('[data-call-effects-add-look]') as HTMLElement;
    expect(add.getAttribute('aria-keyshortcuts')).toBe('Shift+Enter');
    expect(add.getAttribute('aria-description')).toContain('Appui long');
    await act(async () => void add.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
    expect(view.genres()).toEqual(['face']);
    await act(async () => void add.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await later(260);
    expect(view.find('[data-call-effect-layers]')).toBeNull();
    await act(async () => void add.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true })));
    expect(view.genres()).toEqual(['face']);
    view.done();
  });

  test('choisir un look referme la liste : la barre revient à son menu de base après chaque choix', async () => {
    const view = mount({ effects: { ...NO_EFFECTS, faceEffect: 'angel' } });
    await view.hold('[data-call-effects-add-look]');
    expect(view.find('[data-call-effect-layers]')).not.toBeNull();
    await view.press('[data-carousel-item="demon"]');
    await later(260);
    expect(view.find('[data-call-effect-layers]')).toBeNull();
    expect(view.applied).toEqual([{ faceEffect: 'demon' }]);
    view.done();
  });

  test('un choix qui REMPLACE son genre ne crée pas de couche : Visage puis un autre Visage = une seule couche', async () => {
    const view = mount();
    await view.press('[data-carousel-item="toad"]');
    await view.press('[data-carousel-item="demon"]');
    await view.hold('[data-call-effects-add-look]');
    expect(view.genres()).toEqual(['face']);
    expect(effectLayersStore.getState().stack).toEqual([{ genre: 'face', choice: 'demon' }]);
    view.done();
  });

  test('(+) ouvre le genre absent de la pile — Couleur quand Visage est posé — et une pile pleine ne s’ouvre plus', async () => {
    const view = mount({ effects: { ...NO_EFFECTS, faceEffect: 'toad' } });
    await view.press('[data-call-effects-add-look]');
    expect(view.find('[data-call-effects-category="color"]')?.getAttribute('aria-pressed')).toBe('true');
    view.done();
    setEffectLayers([{ genre: 'frame', choice: 'neon' }, { genre: 'landscape', choice: 'beach' }]);
    const full = mount({ effects: { ...NO_EFFECTS, faceEffect: 'toad' } });
    const add = full.find('[data-call-effects-add-look]') as HTMLElement;
    expect(add.getAttribute('aria-disabled')).toBe('true');
    expect(add.getAttribute('aria-label')).toBe('Trois effets au plus : retirez-en un pour en ajouter');
    await full.press('[data-call-effects-add-look]');
    expect(full.find('[data-call-effects-category="face"]')?.getAttribute('aria-pressed')).toBe('true');
    await full.hold('[data-call-effects-add-look]');
    expect(full.genres()).toEqual(['face', 'landscape', 'frame']);
    full.done();
  });

  test('à trois couches, un filtre d’un genre absent est refusé, et on le dit ; remplacer un genre présent reste permis', async () => {
    setEffectLayers([{ genre: 'frame', choice: 'neon' }, { genre: 'landscape', choice: 'beach' }]);
    const view = mount({ effects: { ...NO_EFFECTS, faceEffect: 'toad' } });
    await view.press('[data-call-effects-category="color"]');
    await view.press('[data-carousel-item="golden"]');
    expect(view.applied).toEqual([]);
    expect(view.find('[data-call-capture-status]')?.textContent).toBe('Trois effets au plus : retirez-en un pour en ajouter');
    await view.press('[data-call-effects-category="face"]');
    await view.press('[data-carousel-item="angel"]');
    expect(view.applied).toEqual([{ faceEffect: 'angel' }]);
    view.done();
  });

  test('la couche « cadre » vient du Montage : annulée ici, elle retire aussi le cadre gardé en direct', async () => {
    setEffectLayers([{ genre: 'frame', choice: 'jovial.direct.duo' }]);
    const view = mount({ heldFrameId: 'jovial.direct.duo' });
    await view.hold('[data-call-effects-add-look]');
    expect(view.genres()).toEqual(['frame']);
    await view.press('[data-call-effect-layer-undo="frame"]');
    expect(view.toggled).toEqual(['jovial.direct.duo']);
    expect(effectLayersStore.getState().stack).toEqual([]);
    view.done();
  });

  test('la liste a des cibles de 44 px', async () => {
    const view = mount({ effects: { ...NO_EFFECTS, faceEffect: 'toad' } });
    await view.hold('[data-call-effects-add-look]');
    const small = view.all('[data-call-effect-layers] button').filter((button) => !/min-h-11/.test(button.className));
    expect(small).toEqual([]);
    view.done();
  });
});
