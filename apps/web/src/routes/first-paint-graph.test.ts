import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LE CADRE CÔTE À CÔTE NE PÈSE RIEN SUR LA PREMIÈRE PEINTURE DU TÉLÉPHONE
 * (#10086, après #10073 / D-185).
 *
 * ## Le défaut que ce témoin ferme
 *
 * `route-table.tsx` importait `SplitFrame` STATIQUEMENT : le cadre, sa
 * mémoire de scrollport et ses volets entraient dans le module d'entrée que
 * CHAQUE lecteur télécharge avant le premier pixel — y compris le téléphone,
 * qui ne l'affiche jamais (le cadre ne scinde qu'à partir de 1024 px). Mesuré :
 * le module d'entrée a pris 0,6 Ko gzip, et la première peinture a franchi
 * son plafond de 90 Ko (`budgets.json › first_paint.kb`).
 *
 * ## Pourquoi par le GRAPHE des imports statiques, et pas par le poids
 *
 * Le gate de poids (`measure-weight.mjs`) ne dit QUE la somme : il rougit
 * quand le budget est dépassé, quel que soit le module qui l'a fait déborder,
 * et il reste vert tant qu'une marge absorbe la régression. Ce témoin nomme
 * la cause : il parcourt les imports STATIQUES depuis `main.tsx` — exactement
 * ce que le bundler met dans le module d'entrée — et vérifie que le cadre n'y
 * est pas. Un `import()` différé n'est pas une arête : c'est le découpage que
 * ce témoin protège.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const EXTENSIONS = ['.tsx', '.ts', '.js', '/index.tsx', '/index.ts'];

function resolveLocal(from: string, specifier: string): string | null {
  const base = specifier.startsWith('@/')
    ? join(SRC, specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(from), specifier)
      : null;
  if (base === null) return null;
  if (/\.(?:tsx?|js|mjs)$/.test(base) && existsSync(base)) return base;
  return EXTENSIONS.map((ext) => base + ext).find((candidate) => existsSync(candidate)) ?? null;
}

/** Les arêtes STATIQUES d'un module : `import … from`, `import '…'`, `export … from` — jamais `import type`, jamais `import()`. */
function staticEdges(file: string): readonly string[] {
  const source = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const edges = /^\s*(?:import|export)\s+(?!type\s)(?:[^;'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
  return [...source.matchAll(edges)]
    .map(([, specifier]) => resolveLocal(file, String(specifier)))
    .filter((target): target is string => target !== null);
}

function firstPaintGraph(entry: string): ReadonlySet<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    queue.push(...staticEdges(file));
  }
  return seen;
}

const GRAPH = firstPaintGraph(join(SRC, 'main.tsx'));
const inGraph = (relative: string) => GRAPH.has(join(SRC, relative));

describe('ce que le module d’entrée embarque', () => {
  test('le parcours reconnaît le socle — sinon un graphe vide ressemblerait à un succès', () => {
    expect(inGraph('routes/route-table.tsx')).toBe(true);
    expect(inGraph('lib/router.tsx')).toBe(true);
    expect(inGraph('lib/api/session.ts')).toBe(true);
  });

  test('le cadre côte à côte se charge à la demande, jamais avant le premier pixel (#10086)', () => {
    expect(inGraph('routes/split-frame.tsx')).toBe(false);
    expect(inGraph('routes/split-empty-pane.tsx')).toBe(false);
  });

  test('la couche d’appel ne lit que l’ÉTAT de l’enregistrement : ses gestes partent avec la connexion (#10086)', () => {
    expect(inGraph('lib/calls/call-recording-store.ts')).toBe(true);
    expect(inGraph('lib/calls/call-recording.ts')).toBe(false);
    expect(inGraph('lib/calls/call-recording-live.ts')).toBe(false);
  });

  test('les écrans de la liste et du fil restent découpés', () => {
    expect(inGraph('routes/conversations.tsx')).toBe(false);
    expect(inGraph('routes/thread.tsx')).toBe(false);
  });
});
