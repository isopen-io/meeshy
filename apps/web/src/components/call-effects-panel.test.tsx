import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { onRowKeyDown } from '@/lib/calls/call-row-keys';
import { NO_EFFECTS, videoEffectsStore, type VideoEffects } from '@/lib/calls/video-effects';
import { loadCallStudioCatalog } from '@/lib/i18n-call-studio-catalog';

import { CallEffectsPanel } from './call-effects-panel';

/**
 * LE PANNEAU DES EFFETS (#8442, #8550, #8551) — il s'ouvre DANS le cadre de la
 * pilule, en trois rangées qui défilent à l'horizontale : les effets de
 * visage, les cinq préréglages de couleur, puis les réglages (luminosité, flou
 * d'arrière-plan là où la caméra l'offre). Chaque geste part aussitôt
 * (`apply`) : ce que je vois dans ma vignette est ce que l'autre voit.
 */

describe('CallEffectsPanel', () => {
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
    const closed: string[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <CallEffectsPanel id="call-effects-panel" closeGlyph={null} language="fr" colorAvailable={options.color ?? true} blurAvailable={options.blur ?? false} onClose={() => void closed.push('close')} onRowKeyDown={onRowKeyDown} apply={(patch) => void applied.push(patch)} />,
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

  test('un groupe nommé « Effets », sans verre à lui : il vit dans le cadre de la pilule', () => {
    const view = mount();
    const panel = view.find('[data-call-effects-panel]');
    expect(panel?.getAttribute('role')).toBe('group');
    expect(panel?.className).not.toContain('glass');
    expect(view.find('#call-effects-panel-title')?.textContent).toBe('Effets');
    expect(view.all('[data-call-effects-panel] button').some((button) => button.className.includes('glass-call'))).toBe(false);
    view.done();
  });

  test('trois rangées, chacune titrée et défilant à l’horizontale : Effets, Couleur, Réglages', () => {
    const view = mount({ blur: true });
    const rows = view.all('[data-call-effects-row]');
    expect(rows.map((row) => row.getAttribute('data-call-effects-row'))).toEqual(['faces', 'color', 'settings']);
    expect(rows.map((row) => row.querySelector('[data-call-row-scroll]')?.getAttribute('aria-label'))).toEqual(['Effets', 'Couleur', 'Réglages']);
    rows.forEach((row) => {
      const scroller = row.querySelector('[data-call-row-scroll]');
      expect(scroller?.className).toContain('overflow-x-auto');
      expect(scroller?.className).not.toContain('flex-wrap');
    });
    view.done();
  });

  test('six effets de visage en boutons radio, chacun avec son aperçu ; « Aucun » coché par défaut', () => {
    const view = mount();
    const radios = view.all('[data-call-effects-row="faces"] [role="radio"]');
    expect(radios.map((radio) => radio.textContent)).toEqual(['Aucun', 'Lissage de peau', 'Crapaud', 'Ange', 'Démon', 'Éruption']);
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false']);
    expect(radios.every((radio) => radio.querySelector('svg[aria-hidden]') !== null)).toBe(true);
    view.done();
  });

  test('choisir « Éruption » l’applique aussitôt, et l’effet choisi se lit coché', () => {
    const view = mount();
    view.press('[data-call-effects-face="volcano"]');
    expect(view.applied).toEqual([{ faceEffect: 'volcano' }]);
    view.done();
    const chosen = mount({ effects: { ...NO_EFFECTS, faceEffect: 'demon' } });
    expect(chosen.find('[data-call-effects-face="demon"]')?.getAttribute('aria-checked')).toBe('true');
    chosen.done();
  });

  test('→ dans la rangée des effets coche le voisin', () => {
    const view = mount();
    const first = view.find('[data-call-effects-face="none"]') as HTMLElement;
    act(() => first.focus());
    act(() => first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(view.applied).toEqual([{ faceEffect: 'smoothing' }]);
    view.done();
  });

  test('les flèches sur le curseur de luminosité restent au curseur : la rangée ne vole pas son focus', () => {
    const view = mount({ blur: true });
    const slider = view.find('input[type="range"]') as HTMLInputElement;
    act(() => slider.focus());
    act(() => slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(document.activeElement).toBe(slider);
    expect(view.applied).toEqual([]);
    view.done();
  });

  test('cinq préréglages en boutons radio, dans l’ordre d’iOS ; naturel coché par défaut', () => {
    const view = mount();
    const radios = view.all('[data-call-effects-row="color"] [role="radio"]');
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

  test('sans traitement d’images possible, ni effet de visage ni couleur : seul le flou reste', () => {
    const view = mount({ color: false, blur: true });
    expect(view.find('[role="radiogroup"]')).toBeNull();
    expect(view.find('[data-call-effects-face]')).toBeNull();
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
