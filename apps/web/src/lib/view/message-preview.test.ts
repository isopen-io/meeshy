import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { PIECE_RATIO_ATTRIBUTE, pieceAspectRatio, projectMessagePreview } from './message-preview';

/**
 * L'APERÇU DE L'APPUI LONG (#8008, complément porteur du 2026-09-26) — le
 * clone de la rangée que le menu du message pose au-dessus du fil.
 *
 * 1. Il garde la FORME PROTÉGÉE : un message dont la fenêtre de lecture est
 *    ouverte à l'instant de l'appui ne voit jamais son texte recopié en clair.
 * 2. Ses pièces s'affichent dans leur PROPORTION D'ORIGINE, sans rognage ni
 *    étirement ; repli carré sans dimensions.
 */
beforeAll(() => ensureHappyDomRegistered());
afterAll(async () => releaseHappyDomIfRegistered());


const build = (html: string): HTMLElement => {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
};

describe('pieceAspectRatio', () => {
  test('rend le rapport d’origine de la pièce', () => {
    expect(pieceAspectRatio({ width: 1200, height: 800 })).toBe('1200 / 800');
  });

  test('repli CARRÉ sans dimensions, ou sur une dimension nulle', () => {
    expect(pieceAspectRatio({})).toBe('1 / 1');
    expect(pieceAspectRatio({ width: 0, height: 800 })).toBe('1 / 1');
  });
});

describe('projectMessagePreview — la forme protégée', () => {
  test('une fenêtre de lecture ouverte est remplacée par sa forme au repos, sans le texte', () => {
    const clone = build(
      '<div data-protected="revealed"><p>SECRET-8008</p><div hidden data-protected-rest><button data-protected="hidden">▇▇▇</button></div></div>',
    );
    projectMessagePreview(clone);

    expect(clone.textContent).not.toContain('SECRET-8008');
    expect(clone.querySelector('[data-protected="revealed"]')).toBe(null);
    const rest = clone.querySelector('[data-protected="hidden"]');
    expect(rest).not.toBe(null);
    expect(rest?.closest('[hidden]')).toBe(null);
  });

  test('une fenêtre sans forme de repos déclarée est retirée ENTIÈRE — jamais recopiée', () => {
    const clone = build('<div data-protected="revealed"><p>SECRET-8008</p></div><p>voisin</p>');
    projectMessagePreview(clone);
    expect(clone.textContent).toBe('voisin');
  });

  test('un message au repos est laissé tel quel', () => {
    const clone = build('<button data-protected="hidden">▇▇▇</button>');
    projectMessagePreview(clone);
    expect(clone.innerHTML).toBe('<button data-protected="hidden">▇▇▇</button>');
  });
});

describe('projectMessagePreview — la proportion d’origine des pièces', () => {
  test('une pièce seule prend SON rapport, et son image n’est ni rognée ni étirée', () => {
    const clone = build(
      `<figure ${PIECE_RATIO_ATTRIBUTE}="1200 / 800" style="width: 300px; aspect-ratio: 300 / 240"><img src="x.png" style="object-fit: cover"></figure>`,
    );
    projectMessagePreview(clone);
    const figure = clone.querySelector<HTMLElement>('figure')!;
    expect(figure.style.aspectRatio).toBe('1200 / 800');
    expect(figure.style.height).toBe('auto');
    expect(clone.querySelector<HTMLElement>('img')!.style.objectFit).toBe('contain');
  });

  test('une tuile masquée seule quitte son carré fixe pour le rapport de la pièce', () => {
    const clone = build(
      `<div ${PIECE_RATIO_ATTRIBUTE}="1 / 1" data-protected-attachment="hidden" style="width: 140px; height: 140px"></div>`,
    );
    projectMessagePreview(clone);
    const tile = clone.querySelector<HTMLElement>('[data-protected-attachment]')!;
    expect(tile.style.aspectRatio).toBe('1 / 1');
    expect(tile.style.height).toBe('auto');
  });

  test('dans une grille, chaque pièce reprend son rapport d’origine, en colonne', () => {
    const clone = build(
      `<div data-media-grid style="aspect-ratio: 300 / 180"><div class="flex"><div ${PIECE_RATIO_ATTRIBUTE}="1200 / 800"><img src="a.png"></div><div ${PIECE_RATIO_ATTRIBUTE}="800 / 1200"><video src="b.mp4"></video></div></div></div>`,
    );
    projectMessagePreview(clone);
    const grid = clone.querySelector<HTMLElement>('[data-media-grid]')!;
    const cells = [...grid.querySelectorAll<HTMLElement>(`[${PIECE_RATIO_ATTRIBUTE}]`)];

    expect(grid.getAttribute('data-preview-layout')).toBe('column');
    expect(grid.style.aspectRatio).toBe('auto');
    expect(cells.map((cell) => cell.style.aspectRatio)).toEqual(['1200 / 800', '800 / 1200']);
    expect(cells.every((cell) => cell.parentElement === grid)).toBe(true);
    expect([...clone.querySelectorAll<HTMLElement>('img')].map((media) => media.style.objectFit)).toEqual(['contain', 'contain']);
  });

  test('une vidéo de grille, figée en image, garde son `contain`', () => {
    const clone = build(`<div data-media-grid><div ${PIECE_RATIO_ATTRIBUTE}="800 / 1200"><video src="b.mp4" poster="b.jpg"></video></div></div>`);
    projectMessagePreview(clone);
    expect(clone.querySelector<HTMLElement>('img')!.style.objectFit).toBe('contain');
  });

  test('une pièce qui porte elle-même son rapport reste DANS sa case', () => {
    const clone = build(
      `<div data-media-grid><div ${PIECE_RATIO_ATTRIBUTE}="1200 / 800"><div data-protected-attachment="hidden" ${PIECE_RATIO_ATTRIBUTE}="1200 / 800"></div></div><div ${PIECE_RATIO_ATTRIBUTE}="1 / 1"><img src="b.png"></div></div>`,
    );
    projectMessagePreview(clone);
    const grid = clone.querySelector<HTMLElement>('[data-media-grid]')!;
    expect(grid.children.length).toBe(2);
    expect(grid.children[0]!.querySelector('[data-protected-attachment]')).not.toBe(null);
  });
});

/**
 * L'APERÇU MONTRE LE MÉDIA TEL QU'IL EST À L'ÉCRAN (#11206) — `cloneNode`
 * remet une vidéo à zéro et vide un canvas : le clone figerait un écran noir
 * ou la première image là où le lecteur voyait autre chose.
 */
describe('projectMessagePreview — le média tel qu’il est à l’écran (#11206)', () => {
  const pair = (html: string): { readonly source: HTMLElement; readonly clone: HTMLElement } => {
    const source = build(html);
    return { source, clone: source.cloneNode(true) as HTMLElement };
  };

  test('une vidéo clonée devient une image, sans source vidéo ni préchargement', () => {
    const { source, clone } = pair('<video class="h-full w-full" src="clip.mp4" preload="metadata" poster="clip.jpg" style="object-fit: cover"></video>');
    projectMessagePreview(clone, { source });

    expect(clone.querySelector('video')).toBe(null);
    const frame = clone.querySelector('img')!;
    expect(frame).not.toBe(null);
    expect(frame.getAttribute('src')).toBe('clip.jpg');
    expect(frame.hasAttribute('preload')).toBe(false);
    expect(frame.getAttribute('class')).toBe('h-full w-full');
    expect(frame.getAttribute('alt')).toBe('');
  });

  /** Une vidéo VIVANTE qui a une image décodée, affichée en `box` à l'écran. */
  const playing = (live: HTMLVideoElement, box: { readonly width: number; readonly height: number }) => {
    Object.defineProperty(live, 'readyState', { value: 2 });
    Object.defineProperty(live, 'videoWidth', { value: 3840 });
    Object.defineProperty(live, 'videoHeight', { value: 2160 });
    live.getBoundingClientRect = () => ({ top: 0, left: 0, right: box.width, bottom: box.height, x: 0, y: 0, ...box, toJSON: () => box }) as DOMRect;
  };

  /** `getContext` seul est bouchonné — happy-dom ne dessine rien. `toDataURL`
   * ne l'est PAS : il lève, et une projection qui l'appellerait tomberait. */
  const recordDraws = (run: () => void): { readonly canvas: HTMLCanvasElement; readonly image: unknown; readonly dw: number; readonly dh: number }[] => {
    const draws: { canvas: HTMLCanvasElement; image: unknown; dw: number; dh: number }[] = [];
    const canvasProto = HTMLCanvasElement.prototype as unknown as {
      getContext: (this: HTMLCanvasElement, kind: string) => unknown;
      toDataURL: () => string;
    };
    const originalGetContext = canvasProto.getContext;
    const originalToDataURL = canvasProto.toDataURL;
    canvasProto.getContext = function getContext(this: HTMLCanvasElement) {
      const canvas = this;
      return {
        drawImage: (image: unknown, _x: number, _y: number, dw: number, dh: number) => draws.push({ canvas, image, dw, dh }),
      };
    };
    canvasProto.toDataURL = () => {
      throw new Error('SecurityError: the canvas has been tainted by cross-origin data');
    };
    try {
      run();
    } finally {
      canvasProto.getContext = originalGetContext;
      canvasProto.toDataURL = originalToDataURL;
    }
    return draws;
  };

  test('la frame COURANTE est PEINTE sur un canvas — sans encodage, donc même depuis une autre origine', () => {
    const { source, clone } = pair('<video class="h-full w-full" src="https://gate.meeshy.me/a/clip.mp4" poster="clip.jpg"></video>');
    const live = source.querySelector('video')!;
    playing(live, { width: 240, height: 135 });
    const draws = recordDraws(() => projectMessagePreview(clone, { source }));

    expect(clone.querySelector('video')).toBe(null);
    expect(clone.querySelector('img')).toBe(null);
    const frame = clone.querySelector<HTMLCanvasElement>('canvas[data-preview-frame]')!;
    expect(frame).not.toBe(null);
    expect(frame.getAttribute('class')).toBe('h-full w-full');
    expect(draws.map((draw) => [draw.canvas, draw.image])).toEqual([[frame, live]]);
  });

  test('la frame est peinte à la taille AFFICHÉE, jamais à la résolution native de la vidéo', () => {
    const { source, clone } = pair('<video src="blob:upload" poster="clip.jpg"></video>');
    const live = source.querySelector('video')!;
    playing(live, { width: 240, height: 135 });
    const draws = recordDraws(() => projectMessagePreview(clone, { source }));

    const frame = clone.querySelector<HTMLCanvasElement>('canvas[data-preview-frame]')!;
    expect(frame.width).toBeLessThanOrEqual(240 * 2);
    expect(frame.width).toBeGreaterThan(0);
    expect(frame.width / frame.height).toBeCloseTo(3840 / 2160, 1);
    expect([draws[0]!.dw, draws[0]!.dh]).toEqual([frame.width, frame.height]);
  });

  test('une vidéo sans image décodée garde son poster', () => {
    const { source, clone } = pair('<video src="clip.mp4" poster="clip.jpg"></video>');
    const draws = recordDraws(() => projectMessagePreview(clone, { source }));
    expect(draws).toEqual([]);
    expect(clone.querySelector('canvas')).toBe(null);
    expect(clone.querySelector('img')!.getAttribute('src')).toBe('clip.jpg');
  });

  test('une frame figée ne décale pas l’appariement des canvas du message', () => {
    const { source, clone } = pair('<video src="clip.mp4"></video><canvas width="40" height="20"></canvas>');
    playing(source.querySelector('video')!, { width: 240, height: 135 });
    const draws = recordDraws(() => projectMessagePreview(clone, { source }));
    const ownCanvas = clone.querySelector<HTMLCanvasElement>('canvas:not([data-preview-frame])')!;
    expect(draws.find((draw) => draw.canvas === ownCanvas)?.image).toBe(source.querySelector('canvas'));
  });

  test('sans source vivante ni poster, l’image reste vide plutôt que de recharger la vidéo', () => {
    const clone = build('<video src="clip.mp4"></video>');
    projectMessagePreview(clone);
    const frame = clone.querySelector('img')!;
    expect(frame.hasAttribute('src')).toBe(false);
  });

  test('un canvas est recopié depuis le canvas vivant', () => {
    const { source, clone } = pair('<canvas width="40" height="20"></canvas>');
    const drawn: unknown[] = [];
    const cloned = clone.querySelector('canvas')!;
    cloned.getContext = (() => ({ drawImage: (image: unknown) => drawn.push(image) })) as unknown as HTMLCanvasElement['getContext'];
    projectMessagePreview(clone, { source });
    expect(drawn).toEqual([source.querySelector('canvas')]);
  });

  test('un nœud [data-preview-omit] est absent de l’aperçu', () => {
    const clone = build('<p>texte</p><div data-preview-omit><button>Réagir</button></div>');
    projectMessagePreview(clone);
    expect(clone.querySelector('[data-preview-omit]')).toBe(null);
    expect(clone.textContent).toBe('texte');
  });

  test('[data-effects] et ce qu’il porte ne rejouent aucune animation', () => {
    const clone = build('<div data-effects><span class="animate-pulse">✨</span></div><div data-effects-host><p>x</p></div>');
    projectMessagePreview(clone);
    const frozen = [...clone.querySelectorAll<HTMLElement>('[data-effects], [data-effects] *, [data-effects-host], [data-effects-host] *')];
    expect(frozen.length).toBe(4);
    expect(frozen.every((node) => node.style.animation === 'none')).toBe(true);
  });

  test('une vidéo dans une fenêtre de lecture ouverte n’est jamais figée en clair', () => {
    const { source, clone } = pair('<div data-protected="revealed"><video src="secret.mp4" poster="secret.jpg"></video></div>');
    projectMessagePreview(clone, { source });
    expect(clone.querySelector('img')).toBe(null);
    expect(clone.innerHTML).not.toContain('secret');
  });
});
