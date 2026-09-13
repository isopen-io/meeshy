import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  audit,
  blocsCss,
  contrastesInsuffisants,
  focusInvisiblesDans,
  jetonsOrphelins,
  plansDesordonnes,
  suivisDeLOS,
  verdict,
} from './check-jetons.mjs';
import { feuillesDepuis } from './lib/cascade.mjs';

const HERE = join(import.meta.dir);
const RACINE = join(HERE, '..');

/**
 * Une table de jetons MINIMALE mais complète des deux schémas — noire sur
 * blanc pour le clair, blanche sur noir pour le sombre, avec un anneau de
 * focus et son contre-anneau, une paire encre/fond hors la table, et un seul
 * voile — juste assez pour exercer chaque loi sans dépendre de la vraie
 * table du dépôt (celle-là est couverte par le test d'intégration plus bas).
 */
const TOKENS_CSS = `:root {
  --color-avatar-1: #7d80f6;
  --color-avatar-2: #10b981;
  --color-avatar-3: #ec4899;
  --color-avatar-4: #f59e0b;
  --color-on-avatar: #0b0c14;
}
`;

// Les deux fixtures ci-dessous sont une COPIE FIDÈLE des rôles réels de
// `dark.css`/`light.css` (mêmes hex, mêmes alias `var()`, mêmes
// `color-mix()`) — `resout` (lib/couleur.mjs) sait déjà résoudre les deux
// formes, donc les voiles n'ont pas besoin d'être recalculés à la main : ils
// le sont par le même code que celui qu'on teste, sur des entrées connues.
const dark = (overrides = {}) => {
  const base = {
    '--color-bg': '#0d0e16',
    '--color-bg-sunken': '#08090f',
    '--color-surface': '#161826',
    '--color-surface-raised': '#22243a',
    '--color-text': '#edeef5',
    '--color-text-muted': '#9397ab',
    '--color-text-subtle': '#8a8ea6',
    '--color-border-interactive': '#75798c',
    '--color-primary': '#818cf8',
    '--color-primary-strong': '#a5aeff',
    '--color-on-primary': '#0b0c14',
    '--color-focus': 'var(--color-text)',
    '--color-focus-contra': 'var(--color-bg-sunken)',
    '--color-success': '#10b981',
    '--color-warning': '#f59e0b',
    '--color-danger': '#f45b5b',
    '--color-on-status': 'var(--color-bg)',
    '--color-presence-online': '#34d399',
    '--color-presence-away': '#fbbf24',
    '--color-presence-idle': '#9ca3af',
    '--color-presence-offline': '#9ca3af',
    '--color-tint-primary': 'color-mix(in srgb, var(--color-primary) 12%, var(--color-surface))',
    '--color-tint-success': 'color-mix(in srgb, var(--color-success) 10%, var(--color-surface))',
    '--color-tint-warning': 'color-mix(in srgb, var(--color-warning) 10%, var(--color-surface))',
    '--color-tint-danger': 'color-mix(in srgb, var(--color-danger) 10%, var(--color-surface))',
  };
  return { ...base, ...overrides };
};

const light = (overrides = {}) => {
  const base = {
    '--color-bg': '#f1f3f9',
    '--color-bg-sunken': '#e6e9f2',
    '--color-surface': '#f9fafd',
    '--color-surface-raised': '#ffffff',
    '--color-text': '#12131d',
    '--color-text-muted': '#575b73',
    '--color-text-subtle': '#5f6379',
    '--color-border-interactive': '#767b94',
    '--color-primary': '#4f46e5',
    '--color-primary-strong': '#4338ca',
    '--color-on-primary': '#ffffff',
    '--color-focus': 'var(--color-text)',
    '--color-focus-contra': 'var(--color-surface-raised)',
    '--color-success': '#047857',
    '--color-warning': '#a84e08',
    '--color-danger': '#c81e1e',
    '--color-on-status': '#ffffff',
    '--color-presence-online': '#059669',
    '--color-presence-away': '#b45309',
    '--color-presence-idle': '#6b7280',
    '--color-presence-offline': '#6b7280',
    '--color-tint-primary': 'color-mix(in srgb, var(--color-primary) 12%, var(--color-surface))',
    '--color-tint-success': 'color-mix(in srgb, var(--color-success) 10%, var(--color-surface))',
    '--color-tint-warning': 'color-mix(in srgb, var(--color-warning) 10%, var(--color-surface))',
    '--color-tint-danger': 'color-mix(in srgb, var(--color-danger) 10%, var(--color-surface))',
  };
  return { ...base, ...overrides };
};

const feuille = (nom, jetons) =>
  `:root${nom === 'light.css' ? ',\n:root.light' : ''} {\n` +
  Object.entries(jetons)
    .map(([nom_, valeur]) => `  ${nom_}: ${valeur};`)
    .join('\n') +
  '\n}\n';

let dossiersATTester = [];

afterEach(() => {
  for (const dossier of dossiersATTester) rmSync(dossier, { recursive: true, force: true });
  dossiersATTester = [];
});

/** Écrit une table de jetons valide (par défaut) ou modifiée dans un dossier jetable. */
const tableJetable = ({ tokens = TOKENS_CSS, sombre = dark(), clair = light() } = {}) => {
  const dossier = mkdtempSync(join(tmpdir(), 'jetons-test-'));
  dossiersATTester.push(dossier);
  writeFileSync(join(dossier, 'tokens.css'), tokens);
  writeFileSync(join(dossier, 'dark.css'), feuille('dark.css', sombre));
  writeFileSync(join(dossier, 'light.css'), feuille('light.css', clair));
  return dossier;
};

describe('blocsCss', () => {
  test('lit les déclarations de custom properties par sélecteur, commentaires exclus', () => {
    const blocs = blocsCss(':root {\n  /* --x: 9; */\n  --a: 1;\n  --b: 2;\n}\n');
    expect(blocs).toEqual([{ selecteurs: [':root'], jetons: { '--a': '1', '--b': '2' } }]);
  });
});

describe('jetonsOrphelins', () => {
  test('une table complète des deux côtés ne rend rien', () => {
    expect(jetonsOrphelins(tableJetable())).toEqual([]);
  });

  test("un jeton présent dans dark.css et absent de light.css est signalé", () => {
    const dossier = tableJetable({ clair: (() => { const c = light(); delete c['--color-danger']; return c; })() });
    const orphelins = jetonsOrphelins(dossier);
    expect(orphelins).toEqual([{ fichier: 'dark.css', jeton: '--color-danger', manque: 'light.css' }]);
  });
});

describe('contrastesInsuffisants', () => {
  test('une table conforme ne rend aucun défaut', () => {
    expect(contrastesInsuffisants(tableJetable())).toEqual([]);
  });

  test('une encre trop proche de son fond est rapportée avec le rapport mesuré', () => {
    const dossier = tableJetable({ sombre: dark({ '--color-danger': '#141520' }) });
    const defauts = contrastesInsuffisants(dossier);
    expect(defauts.length).toBeGreaterThan(0);
    expect(defauts.every((d) => d.schema === 'sombre' && d.rapport < d.seuil)).toBe(true);
  });

  test('un jeton non résolu (alias circulaire) rend un rapport `null`, pas une exception', () => {
    const dossier = tableJetable({ sombre: dark({ '--color-danger': 'var(--boucle)', '--boucle': 'var(--color-danger)' }) });
    const defauts = contrastesInsuffisants(dossier);
    expect(defauts.some((d) => d.encre === '--color-danger' && d.rapport === null)).toBe(true);
  });
});

describe('plansDesordonnes', () => {
  test('les quatre plans strictement croissants en luminance ne rendent rien', () => {
    expect(plansDesordonnes(tableJetable())).toEqual([]);
  });

  test("un plan peint plus sombre que celui qu'il surplombe est signalé", () => {
    const dossier = tableJetable({ sombre: dark({ '--color-surface-raised': '#020203' }) });
    const defauts = plansDesordonnes(dossier);
    expect(defauts).toEqual([
      { schema: 'sombre', dessous: '--color-surface', plan: '--color-surface-raised', ecart: expect.any(Number) },
    ]);
    expect(defauts[0].ecart).toBeLessThanOrEqual(0);
  });
});

describe('focusInvisiblesDans', () => {
  test('anneau et contre-anneau qui se couvrent mutuellement ne rendent rien', () => {
    expect(focusInvisiblesDans(dark())).toEqual([]);
  });

  test('deux anneaux identiques, invisibles sur le même fond que lui, sont rapportés', () => {
    const table = dark({ '--color-focus': '#818cf8', '--color-focus-contra': '#818cf8' });
    const defauts = focusInvisiblesDans(table);
    expect(defauts.some((d) => d.fond === '--color-primary')).toBe(true);
  });
});

describe('suivisDeLOS', () => {
  test('une table qui suit la classe (jamais le média) ne rend rien', () => {
    const dossier = tableJetable();
    expect(suivisDeLOS(feuillesDepuis(dossier, 'tokens.css'))).toEqual([]);
  });

  test('un jeton posé sous `@media (prefers-color-scheme)` bascule avec l\'OS et est rapporté', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'jetons-test-'));
    dossiersATTester.push(dossier);
    writeFileSync(
      join(dossier, 'tokens.css'),
      ':root {\n  --color-rogue: #111111;\n}\n@media (prefers-color-scheme: dark) {\n  :root {\n    --color-rogue: #222222;\n  }\n}\n',
    );
    writeFileSync(join(dossier, 'dark.css'), feuille('dark.css', dark()));
    writeFileSync(join(dossier, 'light.css'), feuille('light.css', light()));
    const defauts = suivisDeLOS(feuillesDepuis(dossier, 'tokens.css'));
    expect(defauts.some((d) => d.propriete === '--color-rogue')).toBe(true);
  });

  test('un @import non modélisé (qualifié par un média) fait lever plutôt que disparaître en silence', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'jetons-test-'));
    dossiersATTester.push(dossier);
    writeFileSync(join(dossier, 'tokens.css'), "@import './dark.css' screen;\n:root {}\n");
    writeFileSync(join(dossier, 'dark.css'), feuille('dark.css', dark()));
    expect(() => feuillesDepuis(dossier, 'tokens.css')).toThrow();
  });
});

describe('audit / verdict — intégration sur la vraie table du dépôt', () => {
  test('packages/design-tokens (tokens.css, dark.css, light.css) est vert', () => {
    const rapport = audit({ racineJetons: RACINE });
    expect(rapport).toEqual({ orphelins: [], contrastes: [], ordres: [], focus: [], suivis: [] });
    expect(verdict(rapport)).toBe(0);
  });

  test('une table fabriquée et défaillante rend un verdict non nul', () => {
    const dossier = tableJetable({ sombre: dark({ '--color-danger': '#141520' }) });
    expect(verdict(audit({ racineJetons: dossier }))).toBe(1);
  });
});
