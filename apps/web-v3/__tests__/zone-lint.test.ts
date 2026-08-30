/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const ESLINT = join(ROOT, 'node_modules', '.bin', 'eslint');
const PROBE = join(ROOT, 'app', 'zone-lint-probe.tsx');

type LintMessage = { readonly ruleId: string | null; readonly line: number; readonly message: string };
type LintResult = { readonly messages: readonly LintMessage[] };

const hasStdout = (value: unknown): value is { stdout: string } =>
  typeof value === 'object' && value !== null && typeof (value as { stdout?: unknown }).stdout === 'string';

const lint = (source: string): readonly LintMessage[] => {
  const args = ['--no-color', '--format', 'json', '--stdin', '--stdin-filename', PROBE];

  const stdout = ((): string => {
    try {
      return execFileSync(ESLINT, args, { cwd: ROOT, input: source, encoding: 'utf8' });
    } catch (error: unknown) {
      if (hasStdout(error)) return error.stdout;
      throw error;
    }
  })();

  const results: readonly LintResult[] = JSON.parse(stdout);
  return results.flatMap((result) => result.messages).filter((m) => m.ruleId === 'no-restricted-imports');
};

const FORBIDDEN_FORMS: readonly (readonly [string, string])[] = [
  ['la fonte @phosphor-icons/web par son sous-chemin CSS documenté', "import '@phosphor-icons/web/regular/style.css';"],
  ['la fonte @phosphor-icons/web par sa racine', "import '@phosphor-icons/web';"],
  ['lucide-react icône par icône', "import { House } from 'lucide-react/dist/esm/icons/house';"],
  ['lucide-react par sa racine', "import { List } from 'lucide-react';"],
  // Les deux formes que l'ABSENCE ne bloque pas : `@phosphor-icons/core` est une
  // devDependency de la RACINE, donc RÉSOLVABLE depuis apps/web-v3 (contrairement
  // à lucide-react, qui n'est déclaré nulle part). Sans ces lignes, un fichier de
  // la v3 court-circuite le sprite, une requête par icône, et tous les gates
  // restent verts. `@phosphor-icons/react` est barré d'avance : la conception le
  // rejette nommément, et son installation ne doit pas rouvrir la porte.
  [
    'les tracés source @phosphor-icons/core, que le sprite a déjà payés',
    "import play from '@phosphor-icons/core/assets/regular/play.svg';",
  ],
  ['@phosphor-icons/react, qui bundle les 6 poids par icône', "import { Play } from '@phosphor-icons/react';"],
  ['un second moteur de thème par un sous-chemin', "import 'next-themes/dist/index.js';"],
];

const PROBE_SOURCE = `${FORBIDDEN_FORMS.map(([, line]) => line).join('\n')}\nexport const probe = [House, List, play, Play];\n`;

jest.setTimeout(120_000);

describe('les lints de zone de la v3', () => {
  const refused = lint(PROBE_SOURCE);

  it.each(FORBIDDEN_FORMS.map(([label], index) => [label, index + 1] as const))(
    'refuse %s',
    (_label, line) => {
      expect(refused.map((message) => message.line)).toContain(line);
    },
  );

  // Un témoin qui n'énumère PAS ce que la config interdit ne mord pas : on
  // ajoute un `root` au lint, aucune sonde ne le couvre, et la suite reste
  // verte. Le compte se dérive de la config plutôt que d'être recopié — un
  // nombre en dur serait la jumelle de la liste qu'il prétend garder.
  it('sonde CHAQUE forme que la config interdit — aucune ajoutée sans témoin', () => {
    const config = readFileSync(join(ROOT, 'eslint.config.mjs'), 'utf8');
    const roots = [...config.matchAll(/\{\s*root:\s*'([^']+)'/g)].map(([, root]) => root);

    expect(roots).toHaveLength(5);
    roots.forEach((root) =>
      expect(FORBIDDEN_FORMS.some(([, ligne]) => ligne.includes(`'${root}`))).toBe(true),
    );
  });

  it("dit POURQUOI un import est refusé, jamais seulement qu'il l'est", () => {
    expect(refused.filter((m) => m.message.includes('sprite')).length).toBeGreaterThan(0);
    expect(refused.filter((m) => m.message.includes('moteur')).length).toBeGreaterThan(0);
  });

  it('laisse passer ce que la v3 utilise réellement', () => {
    expect(lint("import type { ReactNode } from 'react';\nexport type A = ReactNode;\n")).toEqual([]);
  });
});
