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

  test('la frame COURANTE de la vidéo vivante passe avant le poster', () => {
    const { source, clone } = pair('<video src="clip.mp4" poster="clip.jpg"></video>');
    const live = source.querySelector('video')!;
    Object.defineProperty(live, 'readyState', { value: 2 });
    Object.defineProperty(live, 'videoWidth', { value: 320 });
    Object.defineProperty(live, 'videoHeight', { value: 180 });
    const drawn: unknown[] = [];
    const canvasProto = HTMLCanvasElement.prototype as unknown as {
      getContext: (kind: string) => unknown;
      toDataURL: () => string;
    };
    const originalGetContext = canvasProto.getContext;
    const originalToDataURL = canvasProto.toDataURL;
    canvasProto.getContext = () => ({ drawImage: (image: unknown) => drawn.push(image) });
    canvasProto.toDataURL = () => 'data:image/png;base64,FRAME';
    try {
      projectMessagePreview(clone, { source });
    } finally {
      canvasProto.getContext = originalGetContext;
      canvasProto.toDataURL = originalToDataURL;
    }
    expect(drawn).toEqual([live]);
    expect(clone.querySelector('img')!.getAttribute('src')).toBe('data:image/png;base64,FRAME');
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
