import { readFileSync } from 'fs';
import { relative, sep } from 'path';

import { blankOutNonCode, walk } from './detached-promise-catch-sweep';

/**
 * Un rappel de minuterie BRUT dont la levée ou le rejet n'est pas gardé (#9480).
 *
 * La pile d'un rappel de `setInterval` / `setTimeout` part de la boucle
 * d'événements : aucun `try/catch` englobant n'existe à invoquer. Une levée
 * synchrone y termine le processus, une promesse rendue et abandonnée aussi.
 * La garde unique est `guardedInterval` / `guardedTimeout`
 * (`src/utils/guarded-timer.ts`).
 */
export interface UnguardedTimerCallback {
  /** Chemin relatif à la racine balayée, pour que la clé ne dérive pas avec le dépôt. */
  readonly file: string;
  readonly timer: 'setInterval' | 'setTimeout';
  /**
   * Comment le rappel se LIT au site — la réparation est la même pour les trois :
   * - `inline` : une fonction fléchée synchrone, corps visible ;
   * - `reference` : un identifiant ou un membre, corps invisible au site ;
   * - `async-function` : une fonction `async`, dont la promesse est abandonnée
   *   sans même un `void` — hors de portée du cliquet des promesses détachées.
   */
  readonly form: 'inline' | 'reference' | 'async-function';
  /** Le rappel, dépouillé et borné — jamais un numéro de ligne (règle du cycle 87 bis). */
  readonly callback: string;
}

const CALLBACK_KEY_LENGTH = 120;

/** La primitive elle-même arme la minuterie brute : c'est l'unique endroit où elle a le droit de vivre. */
const PRIMITIVE_FILE = 'utils/guarded-timer.ts';

/**
 * Un APPEL de minuterie globale — jamais une méthode homonyme d'un objet
 * (`job.setInterval(5)`), d'où le refus d'un `.` ou d'un identifiant juste
 * avant, sauf `globalThis.` / `global.` qui désignent bien la globale.
 */
const TIMER_CALL = /(?<![\w$.])(?:(?:globalThis|global)\.)?(setInterval|setTimeout)\(/g;

/**
 * Les seuls rappels bruts admis : ceux qui ne peuvent pas lever. `resolve` /
 * `reject` d'une promesse, nus ou appelés en ligne avec des arguments sans
 * autre appel qu'un `new …Error(…)`.
 */
const SETTLER_REFERENCE = /^(resolve|reject)$/;
const SETTLER_ARROW = /^\(\s*\)\s*=>\s*(?:\{\s*)?(?:resolve|reject)\(([\s\S]*)\)\s*;?\s*\}?$/;

function isSettler(callback: string): boolean {
  if (SETTLER_REFERENCE.test(callback)) return true;
  const arrow = SETTLER_ARROW.exec(callback);
  if (!arrow) return false;
  const args = arrow[1].replace(/new\s+\w*Error\(/g, '');
  return !args.includes('(') && !args.includes('=>');
}

/**
 * Lit les arguments à partir de l'offset qui suit la parenthèse ouvrante,
 * jusqu'à la parenthèse fermante de MÊME niveau. Rend le premier argument
 * (coupé à la première virgule de niveau 0) et l'offset de la fermante.
 */
function readFirstArgument(code: string, start: number): { first: string; firstEnd: number; close: number } {
  let depth = 0;
  let firstEnd = -1;
  let i = start;
  while (i < code.length) {
    const c = code[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) break;
      depth -= 1;
    } else if (c === ',' && depth === 0 && firstEnd < 0) firstEnd = i;
    i += 1;
  }
  const end = firstEnd < 0 ? i : firstEnd;
  return { first: code.slice(start, end), firstEnd: end, close: i };
}

/**
 * Une DÉCLARATION de méthode nommée `setInterval` (`setInterval(minutes: number): void {`,
 * ou sa signature dans un type littéral) n'arme rien. Elle ouvre une ligne ou
 * suit `{` / `;` / `,`, et sa liste de paramètres est suivie d'un type de
 * retour ou d'un corps — là où un appel serait suivi d'un `;`, d'un `.` ou d'une
 * fermante.
 */
function isMethodDeclaration(code: string, matchIndex: number, close: number): boolean {
  const lineStart = code.lastIndexOf('\n', matchIndex - 1) + 1;
  const before = code.slice(lineStart, matchIndex);
  if (!/(?:^|[{;,])\s*(?:(?:public|private|protected|static|async|override)\s+)*$/.test(before)) return false;
  return /^\s*[:{]/.test(code.slice(close + 1));
}

function formOf(callback: string): UnguardedTimerCallback['form'] {
  if (/^async\b/.test(callback)) return 'async-function';
  if (callback.includes('=>') || /^function\b/.test(callback)) return 'inline';
  return 'reference';
}

/**
 * Tous les rappels de minuterie BRUTS de production dont la levée ou le rejet
 * n'est pas gardé. Comme le cliquet des promesses détachées, le balayage ne
 * suit pas l'appel : « le corps ne lève pas » est une propriété du
 * collaborateur, qui change sans que le site rougisse ; la garantie appartient
 * au SITE.
 */
export function sweepUnguardedTimerCallbacks(srcDir: string): UnguardedTimerCallback[] {
  const found: UnguardedTimerCallback[] = [];
  for (const file of walk(srcDir).sort()) {
    const relativePath = relative(srcDir, file).split(sep).join('/');
    if (relativePath === PRIMITIVE_FILE) continue;
    const raw = readFileSync(file, 'utf8');
    const code = blankOutNonCode(raw);
    TIMER_CALL.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TIMER_CALL.exec(code)) !== null) {
      const start = match.index + match[0].length;
      const { first, firstEnd, close } = readFirstArgument(code, start);
      if (isMethodDeclaration(code, match.index, close)) continue;
      const callback = first.trim().replace(/\s+/g, ' ');
      if (isSettler(callback)) continue;
      found.push({
        file: relativePath,
        timer: match[1] as UnguardedTimerCallback['timer'],
        form: formOf(callback),
        callback: raw.slice(start, firstEnd).trim().replace(/\s+/g, ' ').slice(0, CALLBACK_KEY_LENGTH),
      });
    }
  }
  return found;
}
