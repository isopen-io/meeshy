/**
 * @jest-environment node
 *
 * Ce que ce temoin gage : le tsconfig de la zone ne type-checke QUE la zone —
 * y compris dans l'arbre APLATI que son propre Dockerfile fabrique.
 *
 * Pourquoi il ne se lit pas dans le depot : dans le depot, `apps/web-v3/` n'a
 * pour voisins que ses propres repertoires, donc `include: ["**\/*.ts"]` ne peut
 * rien ratisser d'etranger et un `tsc --noEmit` local sort VERT. Dans l'image,
 * `Dockerfile` copie `packages/shared/` PUIS le contenu d'`apps/web-v3/` dans le
 * MEME `/app` : le glob, relatif au tsconfig, attrape alors le paquet partage
 * entier. Le defaut ne vit donc ni dans un fichier de la zone ni dans le
 * tsconfig lu seul — il vit dans leur RENCONTRE, et seule une simulation de la
 * copie peut le voir.
 *
 * Les racines etrangeres ne sont pas ecrites en dur : elles sont DERIVEES du
 * Dockerfile. Le jour ou une etape y copie `packages/icons/` ou un
 * `infrastructure/`, ce temoin le sait sans etre reecrit — c'est le Dockerfile
 * qui decide de ce qui atterrit a cote du tsconfig, jamais ce fichier.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const zoneRoot = join(__dirname, '..');

const read = (relative: string): string => readFileSync(join(zoneRoot, relative), 'utf8');

const stripJsonComments = (source: string): string =>
  source
    .split('\n')
    .map((line) => line.replace(/^\s*\/\/.*$/, ''))
    .join('\n');

const tsconfigSource = read('tsconfig.json');
const dockerfile = read('Dockerfile');

/**
 * Les racines qu'une etape du Dockerfile pose dans le repertoire de travail
 * SANS qu'elles viennent d'`apps/web-v3/`. Deux formes de COPY les portent :
 * depuis le contexte (`COPY packages/shared/ ./packages/shared/`) et depuis une
 * etape anterieure (`COPY --from=deps /app/packages ./packages`).
 */
export const foreignRootsOf = (source: string): readonly string[] => {
  const roots = source.split('\n').flatMap((line) => {
    const [, from, destination] =
      /^COPY\s+(?:--from=\S+\s+)?(\S+)\s+(\.\/\S+)\s*$/.exec(line.trim()) ?? [];
    if (from === undefined || destination === undefined) return [];
    if (from.startsWith('apps/web-v3')) return [];

    const [root] = destination.replace(/^\.\//, '').split('/');
    return root === undefined || root === '' ? [] : [root];
  });

  return [...new Set(roots)].filter((root) => root !== 'node_modules');
};

const matchedFiles = (tree: string): readonly string[] => {
  const stdout = execFileSync(
    process.execPath,
    [require.resolve('typescript/bin/tsc'), '--showConfig'],
    { cwd: tree, encoding: 'utf8' },
  );
  const parsed: { readonly files?: readonly string[] } = JSON.parse(stdout);
  return parsed.files ?? [];
};

const write = (tree: string, relative: string, content: string): void => {
  mkdirSync(join(tree, dirname(relative)), { recursive: true });
  writeFileSync(join(tree, relative), content, 'utf8');
};

/**
 * L'arbre que le Dockerfile fabrique : le tsconfig de la zone, un fichier DE la
 * zone, et sous chaque racine etrangere un fichier qui ne compile pas — celui
 * qui doit rester invisible.
 */
const flattenedImageTree = (tsconfig: string, foreignRoots: readonly string[]): string => {
  const tree = mkdtempSync(join(tmpdir(), 'web-v3-image-scope-'));

  writeFileSync(join(tree, 'tsconfig.json'), tsconfig, 'utf8');
  write(tree, 'next-env.d.ts', '');
  write(tree, 'app/page.tsx', 'export default function Page() { return null; }\n');

  for (const root of foreignRoots) {
    write(tree, `${root}/etranger/legacy.ts`, "export const role: 'MODERATOR' = 'MODO';\n");
  }

  return tree;
};

describe("le tsconfig de la zone ne ratisse que la zone, dans l'arbre APLATI de l'image", () => {
  const foreignRoots = foreignRootsOf(dockerfile);

  it('le Dockerfile pose bien au moins une racine etrangere a cote du tsconfig', () => {
    expect(foreignRoots).toContain('packages');
  });

  it("ne type-checke AUCUN fichier d'une racine que la zone ne possede pas", () => {
    const tree = flattenedImageTree(tsconfigSource, foreignRoots);
    try {
      const foreign = matchedFiles(tree).filter((file) =>
        foreignRoots.some((root) => file.replace(/^\.\//, '').startsWith(`${root}/`)),
      );

      expect(foreign).toEqual([]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('continue de type-checker les fichiers de la zone, eux', () => {
    const tree = flattenedImageTree(tsconfigSource, foreignRoots);
    try {
      expect(matchedFiles(tree)).toContain('./app/page.tsx');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });
});

describe('le temoin attrape bien le defaut qu il gage', () => {
  it("rougirait sur le tsconfig d'avant le correctif", () => {
    const before = JSON.stringify({
      ...JSON.parse(stripJsonComments(tsconfigSource)),
      exclude: ['node_modules', '.next'],
    });
    const tree = flattenedImageTree(before, ['packages']);

    try {
      const foreign = matchedFiles(tree).filter((file) =>
        file.replace(/^\.\//, '').startsWith('packages/'),
      );

      expect(foreign).toContain('./packages/etranger/legacy.ts');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('nomme la racine plantee par une etape multi-stage, pas seulement celles du contexte', () => {
    expect(foreignRootsOf('COPY --from=deps /app/packages ./packages\n')).toEqual(['packages']);
  });

  it("ne compte pas `apps/web-v3/` lui-meme comme etranger : c'est la zone", () => {
    expect(foreignRootsOf('COPY apps/web-v3/ ./\n')).toEqual([]);
  });
});
