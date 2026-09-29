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

  /* Chromium, sous `scroll-snap-type: mandatory`, recalcule les points
     d'accroche à chaque mise en page de la piste ; s'ils ont bougé pendant un
     glissé du doigt, il RÉACCROCHE sur-le-champ au dernier élément accroché et
     le geste meurt (mesuré, #8619 : 288 → 558 → 288 au milieu du glissé). Or le
     glissé choisit en direct : chaque élément qui passe au centre changeait
     d'échelle (la zone d'accroche elle-même) et de nom (le texte sous la piste,
     qui remettait la colonne en page). Choisir ne touche donc ni la boîte d'un
     élément — l'accent vit dans sa FACE —, ni la mise en page de la colonne. */
  test('choisir ne change ni la boîte d’un élément ni la mise en page autour de la piste : l’accent vit dans sa face, le nom dans une boîte fixe', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const render = (selected: string) => act(() => root.render(<ModeCarousel label="Montages" items={IDS.map((id) => ({ id, label: `Montage ${id}`, visual: null }))} selected={selected} onSelect={() => undefined} />));
    const boxes = () => [...host.querySelectorAll<HTMLElement>('[data-carousel-item]')].map((item) => [item.className, item.getAttribute('style')]);
    const face = (id: string) => host.querySelector<HTMLElement>(`[data-carousel-item="${id}"] [data-carousel-face]`);

    render('screen');
    const before = boxes();
    render('gold');

    expect(boxes()).toEqual(before);
    expect(new Set(before.map(([className]) => className)).size).toBe(1);
    expect(face('gold')?.className).toContain('scale-110');
    expect(face('screen')?.className).not.toContain('scale-110');
    const name = host.querySelector<HTMLElement>('[data-call-mode-selected]');
    expect(name?.textContent).toBe('Montage gold');
    expect(name?.className).toContain('[contain:strict]');
    expect(name?.className).toContain('h-5');
    expect(name?.className).toContain('w-full');
    act(() => root.unmount());
    host.remove();
  });
});
