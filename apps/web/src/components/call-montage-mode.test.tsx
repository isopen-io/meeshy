import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { CaptureEnv, CaptureFile, SaveOutcome } from '@/lib/calls/call-capture';
import { loadCallStudioCatalog } from '@/lib/i18n-call-studio-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallMontageMode } from './call-montage-mode';

/**
 * LE MODE MONTAGE (#8552, #8578, #8580) — l'écran se libère : le montage
 * choisi en plein écran et en direct, le carrousel des treize styles en bas
 * (chacun sa vignette vivante), la barre ✕ · déclencheur · « Chaque visage ».
 * Le déclencheur enregistre le montage choisi ; le statut dit ce qui est
 * parti.
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

describe('CallMontageMode', () => {
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
        <CallMontageMode language="fr" quitGlyph={null} onExit={() => void closed.push('close')} stage={() => stage} env={env} save={save} viewport={() => ({ width: 390, height: 844 })} />,
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

  test('une région nommée ; le montage en plein écran, en direct, derrière le carrousel', () => {
    const view = mount();
    const region = view.find('[data-call-mode="montage"]');
    expect(region?.getAttribute('role')).toBe('region');
    expect(region?.getAttribute('aria-label')).toBe('Capturer l’appel');
    expect(view.find('[data-call-mode-preview="montage"]')?.className).toContain('fixed inset-0');
    const preview = view.find('[data-call-mode-preview="montage"] [data-call-capture-preview]');
    expect(preview?.tagName).toBe('CANVAS');
    expect(preview?.getAttribute('aria-label')).toBe('Aperçu du montage Mosaïque');
    expect([preview?.getAttribute('width'), preview?.getAttribute('height')]).toEqual(['540', '960']);
    expect(view.all('[data-call-mode-carousel]')).toHaveLength(1);
    view.done();
  });

  test('treize montages dans le carrousel, dans l’ordre, chacun sa vignette ; il défile à l’horizontale', () => {
    const view = mount();
    const radios = view.all('[data-call-mode-carousel] [role="radio"]');
    expect(radios.map((radio) => radio.getAttribute('aria-label'))).toEqual(['Plein écran', 'Couverture', 'Doré', 'Tapis rouge', 'Mosaïque', 'Photomaton', 'Polaroïd', 'Magazine', 'Pellicule', 'Néon', 'Noir et blanc', 'BD', 'Cœur']);
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'false', 'true', 'false', 'false', 'false', 'false', 'false', 'false', 'false', 'false']);
    expect(radios.every((radio) => radio.querySelector('canvas[data-call-capture-thumb]') !== null)).toBe(true);
    expect(view.find('[data-call-mode-carousel] [data-call-row-scroll]')?.className).toContain('overflow-x-auto');
    view.done();
  });

  test('choisir « BD » change l’aperçu et le nom du déclencheur', async () => {
    const view = mount();
    await view.press('[data-carousel-item="comic"]');
    expect(view.find('[data-carousel-item="comic"]')?.getAttribute('aria-checked')).toBe('true');
    expect(view.find('[data-call-mode-selected]')?.textContent).toBe('BD');
    expect(view.find('[data-call-capture-preview]')?.getAttribute('data-call-capture-preview')).toBe('comic');
    expect(view.find('[data-call-capture-shoot]')?.getAttribute('aria-label')).toBe('Capturer le montage BD');
    view.done();
  });

  test('Capturer enregistre le montage choisi, et le dit', async () => {
    const view = mount();
    await view.press('[data-carousel-item="polaroid"]');
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

  test('« Couverture » se capture comme les autres, sous son propre nom', async () => {
    const view = mount();
    await view.press('[data-carousel-item="cover"]');
    await view.press('[data-call-capture-shoot]');
    expect(view.saved.map((files) => files.map((file) => file.fileName))).toEqual([['meeshy-appel-cover-20260928-090503.png']]);
    view.done();
  });

  test('✕ quitte le mode ; Échap aussi', () => {
    const view = mount();
    act(() => (view.find('[data-call-mode-quit]') as HTMLElement).click());
    act(() => view.find('[data-call-mode="montage"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(view.closed).toEqual(['close', 'close']);
    view.done();
  });
});
