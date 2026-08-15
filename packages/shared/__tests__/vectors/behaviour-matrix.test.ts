/**
 * Suite de la matrice de conformité comportementale (C-027, workshop §2.5 ③, contrat LWS-2).
 *
 * @see packages/shared/fixtures/conformance/behaviour-matrix.json
 * @see tasks/lentille-focal-workshop.md §2.5 ③
 * @see tasks/lentille-implementation-contract.md §… (behaviour-matrix.json)
 *
 * ────────────────────────────────────────────────────────────────────────
 * RE-PREUVE DU COMPTE DE LIGNES (règle RE-PROUVER, workshop §0 — « un
 * numéro n'est jamais une donnée d'entrée fiable ; un symbole et un chemin
 * le sont presque toujours »).
 *
 * Les documents de planification (`lentille-workshop-execution.md` C-027 et
 * Q-140, `lentille-implementation-contract.md`, `lentille-focal-workshop.md`
 * §2.5 ③ et §7) citent « 28 lignes vol. 5 §5.3 » et « 16 lignes vol. 4 §5 »
 * (44 au total). Compte re-prouvé le 2026-08-15 par extraction mécanique
 * (regex sur `<tr>…</tr>`) des DEUX sections HTML normatives :
 *
 *   - docs/design/2026-08-15-conversation-list-lentille.html
 *     (kicker "Design Vol.5") §5.3 "Matrice de couverture — toutes les
 *     features du rang actuel" : 18 lignes `<tr>` au total, DONT 1 ligne
 *     d'en-tête ⇒ 17 lignes de comportement réel (L01..L17), pas 28.
 *
 *   - docs/design/2026-08-15-focal-spec-integration.html (footer "volume
 *     4") §5 "Spécification d'implémentation — iOS" contient DEUX tables :
 *     une table d'architecture statique (7 lignes, hors périmètre — ce
 *     n'est pas une matrice de comportement temps réel) puis la table
 *     "Matrice de couverture — toutes les features de la vue actuelle"
 *     (16 lignes `<tr>` au total, DONT 1 ligne d'en-tête ⇒ 15 lignes de
 *     comportement réel, F01..F15), pas 16.
 *
 * Total re-prouvé : 17 + 15 = 32 entrées (pas 44). L'écart est documenté
 * ici plutôt que masqué : mieux vaut une matrice de 32 lignes fidèle au
 * document actuel qu'une matrice de 44 lignes dont 12 seraient inventées
 * pour satisfaire un chiffre cité dans une planification antérieure — même
 * défaut que les numéros de ligne périmés déjà corrigés en tête du
 * workshop (`ConversationListViewModel.swift:554` → `:486`). Si un futur
 * amendement du vol. 5/vol. 4 ajoute des lignes à ces tables, ce fichier de
 * test (le compte ci-dessous) et le fixture JSON doivent être mis à jour
 * ENSEMBLE, et cette note republiée avec le nouveau compte re-prouvé.
 * ────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, type Dirent } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'fixtures',
  'conformance',
  'behaviour-matrix.json',
);

// packages/shared/__tests__/vectors/ → racine du dépôt (4 niveaux au-dessus).
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

const EXPECTED_LIST_ROWS = 17; // vol. 5 §5.3, re-prouvé (pas 28 — voir en-tête de fichier)
const EXPECTED_THREAD_ROWS = 15; // vol. 4 §5, re-prouvé (pas 16 — voir en-tête de fichier)
const EXPECTED_TOTAL = EXPECTED_LIST_ROWS + EXPECTED_THREAD_ROWS; // 32, pas 44

type BehaviourEntry = {
  readonly id: string;
  readonly surface: 'list' | 'thread';
  readonly behaviour: string;
  readonly source: 'vol5 §5.3' | 'vol4 §5';
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const loadBehaviourMatrix = (): ReadonlyArray<BehaviourEntry> => {
  const raw = readFileSync(FIXTURE_PATH, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${FIXTURE_PATH} doit contenir un tableau JSON`);
  }
  return parsed as ReadonlyArray<BehaviourEntry>;
};

describe('behaviour-matrix.json — intégrité structurelle', () => {
  const matrix = loadBehaviourMatrix();

  it(`charge exactement ${EXPECTED_TOTAL} entrées (17 list + 15 thread, re-prouvé — pas 44)`, () => {
    expect(matrix).toHaveLength(EXPECTED_TOTAL);
  });

  it(`contient ${EXPECTED_LIST_ROWS} entrées "list" (vol. 5 §5.3, ids L01..L${String(EXPECTED_LIST_ROWS).padStart(2, '0')})`, () => {
    const listEntries = matrix.filter((entry) => entry.surface === 'list');
    expect(listEntries).toHaveLength(EXPECTED_LIST_ROWS);
    expect(listEntries.every((entry) => entry.source === 'vol5 §5.3')).toBe(true);
  });

  it(`contient ${EXPECTED_THREAD_ROWS} entrées "thread" (vol. 4 §5, ids F01..F${String(EXPECTED_THREAD_ROWS).padStart(2, '0')})`, () => {
    const threadEntries = matrix.filter((entry) => entry.surface === 'thread');
    expect(threadEntries).toHaveLength(EXPECTED_THREAD_ROWS);
    expect(threadEntries.every((entry) => entry.source === 'vol4 §5')).toBe(true);
  });

  it('a des ids UNIQUES sur l\'ensemble de la matrice', () => {
    const ids = matrix.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a des ids stables L01..L17 pour "list" et F01..F15 pour "thread", en ordre de document', () => {
    const listIds = matrix.filter((e) => e.surface === 'list').map((e) => e.id);
    const threadIds = matrix.filter((e) => e.surface === 'thread').map((e) => e.id);
    expect(listIds).toEqual(
      Array.from({ length: EXPECTED_LIST_ROWS }, (_, i) => `L${String(i + 1).padStart(2, '0')}`),
    );
    expect(threadIds).toEqual(
      Array.from({ length: EXPECTED_THREAD_ROWS }, (_, i) => `F${String(i + 1).padStart(2, '0')}`),
    );
  });

  it('a des champs id/surface/behaviour/source non vides pour CHAQUE entrée', () => {
    matrix.forEach((entry, index) => {
      expect(isNonEmptyString(entry.id), `entrée ${index}: id vide`).toBe(true);
      expect(isNonEmptyString(entry.behaviour), `entrée ${index} (${entry.id}): behaviour vide`).toBe(true);
      expect(
        entry.surface === 'list' || entry.surface === 'thread',
        `entrée ${index} (${entry.id}): surface invalide "${entry.surface}"`,
      ).toBe(true);
      expect(
        entry.source === 'vol5 §5.3' || entry.source === 'vol4 §5',
        `entrée ${index} (${entry.id}): source invalide "${entry.source}"`,
      ).toBe(true);
    });
  });

  it('lie chaque surface à sa source normative attendue (list ⇒ vol5 §5.3, thread ⇒ vol4 §5)', () => {
    matrix.forEach((entry) => {
      if (entry.surface === 'list') expect(entry.source).toBe('vol5 §5.3');
      if (entry.surface === 'thread') expect(entry.source).toBe('vol4 §5');
    });
  });
});

// ───────────────────────────────────────────────────────────────────────
// Mécanique de scan — garde d'ensemble (leçon 257 : « déclarés == couverts »,
// jamais une garde de présence individuelle — c'est la seule forme qui
// attrape le membre ajouté demain et oublié).
//
// Un id est COUVERT quand un fichier du dépôt contient le motif de référence
// littéral `behaviour-matrix:<id>` (commentaire ou nom de test) — n'importe
// où dans le texte du fichier, sur n'importe quelle plateforme (TS/TSX côté
// web/gateway, Swift côté iOS). Le motif est délibérément un marqueur
// textuel simple plutôt qu'une contrainte de nommage de fichier de test :
// ça laisse chaque plateforme référencer l'id dans le style qui lui est
// naturel (commentaire au-dessus d'un test XCTest, nom d'un test Vitest…).
// ───────────────────────────────────────────────────────────────────────

const DEFAULT_EXCLUDED_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  'out',
  'coverage',
  'DerivedData',
  'Pods',
  'xcuserdata',
  '.build',
  'target',
  '.venv',
  '__pycache__',
  '.expo',
]);

const REFERENCE_PATTERN = /behaviour-matrix:([A-Za-z0-9]+)/g;

type ScanOptions = {
  readonly excludedDirs?: ReadonlySet<string>;
};

/**
 * Parcourt récursivement `rootDir` et collecte tous les ids référencés via
 * le motif `behaviour-matrix:<id>`, tous fichiers confondus (hors
 * répertoires exclus). Retourne l'ensemble des ids trouvés — dédupliqués,
 * sans distinction de casse sur l'id lui-même (l'id est pris tel quel).
 *
 * Ne lève pas si `rootDir` n'existe pas ou est vide : retourne un ensemble
 * vide (contrairement à `loadVectors`, l'absence de couverture est l'état
 * NOMINAL avant armement de la garde — voir note d'armement plus bas).
 */
function scanBehaviourMatrixCoverage(rootDir: string, options: ScanOptions = {}): ReadonlySet<string> {
  const excludedDirs = options.excludedDirs ?? DEFAULT_EXCLUDED_DIRS;
  const covered = new Set<string>();

  const walk = (dir: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (excludedDirs.has(entry.name)) continue;
        walk(join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;

      const path = join(dir, entry.name);
      let content: string;
      try {
        content = readFileSync(path, 'utf-8');
      } catch {
        continue; // fichier binaire ou illisible — ignoré silencieusement
      }

      for (const match of content.matchAll(REFERENCE_PATTERN)) {
        const id = match[1];
        if (id) covered.add(id);
      }
    }
  };

  walk(rootDir);
  return covered;
}

describe('scanBehaviourMatrixCoverage — mécanique de scan (fixture temporaire)', () => {
  it('trouve un id référencé en commentaire ET un id référencé en nom de test, dans des fichiers imbriqués', () => {
    const root = mkdtempSync(join(tmpdir(), 'meeshy-behaviour-matrix-scan-'));
    try {
      mkdirSync(join(root, 'apps', 'web', '__tests__'), { recursive: true });
      mkdirSync(join(root, 'apps', 'ios', 'MeeshyTests'), { recursive: true });

      writeFileSync(
        join(root, 'apps', 'web', '__tests__', 'row.test.ts'),
        "// behaviour-matrix:ZZ01 — fixture de test, id synthétique\nit('affiche le typing', () => {});\n",
      );
      writeFileSync(
        join(root, 'apps', 'ios', 'MeeshyTests', 'FocalRowTests.swift'),
        "// behaviour-matrix:ZZ02\nfunc test_presence_dot_appliesRule135() {}\n",
      );

      const covered = scanBehaviourMatrixCoverage(root);
      expect(covered).toEqual(new Set(['ZZ01', 'ZZ02']));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('déduplique un même id référencé dans plusieurs fichiers', () => {
    const root = mkdtempSync(join(tmpdir(), 'meeshy-behaviour-matrix-scan-'));
    try {
      writeFileSync(join(root, 'a.test.ts'), '// behaviour-matrix:ZZ03\n');
      writeFileSync(join(root, 'b.test.ts'), '// behaviour-matrix:ZZ03 (aussi ici)\n');
      const covered = scanBehaviourMatrixCoverage(root);
      expect(covered).toEqual(new Set(['ZZ03']));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('IGNORE les répertoires exclus (node_modules) même s\'ils contiennent le motif', () => {
    const root = mkdtempSync(join(tmpdir(), 'meeshy-behaviour-matrix-scan-'));
    try {
      mkdirSync(join(root, 'node_modules', 'some-pkg'), { recursive: true });
      writeFileSync(join(root, 'node_modules', 'some-pkg', 'index.js'), '// behaviour-matrix:ZZ04\n');
      writeFileSync(join(root, 'real.test.ts'), '// behaviour-matrix:ZZ05\n');

      const covered = scanBehaviourMatrixCoverage(root);
      expect(covered).toEqual(new Set(['ZZ05']));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ne matche PAS un quasi-motif sans le séparateur ":" (pas de faux positif)', () => {
    const root = mkdtempSync(join(tmpdir(), 'meeshy-behaviour-matrix-scan-'));
    try {
      writeFileSync(join(root, 'near-miss.test.ts'), '// behaviour-matrix L01 (sans le deux-points)\n');
      const covered = scanBehaviourMatrixCoverage(root);
      expect(covered.size).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('retourne un ensemble VIDE (jamais une erreur) sur un répertoire racine sans aucune référence', () => {
    const root = mkdtempSync(join(tmpdir(), 'meeshy-behaviour-matrix-scan-'));
    try {
      writeFileSync(join(root, 'empty.test.ts'), 'it("rien à voir ici", () => {});\n');
      const covered = scanBehaviourMatrixCoverage(root);
      expect(covered.size).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('retourne un ensemble VIDE sur un répertoire racine inexistant (pas de throw)', () => {
    const covered = scanBehaviourMatrixCoverage(join(tmpdir(), 'meeshy-behaviour-matrix-scan-does-not-exist'));
    expect(covered.size).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────
// LA GARDE D'ENSEMBLE — déclarés == couverts (leçon 257).
//
// CONTRAT D'ARMEMENT (décision documentée ici, pas seulement dans le
// commit) : à la date d'écriture (2026-08-15, vague V1, tâche C-027),
// AUCUN test d'AUCUNE plateforme ne référence encore un id
// `behaviour-matrix:*` — les vagues V2 (miroirs Swift), V3 (iOS), V4 (web)
// et V5 (gateway/Rivière) sont celles qui écriront ces références au fil
// de l'implémentation de chaque comportement.
//
// Si cette garde tournait ACTIVE dès maintenant, elle serait rouge en
// permanence pendant tout V2→V4 (32 ids déclarés, 0 couverts) — un rouge
// permanent n'est PAS un signal, c'est du bruit que l'équipe apprend à
// ignorer, ce qui est pire que l'absence de garde. Elle est donc écrite
// intégralement (mécanique réelle, ci-dessus, déjà testée) mais démontée
// via `describe.skip`, avec ce commentaire contractuel comme seule preuve
// de son existence tant qu'elle ne tourne pas.
//
// CRITÈRE D'ARMEMENT — qui doit la retourner à `describe` (active) :
//   1. au moins UN test d'UNE plateforme référence un id `behaviour-matrix:*`
//      (armement PROGRESSIF possible dès le premier id couvert : à ce
//      moment la garde devient utile — elle empêche une régression sur
//      les ids déjà couverts — mais reste informative, pas bloquante,
//      tant que la couverture est partielle) ;
//   2. elle devient BLOQUANTE (CI rouge = build cassé, pas seulement
//      "à corriger plus tard") à la PORTE V1 (fin de vague V3, revue REV-3
//      — voir `tasks/lentille-workshop-execution.md` §4) : à cette porte,
//      la totalité des comportements iOS de la matrice doit être couverte,
//      et web/gateway suivent aux portes V2/V3 sans qu'un id retombe à
//      découvert.
// Jusqu'à la Porte V1, un id manquant est un TRAVAIL RESTANT connu (les
// vagues ne sont pas closes) — pas une régression. Après la Porte V1, un
// id manquant EST une régression : la garde doit alors échouer la build.
// ───────────────────────────────────────────────────────────────────────
describe.skip('behaviour-matrix — garde d\'ensemble déclarés == couverts (DÉSARMÉE — voir contrat d\'armement ci-dessus, arme à la Porte V1)', () => {
  it('chaque id déclaré dans behaviour-matrix.json est référencé par au moins un test du dépôt', () => {
    const matrix = loadBehaviourMatrix();
    const declaredIds = new Set(matrix.map((entry) => entry.id));
    const coveredIds = scanBehaviourMatrixCoverage(REPO_ROOT);

    const missing = [...declaredIds].filter((id) => !coveredIds.has(id));
    const extra = [...coveredIds].filter((id) => !declaredIds.has(id));

    expect(missing, `ids déclarés mais NON couverts par un test : ${missing.join(', ')}`).toEqual([]);
    expect(extra, `ids référencés par un test mais absents de behaviour-matrix.json : ${extra.join(', ')}`).toEqual([]);
  });
});
