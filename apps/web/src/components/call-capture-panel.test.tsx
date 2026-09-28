import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { CaptureEnv, CaptureFile, SaveOutcome } from '@/lib/calls/call-capture';
import { onRowKeyDown } from '@/lib/calls/call-row-keys';
import { loadCallStudioCatalog } from '@/lib/i18n-call-studio-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallCapturePanel } from './call-capture-panel';

/**
 * LE PANNEAU « CAPTURER » (#8552) — dans le cadre de la pilule : le grand
 * aperçu du montage, la rangée des sept styles (chacun sa vignette vivante),
 * la rangée des actions. Capturer enregistre le montage choisi ; « Chaque
 * visage » un portrait par tuile ; le statut dit ce qui est parti.
 */

const place = (element: Element, box: { left: number; top: number; width: number; height: number }): void => {
  Object.defineProperty(element, 'getBoundingClientRect', { value: () => ({ ...box, x: box.left, y: box.top, right: box.left + box.width, bottom: box.top + box.height }) });
};

const stageOf = (count: number): Element => {
  const stage = document.createElement('div');
  place(stage, { left: 0, top: 0, width: 400, height: 800 });
  Array.from({ length: count }, (_, index) => {
    const video = document.createElement('video');
    video.setAttribute('data-call-stream', 'cover');
    Object.defineProperty(video, 'videoWidth', { value: 1280 });
    Object.defineProperty(video, 'videoHeight', { value: 720 });
    place(video, { left: 0, top: index * 250, width: 400, height: 250 });
    stage.appendChild(video);
  });
  return stage;
};

const env: CaptureEnv = {
  canvas: () => ({
    context: new Proxy({}, { get: (_t, key) => (key === 'createLinearGradient' ? () => ({ addColorStop: () => undefined }) : () => undefined), set: () => true }) as unknown as CanvasRenderingContext2D,
    toBlob: async () => new Blob(['png'], { type: 'image/png' }),
  }),
  detector: null,
  now: () => new Date(2026, 8, 28, 9, 5, 3),
};

describe('CallCapturePanel', () => {
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

  const mount = (options: { readonly tiles?: number; readonly outcome?: SaveOutcome } = {}) => {
    const stage = stageOf(options.tiles ?? 2);
    const saved: Array<readonly CaptureFile[]> = [];
    const closed: string[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const save = async (files: readonly CaptureFile[]) => {
      saved.push(files);
      return options.outcome ?? { saved: files.length, failed: 0, cancelled: 0 };
    };
    act(() =>
      root.render(
        <CallCapturePanel id="call-capture-panel" closeGlyph={null} language="fr" onClose={() => void closed.push('close')} onRowKeyDown={onRowKeyDown} stage={() => stage} env={env} save={save} viewport={() => ({ width: 390, height: 844 })} />,
      ),
    );
    const find = (selector: string) => host.querySelector(selector);
    const all = (selector: string) => [...host.querySelectorAll(selector)];
    const press = async (selector: string) => {
      await act(async () => (find(selector) as HTMLElement | null)?.click());
      await act(async () => {});
    };
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { find, all, press, saved, closed, done };
  };

  test('un groupe « Capturer » dans le cadre, sans verre, avec son grand aperçu nommé', () => {
    const view = mount();
    const panel = view.find('[data-call-capture-panel]');
    expect(panel?.getAttribute('role')).toBe('group');
    expect(panel?.className).not.toContain('glass');
    expect(view.find('#call-capture-panel-title')?.textContent).toBe('Capturer');
    const preview = view.find('[data-call-capture-preview]');
    expect(preview?.tagName).toBe('CANVAS');
    expect(preview?.getAttribute('aria-label')).toBe('Aperçu du montage Mosaïque');
    expect([preview?.getAttribute('width'), preview?.getAttribute('height')]).toEqual(['180', '320']);
    view.done();
  });

  test('treize montages en boutons radio, chacun sa vignette ; la rangée défile à l’horizontale', () => {
    const view = mount();
    const radios = view.all('[data-call-capture-row="montage"] [role="radio"]');
    expect(radios.map((radio) => radio.textContent)).toEqual(['Plein écran', 'Couverture', 'Doré', 'Tapis rouge', 'Mosaïque', 'Photomaton', 'Polaroïd', 'Magazine', 'Pellicule', 'Néon', 'Noir et blanc', 'BD', 'Cœur']);
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'false', 'true', 'false', 'false', 'false', 'false', 'false', 'false', 'false', 'false']);
    expect(radios.every((radio) => radio.querySelector('canvas[data-call-capture-thumb]') !== null)).toBe(true);
    expect(view.find('[data-call-capture-row="montage"] [data-call-row-scroll]')?.className).toContain('overflow-x-auto');
    view.done();
  });

  test('choisir « BD » change l’aperçu et le nom du déclencheur', async () => {
    const view = mount();
    await view.press('[data-call-capture-style="comic"]');
    expect(view.find('[data-call-capture-style="comic"]')?.getAttribute('aria-checked')).toBe('true');
    expect(view.find('[data-call-capture-preview]')?.getAttribute('data-call-capture-preview')).toBe('comic');
    expect(view.find('[data-call-capture-shoot]')?.getAttribute('aria-label')).toBe('Capturer le montage BD');
    view.done();
  });

  test('Capturer enregistre le montage choisi, et le dit', async () => {
    const view = mount();
    await view.press('[data-call-capture-style="polaroid"]');
    await view.press('[data-call-capture-shoot]');
    expect(view.saved.map((files) => files.map((file) => file.fileName))).toEqual([['meeshy-appel-polaroid-20260928-090503.png']]);
    expect(view.find('[data-call-capture-status]')?.textContent).toBe('Capture enregistrée');
    expect(view.find('[data-call-capture-status]')?.getAttribute('role')).toBe('status');
    view.done();
  });

  test('« Chaque visage » enregistre un portrait par tuile affichée', async () => {
    const view = mount({ tiles: 3 });
    await view.press('[data-call-capture-faces]');
    expect(view.saved[0]).toHaveLength(3);
    expect(view.find('[data-call-capture-status]')?.textContent).toBe('3 visages enregistrés');
    view.done();
  });

  test('rien d’affiché : rien n’est enregistré, et on le dit', async () => {
    const view = mount({ tiles: 0 });
    await view.press('[data-call-capture-shoot]');
    expect(view.saved).toEqual([]);
    expect(view.find('[data-call-capture-status]')?.textContent).toBe('Rien à capturer : aucune image n’est affichée');
    view.done();
  });

  test('un enregistrement qui échoue se dit en erreur', async () => {
    const view = mount({ outcome: { saved: 0, failed: 1, cancelled: 0 } });
    await view.press('[data-call-capture-shoot]');
    expect(view.find('[data-call-capture-status]')?.getAttribute('data-call-capture-status')).toBe('error');
    view.done();
  });

  test('Échap ferme le panneau', () => {
    const view = mount();
    act(() => view.find('[data-call-capture-panel]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(view.closed).toEqual(['close']);
    view.done();
  });
});
