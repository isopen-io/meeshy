import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { NO_EFFECTS, videoEffectsStore, type VideoEffects } from '@/lib/calls/video-effects';
import { loadCallStudioCatalog } from '@/lib/i18n-call-studio-catalog';

import { CallEffectsMode } from './call-effects-mode';

/**
 * LE MODE EFFETS (#8578) — l'écran se libère : ma vidéo en plein écran, un
 * seul carrousel en bas, la catégorie « Visage · Couleur » au-dessus, et la
 * barre ✕ · Valider · Réglages. Chaque choix part aussitôt ; ✕ rend les effets
 * d'avant, Valider les garde.
 */

describe('CallEffectsMode', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(async () => {
    await loadCallStudioCatalog('fr');
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  const mount = (options: { readonly color?: boolean; readonly blur?: boolean; readonly effects?: VideoEffects } = {}) => {
    videoEffectsStore.setState({ effects: options.effects ?? NO_EFFECTS });
    const applied: Array<Partial<VideoEffects>> = [];
    const exits: string[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <CallEffectsMode
          language="fr"
          colorAvailable={options.color ?? true}
          blurAvailable={options.blur ?? false}
          preview={<video data-testid="self-preview" />}
          quitGlyph={null}
          onExit={() => void exits.push('exit')}
          apply={(patch) => {
            applied.push(patch);
            videoEffectsStore.setState((state) => ({ effects: { ...state.effects, ...patch } }));
          }}
        />,
      ),
    );
    const find = (selector: string) => host.querySelector(selector);
    const all = (selector: string) => [...host.querySelectorAll(selector)];
    const press = (selector: string) => act(() => (find(selector) as HTMLElement | null)?.click());
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { find, all, press, applied, exits, done };
  };

  test('une région nommée, ma vidéo en plein écran derrière, un seul carrousel', () => {
    const view = mount();
    const region = view.find('[data-call-mode="effects"]');
    expect(region?.getAttribute('role')).toBe('region');
    expect(region?.getAttribute('aria-label')).toBe('Effets de ma vidéo');
    expect(view.find('[data-call-mode-preview="effects"] [data-testid="self-preview"]')).not.toBeNull();
    expect(view.find('[data-call-mode-preview="effects"]')?.className).toContain('fixed inset-0');
    expect(view.all('[data-call-mode-carousel]')).toHaveLength(1);
    view.done();
  });

  test('« Visage » d’abord : les six effets, « Aucun » coché ; « Couleur » montre les cinq préréglages', () => {
    const view = mount();
    const categories = view.all('[data-call-effects-category]');
    expect(categories.map((button) => button.textContent)).toEqual(['Visage', 'Couleur']);
    expect(categories.map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(view.all('[data-carousel-item]').map((item) => item.getAttribute('data-carousel-item'))).toEqual(['none', 'smoothing', 'toad', 'angel', 'demon', 'volcano']);
    expect(view.find('[aria-checked="true"]')?.getAttribute('data-carousel-item')).toBe('none');
    view.press('[data-call-effects-category="color"]');
    expect(view.all('[data-carousel-item]').map((item) => item.getAttribute('data-carousel-item'))).toEqual(['natural', 'warm', 'cool', 'vivid', 'muted']);
    view.done();
  });

  test('toucher un effet l’applique aussitôt et le coche', () => {
    const view = mount();
    view.press('[data-carousel-item="volcano"]');
    expect(view.applied).toEqual([{ faceEffect: 'volcano' }]);
    expect(view.find('[data-carousel-item="volcano"]')?.getAttribute('aria-checked')).toBe('true');
    expect(view.find('[data-call-mode-selected]')?.textContent).toBe('Éruption');
    view.done();
  });

  test('→ passe au voisin ; au bout, rien ne boucle', () => {
    const view = mount({ effects: { ...NO_EFFECTS, faceEffect: 'volcano' } });
    const last = view.find('[data-carousel-item="volcano"]') as HTMLElement;
    act(() => last.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(view.applied).toEqual([]);
    act(() => last.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
    expect(view.applied).toEqual([{ faceEffect: 'demon' }]);
    view.done();
  });

  test('« Réglages » remplace le carrousel par la luminosité et le flou ; le retoucher rend le carrousel', () => {
    const view = mount({ blur: true });
    expect(view.find('[data-call-effects-settings]')).toBeNull();
    view.press('[data-call-effects-settings-toggle]');
    expect(view.find('[data-call-effects-settings-toggle]')?.getAttribute('aria-pressed')).toBe('true');
    expect(view.find('[data-call-mode-carousel]')).toBeNull();
    const slider = view.find('input[type="range"]') as HTMLInputElement;
    expect([slider.min, slider.max, slider.step]).toEqual(['-50', '50', '5']);
    act(() => {
      slider.value = '20';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    view.press('[data-call-effects-blur]');
    expect(view.applied).toEqual([{ brightness: 0.2 }, { blur: true }]);
    view.press('[data-call-effects-settings-toggle]');
    expect(view.find('[data-call-mode-carousel]')).not.toBeNull();
    view.done();
  });

  test('sans traitement d’images, seul le flou reste — et ni carrousel ni bouton Réglages', () => {
    const view = mount({ color: false, blur: true });
    expect(view.find('[data-call-mode-carousel]')).toBeNull();
    expect(view.find('[data-call-effects-settings-toggle]')).toBeNull();
    expect(view.find('input[type="range"]')).toBeNull();
    expect(view.find('[data-call-effects-blur]')).not.toBeNull();
    view.done();
  });

  test('Valider garde l’effet et quitte le mode', () => {
    const view = mount();
    view.press('[data-carousel-item="angel"]');
    view.press('[data-call-effects-validate]');
    expect(view.exits).toEqual(['exit']);
    expect(view.applied).toEqual([{ faceEffect: 'angel' }]);
    view.done();
  });

  test('✕ rend les effets d’avant le mode, puis quitte ; Échap aussi, sans réduire l’appel', () => {
    const before: VideoEffects = { ...NO_EFFECTS, preset: 'cool' };
    const view = mount({ effects: before });
    view.press('[data-carousel-item="toad"]');
    view.press('[data-call-mode-quit]');
    expect(view.applied.at(-1)).toEqual(before);
    expect(view.exits).toEqual(['exit']);
    const reached: string[] = [];
    const onWindow = () => void reached.push('window');
    window.addEventListener('keydown', onWindow);
    act(() => view.find('[data-call-mode="effects"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    window.removeEventListener('keydown', onWindow);
    expect(view.exits).toEqual(['exit', 'exit']);
    expect(reached).toEqual([]);
    view.done();
  });

  test('la barre : Quitter, le déclencheur de 72, Réglages ; toutes les cibles font au moins 44 px', () => {
    const view = mount({ blur: true });
    const bar = view.find('[data-call-mode-bar]');
    expect(bar?.querySelector('[data-call-mode-quit]')?.getAttribute('aria-label')).toBe('Quitter sans garder ces changements');
    expect(bar?.querySelector('[data-call-effects-validate]')?.className).toContain('size-[72px]');
    const small = view.all('[data-call-mode="effects"] button').filter((button) => !/min-h-11|size-12|size-\[72px\]/.test(button.className) && (button as HTMLElement).style.height !== '64px');
    expect(small).toEqual([]);
    view.done();
  });
});
