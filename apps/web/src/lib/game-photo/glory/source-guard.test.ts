import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * LES GARDES DE SOURCE DU PEINTRE DES CADRES (#10159, L7 ; § 8.7 et leçon 589
 * du prompt des Cadres de gloire). Chacune a été vue ROUGE sous sa mutation :
 *  - aucun `fetch(` sous `lib/game-photo/` : les octets d'un pack passent par le
 *    magasin, qui les vérifie — jamais par un appel direct ;
 *  - le module paresseux n'est atteint que par `import()` : un import statique
 *    depuis n'importe quel module du dossier parent le ferait entrer dans le
 *    chunk de celui qui l'importe, et le budget `glory_painter` mentirait ;
 *  - aucun `toBlob` sous `glory/` : l'image finale ne sort que de `render.ts`
 *    (garde #8695) ;
 *  - le budget nomme le chunk, en `dynamic_only`.
 */

const HERE = new URL('.', import.meta.url).pathname;
const GAME_PHOTO = resolve(HERE, '..');
const SRC = resolve(GAME_PHOTO, '..', '..');
const WEB = resolve(SRC, '..');

const walk = (dir: string): readonly string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const sources = (dir: string): readonly string[] => walk(dir).filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file));

const stripComments = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('aucun réseau direct sous lib/game-photo/', () => {
  test('le balayage voit bien le dossier (il n’est pas vide)', () => {
    expect(sources(GAME_PHOTO).length).toBeGreaterThan(10);
  });

  test('aucun `fetch(` dans aucun module du dossier, sous-dossiers compris', () => {
    const offenders = sources(GAME_PHOTO).filter((file) => /\bfetch\s*\(/.test(stripComments(readFileSync(file, 'utf8'))));
    expect(offenders.map((file) => relative(SRC, file))).toEqual([]);
  });

  test('aucune adresse de fichier de pack écrite en dur (`/pack-assets/`) : seul le magasin les compose', () => {
    const offenders = sources(GAME_PHOTO).filter((file) => stripComments(readFileSync(file, 'utf8')).includes('/pack-assets/'));
    expect(offenders).toEqual([]);
  });
});

describe('le peintre est un chunk à la demande', () => {
  const STATIC = /^\s*(?:import|export)\s(?!type\s)[^'"]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;
  const resolveSpecifier = (from: string, specifier: string): string | null => {
    const base = specifier.startsWith('@/') ? join(SRC, specifier.slice(2)) : specifier.startsWith('.') ? resolve(dirname(from), specifier) : null;
    if (base === null) return null;
    const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx'), base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx')];
    return candidates.find((path) => existsSync(path) && statSync(path).isFile()) ?? null;
  };

  test('aucun module hors de glory/ n’importe STATIQUEMENT une valeur du dossier glory/ (les imports de types ne comptent pas)', () => {
    const outside = sources(SRC).filter((file) => !file.startsWith(`${HERE}`));
    const offenders = outside.flatMap((file) => {
      const code = readFileSync(file, 'utf8');
      return [...code.matchAll(STATIC)]
        .map((match) => resolveSpecifier(file, match[1] ?? match[2] ?? ''))
        .filter((target): target is string => target !== null && target.startsWith(HERE))
        .map((target) => `${relative(SRC, file)} → ${relative(SRC, target)}`);
    });
    expect(offenders).toEqual([]);
  });

  test('l’environnement atteint la scène par import() seulement', () => {
    const env = readFileSync(join(GAME_PHOTO, 'env.ts'), 'utf8');
    expect(env).toContain("import('./glory/glory-scene')");
  });

  test('la scène atteint le magasin des packs par import() : `packs_store` reste un chunk à la demande', () => {
    const scene = stripComments(readFileSync(join(HERE, 'glory-scene.ts'), 'utf8'));
    expect(scene).toContain("import('@/lib/packs/pack-asset-store')");
    expect(/^\s*import\s(?!type\s)[^'"]*?from\s+['"]@\/lib\/packs\/pack-asset-store['"]/m.test(scene)).toBe(false);
  });

  test('budgets.json borne le chunk `glory_painter`, en dynamic_only, sur le nom de la scène', () => {
    const budgets = JSON.parse(readFileSync(join(WEB, 'budgets.json'), 'utf8')) as { on_demand_chunks: Record<string, { pattern?: string; dynamic_only?: boolean }> };
    const entry = budgets.on_demand_chunks.glory_painter;
    expect(entry?.dynamic_only).toBe(true);
    expect(new RegExp(entry?.pattern ?? '$^').test('assets/glory-scene-Dk83dss.js')).toBe(true);
  });

  test('aucun toBlob sous glory/ : l’image finale sort de render.ts seul (#8695)', () => {
    const offenders = sources(HERE).filter((file) => /toBlob|toDataURL/.test(stripComments(readFileSync(file, 'utf8'))));
    expect(offenders).toEqual([]);
  });
});
