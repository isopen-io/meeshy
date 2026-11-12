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

  /* LE RÉACCROCHAGE SANS GESTE (#8969) : sous `snap-mandatory`, Chromium
     réaccroche au dernier élément accroché dès que la mise en page change
     (chunk chargé, piste remplacée) — un défilement que PERSONNE n'a fait.
     Choisir à chaque `scroll` appliquait alors « Naturel » sans geste. Seul
     un doigt, une molette ou une touche qui tient la piste choisit, et le
     choix touché tient jusqu'au `scrollend` de son centrage. */
  test('un défilement sans geste en cours ne choisit rien, et l’élément choisi revient au centre quand il s’arrête (#8969)', async () => {
    const view = mount();
    await view.scrollTo(2 * PITCH);
    await view.scrollTo(4 * PITCH);
    view.track.dispatchEvent(new Event('scrollend'));
    await act(frame);
    expect(view.chosen).toEqual([]);
    expect(view.scrolls).toEqual([0]);
    view.done();
  });

  test('un toucher puis un réaccrochage du navigateur sur l’ancien élément : le choix touché tient (#8969)', async () => {
    const view = mount();
    await act(async () => (view.host.querySelector('[data-carousel-item="gold"]') as HTMLElement).click());
    await view.scrollTo(PITCH);
    await view.scrollTo(2 * PITCH);
    await view.scrollTo(0);
    view.track.dispatchEvent(new Event('scrollend'));
    await view.scrollTo(PITCH);
    view.track.dispatchEvent(new Event('scrollend'));
    await act(frame);
    expect(view.chosen).toEqual(['gold']);
    view.done();
  });

  test('une molette sur la piste choisit en direct, puis le défilement suivant sans geste ne choisit plus (#8969)', async () => {
    const view = mount();
    view.track.dispatchEvent(new Event('wheel'));
    await view.scrollTo(PITCH);
    view.track.dispatchEvent(new Event('scrollend'));
    await view.scrollTo(3 * PITCH);
    expect(view.chosen).toEqual(['cover']);
    view.done();
  });

  test('un glissé du doigt dont le dernier défilement n’a pas encore choisi : le scrollend choisit l’élément arrêté, sans le ramener à l’ancien (#8969)', async () => {
    const view = mount();
    view.track.dispatchEvent(new Event('pointerdown'));
    view.track.scrollLeft = 3 * PITCH;
    view.track.dispatchEvent(new Event('scroll'));
    view.track.dispatchEvent(new Event('scrollend'));
    await act(frame);
    expect(view.chosen).toEqual(['redcarpet']);
    expect(view.scrolls).toEqual([]);
    view.done();
  });

  test('une piste qui quitte la page ne choisit rien : son dernier défilement, remis à zéro par le démontage, ne rend pas « Naturel » sous Échap', async () => {
    const view = mount();
    view.track.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    view.host.remove();
    await view.scrollTo(3 * PITCH);
    view.track.dispatchEvent(new Event('scrollend'));
    await act(frame);
    expect(view.chosen).toEqual([]);
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

  /* UNE RANGÉE QUI DÉFILE N'EST JAMAIS COUPÉE NET (#17409, facture #17406) :
     la piste s'efface en fondu à ses DEUX bords, de la même largeur à gauche
     et à droite — l'arabe n'a donc rien à inverser. Le masque est posé sur la
     piste elle-même : les éléments défilent dessous, le fondu ne bouge pas. */
  test('la piste s’efface en fondu à ses deux bords, la même largeur à gauche et à droite (#17409)', () => {
    const view = mountRecorded();
    const style = view.track.getAttribute('style') ?? '';
    const mask = /(?:^|;)\s*mask-image:\s*([^;]+)/.exec(style)?.[1]?.trim() ?? '';
    expect(mask).toMatch(/^linear-gradient\(/);
    const stops = /linear-gradient\(\s*(?:90deg|to right)\s*,\s*transparent(?:\s+0(?:px)?)?\s*,\s*(?:#000|black)\s+(\d+)px\s*,\s*(?:#000|black)\s+calc\(100% - (\d+)px\)\s*,\s*transparent(?:\s+100%)?\s*\)/.exec(mask);
    expect(stops).not.toBeNull();
    expect(Number(stops?.[1])).toBeGreaterThanOrEqual(16);
    expect(stops?.[1]).toBe(stops?.[2]);
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

  /* C1.5 — la vignette du Montage est PORTRAIT (48 × 85, comme iOS et Android) : un disque rognait l'aperçu 9:16 du cadre. */
  test('une vignette portrait : la boîte fait 48 × 85 et sa face n’est plus un disque, donc l’aperçu entier se voit (C1.5)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<ModeCarousel label="Cadres" items={IDS.map((id) => ({ id, label: id, visual: <canvas data-visual={id} /> }))} selected="gold" onSelect={() => undefined} itemSize={{ width: 48, height: 85 }} />));
    const item = host.querySelector<HTMLElement>('[data-carousel-item="gold"]');
    const face = item?.querySelector<HTMLElement>('[data-carousel-face]');
    expect(item?.style.width).toBe('48px');
    expect(item?.style.height).toBe('85px');
    expect(item?.className).not.toContain('rounded-full');
    expect(face?.className).not.toContain('rounded-full');
    expect(face?.className).toContain('rounded-');
    const track = host.querySelector<HTMLElement>('[data-call-row-scroll]');
    expect(track?.style.paddingInline).toBe('calc(50% - 24px)');
    act(() => root.unmount());
    host.remove();
  });

  test('sans taille demandée, la vignette reste le disque de 64 que les effets gardent', () => {
    const view = mount();
    const item = view.host.querySelector<HTMLElement>('[data-carousel-item="gold"]');
    expect([item?.style.width, item?.style.height]).toEqual(['64px', '64px']);
    expect(item?.querySelector('[data-carousel-face]')?.className).toContain('rounded-full');
    view.done();
  });

  /* C1.2 — la vue C1 ne montre pas la ligne « où il sert » : le texte reste lu, jamais vu. */
  test('l’usage d’un élément n’est plus une ligne visible sous son nom, mais reste lu par le lecteur d’écran (C1.2)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<ModeCarousel label="Cadres" items={[{ id: 'a', label: 'Aurore', visual: null, detail: 'Utilisable : appels vidéo et captures' }]} selected="a" onSelect={() => undefined} />));
    expect(host.querySelector('[data-call-mode-detail]')).toBeNull();
    const item = host.querySelector('[data-carousel-item="a"]');
    const described = (item?.getAttribute('aria-describedby') ?? '').split(' ').map((id) => host.querySelector(`[id="${id}"]`));
    expect(described.map((node) => node?.textContent)).toEqual(['Utilisable : appels vidéo et captures']);
    expect(described[0]?.className).toContain('sr-only');
    expect(item?.getAttribute('title')).toBe('Utilisable : appels vidéo et captures');
    act(() => root.unmount());
    host.remove();
  });

  /* C1.6 — les déclinaisons d'un cadre : un balayage vertical dans la vignette choisie, des points, des actions nommées. */
  const DECLINATIONS = ['base', 'relief', 'neon'] as const;

  const mountDeclined = (options: { readonly index?: number; readonly recording?: boolean } = {}) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const stepped: number[] = [];
    const captured: string[] = [];
    const items = IDS.map((id) => ({
      id,
      label: id,
      visual: <canvas data-visual={id} />,
      ...(id === 'gold'
        ? { declinations: { pages: DECLINATIONS.map((name) => <canvas key={name} data-page={name} />), index: options.index ?? 0, onSelect: (index: number) => void stepped.push(index), next: 'Déclinaison suivante', previous: 'Déclinaison précédente' } }
        : {}),
    }));
    act(() =>
      root.render(
        <ModeCarousel
          label="Cadres"
          items={items}
          selected="gold"
          onSelect={() => undefined}
          itemSize={{ width: 48, height: 85 }}
          capture={{ recording: options.recording === true, onCapture: (intent) => void captured.push(intent), hint: 'Deux tapes : photo', longPressMs: 30 }}
        />,
      ),
    );
    const pages = host.querySelector<HTMLElement>('[data-call-declination-pages]');
    const point = (type: string, y: number, x = 20) => act(() => void pages?.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, isPrimary: true, clientX: x, clientY: y })));
    const swipe = (from: number, to: number, x = 20) => {
      point('pointerdown', from, x);
      point('pointermove', (from + to) / 2, x);
      point('pointermove', to, x);
      point('pointerup', to, x);
    };
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { host, pages, point, swipe, stepped, captured, done };
  };

  test('la vignette choisie qui a des déclinaisons les empile : toutes les pages, la bonne posée, des points qui disent combien et laquelle (C1.6)', () => {
    const view = mountDeclined({ index: 1 });
    expect(view.pages).not.toBeNull();
    expect([...view.host.querySelectorAll('[data-call-declination-pages] [data-page]')].map((page) => page.getAttribute('data-page'))).toEqual(['base', 'relief', 'neon']);
    expect(view.host.querySelector('[data-carousel-item="gold"] [data-visual]')).toBeNull();
    expect(view.host.querySelector('[data-carousel-item="cover"] [data-visual]')).not.toBeNull();
    expect(view.host.querySelector('[data-carousel-item="cover"] [data-call-declination-pages]')).toBeNull();
    expect(view.pages?.firstElementChild?.getAttribute('style')).toContain('translate3d(0px, -85px, 0px)');
    const dots = [...view.host.querySelectorAll('[data-call-declination-dots] [data-call-declination-dot]')];
    expect(dots).toHaveLength(3);
    expect(dots.map((dot) => dot.getAttribute('data-current'))).toEqual([null, '', null]);
    expect(view.host.querySelector('[data-call-declination-dots]')?.getAttribute('aria-hidden')).toBe('true');
    view.done();
  });

  test('l’axe vertical se laisse au carrousel horizontal : la vignette ne réclame que le vertical au navigateur', () => {
    const view = mountDeclined();
    expect(view.pages?.className).toContain('touch-pan-x');
    view.done();
  });

  test('un balayage vers le haut passe à la déclinaison suivante ; vers le bas, à la précédente (C1.6)', () => {
    const up = mountDeclined({ index: 0 });
    up.swipe(70, 30);
    expect(up.stepped).toEqual([1]);
    up.done();
    const down = mountDeclined({ index: 2 });
    down.swipe(20, 62);
    expect(down.stepped).toEqual([1]);
    down.done();
  });

  test('un petit geste revient, un bord résiste, et le balayage n’enjambe jamais plus d’une page', () => {
    const small = mountDeclined({ index: 0 });
    small.swipe(60, 45);
    expect(small.stepped).toEqual([]);
    small.done();
    const edge = mountDeclined({ index: 0 });
    edge.swipe(20, 80);
    expect(edge.stepped).toEqual([]);
    edge.done();
    const long = mountDeclined({ index: 0 });
    long.swipe(84, 0);
    expect(long.stepped).toEqual([1]);
    long.done();
  });

  test('un geste plutôt horizontal ne change aucune déclinaison : il reste au carrousel', () => {
    const view = mountDeclined({ index: 0 });
    view.point('pointerdown', 40, 10);
    view.point('pointermove', 38, 40);
    view.point('pointermove', 20, 60);
    view.point('pointerup', 20, 60);
    expect(view.stepped).toEqual([]);
    view.done();
  });

  test('un balayage annulé (le navigateur prend le défilement) ne fige rien et ne change rien', () => {
    const view = mountDeclined({ index: 0 });
    view.point('pointerdown', 70);
    view.point('pointermove', 50);
    view.point('pointercancel', 50);
    view.swipe(70, 25);
    expect(view.stepped).toEqual([1]);
    view.done();
  });

  test('le geste qui a balayé n’est pas un toucher : il ne prend pas de photo, et ne lance pas de vidéo', async () => {
    const view = mountDeclined({ index: 0 });
    view.swipe(70, 25);
    await act(async () => view.host.querySelector<HTMLElement>('[data-carousel-item="gold"]')?.click());
    await act(async () => view.host.querySelector<HTMLElement>('[data-carousel-item="gold"]')?.click());
    expect(view.captured).toEqual([]);
    await act(async () => view.pages?.click());
    expect(view.captured).toEqual(['photo']);
    view.done();
  });

  test('au clavier, ↓ passe à la déclinaison suivante et ↑ à la précédente, sans changer d’élément (C1.6)', () => {
    const view = mountDeclined({ index: 1 });
    const item = view.host.querySelector<HTMLElement>('[data-carousel-item="gold"]');
    const key = (name: string) => act(() => void item?.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })));
    key('ArrowDown');
    key('ArrowUp');
    expect(view.stepped).toEqual([2, 0]);
    view.done();
  });

  test('aux bords, les flèches verticales ne bouclent pas', () => {
    const first = mountDeclined({ index: 0 });
    act(() => void first.host.querySelector('[data-carousel-item="gold"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })));
    expect(first.stepped).toEqual([]);
    first.done();
  });

  test('le lecteur d’écran a deux actions nommées, désactivées au bord ; le changement est annoncé (C1.6)', () => {
    const view = mountDeclined({ index: 0 });
    const next = view.host.querySelector<HTMLButtonElement>('[data-call-declination-step="next"]');
    const previous = view.host.querySelector<HTMLButtonElement>('[data-call-declination-step="previous"]');
    expect(next?.textContent).toBe('Déclinaison suivante');
    expect(previous?.textContent).toBe('Déclinaison précédente');
    expect(next?.className).toContain('sr-only');
    expect(next?.disabled).toBe(false);
    expect(previous?.disabled).toBe(true);
    expect(next?.closest('[role="radiogroup"]')).toBeNull();
    act(() => next?.click());
    expect(view.stepped).toEqual([1]);
    expect(view.host.querySelector('[data-call-declination-status]')?.getAttribute('aria-live')).toBe('polite');
    view.done();
  });

  test('sans déclinaison, ni pages, ni points, ni actions', () => {
    const view = mount();
    expect(view.host.querySelector('[data-call-declination-pages]')).toBeNull();
    expect(view.host.querySelector('[data-call-declination-step]')).toBeNull();
    view.done();
  });
});
