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
    expect(clone.querySelector<HTMLElement>('img')!.style.objectFit).toBe('contain');
    expect(clone.querySelector<HTMLElement>('video')!.style.objectFit).toBe('contain');
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
