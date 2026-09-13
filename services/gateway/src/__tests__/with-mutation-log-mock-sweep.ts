import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Un double de `utils/withMutationLog` trop étroit (#6294).
 *
 * `withMutationLog` n'est qu'UNE des trois exportations du module :
 * `MutationResultGone` (une CLASSE dont les routes font `instanceof`) et
 * `withMutationOutcome` (le chemin réel du repost) en sont deux autres. Une
 * usine `jest.mock` qui ne rend que `withMutationLog` laisse les deux autres
 * à `undefined` — `instanceof undefined` lève un `TypeError`, appeler
 * `undefined()` aussi, et les deux se déguisent en 500 sur des chemins
 * d'erreur SANS RAPPORT avec ce que le fichier teste (#6293).
 *
 * Le remède est d'étaler le module réel avant de surcharger
 * `withMutationLog` : `...(jest.requireActual('<module>') as object)`. Le
 * cast est EXIGÉ, pas cosmétique : `jest.requireActual` rend `unknown`, que
 * TypeScript refuse d'étaler (`TS2698`) — une suite entière cesse alors de se
 * CHARGER, ce qui a cassé `dev` une fois déjà (voir le commentaire de
 * l'issue). La forme générique `jest.requireActual<Record<string,
 * unknown>>(...)`, utilisée ailleurs dans le dépôt, est acceptée au même
 * titre.
 */
export interface NarrowWithMutationLogMock {
  /** Chemin relatif à `src/`, pour que la clé ne dérive pas avec le dépôt. */
  readonly file: string;
  /** Le chemin de module passé à `jest.mock`, tel qu'écrit dans le fichier. */
  readonly modulePath: string;
  readonly reason: 'requireActual absent' | 'requireActual non casté (`as object` ou générique requis)';
  /** La première ligne de l'appel — jamais un numéro de ligne, qui dérive. */
  readonly snippet: string;
}

/** Les commentaires citent la forme fautive pour l'expliquer — c'est leur rôle. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Le garde lui-même porte, dans ses fixtures en mémoire, le TEXTE littéral
 * des formes fautives qu'il détecte (§ contre-épreuve) — l'exclure de sa
 * propre inventaire est donc nécessaire, pas cosmétique : sans cette ligne,
 * le balayage se signale lui-même comme site fautif.
 */
const SWEEP_TEST_FILE = 'with-mutation-log-mock-sweep.test.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      walk(full, out);
      continue;
    }
    if (entry.endsWith('.test.ts') && entry !== SWEEP_TEST_FILE) out.push(full);
  }
  return out;
}

const MOCK_CALL = /jest\.mock\(\s*(['"])((?:(?!\1).)*utils\/withMutationLog)\1/g;

/**
 * Extrait l'appel `jest.mock(...)` en ENTIER, quelle que soit la forme du
 * corps de l'usine — objet littéral (`() => ({ … })`, fermé par `}));`) ou
 * fonction (`() => { …; return { … }; }`, fermée par `});`). Compter la
 * profondeur des parenthèses est ce qui rend l'extraction indépendante de la
 * forme : les deux usines rencontrées dans le dépôt (#6294) sont l'une et
 * l'autre.
 */
function extractCall(source: string, startIndex: number): string {
  const openParenIndex = source.indexOf('(', startIndex);
  let depth = 0;
  for (let i = openParenIndex; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')') {
      depth--;
      if (depth === 0) return source.slice(startIndex, i + 1);
    }
  }
  return source.slice(startIndex);
}

function verdictFor(
  block: string,
  modulePath: string,
): 'ok' | NarrowWithMutationLogMock['reason'] {
  const escaped = modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // La clause générique peut s'imbriquer (`requireActual<Record<string,
  // unknown>>(...)`) : `[^(]*` — tout sauf une parenthèse ouvrante, jamais
  // `[^>]*` — est ce qui laisse `<Record<string, unknown>>` s'apparier en
  // entier plutôt que de s'arrêter au premier `>` rencontré.
  const requireActualRe = new RegExp(
    `jest\\.requireActual(<[^(]*>)?\\(\\s*['"]${escaped}['"]\\s*\\)(\\s*as\\s+object)?`,
  );
  const match = requireActualRe.exec(block);
  if (!match) return 'requireActual absent';
  const isGeneric = !!match[1];
  const isCast = !!match[2];
  return isGeneric || isCast ? 'ok' : 'requireActual non casté (`as object` ou générique requis)';
}

/**
 * Balaye le contenu d'UN fichier — séparé de `sweepNarrowWithMutationLogMocks`
 * pour que la contre-épreuve du garde s'exerce sur une chaîne en mémoire,
 * jamais sur un fichier fixture nommé `*.test.ts` : `jest.config.json`
 * (`testMatch`) ramasserait un tel fixture dans la suite réelle, et un
 * fichier sans aucun `it()` fait échouer Jest AVANT même d'atteindre ce
 * garde.
 */
export function findNarrowWithMutationLogMocks(
  source: string,
  file: string,
): NarrowWithMutationLogMock[] {
  const found: NarrowWithMutationLogMock[] = [];
  const stripped = stripComments(source);

  MOCK_CALL.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MOCK_CALL.exec(stripped))) {
    const modulePath = match[2];
    const block = extractCall(stripped, match.index);
    const verdict = verdictFor(block, modulePath);
    if (verdict === 'ok') continue;
    found.push({
      file,
      modulePath,
      reason: verdict,
      snippet: block.split('\n')[0].trim(),
    });
  }

  return found;
}

/**
 * Balaye `src/` entier — pas seulement les répertoires `posts/` ou
 * `directory/` où vivaient les 41 doubles fautifs mesurés par #6294 : rien ne
 * borne un futur double étroit à ces répertoires.
 */
export function sweepNarrowWithMutationLogMocks(srcDir: string): NarrowWithMutationLogMock[] {
  const found: NarrowWithMutationLogMock[] = [];

  for (const file of walk(srcDir)) {
    const relative = file.slice(srcDir.length + 1);
    found.push(...findNarrowWithMutationLogMocks(readFileSync(file, 'utf8'), relative));
  }

  return found;
}
