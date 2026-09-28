import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ModeCarousel } from './call-mode-carousel';

/**
 * LE CARROUSEL D'UN MODE (#8578, #8580) — toucher un élément le CHOISIT puis
 * le centre en glissant ; le glissé qui l'amène au centre traverse ses
 * voisins, et aucun d'eux ne doit être choisi en chemin (l'aperçu clignoterait
 * de montage en montage, et un `scrollend` arrivé trop tôt pouvait laisser la
 * sélection sur un voisin — mesuré dans Chromium : « Couverture » touchée,
 * « Tapis rouge » enregistré). Un glissé du DOIGT, lui, choisit en direct.
 *
 * La géométrie est posée à la main : la piste fait 390 px, chaque élément 64
 * px tous les 72 px, et `scrollLeft` décale le tout.
 */

const IDS = ['screen', 'cover', 'gold', 'redcarpet', 'grid'] as const;
const WIDTH = 390;
const PITCH = 72;

type Track = HTMLElement & { scrollLeft: number };

const layout = (track: Track): void => {
  Object.defineProperty(track, 'clientWidth', { configurable: true, value: WIDTH });
  Object.defineProperty(track, 'getBoundingClientRect', { configurable: true, value: () => ({ left: 0, right: WIDTH, top: 0, bottom: 80, width: WIDTH, height: 80, x: 0, y: 0 }) });
  track.querySelectorAll<HTMLElement>('[data-carousel-item]').forEach((item, index) => {
    Object.defineProperty(item, 'offsetWidth', { configurable: true, value: 64 });
    Object.defineProperty(item, 'getBoundingClientRect', {
      configurable: true,
      value: () => {
        const left = WIDTH / 2 - 32 + index * PITCH - track.scrollLeft;
        return { left, right: left + 64, top: 8, bottom: 72, width: 64, height: 64, x: left, y: 8 };
      },
    });
  });
};

const frame = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('ModeCarousel', () => {
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

  const mount = () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const chosen: string[] = [];
    const scrolls: number[] = [];
    act(() =>
      root.render(<ModeCarousel label="Montages" items={IDS.map((id) => ({ id, label: id, visual: null }))} selected="screen" onSelect={(id) => void chosen.push(id)} />),
    );
    const track = host.querySelector('[data-call-row-scroll]') as Track;
    track.scrollLeft = 0;
    layout(track);
    Object.defineProperty(track, 'scrollTo', { configurable: true, value: (options: { readonly left: number }) => void scrolls.push(options.left) });
    Object.defineProperty(track, 'scrollBy', { configurable: true, value: () => void scrolls.push(Number.NaN) });
    const scrollTo = async (left: number) => {
      track.scrollLeft = left;
      track.dispatchEvent(new Event('scroll'));
      await act(frame);
    };
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { host, track, chosen, scrolls, scrollTo, done };
  };

  test('toucher « Tapis rouge » le choisit et le centre ; le glissé qui l’y amène ne choisit personne en chemin, même si un scrollend arrive trop tôt', async () => {
    const view = mount();
    await act(async () => (view.host.querySelector('[data-carousel-item="redcarpet"]') as HTMLElement).click());
    expect(view.chosen).toEqual(['redcarpet']);
    expect(view.scrolls).toEqual([3 * PITCH]);
    view.track.dispatchEvent(new Event('scrollend'));
    await view.scrollTo(60);
    await view.scrollTo(140);
    await view.scrollTo(3 * PITCH);
    view.track.dispatchEvent(new Event('scrollend'));
    expect(view.chosen).toEqual(['redcarpet']);
    view.done();
  });

  /* Chromium, sous `scroll-snap-type: mandatory`, accroche un scrollBy au point
     SUIVANT dans son sens : un décalage de quelques pixels vers l'élément déjà
     au centre envoyait au voisin (mesuré : « Couverture » touchée, « Doré »
     enregistré). Le centre se vise en position ABSOLUE, et l'élément déjà au
     centre ne bouge pas. */
  test('toucher l’élément déjà au centre le choisit sans rien faire défiler ; un autre se vise en position absolue', async () => {
    const view = mount();
    await view.scrollTo(PITCH + 5);
    view.chosen.length = 0;
    await act(async () => (view.host.querySelector('[data-carousel-item="cover"]') as HTMLElement).click());
    expect(view.chosen).toEqual(['cover']);
    expect(view.scrolls).toEqual([]);
    await act(async () => (view.host.querySelector('[data-carousel-item="grid"]') as HTMLElement).click());
    expect(view.scrolls).toEqual([4 * PITCH]);
    view.done();
  });

  test('au doigt, le glissé choisit en direct celui qui passe au centre — même juste après un toucher', async () => {
    const view = mount();
    await act(async () => (view.host.querySelector('[data-carousel-item="gold"]') as HTMLElement).click());
    view.track.dispatchEvent(new Event('pointerdown'));
    await view.scrollTo(PITCH);
    await view.scrollTo(4 * PITCH);
    expect(view.chosen).toEqual(['gold', 'cover', 'grid']);
    view.done();
  });
});
