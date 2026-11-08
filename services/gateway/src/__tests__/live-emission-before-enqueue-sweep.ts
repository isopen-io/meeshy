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
 * appariement d'accolades, et la garde par la position relative des blocs. Ses
 * limites sont données avec leur CHIFFRE, parce qu'« un inventaire à la main »
 * sans ordre de grandeur ne dit pas s'il manque un nom ou vingt :
 *
 * 1. **{@link EMIT_HELPERS} couvre 4 des 24 helpers qui émettent sans se
 *    garder.** Mesuré au second passage de l'audit : 40 fonctions exportées du
 *    gateway émettent, 24 ne portent ni `try`, ni `safeBroadcast`, ni `safely`.
 *    Les vingt autres n'apparaissent dans AUCUNE fenêtre d'enfilage
 *    aujourd'hui — donc aucun site n'échappe pour l'instant — mais le rapport
 *    est d'un sixième, et l'inventaire sera faux le premier jour où l'une
 *    d'elles est appelée en amont d'un enfilage. **Ce n'est pas réparable par un
 *    meilleur inventaire : c'est la limite de l'outil.**
 * 2. Un site qui enfile par un helper d'un nom inconnu de
 *    {@link ENQUEUE_CALLS} lui échappe. Le délégué
 *    `syncConversationListOnNewMessage` y figure pour cette raison ; un futur
 *    délégué n'y figurera pas tout seul.
 * 3. **Une FERMETURE définie avant l'enfilage est un faux positif.** Un
 *    `const later = () => io.to(r).emit(…)` suivi d'un enfilage puis d'un
 *    `setTimeout(later, …)` est signalé, alors que l'émission n'est en amont
 *    que dans le TEXTE. Aucune instance vivante. Devant un constat, vérifier
 *    que l'émission est dans le FLOT et pas seulement au-dessus dans le
 *    fichier.
 * 4. Il ne voit pas du tout la moitié « LECTURE non gardée » de la famille
 *    (#17026 en nommait quatre sites) : seules les ÉMISSIONS sont balayées.
 *
 * Ces quatre limites sont la raison pour laquelle son vert n'est pas une preuve
 * d'absence. Elles sont écrites ici parce que la première version n'en
 * déclarait qu'une — la 2 — et que l'omission de la 1 lui a fait certifier
 * propres quatre des sept sites que son propre lot venait de corriger.
 *
 * Il se TAIT en revanche, par construction, sur les deux formes de garde
 * légitimes — un `try` qui n'englobe PAS l'enfilage, et un enrobage
 * best-effort — parce que la seconde EST la réparation : un cliquet qui
 * désignerait le correctif comme le défaut enseignerait l'inverse de sa règle.
 *
 * **Quand il tombe, la réparation est `safeBroadcast` (ou un `try` qui
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
 * Les noms qui ENFILENT durablement.
 *
 * La première version de ce tableau en portait QUATRE, sous un commentaire qui
 * disait « les quatre du dépôt au 2026-11-08 ». C'était faux : il y en a onze,
 * et l'audit adversarial l'a mesuré. Une énumération porte deux affirmations —
 * « ces entrées sont justes » et « ce sont toutes les entrées » — et seule la
 * première se vérifie en relisant (leçon 261). Celle-ci a été écrite dans le
 * cycle même qui publiait cette leçon.
 *
 * Relevé MÉCANIQUEMENT, jamais de mémoire :
 *   grep -rhoE '\b(enqueue[A-Za-z]*|_enqueue[A-Za-z]*)\s*\(' src --include=*.ts
 */
const ENQUEUE_CALLS = [
  'enqueueForOfflineParticipants',
  '_enqueueForOfflineParticipants',
  '_enqueueOfflineEventForParticipants',
  'enqueueOfflineMessageMutation',
  'enqueueOfflineLinkMessage',
  'enqueueOfflineReactionMutation',
  'enqueueOfflineReactionEvent',
  '_enqueueOfflineReactionEvent',
  '_enqueueOfflineAttachmentReactionEvent',
  'enqueuePersonalVisibilityMark',
  'enqueueStarMark',
  'deliveryQueue.enqueue',
  'queue.enqueue',
  // DÉLÉGUÉS — ils enfilent pour le compte de leur appelant, donc une émission
  // non gardée au-dessus de leur APPEL emporte l'enfilage aussi sûrement que
  // si le nom était écrit sur place. C'est la limite que le doc-comment
  // déclarait (« aucune méthode qui enfile pour le compte d'un autre »), et la
  // déclarer ne la referme pas : le quatrième site de #17026 vivait dedans, sur
  // le transport REST/ZMQ, où ce qui se perd est le message ENTIER.
  'syncConversationListOnNewMessage',
] as const;

const ENQUEUE_RE = new RegExp(
  '(?:' + ENQUEUE_CALLS.map((name) => name.replace('.', '\\s*\\.\\s*')).join('|') + ')\\s*\\(',
  'g',
);

/**
 * Une émission vivante, sous ses DEUX formes.
 *
 * La première version ne cherchait que `.emit(` TEXTUEL, et c'est la limite qui
 * a coûté le plus cher : **l'émission par HELPER est l'idiome dominant de ce
 * dépôt**, et quatre des sept sites que le lot #17026 venait de corriger —
 * plus un huitième qu'il n'avait pas vu — passent par un helper qui ne porte
 * aucun `.emit(` au site d'appel. Le cliquet les certifiait propres.
 *
 * Le doc-comment déclarait bien une limite, et elle ne parlait que de
 * l'ENFILAGE (« aucune méthode qui enfile pour le compte d'un autre ») : la
 * limite la plus coûteuse n'était pas écrite. Un cliquet qui SURDÉCLARE sa
 * portée coûte plus qu'un cliquet absent, parce qu'on cesse de chercher.
 *
 * N'entrent ici que les helpers qui NE SE GARDENT PAS eux-mêmes — vérifié
 * fichier par fichier. `broadcastToUser` (`utils/socket-broadcast.ts`) et
 * `safely()` (`sharedLocationRelay.ts`) s'enrobent en interne et sont donc
 * absents : les inscrire produirait des faux positifs, et un inventaire faux
 * se gèle en vérité de dépôt.
 */
const EMIT_HELPERS = [
  'emitServerEvent',
  'emitMessageNew',
  'emitEditedToReaders',
  'emitToConversationParticipants',
] as const;

const EMIT_RE = new RegExp(
  '(?:\\.\\s*emit\\s*\\(|\\b(?:' + EMIT_HELPERS.join('|') + ')\\s*\\()',
  'g',
);

/**
 * L'enrobage qui FAIT la garde — le reconnaître, c'est reconnaître le
 * correctif. Il n'y en a qu'UN (`safeBroadcast`, `socketio/serverEmit.ts`) :
 * un second avait été écrit pour #17026 avant qu'on remarque celui-ci, et il a
 * été supprimé — un cliquet qui doit reconnaître deux noms d'enrobage en
 * manquera un. `emitMessageNewBestEffort` en est une projection nommée.
 */
const WRAPPER_RE = /\b(?:safeBroadcast|emitMessageNewBestEffort)\s*\(/g;
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
 * Remontée par NIVEAU d'accolade, mais **jusqu'à une frontière de FONCTION** —
 * pas jusqu'à la première accolade ouvrante. La première version s'arrêtait là,
 * et l'erreur était systématique dans un sens : un enfilage placé dans un
 * `if (…) { … }` voyait sa fenêtre commencer à l'accolade du `if`, si bien que
 * l'émission située AU-DESSUS du `if` sortait du périmètre. Le cinquième site
 * de #17026 est exactement de cette forme, et le cliquet ne le voyait pas.
 *
 * Le test d'une frontière de fonction est la forme du texte qui PRÉCÈDE
 * l'accolade : `function`, `=>`, ou une liste de paramètres `)` éventuellement
 * suivie d'un type de retour. Une accolade de `if`, `for`, `while`, `try`,
 * `catch`, `else` ou de bloc nu n'en est pas une, et on continue de remonter.
 */
const FUNCTION_HEAD = /(?:function\b[^{};]*|=>|\)\s*(?::\s*[^{};]*)?)\s*$/;
const BLOCK_KEYWORD = /\b(?:if|for|while|switch|try|catch|finally|else|do)\s*$/;

/**
 * Le texte qui précède une accolade, son groupe de parenthèses APPARIÉ retiré.
 *
 * Sans ce retrait, `BLOCK_KEYWORD` exigeait `\([^()]*\)` et échouait donc sur
 * toute condition qui contient un appel — `if (rows.filter((r) => r).length)
 * {` — après quoi `FUNCTION_HEAD` matchait le `)` FINAL DE LA CONDITION et
 * `unitStart` s'arrêtait sur l'accolade du `if`. C'est-à-dire **la panne même
 * que ce lot venait de corriger**, réintroduite pour toute condition non
 * triviale, et le second passage de l'audit l'a prouvée sur jumelles.
 *
 * L'ordre compte autant que le retrait : on ne laisse jamais `FUNCTION_HEAD`
 * arbitrer un `)` qui appartient à une condition.
 */
function headBeforeBrace(source: string, brace: number): string {
  let end = brace - 1;
  while (end >= 0 && /\s/.test(source[end] as string)) end -= 1;
  if (source[end] === ')') {
    let depth = 0;
    for (; end >= 0; end -= 1) {
      if (source[end] === ')') depth += 1;
      else if (source[end] === '(') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    end -= 1;
    while (end >= 0 && /\s/.test(source[end] as string)) end -= 1;
  }
  return source.slice(Math.max(0, end - 400), end + 1);
}

function unitStart(source: string, offset: number): number {
  let depth = 0;
  for (let cursor = offset; cursor >= 0; cursor -= 1) {
    if (source[cursor] === '}') depth += 1;
    else if (source[cursor] === '{') {
      if (depth > 0) {
        depth -= 1;
        continue;
      }
      // Le mot-clé se lit PARENTHÈSES RETIRÉES, et il se lit AVANT
      // `FUNCTION_HEAD` — voir {@link headBeforeBrace}.
      if (BLOCK_KEYWORD.test(headBeforeBrace(source, cursor))) continue;
      if (FUNCTION_HEAD.test(source.slice(Math.max(0, cursor - 400), cursor))) return cursor;
      // Accolade de bloc nu ou de littéral d'objet : on continue de remonter.
    }
  }
  return 0;
}

const contains = ([open, close]: readonly [number, number], offset: number): boolean =>
  open < offset && offset < close;

/**
 * Le bloc le plus INTERNE qui contient `offset`, en offsets `[open, close]`.
 */
function innermostBlock(source: string, offset: number): readonly [number, number] | null {
  let depth = 0;
  for (let cursor = offset; cursor >= 0; cursor -= 1) {
    if (source[cursor] === '}') depth += 1;
    else if (source[cursor] === '{') {
      if (depth > 0) {
        depth -= 1;
        continue;
      }
      let inner = 0;
      for (let end = cursor; end < source.length; end += 1) {
        if (source[end] === '{') inner += 1;
        else if (source[end] === '}') {
          inner -= 1;
          if (inner === 0) return [cursor, end] as const;
        }
      }
      return null;
    }
  }
  return null;
}

/**
 * L'émission est-elle sur un chemin qui SORT avant d'atteindre l'enfilage ?
 *
 * Un balayage textuel ne modélise pas le flot de contrôle, et il n'a pas à le
 * faire en général — mais il doit reconnaître la CLAUSE DE GARDE, qui est la
 * forme dominante du faux positif. Mesuré : `ReactionHandler` émet
 * `SERVER_EVENTS.ERROR` dans un `if (!rateLimitAllowed) { … return; }`, bien
 * avant l'enfilage du chemin nominal. L'enfilage y est INATTEIGNABLE, et le
 * signaler enverrait chercher un défaut qui n'existe pas.
 *
 * La règle : si le bloc le plus interne qui contient l'émission se FERME avant
 * l'enfilage **et** porte un `return` ou un `throw` à son propre niveau, le
 * chemin sort. Un bloc qui se ferme sans sortir laisse le flot retomber sur
 * l'enfilage — on signale alors, et c'est juste.
 */
function exitsBeforeEnqueue(source: string, emitAt: number, enqueueAt: number): boolean {
  const block = innermostBlock(source, emitAt);
  if (!block || block[1] >= enqueueAt) return false;
  return exitsAtOwnLevel(source, block);
}

/**
 * Le bloc porte-t-il un `return` / `throw` À SON PROPRE NIVEAU ?
 *
 * Tester le corps ENTIER masquait un VRAI site, et le second passage de l'audit
 * l'a prouvé sur jumelles : un `return` dans une branche imbriquée — ou dans un
 * `.map()` du même bloc — faisait écarter une émission dont le flot retombe
 * pourtant sur l'enfilage. Seul un `return` au niveau du bloc prouve que le
 * chemin SORT.
 */
function exitsAtOwnLevel(source: string, [open, close]: readonly [number, number]): boolean {
  let depth = 0;
  const exit = /^(?:return|throw)\b/;
  for (let cursor = open + 1; cursor < close; cursor += 1) {
    const char = source[cursor];
    if (char === '{' || char === '(' || char === '[') depth += 1;
    else if (char === '}' || char === ')' || char === ']') depth -= 1;
    else if (depth === 0 && (char === 'r' || char === 't')) {
      const before = source[cursor - 1] ?? ' ';
      if (!/[A-Za-z0-9_$.]/.test(before) && exit.test(source.slice(cursor, cursor + 6))) return true;
    }
  }
  return false;
}

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
    if (!ENQUEUE_CALLS.some((name) => raw.includes(name.split('.')[0] as string))) continue;

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
        if (exitsBeforeEnqueue(code, emitAt, enqueueAt)) continue;
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

/**
 * La PORTÉE RÉELLE du balayage, mesurée par le balayage lui-même.
 *
 * Le témoin de couverture de la première version assertait `>= 10` sur une
 * liste de fichiers obtenue par une AUTRE regex, un AUTRE prédicat de fichier,
 * et sans dépouiller les commentaires — si bien qu'il comptait sept fichiers où
 * le nom n'apparaît que dans un commentaire. Il ne pouvait donc pas tomber le
 * jour où le balayage cesse d'atteindre quoi que ce soit : exactement le piège
 * qu'il se prévalait d'éviter (l'audit adversarial l'a mesuré).
 *
 * Un témoin de couverture doit interroger le MÊME code que ce qu'il couvre.
 * Celui-ci rend les positions d'enfilage réellement inspectées et le nombre
 * d'émissions candidates examinées — les deux quantités dont dépend la capacité
 * du cliquet à rendre un constat.
 */
export function sweepReach(srcDir: string, options: { readonly helpersBlind?: boolean } = {}): {
  readonly files: number;
  readonly enqueuePositions: number;
  readonly emitCandidates: number;
} {
  let files = 0;
  let enqueuePositions = 0;
  let emitCandidates = 0;

  for (const file of walk(srcDir)) {
    if (!file.endsWith('.ts') || file.endsWith('.d.ts')) continue;
    const relativePath = relative(srcDir, file).split(sep).join('/');
    if (relativePath.includes('__tests__/') || relativePath.endsWith('.test.ts')) continue;

    const raw = readFileSync(file, 'utf8');
    if (!ENQUEUE_CALLS.some((name) => raw.includes(name.split('.')[0] as string))) continue;

    const code = blankOutNonCode(raw);
    // `helpersBlind` rejoue la PREMIÈRE version du balayage — `.emit(` textuel
    // seul. Le témoin de couverture compare les deux : c'est l'ÉCART qui garde
    // la reconnaissance des helpers, là où un plancher absolu la laissait
    // repasser au vert dès qu'un `.emit(` direct est ajouté ailleurs.
    const emitSource = options.helpersBlind ? '\\.\\s*emit\\s*\\(' : EMIT_RE.source;
    const enqueues = new RegExp(ENQUEUE_RE.source, 'g');
    let enqueue: RegExpExecArray | null;
    let seenHere = 0;
    while ((enqueue = enqueues.exec(code)) !== null) {
      if (DECLARATION_BEFORE.test(code.slice(Math.max(0, enqueue.index - 24), enqueue.index))) continue;
      seenHere += 1;
      const start = unitStart(code, enqueue.index);
      const emits = new RegExp(emitSource, 'g');
      emits.lastIndex = start;
      let emit: RegExpExecArray | null;
      while ((emit = emits.exec(code)) !== null && emit.index < enqueue.index) emitCandidates += 1;
    }
    if (seenHere > 0) {
      files += 1;
      enqueuePositions += seenHere;
    }
  }

  return { files, enqueuePositions, emitCandidates };
}

export const GATEWAY_SRC = join(__dirname, '..');

/**
 * VIDE, et c'est un état à défendre. Quand le cliquet tombe : enrober l'émission
 * (`safeBroadcast`), ou borner le `try` AVANT l'enfilage. Jamais ajouter
 * une ligne ici.
 */
export const FROZEN_UNGUARDED_LIVE_EMISSIONS: readonly UnguardedLiveEmission[] = [];
