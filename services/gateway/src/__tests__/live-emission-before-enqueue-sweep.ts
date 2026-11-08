import { readFileSync } from 'fs';
import { join, relative, sep } from 'path';

import { blankOutNonCode, walk } from './detached-promise-catch-sweep';

/**
 * Une émission VIVANTE, NON GARDÉE, en amont d'un enfilage DURABLE dans la MÊME
 * unité (#17026).
 *
 * `io.to(room).emit(...)` LÈVE quand l'adaptateur ou l'encodeur est en défaut —
 * une affirmation du dépôt, pas une hypothèse : `socketio/utils/emitWithSeq.ts`
 * l'écrit là où il s'en garde. Quand un tel appel précède une mise en file hors
 * ligne **dans le même `try`**, la diffusion tombée annule l'enfilage, et le
 * `catch` de fin de méthode journalise une perte cosmétique. Le message —
 * l'édition, la suppression, la traduction, la pièce enrichie — est déjà
 * persisté et déjà acquitté ; la file était sa dernière voie, et plus rien ne
 * rejoue.
 *
 * ─── Pourquoi un CLIQUET et pas une règle écrite ─────────────────────────────
 *
 * La règle ÉTAIT écrite, deux fois, dans les deux unités qui l'appliquent le
 * mieux (le § « Sa PLACE fait partie de la garantie » de
 * `MessageHandler.broadcastNewMessage` et son jumeau de `postMessageSyncFanOut`).
 * Les deux nomment ce qui vient APRÈS l'enfilage et aucun ne tire la conséquence
 * sur ce qui vient AVANT. L'issue #17026 a énuméré quatre sites ; la relecture
 * en a trouvé un cinquième, et ce balayage DEUX de plus — soit sept, dont trois
 * que personne n'avait vus. C'est la leçon 307 : une règle ne se propage pas
 * depuis son énoncé, elle vaut là où quelqu'un l'a récitée.
 *
 * ─── Ce que l'outil peut dire, et ce qu'il ne peut pas ───────────────────────
 *
 * Il est TEXTUEL. Il voit les appels d'enfilage par leur NOM, l'unité par
 * appariement d'accolades, et la garde par la position relative des blocs. Il ne
 * suit aucun alias, aucune indirection, aucun appel de méthode qui enfile pour
 * le compte d'un autre. Un site qui enfile par un helper d'un nom inconnu de
 * {@link ENQUEUE_CALLS} lui échappe, et c'est la limite à redire avant de lire
 * son vert comme une preuve.
 *
 * Il se TAIT en revanche, par construction, sur les deux formes de garde
 * légitimes — un `try` qui n'englobe PAS l'enfilage, et un enrobage
 * best-effort — parce que la seconde EST la réparation : un cliquet qui
 * désignerait le correctif comme le défaut enseignerait l'inverse de sa règle.
 *
 * **Quand il tombe, la réparation est `emitLiveBestEffort` (ou un `try` qui
 * s'arrête avant l'enfilage), jamais une ligne d'inventaire** — il n'y a pas
 * d'émission vivante non gardée légitime en amont d'une garantie durable.
 */
export interface UnguardedLiveEmission {
  /** Chemin relatif à `src/`, pour que la clé ne dérive pas avec le dépôt. */
  readonly file: string;
  /**
   * L'expression d'émission, dépouillée et bornée — jamais un numéro de ligne,
   * qui dérive à la première édition et transforme le cliquet en bruit
   * (règle du cycle 87 bis).
   */
  readonly emission: string;
}

const EXPRESSION_KEY_LENGTH = 90;

/**
 * Les noms qui ENFILENT durablement. Les quatre du dépôt au 2026-11-08 ; un
 * cinquième nom se déclare ici, et son absence est la limite ci-dessus.
 */
const ENQUEUE_CALLS = [
  'enqueueForOfflineParticipants',
  '_enqueueOfflineEventForParticipants',
  'enqueueOfflineMessageMutation',
  'deliveryQueue.enqueue',
] as const;

const ENQUEUE_RE = /\b(?:enqueueForOfflineParticipants|_enqueueOfflineEventForParticipants|enqueueOfflineMessageMutation|deliveryQueue\s*\.\s*enqueue)\s*\(/g;
const EMIT_RE = /\.\s*emit\s*\(/g;
/** Les enrobages qui FONT la garde — les reconnaître, c'est reconnaître le correctif. */
const WRAPPER_RE = /\b(?:emitLiveBestEffort|emitMessageNewBestEffort)\s*\(/g;
/** Une DÉCLARATION n'est pas un appel : sans ce filtre, deux faux positifs sur quatre. */
const DECLARATION_BEFORE = /(?:private|public|protected|function|async)\s+$/;

/** Les blocs délimités par `open`/`close` qui suivent chaque occurrence de `re`. */
function spansAfter(source: string, re: RegExp, open: string, close: string): Array<readonly [number, number]> {
  const spans: Array<readonly [number, number]> = [];
  const scanner = new RegExp(re.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = scanner.exec(source)) !== null) {
    const start = match.index + match[0].length - 1;
    let depth = 0;
    let cursor = start;
    for (; cursor < source.length; cursor += 1) {
      if (source[cursor] === open) depth += 1;
      else if (source[cursor] === close) {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    spans.push([start, cursor] as const);
  }
  return spans;
}

/**
 * Le début de l'unité (fonction, méthode, fermeture) qui contient `offset`.
 *
 * Remontée par NIVEAU d'accolade : la première accolade ouvrante non appariée
 * au-dessus de `offset` ouvre son unité. On ne cherche pas le nom de la
 * fonction — il ne sert à rien ici, et le chercher ferait dépendre l'outil de
 * la forme de la déclaration.
 */
function unitStart(source: string, offset: number): number {
  let depth = 0;
  for (let cursor = offset; cursor >= 0; cursor -= 1) {
    if (source[cursor] === '}') depth += 1;
    else if (source[cursor] === '{') {
      if (depth === 0) return cursor;
      depth -= 1;
    }
  }
  return 0;
}

const contains = ([open, close]: readonly [number, number], offset: number): boolean =>
  open < offset && offset < close;

/**
 * Balaie `srcDir` et rend les émissions vivantes non gardées en amont d'un
 * enfilage durable. Les fichiers de test sont hors périmètre : un double a le
 * droit d'être permissif.
 */
export function sweepUnguardedLiveEmissions(srcDir: string): UnguardedLiveEmission[] {
  const found: UnguardedLiveEmission[] = [];

  for (const file of walk(srcDir)) {
    if (!file.endsWith('.ts') || file.endsWith('.d.ts')) continue;
    const relativePath = relative(srcDir, file).split(sep).join('/');
    if (relativePath.includes('__tests__/') || relativePath.endsWith('.test.ts')) continue;

    const raw = readFileSync(file, 'utf8');
    if (!ENQUEUE_CALLS.some((name) => raw.includes(name.replace('.', '')) || raw.includes(name))) continue;

    const code = blankOutNonCode(raw);
    const tries = spansAfter(code, /\btry\s*\{/, '{', '}');
    const wrappers = spansAfter(code, WRAPPER_RE, '(', ')');

    const enqueues = new RegExp(ENQUEUE_RE.source, 'g');
    let enqueue: RegExpExecArray | null;
    while ((enqueue = enqueues.exec(code)) !== null) {
      if (DECLARATION_BEFORE.test(code.slice(Math.max(0, enqueue.index - 24), enqueue.index))) continue;
      const enqueueAt = enqueue.index;
      const start = unitStart(code, enqueueAt);

      const emits = new RegExp(EMIT_RE.source, 'g');
      emits.lastIndex = start;
      let emit: RegExpExecArray | null;
      while ((emit = emits.exec(code)) !== null && emit.index < enqueueAt) {
        const emitAt = emit.index;
        const guardedByTry = tries.some((span) => contains(span, emitAt) && !contains(span, enqueueAt));
        const guardedByWrapper = wrappers.some((span) => contains(span, emitAt));
        if (guardedByTry || guardedByWrapper) continue;
        found.push({
          file: relativePath,
          emission: raw
            .slice(Math.max(0, emitAt - EXPRESSION_KEY_LENGTH), emitAt + 20)
            .replace(/\s+/g, ' ')
            .trim(),
        });
      }
    }
  }

  return found;
}

export const GATEWAY_SRC = join(__dirname, '..');

/**
 * VIDE, et c'est un état à défendre. Quand le cliquet tombe : enrober l'émission
 * (`emitLiveBestEffort`), ou borner le `try` AVANT l'enfilage. Jamais ajouter
 * une ligne ici.
 */
export const FROZEN_UNGUARDED_LIVE_EMISSIONS: readonly UnguardedLiveEmission[] = [];
