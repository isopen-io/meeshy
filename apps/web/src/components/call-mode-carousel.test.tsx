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

  test('re-toucher l’élément qui se centre ne rend pas la main : sa seconde tape ne choisit pas le voisin qui passe (#8625)', async () => {
    const view = mount();
    const gold = view.host.querySelector('[data-carousel-item="gold"]') as HTMLElement;
    await act(async () => gold.click());
    gold.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await view.scrollTo(PITCH);
    await view.scrollTo(2 * PITCH);
    expect(view.chosen).toEqual(['gold']);
    view.track.dispatchEvent(new Event('pointercancel'));
    await view.scrollTo(4 * PITCH);
    expect(view.chosen).toEqual(['gold', 'grid']);
    view.done();
  });

  const mountCapture = (options: { readonly recording?: boolean } = {}) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const chosen: string[] = [];
    const captured: string[] = [];
    act(() =>
      root.render(
        <ModeCarousel
          label="Montages"
          items={IDS.map((id) => ({ id, label: id, visual: null }))}
          selected="screen"
          onSelect={(id) => void chosen.push(id)}
          capture={{ recording: options.recording === true, onCapture: (intent) => void captured.push(intent), hint: 'Deux tapes : photo · Appui long : vidéo', longPressMs: 30 }}
        />,
      ),
    );
    const track = host.querySelector('[data-call-row-scroll]') as Track;
    layout(track);
    Object.defineProperty(track, 'scrollTo', { configurable: true, value: () => undefined });
    const item = (id: string) => host.querySelector(`[data-carousel-item="${id}"]`) as HTMLElement;
    const pointer = (id: string, type: string, x = 10) => act(() => void item(id).dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, isPrimary: true, clientX: x, clientY: 10 })));
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { host, item, pointer, chosen, captured, done };
  };

  test('deux tapes sur le style choisi prennent UNE photo ; une seule ne fait rien (#8625)', async () => {
    const view = mountCapture();
    await act(async () => view.item('screen').click());
    expect(view.captured).toEqual([]);
    expect(view.chosen).toEqual([]);
    await act(async () => view.item('screen').click());
    expect(view.captured).toEqual(['photo']);
    await act(async () => view.item('screen').click());
    expect(view.captured).toEqual(['photo']);
    view.done();
  });

  test('une tape sur un AUTRE style le choisit, sans rien capturer (#8625)', async () => {
    const view = mountCapture();
    await act(async () => view.item('gold').click());
    await act(async () => view.item('gold').click());
    expect(view.chosen).toEqual(['gold', 'gold']);
    expect(view.captured).toEqual([]);
    view.done();
  });

  test('un appui long sur le style choisi lance la vidéo, et le clic qui le suit n’est pas une photo (#8625)', async () => {
    const view = mountCapture();
    view.pointer('screen', 'pointerdown');
    await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
    expect(view.captured).toEqual(['record']);
    view.pointer('screen', 'pointerup');
    await act(async () => view.item('screen').click());
    expect(view.captured).toEqual(['record']);
    await act(async () => view.item('screen').click());
    await act(async () => view.item('screen').click());
    expect(view.captured).toEqual(['record', 'photo']);
    expect(view.chosen).toEqual([]);
    view.done();
  });

  test('un doigt qui glisse fait défiler : ce n’est pas un appui long (#8625)', async () => {
    const view = mountCapture();
    view.pointer('screen', 'pointerdown', 10);
    view.pointer('screen', 'pointermove', 40);
    await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
    expect(view.captured).toEqual([]);
    view.done();
  });

  test('un appui long sur un autre style le choisit seulement (#8625)', async () => {
    const view = mountCapture();
    view.pointer('gold', 'pointerdown');
    await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
    expect(view.captured).toEqual([]);
    expect(view.chosen).toEqual(['gold']);
    view.done();
  });

  test('au clavier, Entrée sur le style choisi prend la photo ; le geste est dit au lecteur d’écran (#8625)', async () => {
    const view = mountCapture();
    const selected = view.item('screen');
    await act(async () => selected.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    expect(view.captured).toEqual(['photo']);
    const described = selected.getAttribute('aria-describedby');
    expect(described).not.toBeNull();
    expect(view.host.querySelector(`#${described}`)?.textContent).toBe('Deux tapes : photo · Appui long : vidéo');
    view.done();
  });

  test('pendant une vidéo, deux tapes ou un appui long attendent le stop ; changer de style reste possible (#8625)', async () => {
    const view = mountCapture({ recording: true });
    await act(async () => view.item('screen').click());
    await act(async () => view.item('screen').click());
    view.pointer('screen', 'pointerdown');
    await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
    view.pointer('screen', 'pointerup');
    expect(view.captured).toEqual([]);
    await act(async () => view.item('gold').click());
    expect(view.chosen).toEqual(['gold']);
    view.done();
  });

  /* LE DOIGT QUI SE POSE PUIS GLISSE (#8736) : un appui long sur un AUTRE
     style le choisit — mais un défilement programmé SOUS le doigt encore
     posé luttait contre lui, et le glissé qui suivait restait collé. Le
     centrage attend que le doigt se lève. */
  const mountRecorded = () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const chosen: string[] = [];
    const captured: string[] = [];
    const scrolls: number[] = [];
    act(() =>
      root.render(
        <ModeCarousel
          label="Montages"
          items={IDS.map((id) => ({ id, label: id, visual: null }))}
          selected="screen"
          onSelect={(id) => void chosen.push(id)}
          capture={{ recording: false, onCapture: (intent) => void captured.push(intent), hint: 'Deux tapes : photo · Appui long : vidéo', longPressMs: 30 }}
        />,
      ),
    );
    const track = host.querySelector('[data-call-row-scroll]') as Track;
    track.scrollLeft = 0;
    layout(track);
    Object.defineProperty(track, 'scrollTo', { configurable: true, value: (options: { readonly left: number }) => void scrolls.push(options.left) });
    const item = (id: string) => host.querySelector(`[data-carousel-item="${id}"]`) as HTMLElement;
    const pointer = (id: string, type: string) => act(() => void item(id).dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, isPrimary: true, clientX: 10, clientY: 10 })));
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { host, track, item, pointer, chosen, captured, scrolls, done };
  };

  test('un appui long sur un autre style le choisit sans rien faire défiler sous le doigt ; il se centre quand le doigt se lève (#8736)', async () => {
    const view = mountRecorded();
    view.pointer('gold', 'pointerdown');
    await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
    expect(view.chosen).toEqual(['gold']);
    expect(view.scrolls).toEqual([]);
    view.pointer('gold', 'pointerup');
    expect(view.scrolls).toEqual([2 * PITCH]);
    view.done();
  });

  test('un doigt posé qui se met à défiler n’est plus un appui long : la piste qui bouge le relâche (#8736)', async () => {
    const view = mountRecorded();
    view.pointer('screen', 'pointerdown');
    view.track.scrollLeft = 20;
    act(() => void view.track.dispatchEvent(new Event('scroll')));
    await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
    expect(view.captured).toEqual([]);
    view.done();
  });

  test('un glissé ne redemande pas le style déjà choisi à chaque image (#8736)', async () => {
    const view = mountRecorded();
    view.track.dispatchEvent(new Event('pointerdown'));
    view.track.scrollLeft = 10;
    view.track.dispatchEvent(new Event('scroll'));
    await act(frame);
    view.track.scrollLeft = 20;
    view.track.dispatchEvent(new Event('scroll'));
    await act(frame);
    expect(view.chosen).toEqual([]);
    view.track.scrollLeft = PITCH;
    view.track.dispatchEvent(new Event('scroll'));
    await act(frame);
    view.track.scrollLeft = PITCH + 6;
    view.track.dispatchEvent(new Event('scroll'));
    await act(frame);
    expect(view.chosen).toEqual(['cover']);
    view.done();
  });

  test('la piste défile sans élasticité : overscroll-x-none (#8736)', () => {
    const view = mountRecorded();
    expect(view.track.className).toContain('overscroll-x-none');
    expect(view.track.className).not.toContain('overscroll-x-contain');
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
