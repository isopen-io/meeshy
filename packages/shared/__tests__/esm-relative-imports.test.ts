// packages/shared/__tests__/esm-relative-imports.test.ts
//
// Le dist de @meeshy/shared est exécuté par Node en ESM pur (gateway prod) :
// tout import relatif de VALEUR doit porter une extension explicite (.js/.json),
// sinon ERR_MODULE_NOT_FOUND au boot (crash-loop gateway du 2026-07-04).
// Les imports/exports type-only sont effacés par tsc et donc exemptés.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHARED_ROOT = fileURLToPath(new URL('..', import.meta.url));

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '__tests__', 'prisma']);
const EXCLUDED_FILES = new Set(['seed.ts', 'vitest.config.ts']);

const collectSourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return EXCLUDED_DIRS.has(entry.name) ? [] : collectSourceFiles(join(dir, entry.name));
    }
    const isSource =
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !EXCLUDED_FILES.has(entry.name);
    return isSource ? [join(dir, entry.name)] : [];
  });

const RUNTIME_STATEMENT_WITH_FROM =
  /(?:^|\n)\s*(import|export)\s+(type\s)?[\s\S]*?\sfrom\s+['"](\.[^'"]*)['"]/g;
const SIDE_EFFECT_IMPORT = /(?:^|\n)\s*import\s+['"](\.[^'"]*)['"]/g;
const DYNAMIC_IMPORT = /import\(\s*['"](\.[^'"]*)['"]\s*\)/g;

const HAS_EXTENSION = /\.(js|json)$/;

const extensionlessSpecifiers = (content: string): string[] => {
  const violations: string[] = [];
  for (const match of content.matchAll(RUNTIME_STATEMENT_WITH_FROM)) {
    const [, , typeOnly, specifier] = match;
    if (!typeOnly && !HAS_EXTENSION.test(specifier)) violations.push(specifier);
  }
  for (const regex of [SIDE_EFFECT_IMPORT, DYNAMIC_IMPORT]) {
    for (const match of content.matchAll(regex)) {
      if (!HAS_EXTENSION.test(match[1])) violations.push(match[1]);
    }
  }
  return violations;
};

describe('ESM relative imports (dist runtime safety)', () => {
  it('tout import relatif de valeur porte une extension .js/.json explicite', () => {
    const offenders = collectSourceFiles(SHARED_ROOT).flatMap((file) => {
      const specifiers = extensionlessSpecifiers(readFileSync(file, 'utf8'));
      return specifiers.map((specifier) => `${relative(SHARED_ROOT, file)} → '${specifier}'`);
    });

    expect(offenders).toEqual([]);
  });
});
