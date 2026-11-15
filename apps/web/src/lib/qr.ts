/**
 * L'ENCODEUR QR (#9554) — ISO/IEC 18004, écrit ici plutôt qu'importé : la carte
 * du jeu n'a besoin que d'UN cas (un lien, en mode octet, correction M), et un
 * paquet généraliste pèserait plus que tout le reste de la carte.
 *
 * PUR : un texte entre, une matrice sort — `modules[y][x]`, `true` = sombre,
 * SANS marge de silence (elle appartient à celui qui peint). La version est la
 * plus petite qui porte le texte ; le masque est celui que la norme élit (le
 * moins pénalisé des huit). Les grilles se remplissent en place à l'intérieur
 * des fonctions ; rien de ce qui sort n'est modifiable.
 */

export type QrMatrix = {
  /** 1 à 40. */
  readonly version: number;
  /** Le côté, en modules : `17 + 4 × version`. */
  readonly size: number;
  /** Le masque retenu, 0 à 7. */
  readonly mask: number;
  readonly modules: readonly (readonly boolean[])[];
};

export const QR_MAX_VERSION = 40;

/** Correction M : octets de correction par bloc, puis nombre de blocs, par version (rang 0 = version 1). */
const ECC_PER_BLOCK = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28] as const;
const BLOCKS = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49] as const;
/** Les deux bits de la correction M dans l'information de format. */
const FORMAT_LEVEL_M = 0;

const sizeOf = (version: number): number => 17 + 4 * version;

function rawCodewords(version: number): number {
  const base = (16 * version + 128) * version + 64;
  if (version < 2) return base >> 3;
  const align = Math.floor(version / 7) + 2;
  const modules = base - ((25 * align - 10) * align - 55) - (version >= 7 ? 36 : 0);
  return modules >> 3;
}

const eccPerBlock = (version: number): number => ECC_PER_BLOCK[version - 1] ?? 0;
const blockCount = (version: number): number => BLOCKS[version - 1] ?? 1;
const dataCodewords = (version: number): number => rawCodewords(version) - eccPerBlock(version) * blockCount(version);
const countBits = (version: number): number => (version < 10 ? 8 : 16);

/** La capacité en octets de texte : les octets de données, moins l'en-tête (mode sur 4 bits + compteur). */
export const qrByteCapacity = (version: number): number => Math.floor((dataCodewords(version) * 8 - 4 - countBits(version)) / 8);

function versionFor(byteLength: number, maxVersion: number): number | null {
  for (let version = 1; version <= Math.min(maxVersion, QR_MAX_VERSION); version += 1) {
    if (byteLength <= qrByteCapacity(version)) return version;
  }
  return null;
}

function dataBytes(bytes: Uint8Array, version: number): Uint8Array {
  const capacity = dataCodewords(version);
  const bits: number[] = [];
  const push = (value: number, length: number): void => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, countBits(version));
  for (const byte of bytes) push(byte, 8);
  push(0, Math.min(4, capacity * 8 - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  const out = new Uint8Array(capacity);
  for (let i = 0; i < bits.length; i += 1) out[i >> 3] = (out[i >> 3] ?? 0) | ((bits[i] ?? 0) << (7 - (i & 7)));
  for (let i = bits.length >> 3, pad = 0xec; i < capacity; i += 1, pad ^= 0xec ^ 0x11) out[i] = pad;
  return out;
}

/** Le produit dans GF(2⁸), polynôme 0x11D. */
function gfMultiply(a: number, b: number): number {
  let product = 0;
  for (let i = 7; i >= 0; i -= 1) {
    product = (product << 1) ^ ((product >>> 7) * 0x11d);
    product ^= ((b >>> i) & 1) * a;
  }
  return product;
}

function rsDivisor(degree: number): Uint8Array {
  const divisor = new Uint8Array(degree);
  divisor[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      divisor[j] = gfMultiply(divisor[j] ?? 0, root) ^ (divisor[j + 1] ?? 0);
    }
    root = gfMultiply(root, 2);
  }
  return divisor;
}

function rsRemainder(data: Uint8Array, divisor: Uint8Array): Uint8Array {
  const remainder = new Uint8Array(divisor.length);
  for (const byte of data) {
    const factor = byte ^ (remainder[0] ?? 0);
    remainder.copyWithin(0, 1);
    remainder[remainder.length - 1] = 0;
    for (let i = 0; i < divisor.length; i += 1) remainder[i] = (remainder[i] ?? 0) ^ gfMultiply(divisor[i] ?? 0, factor);
  }
  return remainder;
}

/** Les blocs de données puis leurs corrections, entrelacés octet par octet ; les blocs courts d'abord. */
function interleaved(data: Uint8Array, version: number): Uint8Array {
  const blocks = blockCount(version);
  const ecc = eccPerBlock(version);
  const raw = rawCodewords(version);
  const shortBlocks = blocks - (raw % blocks);
  const shortData = Math.floor(raw / blocks) - ecc;
  const divisor = rsDivisor(ecc);
  const parts: { readonly data: Uint8Array; readonly ecc: Uint8Array }[] = [];
  for (let block = 0, offset = 0; block < blocks; block += 1) {
    const length = shortData + (block < shortBlocks ? 0 : 1);
    const slice = data.subarray(offset, offset + length);
    parts.push({ data: slice, ecc: rsRemainder(slice, divisor) });
    offset += length;
  }
  const out: number[] = [];
  for (let i = 0; i <= shortData; i += 1) for (const part of parts) if (i < part.data.length) out.push(part.data[i] ?? 0);
  for (let i = 0; i < ecc; i += 1) for (const part of parts) out.push(part.ecc[i] ?? 0);
  return Uint8Array.from(out);
}

function alignmentCenters(version: number): readonly number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const last = sizeOf(version) - 7;
  return [6, ...Array.from({ length: count - 1 }, (_, i) => last - (count - 2 - i) * step)];
}

type Grid = { readonly size: number; readonly dark: Uint8Array; readonly reserved: Uint8Array };

/** Tout ce qui ne porte pas de donnée : repères, synchronisation, alignement, version, et la place du format. */
function functionPatterns(version: number): Grid {
  const size = sizeOf(version);
  const dark = new Uint8Array(size * size);
  const reserved = new Uint8Array(size * size);
  const set = (x: number, y: number, on: boolean): void => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    dark[y * size + x] = on ? 1 : 0;
    reserved[y * size + x] = 1;
  };

  for (let i = 0; i < size; i += 1) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }

  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        set(cx + dx, cy + dy, ring !== 2 && ring !== 4);
      }
    }
  }

  const centers = alignmentCenters(version);
  const lastIndex = centers.length - 1;
  centers.forEach((cy, row) =>
    centers.forEach((cx, column) => {
      if ((row === 0 && column === 0) || (row === 0 && column === lastIndex) || (row === lastIndex && column === 0)) return;
      for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }),
  );

  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) {
      set(8, i, false);
      set(i, 8, false);
    }
  }
  for (let i = 0; i < 8; i += 1) {
    set(size - 1 - i, 8, false);
    set(8, size - 1 - i, false);
  }
  set(8, size - 8, true);

  if (version >= 7) {
    let remainder = version;
    for (let i = 0; i < 12; i += 1) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
    const bits = (version << 12) | remainder;
    for (let i = 0; i < 18; i += 1) {
      const on = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, on);
      set(b, a, on);
    }
  }
  return { size, dark, reserved };
}

/** Les octets se posent en zigzag, deux colonnes à la fois, de bas en haut puis de haut en bas, depuis le coin bas-droit. */
function placeData(grid: Grid, codewords: Uint8Array): void {
  const { size, dark, reserved } = grid;
  let bit = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step += 1) {
      for (let column = 0; column < 2; column += 1) {
        const x = right - column;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - step : step;
        if (reserved[y * size + x] === 1) continue;
        if (bit < codewords.length * 8) dark[y * size + x] = ((codewords[bit >> 3] ?? 0) >>> (7 - (bit & 7))) & 1;
        bit += 1;
      }
    }
  }
}

const MASKS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function masked(grid: Grid, mask: number): Uint8Array {
  const { size, dark, reserved } = grid;
  const flip = MASKS[mask] ?? (() => false);
  const out = Uint8Array.from(dark);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (reserved[y * size + x] === 0 && flip(x, y)) out[y * size + x] = (out[y * size + x] ?? 0) ^ 1;
    }
  }

  const data = (FORMAT_LEVEL_M << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i += 1) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  const bits = ((data << 10) | remainder) ^ 0x5412;
  const set = (x: number, y: number, i: number): void => {
    out[y * size + x] = (bits >>> i) & 1;
  };
  for (let i = 0; i <= 5; i += 1) set(8, i, i);
  set(8, 7, 6);
  set(8, 8, 7);
  set(7, 8, 8);
  for (let i = 9; i < 15; i += 1) set(14 - i, 8, i);
  for (let i = 0; i < 8; i += 1) set(size - 1 - i, 8, i);
  for (let i = 8; i < 15; i += 1) set(8, size - 15 + i, i);
  return out;
}

const RUN_PENALTY = 3;
const BLOCK_PENALTY = 3;
const FINDER_PENALTY = 40;
const BALANCE_PENALTY = 10;

/** Les suites d'au moins cinq modules d'une couleur, et les faux repères 1:1:3:1:1 bordés de quatre modules clairs (le bord compte pour clair). */
function linePenalty(line: Uint8Array): number {
  const runs: number[] = [];
  let penalty = 0;
  for (let i = 0, start = 0; i <= line.length; i += 1) {
    if (i < line.length && line[i] === line[start]) continue;
    const length = i - start;
    if (length >= 5) penalty += RUN_PENALTY + length - 5;
    runs.push(length);
    start = i;
  }
  const firstDark = line[0] === 1 ? 0 : 1;
  for (let i = firstDark + 2; i < runs.length - 2; i += 2) {
    const unit = runs[i - 2] ?? 0;
    const core = runs[i] === unit * 3 && runs[i - 1] === unit && runs[i + 1] === unit && runs[i + 2] === unit;
    if (!core) continue;
    const before = i - 3 < 0 ? Number.POSITIVE_INFINITY : (runs[i - 3] ?? 0);
    const after = i + 3 >= runs.length ? Number.POSITIVE_INFINITY : (runs[i + 3] ?? 0);
    if (before >= unit * 4 || after >= unit * 4) penalty += FINDER_PENALTY;
  }
  return penalty;
}

function penaltyOf(cells: Uint8Array, size: number): number {
  let penalty = 0;
  let darkCount = 0;
  const column = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    penalty += linePenalty(cells.subarray(i * size, (i + 1) * size));
    for (let y = 0; y < size; y += 1) column[y] = cells[y * size + i] ?? 0;
    penalty += linePenalty(column);
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cell = cells[y * size + x];
      darkCount += cell ?? 0;
      if (x < size - 1 && y < size - 1 && cell === cells[y * size + x + 1] && cell === cells[(y + 1) * size + x] && cell === cells[(y + 1) * size + x + 1]) penalty += BLOCK_PENALTY;
    }
  }
  const total = size * size;
  return penalty + (Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1) * BALANCE_PENALTY;
}

export type QrOptions = {
  /** La plus grande version acceptée ; au-delà, `null` — celui qui peint sait combien de modules il peut rendre lisibles. */
  readonly maxVersion?: number;
};

/** Le texte (UTF-8, mode octet, correction M) → sa matrice ; `null` quand aucune version permise ne le porte. */
export function encodeQr(text: string, options: QrOptions = {}): QrMatrix | null {
  const bytes = new TextEncoder().encode(text);
  const version = versionFor(bytes.length, options.maxVersion ?? QR_MAX_VERSION);
  if (version === null) return null;
  const grid = functionPatterns(version);
  placeData(grid, interleaved(dataBytes(bytes, version), version));
  const best = MASKS.map((_, mask) => {
    const cells = masked(grid, mask);
    return { mask, cells, penalty: penaltyOf(cells, grid.size) };
  }).reduce((kept, candidate) => (candidate.penalty < kept.penalty ? candidate : kept));
  const { size } = grid;
  return {
    version,
    size,
    mask: best.mask,
    modules: Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => best.cells[y * size + x] === 1)),
  };
}
