/**
 * Cliquet — `packages/shared/types/` reste un graphe d'import SANS CYCLE (#4683).
 *
 * Trois fichiers se citaient en rond : `api-responses.ts` → `conversation.ts`
 * (`ConversationStats`) → `user.ts` (`UserRole`) → `api-responses.ts`
 * (`PaginationMeta`). Les trois arêtes sont des `import type`, effacées à la
 * compilation — aucun défaut d'exécution — mais le cycle empêche de répondre
 * « ce fichier dépend de quoi ? » par une réponse finie, et casse tout outil
 * qui suit le graphe de modules (le générateur de #4645 l'a rencontré en
 * mesurant `types/` avant de découper `socketio-events.ts`).
 *
 * Ce témoin mesure le graphe RÉEL (résolution des `import … from '…'`
 * relatifs, Tarjan) plutôt que de figer les trois fichiers nommés ci-dessus :
 * un futur cycle entre DEUX AUTRES fichiers doit rougir la même garde.
 */

import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'types');

/** Fichiers `.ts` sous `types/`, hors `__tests__` et déclarations `.d.ts`. */
function listTypeModules(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === '__tests__' ? [] : listTypeModules(full);
    }
    return entry.endsWith('.ts') && !entry.endsWith('.d.ts') ? [full] : [];
  });
}

/** Les spécificateurs `import type { … } from '<relatif>.js'` / `export type … from` d'un fichier. */
function relativeImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^;]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) {
    const specifier = match[1];
    if (specifier) specifiers.push(specifier);
  }
  return specifiers;
}

/** Résout un spécificateur relatif (`./conversation.js`, `./preferences/index.js`) vers un fichier de `types/`. */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  const withoutExt = specifier.replace(/\.js$/, '');
  const base = resolve(dirname(fromFile), withoutExt);
  const candidates = [`${base}.ts`, join(base, 'index.ts')];
  return candidates.find(existsSync) ?? null;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Le graphe d'import de `types/`, restreint aux arêtes qui restent DANS `types/`. */
function buildImportGraph(): Map<string, Set<string>> {
  const modules = listTypeModules(TYPES_ROOT);
  const graph = new Map<string, Set<string>>(modules.map((file) => [file, new Set<string>()]));

  for (const file of modules) {
    const source = stripComments(readFileSync(file, 'utf8'));
    for (const specifier of relativeImportSpecifiers(source)) {
      const resolved = resolveSpecifier(file, specifier);
      if (resolved && graph.has(resolved) && resolved !== file) {
        graph.get(file)!.add(resolved);
      }
    }
  }
  return graph;
}

/** Composantes fortement connexes (Tarjan) — une composante de taille > 1 EST un cycle. */
function stronglyConnectedComponents(graph: Map<string, Set<string>>): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];

  function strongConnect(node: string): void {
    indices.set(node, index);
    lowlink.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);

    for (const neighbour of graph.get(node) ?? []) {
      if (!indices.has(neighbour)) {
        strongConnect(neighbour);
        lowlink.set(node, Math.min(lowlink.get(node)!, lowlink.get(neighbour)!));
      } else if (onStack.has(neighbour)) {
        lowlink.set(node, Math.min(lowlink.get(node)!, indices.get(neighbour)!));
      }
    }

    if (lowlink.get(node) === indices.get(node)) {
      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      components.push(component);
    }
  }

  for (const node of graph.keys()) {
    if (!indices.has(node)) strongConnect(node);
  }
  return components;
}

const toRelative = (file: string): string => relative(TYPES_ROOT, file);

describe('cliquet — packages/shared/types/ est un graphe d\'import sans cycle (#4683)', () => {
  test('le graphe atteint bien un ensemble réel de modules (borne de non-vacuité)', () => {
    // Un détecteur qui n'atteint aucun module rendrait vert par construction —
    // la doctrine du dépôt exige cette borne sur toute garde de balayage.
    const graph = buildImportGraph();
    expect(graph.size).toBeGreaterThan(30);
  });

  test('aucune composante fortement connexe de taille > 1 dans types/', () => {
    const graph = buildImportGraph();
    const cycles = stronglyConnectedComponents(graph).filter((component) => component.length > 1);

    expect(cycles.map((cycle) => cycle.map(toRelative).sort())).toEqual([]);
  });

  test('sonde — un cycle introduit délibérément rougit le témoin', () => {
    // Preuve que le détecteur détecte vraiment, pas seulement qu'il ne trouve
    // rien sur le graphe actuel.
    const graph = new Map<string, Set<string>>([
      ['a.ts', new Set(['b.ts'])],
      ['b.ts', new Set(['a.ts'])],
    ]);

    const cycles = stronglyConnectedComponents(graph).filter((component) => component.length > 1);
    expect(cycles).toHaveLength(1);
  });
});
