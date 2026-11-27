import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { ENGINE_FILES, auditSources, isInScope, scanSource } from './check-theme-engine.mjs';

/**
 * LE TÉMOIN DU GATE « UN SEUL MOTEUR DE THÈME » (#6020).
 *
 * Le schéma clair/sombre se décide en UN lieu : `src/lib/scheme.ts` (à chaud)
 * et `src/lib/inline-scheme-bootstrap.js` (au démarrage, avant le premier
 * rendu). Un composant qui interroge `prefers-color-scheme` ou pose lui-même
 * `dark`/`light` sur une classe est un SECOND moteur : il se peint selon le
 * système pendant que l'app est réglée sur l'autre schéma. Le gate garde ses
 * deux moitiés — ce qu'il attrape, et ce qu'il laisse passer à dessein.
 */

type Violation = { readonly line: number; readonly kind: string; readonly match: string };

const kinds = (text: string): readonly string[] => (scanSource(text) as readonly Violation[]).map((v) => v.kind);

const SCRIPT = fileURLToPath(new URL('./check-theme-engine.mjs', import.meta.url));

describe('scanSource — ce que le gate attrape', () => {
  test('une requête média du schéma système', () => {
    expect(kinds("const q = window.matchMedia('(prefers-color-scheme: dark)');")).toEqual(['system-query']);
    expect(kinds('const q = matchMedia(`(prefers-color-scheme: light)`).matches;')).toEqual(['system-query']);
    expect(kinds('const q = window.matchMedia(\n  "(prefers-color-scheme: dark)",\n);')).toEqual(['system-query']);
  });

  test('une classe de schéma posée, retirée ou basculée', () => {
    expect(kinds("document.documentElement.classList.add('dark');")).toEqual(['scheme-class']);
    expect(kinds('root.classList.toggle("light", on);')).toEqual(['scheme-class']);
    expect(kinds("el.classList.remove('dark');")).toEqual(['scheme-class']);
    expect(kinds("el.classList.replace('light', 'dark');")).toEqual(['scheme-class']);
  });

  test('un attribut de thème écrit sur un élément', () => {
    expect(kinds("document.documentElement.setAttribute('data-theme', 'dark');")).toEqual(['theme-attribute']);
    expect(kinds("document.documentElement.dataset.theme = 'dark';")).toEqual(['theme-attribute']);
  });

  test('la LIGNE est celle de l’appel', () => {
    const found = scanSource("const a = 1;\n\nel.classList.add('dark');\n") as readonly Violation[];
    expect(found.map((v) => v.line)).toEqual([3]);
  });
});

describe('scanSource — ce que le gate laisse passer à dessein', () => {
  test('un attribut `media=` déclaratif (balise <meta>, <source>)', () => {
    expect(kinds('<source media="(prefers-color-scheme: dark)" srcSet={src} />')).toEqual([]);
    expect(kinds('const m = `<meta name="theme-color" media="(prefers-color-scheme: dark)">`;')).toEqual([]);
  });

  test('un commentaire qui cite le moteur', () => {
    expect(kinds("// window.matchMedia('(prefers-color-scheme: dark)')\nconst a = 1;")).toEqual([]);
    expect(kinds("/* el.classList.add('dark') */\nconst a = 1;")).toEqual([]);
  });

  test('une LECTURE du schéma courant, une autre classe, un `colorScheme` de surface', () => {
    expect(kinds("const light = document.documentElement.classList.contains('light');")).toEqual([]);
    expect(kinds("el.classList.add('darkened');")).toEqual([]);
    expect(kinds("const s = { colorScheme: 'dark' };")).toEqual([]);
    expect(kinds("const q = window.matchMedia('(prefers-reduced-motion: reduce)');")).toEqual([]);
  });

  test('une URL dans une chaîne n’ouvre pas de commentaire', () => {
    expect(kinds("const u = 'https://meeshy.me'; el.classList.add('dark');")).toEqual(['scheme-class']);
  });
});

describe('auditSources — le périmètre', () => {
  test('les deux fichiers du moteur sont les seuls autorisés', () => {
    expect([...ENGINE_FILES]).toEqual(['lib/scheme.ts', 'lib/inline-scheme-bootstrap.js']);
    const engine = "document.documentElement.classList.toggle('dark', true);";
    const report = auditSources([
      { path: 'lib/scheme.ts', text: engine },
      { path: 'lib/inline-scheme-bootstrap.js', text: engine },
      { path: 'components/panel.tsx', text: engine },
    ]);
    expect(report.files.map((f: { path: string }) => f.path)).toEqual(['components/panel.tsx']);
    expect(report.total).toBe(1);
  });

  test('un moteur déclaré qui disparaît se signale', () => {
    const report = auditSources([{ path: 'components/panel.tsx', text: 'const a = 1;' }]);
    expect(report.missingEngineFiles).toEqual(['lib/scheme.ts', 'lib/inline-scheme-bootstrap.js']);
  });

  test('les tests et le support de test sont hors périmètre ; js et mjs y sont', () => {
    expect(isInScope('components/panel.test.tsx')).toBe(false);
    expect(isInScope('test-support/dom.ts')).toBe(false);
    expect(isInScope('lib/types.d.ts')).toBe(false);
    expect(isInScope('lib/boot.js')).toBe(true);
    expect(isInScope('lib/boot.mjs')).toBe(true);
    expect(isInScope('styles/app.css')).toBe(false);
  });
});

describe('le pilote — une mutation le fait tomber', () => {
  const tree = (extra: Record<string, string>): string => {
    const root = mkdtempSync(join(tmpdir(), 'theme-engine-'));
    const files: Record<string, string> = {
      'lib/scheme.ts': "document.documentElement.classList.toggle('dark', true);",
      'lib/inline-scheme-bootstrap.js': "matchMedia('(prefers-color-scheme: light)');",
      ...extra,
    };
    Object.entries(files).forEach(([path, text]) => {
      const full = join(root, path);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, text);
    });
    return root;
  };

  const run = (root: string) => spawnSync('node', [SCRIPT, '--src', root], { encoding: 'utf8' });

  test('vert sans second moteur', () => {
    const result = run(tree({ 'components/ok.tsx': '<source media="(prefers-color-scheme: dark)" />' }));
    expect(result.status).toBe(0);
  });

  test('rouge dès qu’un composant interroge le schéma système', () => {
    const result = run(tree({ 'components/bad.tsx': "const q = window.matchMedia('(prefers-color-scheme: dark)');" }));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('components/bad.tsx');
  });

  test('vert sur le vrai src/ de l’application', () => {
    const result = spawnSync('node', [SCRIPT], { encoding: 'utf8' });
    expect(result.stdout).toContain('un seul moteur');
    expect(result.status).toBe(0);
  });
});
