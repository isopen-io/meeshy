/**
 * **LA LUT D'UNE LENS, EN CUBE** (W14, #11320) — PUR. Le contrat MeeshyLens v1
 * déclare une couche `lut` par son fichier (`asset`, une image `png`/`webp`
 * du pack) et son intensité. Le fichier est une BANDE : N carrés de N × N côte
 * à côte (largeur N², hauteur N), le bleu croissant d'un carré à l'autre, le
 * rouge croissant vers la droite et le vert vers le bas dans chaque carré — le
 * format « strip » des outils d'étalonnage. N vaut 16, 32 ou 64.
 *
 * `lutCubeOf` range ces pixels dans l'ordre d'une texture 3D WebGL2
 * (`texImage3D`, rouge le plus rapide, puis vert, puis bleu), que le GPU
 * échantillonne en trilinéaire (`lens-lut-stage.ts`). `applyLut` est la
 * même lecture, sur le processeur : la RÉFÉRENCE des goldens, jamais le chemin
 * d'une image d'appel.
 */
export const LUT_SIZES: readonly number[] = [16, 32, 64];

export type LutCube = { readonly size: number; readonly data: Uint8Array };

export type LutImage = { readonly width: number; readonly height: number; readonly data: ArrayLike<number> };

/** Le cube d'une bande RGBA, ou `null` si l'image n'a pas la forme d'une bande N² × N. */
export function lutCubeOf(image: LutImage): LutCube | null {
  const size = image.height;
  if (!LUT_SIZES.includes(size) || image.width !== size * size || image.data.length !== image.width * image.height * 4) return null;
  const data = new Uint8Array(size * size * size * 4);
  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        const from = (g * image.width + b * size + r) * 4;
        const to = ((b * size + g) * size + r) * 4;
        data[to] = image.data[from] ?? 0;
        data[to + 1] = image.data[from + 1] ?? 0;
        data[to + 2] = image.data[from + 2] ?? 0;
        data[to + 3] = 255;
      }
    }
  }
  return { size, data };
}

/** La bande identité de taille N : chaque couleur rend elle-même (le témoin de `lutCubeOf`). */
export function identityStrip(size: number): LutImage {
  const width = size * size;
  const data = new Uint8ClampedArray(width * size * 4);
  const level = (index: number): number => Math.round((index * 255) / (size - 1));
  for (let g = 0; g < size; g += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (g * width + x) * 4;
      data[at] = level(x % size);
      data[at + 1] = level(g);
      data[at + 2] = level(Math.floor(x / size));
      data[at + 3] = 255;
    }
  }
  return { width, height: size, data };
}

export type Rgb = readonly [number, number, number];

const texel = (cube: LutCube, r: number, g: number, b: number): Rgb => {
  const at = ((b * cube.size + g) * cube.size + r) * 4;
  return [cube.data[at] ?? 0, cube.data[at + 1] ?? 0, cube.data[at + 2] ?? 0];
};

const mixRgb = (a: Rgb, b: Rgb, weight: number): Rgb => [a[0] + (b[0] - a[0]) * weight, a[1] + (b[1] - a[1]) * weight, a[2] + (b[2] - a[2]) * weight];

/** Une couleur (0–255) passée par le cube en trilinéaire, mêlée à l'originale selon l'intensité (0–1). */
export function applyLut(cube: LutCube, color: Rgb, intensity: number): Rgb {
  const scale = (channel: number): number => (Math.min(255, Math.max(0, channel)) / 255) * (cube.size - 1);
  const [fr, fg, fb] = [scale(color[0]), scale(color[1]), scale(color[2])];
  const [r0, g0, b0] = [Math.floor(fr), Math.floor(fg), Math.floor(fb)];
  const [r1, g1, b1] = [Math.min(cube.size - 1, r0 + 1), Math.min(cube.size - 1, g0 + 1), Math.min(cube.size - 1, b0 + 1)];
  const [wr, wg, wb] = [fr - r0, fg - g0, fb - b0];
  const plane = (b: number): Rgb => mixRgb(mixRgb(texel(cube, r0, g0, b), texel(cube, r1, g0, b), wr), mixRgb(texel(cube, r0, g1, b), texel(cube, r1, g1, b), wr), wg);
  const graded = mixRgb(plane(b0), plane(b1), wb);
  const weight = Math.min(1, Math.max(0, intensity));
  const served = mixRgb(color, graded, weight);
  return [Math.round(served[0]), Math.round(served[1]), Math.round(served[2])];
}
