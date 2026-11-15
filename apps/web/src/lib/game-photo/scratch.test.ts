import { describe, expect, test } from 'bun:test';

import { scratchPool } from './scratch';

/**
 * LA SURFACE DE TRAVAIL DU PEINTRE (#10159, § 5.5) — la photo se découpe par
 * son masque hors écran avant de se poser dans la fenêtre. Vu rouge d'abord :
 * `env.scratch` créait un `<canvas>` NEUF à chaque peinture, en pixels de
 * DESIGN quelle que soit la taille d'affichage — 1080 × 1920 × 4 = 8,3 Mo, 30
 * fois par seconde pendant le direct, pour un aperçu de 400 px de large. Ici :
 * UNE surface par bassin, réutilisée, à l'ÉCHELLE de l'aperçu, nettoyée et
 * remise en `source-over` avant chaque remise.
 */

type Call = readonly [string, ...unknown[]];

function fakeCanvases() {
  const created: { readonly canvas: HTMLCanvasElement; readonly calls: Call[]; readonly props: Record<string, unknown> }[] = [];
  const createCanvas = (width: number, height: number, withContext = true): HTMLCanvasElement => {
    const calls: Call[] = [];
    const props: Record<string, unknown> = { globalCompositeOperation: 'destination-in' };
    const ctx = {
      setTransform: (...args: number[]) => void calls.push(['setTransform', ...args]),
      clearRect: (...args: number[]) => void calls.push(['clearRect', ...args]),
      get globalCompositeOperation() {
        return props.globalCompositeOperation;
      },
      set globalCompositeOperation(value: unknown) {
        props.globalCompositeOperation = value;
        calls.push(['globalCompositeOperation', value]);
      },
    };
    const canvas = { width, height, getContext: () => (withContext ? ctx : null) } as unknown as HTMLCanvasElement;
    created.push({ canvas, calls, props });
    return canvas;
  };
  return { created, createCanvas };
}

describe('une surface par bassin, réutilisée', () => {
  test('deux demandes de la même taille rendent le MÊME canevas, nettoyé en repère identité entre les deux', () => {
    const { created, createCanvas } = fakeCanvases();
    const scratch = scratchPool(createCanvas).at(1);
    const first = scratch(824, 948);
    const second = scratch(824, 948);
    expect(created).toHaveLength(1);
    expect(first?.image).toBe(second?.image);
    expect(created[0]?.calls).toContainEqual(['setTransform', 1, 0, 0, 1, 0, 0]);
    expect(created[0]?.calls).toContainEqual(['clearRect', 0, 0, 824, 948]);
  });

  test('à l’échelle de l’aperçu : le canevas est en pixels d’AFFICHAGE et son repère porte l’échelle — le peintre dessine en pixels de design sans le savoir', () => {
    const { created, createCanvas } = fakeCanvases();
    const surface = scratchPool(createCanvas).at(400 / 1080)(824, 948);
    expect(created[0]?.canvas.width).toBe(305);
    expect(created[0]?.canvas.height).toBe(351);
    expect(surface?.image).toBe(created[0]?.canvas);
    const scale = 400 / 1080;
    expect(created[0]?.calls.at(-1)).toEqual(['setTransform', scale, 0, 0, scale, 0, 0]);
  });

  test('une autre taille redimensionne le canevas tenu, sans en créer un autre ; le mode de fusion est remis à source-over à chaque remise', () => {
    const { created, createCanvas } = fakeCanvases();
    const pool = scratchPool(createCanvas);
    pool.at(1)(824, 948);
    pool.at(0.5)(824, 948);
    expect(created).toHaveLength(1);
    expect(created[0]?.canvas.width).toBe(412);
    expect(created[0]?.canvas.height).toBe(474);
    expect(created[0]?.props.globalCompositeOperation).toBe('source-over');
  });

  test('une taille nulle ou négative donne un pixel, jamais un canevas vide', () => {
    const { created, createCanvas } = fakeCanvases();
    scratchPool(createCanvas).at(0.25)(2, 0);
    expect(created[0]?.canvas.width).toBe(1);
    expect(created[0]?.canvas.height).toBe(1);
  });

  test('sans contexte 2d (vieux moteur) : null, et la demande suivante réessaie plutôt que de garder un canevas mort', () => {
    const { created, createCanvas } = fakeCanvases();
    const pool = scratchPool((w, h) => createCanvas(w, h, created.length > 0));
    expect(pool.at(1)(10, 10)).toBeNull();
    expect(pool.at(1)(10, 10)).not.toBeNull();
    expect(created).toHaveLength(2);
  });
});
