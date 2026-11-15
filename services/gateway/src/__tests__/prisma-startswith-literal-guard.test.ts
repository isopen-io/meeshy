/**
 * Aucun filtre Prisma `startsWith` de la passerelle ne reçoit une valeur
 * calculée (#11492).
 *
 * Sur MongoDB, Prisma traduit `startsWith` en regex `^<valeur>` sans échapper
 * la valeur (mesuré contre mongod 8 et Prisma 6.19.3, #11467) : un `|` y
 * devient une alternative, un `.` n'importe quel caractère. La reprise des
 * reçus d'un contenu emportait ainsi ceux de TOUS les contenus de l'auteur.
 * Une valeur calculée passe par `prefixRange` (`utils/prefix-range.ts`) ; seul
 * un littéral sans métacaractère reste un `startsWith`.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { walk } from './helpers/file-size-sweep';

const SRC_DIR = join(__dirname, '..');

const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const productionSources = () =>
  walk(SRC_DIR)
    .filter((file) => file.endsWith('.ts') && !file.includes('__tests__') && !file.endsWith('.test.ts'))
    .map((file) => ({ file: relative(SRC_DIR, file), source: withoutComments(readFileSync(file, 'utf8')) }));

const STARTS_WITH = /\bstartsWith\s*:\s*([^,}\n]+)/g;
const SAFE_LITERAL = /^(['"])[^'"\\.^$|?*+()[\]{}]*\1$/;

describe('aucun startsWith Prisma ne reçoit une valeur calculée (#11492)', () => {
  it('le balayage voit bien des startsWith — sinon une mesure vide passerait au vert', () => {
    const count = productionSources().reduce((sum, { source }) => sum + [...source.matchAll(STARTS_WITH)].length, 0);
    expect(count).toBeGreaterThan(5);
  });

  it('chaque startsWith reçoit un littéral sans métacaractère de regex', () => {
    const offenders = productionSources().flatMap(({ file, source }) =>
      [...source.matchAll(STARTS_WITH)]
        .map((match) => match[1].trim())
        .filter((value) => !SAFE_LITERAL.test(value))
        .map((value) => `${file} : startsWith: ${value}`),
    );
    expect(offenders).toEqual([]);
  });
});
