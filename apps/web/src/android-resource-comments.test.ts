import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * AUCUN `--` DANS UN COMMENTAIRE DE RESSOURCE ANDROID (#10088).
 *
 * XML interdit `--` dans le corps d'un commentaire, et `aapt2` refuse le
 * fichier : « The string "--" is not permitted within comments ». Le
 * 2026-10-11, deux commentaires de `colors.xml` citant le jeton
 * `--ios-surface` (#10005) ont cassé `:app:mergeDebugResources`, donc TOUTE la
 * coque Android — le seul chemin Android depuis le gel du Kotlin natif.
 *
 * `aapt2` ne nomme que le PREMIER `--` de chaque fichier : le correctif écrit
 * depuis son message rougissait une seconde fois, un `--` plus bas. Ce témoin
 * les voit tous, d'un coup, et il voit aussi les ressources qu'`aapt2` ne
 * compile pas encore.
 */

const RES = join(dirname(fileURLToPath(import.meta.url)), '..', 'android/app/src/main/res');

const xmlFiles = (dir: string): readonly string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? xmlFiles(join(dir, entry.name))
      : entry.name.endsWith('.xml')
        ? [join(dir, entry.name)]
        : [],
  );

/** Les lignes (1-indexées) où un `--` apparaît dans le CORPS d'un commentaire. */
function doubleHyphenComments(xml: string): readonly number[] {
  const lines: number[] = [];
  for (const match of xml.matchAll(/<!--([\s\S]*?)-->/g)) {
    const before = xml.slice(0, match.index ?? 0).split('\n').length;
    (match[1] ?? '').split('\n').forEach((line, offset) => {
      if (line.includes('--')) lines.push(before + offset);
    });
  }
  return lines;
}

describe('les commentaires des ressources Android (#10088)', () => {
  test('aucun `--` dans le corps d’un commentaire — `aapt2` refuserait le fichier', () => {
    const offenders = xmlFiles(RES).flatMap((file) =>
      doubleHyphenComments(readFileSync(file, 'utf8')).map((line) => `${relative(RES, file)}:${line}`),
    );
    expect(offenders).toEqual([]);
  });

  test('le témoin voit TOUTES les occurrences d’un fichier, pas seulement la première', () => {
    const xml = '<a>\n<!-- un -- ici -->\n<b/>\n<!-- et un -- là -->\n</a>\n';
    expect(doubleHyphenComments(xml)).toEqual([2, 4]);
  });

  test('le `--` de fermeture d’un commentaire n’est pas une faute', () => {
    expect(doubleHyphenComments('<!--\n  rien de fautif\n-->\n')).toEqual([]);
  });

  test('un `--` hors commentaire n’est pas une faute — seul le corps compte', () => {
    expect(doubleHyphenComments('<a value="--ios-surface"/>\n')).toEqual([]);
  });
});
