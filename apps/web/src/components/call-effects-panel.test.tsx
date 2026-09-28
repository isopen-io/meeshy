import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { NO_EFFECTS, videoEffectsStore, type VideoEffects } from '@/lib/calls/video-effects';

import { CallEffectsPanel } from './call-effects-panel';

/**
 * LE PANNEAU DES EFFETS (#8442) — un verre d'appel qui monte au-dessus de la
 * pilule : les cinq préréglages, la luminosité, le flou d'arrière-plan là où
 * la caméra l'offre. Chaque geste part aussitôt (`apply`) : ce que je vois dans
 * ma vignette est ce que l'autre voit.
 */

describe('CallEffectsPanel', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(() => {
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
    const closed: string[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <CallEffectsPanel id="call-effects-panel" closeGlyph={null} language="fr" colorAvailable={options.color ?? true} blurAvailable={options.blur ?? false} onClose={() => void closed.push('close')} apply={(patch) => void applied.push(patch)} />,
      ),
    );
    const find = (selector: string) => host.querySelector(selector);
    const all = (selector: string) => [...host.querySelectorAll(selector)];
    const press = (selector: string) => act(() => (find(selector) as HTMLElement | null)?.click());
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { find, all, press, applied, closed, done };
  };

  test('un dialogue de verre nommé « Effets », ses boutons sans verre à eux (pas de verre sur verre)', () => {
    const view = mount();
    const panel = view.find('[data-call-effects-panel]');
    expect(panel?.getAttribute('role')).toBe('dialog');
    expect(panel?.className).toContain('glass-call-prominent');
    expect(view.find('#call-effects-title')?.textContent).toBe('Effets');
    expect(view.all('[data-call-effects-panel] button').some((button) => button.className.includes('glass-call'))).toBe(false);
    view.done();
  });

  test('cinq préréglages en boutons radio, dans l’ordre d’iOS ; naturel coché par défaut', () => {
    const view = mount();
    const radios = view.all('[role="radiogroup"] [role="radio"]');
    expect(radios.map((radio) => radio.textContent)).toEqual(['Naturel', 'Chaud', 'Froid', 'Vif', 'Doux']);
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false', 'false']);
    view.done();
  });

  test('choisir « Chaud » l’applique aussitôt', () => {
    const view = mount();
    view.press('[data-call-effects-preset="warm"]');
    expect(view.applied).toEqual([{ preset: 'warm' }]);
    view.done();
  });

  test('le préréglage choisi se lit coché', () => {
    const view = mount({ effects: { ...NO_EFFECTS, preset: 'vivid' } });
    expect(view.find('[data-call-effects-preset="vivid"]')?.getAttribute('aria-checked')).toBe('true');
    view.done();
  });

  test('la luminosité est un curseur de −50 à +50 %, appliqué à chaque cran', () => {
    const view = mount();
    const slider = view.find('input[type="range"]') as HTMLInputElement;
    expect(slider.getAttribute('aria-label')).toBe('Luminosité');
    expect([slider.min, slider.max, slider.step]).toEqual(['-50', '50', '5']);
    act(() => {
      slider.value = '20';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(view.applied).toEqual([{ brightness: 0.2 }]);
    view.done();
  });

  test('le flou d’arrière-plan est un interrupteur — seulement là où la caméra l’offre', () => {
    const without = mount({ blur: false });
    expect(without.find('[data-call-effects-blur]')).toBeNull();
    without.done();
    const view = mount({ blur: true });
    const toggle = view.find('[data-call-effects-blur]');
    expect(toggle?.getAttribute('role')).toBe('switch');
    expect(toggle?.getAttribute('aria-checked')).toBe('false');
    view.press('[data-call-effects-blur]');
    expect(view.applied).toEqual([{ blur: true }]);
    view.done();
  });

  test('sans traitement de couleur possible, seul le flou reste', () => {
    const view = mount({ color: false, blur: true });
    expect(view.find('[role="radiogroup"]')).toBeNull();
    expect(view.find('input[type="range"]')).toBeNull();
    expect(view.find('[data-call-effects-blur]')).not.toBeNull();
    view.done();
  });

  test('Échap ferme le panneau sans réduire l’appel ; le bouton Fermer aussi', () => {
    const view = mount();
    const reached: string[] = [];
    const onWindow = () => void reached.push('window');
    window.addEventListener('keydown', onWindow);
    act(() => view.find('[data-call-effects-panel]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    window.removeEventListener('keydown', onWindow);
    expect(view.closed).toEqual(['close']);
    expect(reached).toEqual([]);
    view.press('[data-call-effects-close]');
    expect(view.closed).toEqual(['close', 'close']);
    view.done();
  });

  test('chaque cible fait au moins 44 px', () => {
    const view = mount({ blur: true });
    const small = view.all('[data-call-effects-panel] button').filter((button) => !/min-h-11|size-11|h-11/.test(button.className) && (button as HTMLElement).style.height !== '44px');
    expect(small).toEqual([]);
    view.done();
  });
});
