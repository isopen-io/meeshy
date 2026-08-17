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

// Le fichier de la garde LUI-MÊME (ce fichier) — son chemin absolu, calculé
// une fois. Ses fixtures de démonstration ci-dessus (ZZ01..ZZ05, dans les
// `describe('scanBehaviourMatrixCoverage — mécanique de scan …')`) posent le
// motif `behaviour-matrix:ZZ0x` en DUR, dans des chaînes de caractères
// littérales — jamais écrites sur disque (elles vivent dans des répertoires
// temporaires créés puis détruits par CHAQUE test via `mkdtempSync`/
// `rmSync`). Sans cette exclusion, un balayage de `REPO_ROOT` qui inclurait
// ce fichier-ci trouverait quand même ZZ01..ZZ05 dans SON PROPRE texte
// source (les littéraux `"// behaviour-matrix:ZZ01 — …"` etc., ci-dessus) et
// les compterait comme des ids « couverts » — un faux positif qui n'a rien à
// voir avec `declaredIds` (L01..L17/F01..F15) mais qui, plus grave, ne fait
// JAMAIS échouer la garde d'ensemble : ces ids ZZ0x ne sont pas dans
// `behaviour-matrix.json`, donc ils rentreraient dans `extra` — CE QUE LA
// GARDE EST CENSÉE DÉTECTER. Autrement dit, la garde continuerait à
// détecter son propre bruit de fixture, indéfiniment, même une fois les 32
// ids réels tous couverts par de vrais tests — un rouge permanent qui
// masquerait le signal réel. La correction n'exclut QUE ce fichier précis
// (jamais un répertoire entier, jamais une exclusion par nom générique) :
// tout autre fichier du dépôt, y compris d'autres fichiers de test, reste
// balayé normalement.
const SELF_TEST_FILE_PATH = fileURLToPath(import.meta.url);

type ScanOptions = {
  readonly excludedDirs?: ReadonlySet<string>;
  readonly excludedFiles?: ReadonlySet<string>;
};

// Borne de LECTURE (Q-145, 2026-08-17) : le jumeau jest de cette garde avait
// été rendu déterministe par V4bis/B5 (« borner, pas relever le seuil ») —
// ce fichier vitest ne l'avait jamais été, et le run complet le tuait au
// timeout de 5 s (vert isolé à 2,9 s : contenu juste, budget faux). Un jeton
// `behaviour-matrix:<id>` ne vit que dans du code ou de la doc de code —
// lire bun.lock, les images ou les .jsonl d'audit ne peut RIEN découvrir.
// Sens de sûreté : si un jeton vivait dans un type exclu, son id tomberait
// dans `missing` et la garde ROUGIRAIT — l'exclusion ne peut pas verdir à
// tort.
const SCANNED_EXTENSIONS: ReadonlySet<string> = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.swift', '.kt', '.kts', '.md', '.sh', '.yml', '.yaml',
]);

function hasScannedExtension(fileName: string): boolean {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 && SCANNED_EXTENSIONS.has(fileName.slice(dot).toLowerCase());
}

/**
 * Parcourt récursivement `rootDir` et collecte tous les ids référencés via
 * le motif `behaviour-matrix:<id>`, tous fichiers confondus (hors
 * répertoires exclus ET hors fichiers exclus — voir `excludedFiles`, qui
 * n'exclut par défaut QUE ce fichier de garde lui-même,
 * `SELF_TEST_FILE_PATH`). Retourne l'ensemble des ids trouvés — dédupliqués,
 * sans distinction de casse sur l'id lui-même (l'id est pris tel quel).
 *
 * Ne lève pas si `rootDir` n'existe pas ou est vide : retourne un ensemble
 * vide (contrairement à `loadVectors`, l'absence de couverture est l'état
 * NOMINAL avant armement de la garde — voir note d'armement plus bas).
 */
function scanBehaviourMatrixCoverage(rootDir: string, options: ScanOptions = {}): ReadonlySet<string> {
  const excludedDirs = options.excludedDirs ?? DEFAULT_EXCLUDED_DIRS;
  const excludedFiles = options.excludedFiles ?? new Set([SELF_TEST_FILE_PATH]);
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
      if (!hasScannedExtension(entry.name)) continue; // borne Q-145 — voir SCANNED_EXTENSIONS

      const path = join(dir, entry.name);
      if (excludedFiles.has(path)) continue; // le fichier de la garde lui-même — voir SELF_TEST_FILE_PATH

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

  it('exclut le fichier de la garde lui-même du balayage — ses fixtures internes ne se comptent jamais comme couvertes', () => {
    // Rejoue le bug réel corrigé ici : AVANT ce correctif, un balayage de
    // REPO_ROOT trouvait ZZ01..ZZ05 dans le texte SOURCE de ce fichier de
    // garde (les littéraux `writeFileSync(..., "// behaviour-matrix:ZZ01…")`
    // ci-dessus) et les comptait comme « couverts » — un faux positif dans
    // `extra`, jamais résolu, qui aurait gardé `describe.skip` inarmable
    // même à couverture complète des 32 ids réels. Le fichier « self » ici
    // simule ce fichier de garde (littéral `behaviour-matrix:ZZ99` en dur,
    // exactement comme ZZ01..ZZ05 le sont plus haut) ; le fichier « other »
    // simule un VRAI test ailleurs dans le dépôt. L'exclusion ne retire QUE
    // « self », jamais « other ».
    const root = mkdtempSync(join(tmpdir(), 'meeshy-behaviour-matrix-scan-'));
    try {
      const selfPath = join(root, 'behaviour-matrix.test.ts');
      writeFileSync(selfPath, '// behaviour-matrix:ZZ99 (fixture auto-référente, comme ZZ01..ZZ05 dans ce fichier de garde)\n');
      const otherPath = join(root, 'real-suite.test.ts');
      writeFileSync(otherPath, '// behaviour-matrix:ZZ98 — un test réel, ailleurs\n');

      const covered = scanBehaviourMatrixCoverage(root, { excludedFiles: new Set([selfPath]) });

      expect(covered).toEqual(new Set(['ZZ98']));
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
// ARMÉE À LA PORTE V1 (REV-3, blocker B1, 2026-08-16). Le contrat
// d'armement ci-dessous (écrit le 2026-08-15) posait deux conditions :
//   1. armement PROGRESSIF dès le premier id couvert — franchi ;
//   2. BLOQUANTE à la Porte V1 (fin de vague V3, revue REV-3) — CETTE
//      porte. Les 32 ids (L01..L17, F01..F15) sont désormais référencés
//      par un test RÉEL d'au moins une plateforme (iOS — voir le mapping
//      complet dans le rapport de la tâche REV-3/B1) : `describe.skip` est
//      retiré, la garde est ACTIVE et BLOQUANTE. Un id qui retomberait à
//      découvert après ce commit EST une régression — la garde échoue la
//      build, comme prévu par le critère d'armement ci-dessous.
//
// CONTRAT D'ARMEMENT ORIGINAL (conservé pour mémoire — décision documentée
// ici, pas seulement dans le commit) : à la date d'écriture (2026-08-15,
// vague V1, tâche C-027), AUCUN test d'AUCUNE plateforme ne référençait
// encore un id `behaviour-matrix:*` — les vagues V2 (miroirs Swift), V3
// (iOS), V4 (web) et V5 (gateway/Rivière) sont celles qui écriraient ces
// références au fil de l'implémentation de chaque comportement.
//
// Si cette garde avait tourné ACTIVE dès l'écriture, elle aurait été rouge
// en permanence pendant tout V2→V4 (32 ids déclarés, 0 couverts) — un
// rouge permanent n'est PAS un signal, c'est du bruit que l'équipe apprend
// à ignorer, ce qui est pire que l'absence de garde. Elle a donc été écrite
// intégralement (mécanique réelle, ci-dessus, déjà testée) mais démontée
// via `describe.skip`, avec ce commentaire contractuel comme seule preuve
// de son existence tant qu'elle ne tournait pas.
//
// CRITÈRE D'ARMEMENT — qui devait la retourner à `describe` (active) :
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
// Jusqu'à la Porte V1, un id manquant était un TRAVAIL RESTANT connu (les
// vagues n'étaient pas closes) — pas une régression. Après la Porte V1
// (maintenant), un id manquant EST une régression : la garde échoue la
// build.
// ───────────────────────────────────────────────────────────────────────
describe('behaviour-matrix — garde d\'ensemble déclarés == couverts (ARMÉE à la Porte V1, REV-3/B1 — bloquante)', () => {
  it('chaque id déclaré dans behaviour-matrix.json est référencé par au moins un test du dépôt', () => {
    const matrix = loadBehaviourMatrix();
    const declaredIds = new Set(matrix.map((entry) => entry.id));
    const coveredIds = scanBehaviourMatrixCoverage(REPO_ROOT);

    const missing = [...declaredIds].filter((id) => !coveredIds.has(id));
    const extra = [...coveredIds].filter((id) => !declaredIds.has(id));

    expect(missing, `ids déclarés mais NON couverts par un test : ${missing.join(', ')}`).toEqual([]);
    expect(extra, `ids référencés par un test mais absents de behaviour-matrix.json : ${extra.join(', ')}`).toEqual([]);
    // Budget explicite : ce témoin PARCOURT LE DÉPÔT ENTIER en synchrone
    // (`walk` + `readFileSync` sur chaque fichier de test) — ~4,2 s seul sur un
    // runner de CI, contre le `testTimeout` de 5 s par défaut de Vitest. La
    // marge était donc de quelques centaines de millisecondes, et elle
    // s'évapore dès que la suite complète tourne : les 82 autres fichiers se
    // disputent le CPU, et ce test-ci dépasse.
    //
    // C'est le flake `packages/shared` que le cycle 61 bis n'avait pas su
    // nommer (piste n°3, restée ouverte quatre cycles) : il ne rougissait
    // jamais seul, seulement en suite, et son message — « Test timed out » —
    // ne désignait aucune régression. Il n'y en avait pas : le témoin fait un
    // travail d'I/O que 5 s ne payent pas.
    //
    // Le budget se resserre à CHAQUE fichier de test ajouté au dépôt, ce qui
    // en fait une bombe à retardement pour tout lot un peu large — celui du
    // cycle 63 en ajoute quatre. 60 s laissent la marge d'un ordre de
    // grandeur, sans masquer une vraie régression : un balayage qui prendrait
    // une minute signalerait un tout autre problème.
  }, 60_000);
});
