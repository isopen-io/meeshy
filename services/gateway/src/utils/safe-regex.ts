import { Worker } from 'node:worker_threads';

/**
 * Exécuter une expression régulière FOURNIE PAR L'APPELANT est un geste
 * dangereux, et le danger n'est pas la compilation : c'est le RETOUR ARRIÈRE.
 *
 * `POST /admin/agent/topics/:id/test` prend jusqu'à dix motifs stockés et les
 * fait courir sur 5 000 caractères choisis par l'appelant. Un motif à retour
 * arrière catastrophique — `(a+)+$` sur `'a'.repeat(40) + '!'` — demande 2^40
 * chemins à irregexp. Ce n'est pas « une requête lente » : la boucle
 * d'événements de Node est MONO-FIL, donc le gateway ENTIER s'arrête —
 * WebSocket, ZMQ, healthcheck compris — jusqu'à ce que Docker le tue. Une
 * seule requête d'un seul administrateur suffit.
 *
 * Ce défaut dormait derrière une garde qui rendait 403 à tout le monde
 * (#4156) : la réparer l'ARME. D'où ce module, livré dans le même lot.
 *
 * ## Deux lignes de défense, et ce que chacune ne peut pas faire
 *
 * 1. **`analysePatternStatically`** — un scanner qui refuse les CLASSES de
 *    motifs connues pour exploser : quantificateur imbriqué, alternance
 *    ambiguë sous quantificateur, répétition bornée démesurée. Il est
 *    synchrone, sans coût, et il refuse À L'ÉCRITURE — l'administrateur voit
 *    son motif rejeté au moment où il le tape, pas six mois plus tard.
 *    Ce qu'il LAISSE PASSER, dit sans détour :
 *      - les explosions par rétro-référence (`(a+)\1+`) ;
 *      - une alternance dont les branches se recouvrent sans se ressembler
 *        (`(\s|\t)*` : `\s` contient la tabulation, mais les deux atomes
 *        s'écrivent différemment, donc la disjonction approchée les croit
 *        distincts) ;
 *      - l'imbrication cachée dans un lookahead (`(?=(a+))+`) ;
 *      - le retour arrière POLYNOMIAL (`a.*b.*c`), qui n'explose pas mais
 *        coûte quadratique — borné ici par le plafond de 5 000 caractères.
 *
 * 2. **Le fil d'exécution séparé** — la sonde de `certifyPatterns` et
 *    `countMatchesOffLoop` n'exécutent JAMAIS un motif d'appelant dans la
 *    boucle d'événements. Ils le confient à un `worker_thread` sous délai
 *    maximal, et `terminate()` coupe le fil si le délai passe. C'est la seule
 *    défense qui tienne contre ce que l'analyse statique laisse passer, parce
 *    qu'elle ne dépend d'aucune reconnaissance de forme : elle mesure.
 *    Mesuré en Node 22 et en bun 1.3 : `terminate()` interrompt bien une
 *    boucle de retour arrière en cours (V8 rend la main sur son garde de
 *    pile), c'est ce qui rend le délai maximal réel et pas décoratif.
 *
 * ## Le SENS de la panne
 *
 * Si le fil de travail ne peut pas démarrer (runtime sans `worker_threads`),
 * ce module REFUSE — il ne retombe jamais sur une exécution en boucle
 * d'événements. Le repli « au pire on l'exécute ici » serait exactement le
 * défaut qu'on corrige, ressuscité au moment le plus défavorable. Une
 * création de sujet qui échoue coûte un message d'erreur à un administrateur ;
 * un gateway figé coûte le service à tout le monde.
 */

/** Pourquoi un motif est refusé — le code voyage jusqu'au client. */
export type PatternRefusalCode =
  | 'INVALID_SYNTAX'
  | 'TOO_LONG'
  | 'NESTED_QUANTIFIER'
  | 'AMBIGUOUS_ALTERNATION'
  | 'REPETITION_BUDGET'
  | 'BACKTRACKING_BUDGET'
  | 'UNSUPPORTED_RUNTIME';

export type PatternRefusal = {
  readonly pattern: string;
  readonly code: PatternRefusalCode;
  readonly message: string;
};

/** Un motif de mot-clé tient en deux lignes ; au-delà, c'est autre chose. */
const MAX_PATTERN_LENGTH = 200;

/** `{n,m}` au-delà de ce facteur n'est plus un mot-clé, c'est un budget. */
const MAX_REPETITION = 64;

/** Produit de répétitions bornées imbriquées toléré : `(x{8}){8}`. */
const MAX_REPETITION_PRODUCT = 1024;

/** Délai maximal d'une session de sonde (tous motifs d'une requête). */
export const DEFAULT_PROBE_BUDGET_MS = 250;

/** Délai maximal d'une session d'exécution sur le texte de l'appelant. */
export const DEFAULT_MATCH_BUDGET_MS = 500;

const refusal = (pattern: string, code: PatternRefusalCode, message: string): PatternRefusal =>
  ({ pattern, code, message });

// ─── Analyse statique ────────────────────────────────────────────────────────

/**
 * Ce qu'une parenthèse ouvrante retient de son contenu, et rien de plus :
 * on ne construit pas un arbre syntaxique, on répond à deux questions —
 * « ce groupe contient-il déjà une répétition non bornée ? » et « ses
 * branches d'alternance peuvent-elles commencer pareil ? ».
 */
type GroupFrame = {
  hasUnboundedQuantifier: boolean;
  hasAlternation: boolean;
  repetitionProduct: number;
  branchSignatures: string[];
  currentBranchHasAtom: boolean;
};

const newFrame = (): GroupFrame => ({
  hasUnboundedQuantifier: false,
  hasAlternation: false,
  repetitionProduct: 1,
  branchSignatures: [],
  currentBranchHasAtom: false,
});

type Quantifier = { length: number; unbounded: boolean; factor: number };

/**
 * Lit le quantificateur qui suit l'atome fermé en `index`, s'il y en a un.
 * `?` est volontairement traité comme borné de facteur 1 : il double le
 * nombre de chemins mais ne l'ouvre pas.
 */
function readQuantifier(source: string, index: number): Quantifier | null {
  const c = source[index];
  if (c === '*' || c === '+') return { length: 1, unbounded: true, factor: Number.POSITIVE_INFINITY };
  if (c === '?') return { length: 1, unbounded: false, factor: 1 };
  if (c !== '{') return null;

  const close = source.indexOf('}', index);
  if (close === -1) return null;
  const body = source.slice(index + 1, close);
  const braced = /^(\d+)(,(\d*)?)?$/.exec(body);
  if (!braced) return null;

  const min = Number(braced[1]);
  const hasComma = braced[2] !== undefined;
  const maxRaw = braced[3];
  const unbounded = hasComma && (maxRaw === undefined || maxRaw === '');
  const max = unbounded ? Number.POSITIVE_INFINITY : Number(hasComma ? maxRaw : braced[1]);

  return {
    length: close - index + 1,
    unbounded,
    factor: unbounded ? Number.POSITIVE_INFINITY : Math.max(min, max),
  };
}

/** Consomme une classe `[...]` et rend l'index qui suit son `]`. */
function skipCharacterClass(source: string, index: number): number {
  let i = index + 1;
  if (source[i] === '^') i += 1;
  if (source[i] === ']') i += 1;
  while (i < source.length) {
    if (source[i] === '\\') { i += 2; continue; }
    if (source[i] === ']') return i + 1;
    i += 1;
  }
  return source.length;
}

/**
 * Deux branches d'alternance peuvent-elles commencer par le même caractère ?
 *
 * On compare la SIGNATURE de leur premier atome. C'est une approximation
 * assumée, et c'est le bon compromis : elle ne se trompe que dans un sens
 * sur les motifs de mots-clés réels — `(?:film|série)+` a deux signatures
 * littérales distinctes et passe, `(a|a)+` a deux signatures identiques et
 * tombe. Ce qu'elle rate (`(\s|\t)*`) est rattrapé par la sonde.
 */
function branchesMayOverlap(signatures: readonly string[]): boolean {
  const seen = new Set<string>();
  for (const signature of signatures) {
    // Une branche VIDE — `(a|)+` — rend le groupe annulable : le moteur peut
    // itérer sans consommer, ce qui est la forme la plus directe de l'explosion.
    if (signature === '' || signature === 'opaque') return true;
    if (seen.has(signature)) return true;
    seen.add(signature);
  }
  return false;
}

/**
 * Refuse les CLASSES de motifs à retour arrière exponentiel, sans exécuter
 * quoi que ce soit. Rend `null` quand rien ne s'oppose au motif.
 */
export function analysePatternStatically(source: string): PatternRefusal | null {
  if (source.length > MAX_PATTERN_LENGTH) {
    return refusal(source, 'TOO_LONG', `Motif trop long (${source.length} > ${MAX_PATTERN_LENGTH} caractères)`);
  }

  try {
    new RegExp(source);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'motif illisible';
    return refusal(source, 'INVALID_SYNTAX', `Motif invalide : ${detail}`);
  }

  const stack: GroupFrame[] = [newFrame()];
  const top = (): GroupFrame => stack[stack.length - 1];

  /** Note la signature du premier atome de la branche courante. */
  const noteAtom = (signature: string): void => {
    const frame = top();
    if (frame.currentBranchHasAtom) return;
    frame.branchSignatures.push(signature);
    frame.currentBranchHasAtom = true;
  };

  /**
   * L'effet d'un quantificateur porté par un ATOME sur le groupe qui le
   * contient. `{40}` ne coûte rien seul ; il coûte quand un groupe qui le
   * porte est répété à son tour, d'où le PRODUIT que le groupe accumule.
   */
  const applyAtomQuantifier = (q: Quantifier): PatternRefusal | null => {
    if (q.unbounded) { top().hasUnboundedQuantifier = true; return null; }
    if (q.factor > MAX_REPETITION) {
      return refusal(source, 'REPETITION_BUDGET', `Répétition trop large : {${q.factor}} > ${MAX_REPETITION}`);
    }
    if (q.factor > 1) top().repetitionProduct *= q.factor;
    return null;
  };

  let i = 0;
  while (i < source.length) {
    const c = source[i];

    if (c === '\\' || c === '[' ) {
      // Un atome ÉCHAPPÉ ou une CLASSE se traitent pareil : on les consomme
      // en bloc, on signe la branche, puis on lit leur quantificateur.
      const end = c === '[' ? skipCharacterClass(source, i) : i + 2;
      noteAtom(c === '[' ? `class:${source.slice(i, end)}` : `esc:${source[i + 1] ?? ''}`);
      i = end;
      const q = readQuantifier(source, i);
      if (q) {
        const r = applyAtomQuantifier(q);
        if (r) return r;
        i += q.length;
      }
      continue;
    }

    if (c === '(') {
      noteAtom('opaque');
      stack.push(newFrame());
      // `(?:`, `(?=`, `(?!`, `(?<=`, `(?<!`, `(?<nom>` — le préfixe ne change
      // rien au risque de retour arrière, seulement la capture.
      const prefix = /^\(\?(:|=|!|<=|<!|<[A-Za-z_$][\w$]*>)/.exec(source.slice(i));
      i += prefix ? prefix[0].length : 1;
      continue;
    }

    if (c === ')') {
      const frame = stack.pop() ?? newFrame();
      if (stack.length === 0) stack.push(newFrame());
      // La DERNIÈRE branche d'une alternance n'a pas de `|` après elle : sans
      // cette ligne, `(a|)*` — le groupe annulable, la forme la plus directe
      // de l'explosion — passait, sa branche vide n'étant jamais signée.
      if (frame.hasAlternation && !frame.currentBranchHasAtom) frame.branchSignatures.push('');
      i += 1;

      const q = readQuantifier(source, i);
      if (!q) continue;
      i += q.length;

      if (q.unbounded) {
        // LA forme canonique : `(a+)+`. Un groupe qui contient déjà une
        // répétition non bornée, répété lui-même sans borne, donne au moteur
        // 2^n découpages du même texte à essayer avant de renoncer.
        if (frame.hasUnboundedQuantifier) {
          return refusal(source, 'NESTED_QUANTIFIER', 'Quantificateur imbriqué : un groupe répété contient déjà une répétition non bornée');
        }
        if (frame.hasAlternation && branchesMayOverlap(frame.branchSignatures)) {
          return refusal(source, 'AMBIGUOUS_ALTERNATION', 'Alternance ambiguë sous quantificateur : deux branches peuvent commencer pareil');
        }
        if (frame.repetitionProduct > MAX_REPETITION) {
          return refusal(source, 'REPETITION_BUDGET', 'Répétition bornée large sous un quantificateur non borné');
        }
        top().hasUnboundedQuantifier = true;
        continue;
      }

      if (q.factor > MAX_REPETITION) {
        return refusal(source, 'REPETITION_BUDGET', `Répétition trop large : {${q.factor}} > ${MAX_REPETITION}`);
      }
      if (frame.hasUnboundedQuantifier && q.factor > 1) {
        top().hasUnboundedQuantifier = true;
      }
      const product = frame.repetitionProduct * q.factor;
      if (product > MAX_REPETITION_PRODUCT) {
        return refusal(source, 'REPETITION_BUDGET', `Répétitions bornées imbriquées : ${product} > ${MAX_REPETITION_PRODUCT} chemins`);
      }
      top().repetitionProduct = Math.max(top().repetitionProduct, product);
      continue;
    }

    if (c === '|') {
      const frame = top();
      frame.hasAlternation = true;
      if (!frame.currentBranchHasAtom) frame.branchSignatures.push('');
      frame.currentBranchHasAtom = false;
      i += 1;
      continue;
    }

    if (c === '*' || c === '+') {
      top().hasUnboundedQuantifier = true;
      i += 1;
      continue;
    }

    if (c === '{') {
      const q = readQuantifier(source, i);
      if (q) {
        const r = applyAtomQuantifier(q);
        if (r) return r;
        i += q.length;
        continue;
      }
      noteAtom('lit:{');
      i += 1;
      continue;
    }

    if (c === '?') { i += 1; continue; }

    noteAtom(`lit:${c}`);
    i += 1;
    const q = readQuantifier(source, i);
    if (q) {
      const r = applyAtomQuantifier(q);
      if (r) return r;
      i += q.length;
    }
  }

  return null;
}

// ─── Exécution hors boucle d'événements ──────────────────────────────────────

type OffLoopJob = {
  readonly patterns: readonly string[];
  readonly flags: string;
  readonly texts: readonly (readonly string[])[];
};

type OffLoopOutcome = {
  /** index de motif → nombre d'occurrences trouvées */
  readonly counts: ReadonlyMap<number, number>;
  /** motifs dont `new RegExp` a levé DANS le fil de travail */
  readonly invalid: ReadonlySet<number>;
  /** index du motif en cours quand le délai maximal est tombé, s'il y en a un */
  readonly hungIndex: number | null;
  /** le fil de travail n'a pas pu démarrer — aucune exécution n'a eu lieu */
  readonly unsupported: boolean;
};

/**
 * Le programme du fil de travail. Il ANNONCE chaque motif avant de l'exécuter
 * (`begin`) : c'est ce qui permet, quand le délai tombe et qu'on coupe le fil,
 * de dire QUEL motif a figé — sans cette annonce on saurait seulement qu'un
 * des dix a explosé, et on refuserait les dix.
 */
const WORKER_SOURCE = `
const { workerData, parentPort } = require('node:worker_threads');
const job = workerData;
for (let i = 0; i < job.patterns.length; i++) {
  parentPort.postMessage({ type: 'begin', index: i });
  let re;
  try {
    re = new RegExp(job.patterns[i], job.flags);
  } catch (error) {
    parentPort.postMessage({ type: 'invalid', index: i });
    continue;
  }
  let total = 0;
  const corpus = job.texts[i] || [];
  for (let t = 0; t < corpus.length; t++) {
    re.lastIndex = 0;
    const found = corpus[t].match(re);
    total += found ? found.length : 0;
  }
  parentPort.postMessage({ type: 'result', index: i, count: total });
}
parentPort.postMessage({ type: 'done' });
`;

type WorkerMessage =
  | { type: 'begin'; index: number }
  | { type: 'invalid'; index: number }
  | { type: 'result'; index: number; count: number }
  | { type: 'done' };

async function runOffLoop(job: OffLoopJob, budgetMs: number): Promise<OffLoopOutcome> {
  const counts = new Map<number, number>();
  const invalid = new Set<number>();
  let started: number | null = null;
  let finished = false;

  let worker: Worker;
  try {
    worker = new Worker(WORKER_SOURCE, { eval: true, workerData: job });
  } catch {
    return { counts, invalid, hungIndex: null, unsupported: true };
  }

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => { settle(); }, budgetMs);

    const settle = (): void => {
      clearTimeout(timer);
      worker.removeAllListeners();
      // `terminate()` coupe le fil MÊME au milieu d'un retour arrière : c'est
      // la propriété qui rend ce délai maximal réel. On ne l'attend pas — le
      // gateway n'a aucune raison de retenir sa réponse le temps que V8 rende
      // la main sur un motif qu'on a déjà décidé de refuser.
      // `.catch` OBLIGATOIRE sur une promesse DÉTACHÉE (loi du dépôt, leçon 230),
      // et les deux gardes sont disjointes : le `try` d'au-dessus n'attrape que
      // le `throw` SYNCHRONE de `new Worker`, jamais le rejet de cette
      // promesse-ci. Sans écouteur, ce rejet termine le PROCESS sous le
      // `--unhandled-rejections=throw` par défaut de Node 22 — toute la
      // passerelle tombée parce qu'un fil qu'on avait déjà décidé d'abandonner
      // a mal fini de mourir. Le repli est muet À DESSEIN : ce module n'importe
      // aucun logger, et l'issue de `terminate()` n'apprend rien à personne.
      void worker.terminate().catch(() => undefined);
      resolve();
    };

    worker.on('message', (message: WorkerMessage) => {
      if (message.type === 'begin') { started = message.index; return; }
      if (message.type === 'invalid') { invalid.add(message.index); started = null; return; }
      if (message.type === 'result') { counts.set(message.index, message.count); started = null; return; }
      finished = true;
      settle();
    });
    worker.on('error', () => { settle(); });
    worker.on('exit', () => { settle(); });
  });

  return { counts, invalid, hungIndex: finished ? null : started, unsupported: false };
}

/**
 * Le vocabulaire qu'une classe d'échappement ACCEPTE, réduit à un exemplaire
 * par famille. Sans cette table, la sonde n'aurait jamais de tabulation à
 * proposer à `(\s|\t)*` — et une sonde qui ne prononce pas le mot que le
 * motif attend ne mesure rien du tout.
 */
const ESCAPE_ALPHABET: Readonly<Record<string, readonly string[]>> = {
  s: [' ', '\t'],
  S: ['a'],
  d: ['1'],
  D: ['a'],
  w: ['a', '1', '_'],
  W: [' ', '-'],
  t: ['\t'],
  n: ['\n'],
  r: ['\r'],
};

/**
 * Fabrique le texte adverse d'un motif : des répétitions du vocabulaire que
 * le motif lui-même nomme, suivies d'un caractère qui ne peut pas satisfaire
 * l'ancre finale. C'est la forme qui fait exploser `(a+)+$` — répéter ce que
 * le motif accepte, puis lui refuser la conclusion, oblige le moteur à
 * essayer tous les découpages avant de renoncer.
 *
 * La limite est donc CLAIRE : la sonde ne voit un motif exploser que si son
 * corpus prononce le vocabulaire attendu. Elle lit pour cela les littéraux,
 * les classes et les échappements du motif — ce qui couvre les mots-clés
 * réels, pas un motif qui n'attendrait qu'un caractère exotique.
 */
function adversarialCorpus(source: string): string[] {
  const alphabet = new Set<string>(['a', '1', ' ']);
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (c === '\\') {
      const next = source[i + 1] ?? '';
      for (const seed of ESCAPE_ALPHABET[next] ?? (/[A-Za-z0-9]/.test(next) ? [] : [next])) {
        alphabet.add(seed);
      }
      i += 1;
      continue;
    }
    if (/[A-Za-z0-9_ \-\t]/.test(c)) alphabet.add(c);
  }

  const seeds = [...Array.from(alphabet).slice(0, 10), 'ab', 'a1'];
  const texts: string[] = [];
  for (const seed of seeds) {
    const body = seed.repeat(Math.ceil(42 / seed.length));
    // Avec ET sans terminateur : l'ancre `$` explose sur le premier, un motif
    // sans ancre peut exploser sur le second.
    texts.push(`${body}!`);
    texts.push(body);
  }
  return texts;
}

/**
 * Certifie des motifs AVANT de les écrire en base : analyse statique, puis
 * sonde adverse hors boucle d'événements. Rend la liste des refus — vide
 * quand tout passe.
 */
export async function certifyPatterns(
  patterns: readonly string[],
  options: { budgetMs?: number } = {}
): Promise<PatternRefusal[]> {
  if (patterns.length === 0) return [];

  const refusals: PatternRefusal[] = [];
  const survivors: string[] = [];
  for (const pattern of patterns) {
    const verdict = analysePatternStatically(pattern);
    if (verdict) refusals.push(verdict);
    else survivors.push(pattern);
  }
  if (survivors.length === 0) return refusals;

  const outcome = await runOffLoop(
    { patterns: survivors, flags: 'gi', texts: survivors.map(adversarialCorpus) },
    options.budgetMs ?? DEFAULT_PROBE_BUDGET_MS
  );

  if (outcome.unsupported) {
    // Fail-closed : ne pas pouvoir mesurer n'autorise pas à supposer.
    return [
      ...refusals,
      ...survivors.map((p) => refusal(p, 'UNSUPPORTED_RUNTIME', 'Motif non certifiable : fil de travail indisponible')),
    ];
  }

  survivors.forEach((pattern, index) => {
    if (outcome.invalid.has(index)) {
      refusals.push(refusal(pattern, 'INVALID_SYNTAX', 'Motif invalide'));
      return;
    }
    if (outcome.counts.has(index)) return;
    // Ni résultat ni invalidité : ce motif courait encore quand le délai est
    // tombé, ou n'a jamais démarré parce que le précédent l'a figé. Les deux
    // se refusent — on ne relance pas une sonde pour départager, ce serait
    // offrir une seconde exécution au motif qu'on soupçonne.
    refusals.push(refusal(
      pattern,
      'BACKTRACKING_BUDGET',
      index === outcome.hungIndex
        ? 'Retour arrière catastrophique : le motif dépasse le délai maximal sur un texte adverse'
        : 'Motif non certifié : la sonde a été interrompue par un motif voisin'
    ));
  });

  return refusals;
}

export type MatchReport = {
  /** motif → occurrences ; `-1` quand le motif n'a pas pu être évalué */
  readonly matches: Record<string, number>;
  /** le détail de ce que `-1` recouvre, motif par motif */
  readonly refused: PatternRefusal[];
};

/**
 * Compte les occurrences de chaque motif dans le texte de l'appelant, hors
 * boucle d'événements et sous délai maximal.
 *
 * Les motifs déjà en base n'ont jamais été certifiés — ils datent d'avant
 * `certifyPatterns`. C'est pourquoi l'exécution elle-même est déportée, et
 * pas seulement l'écriture : garder la porte sans garder la salle laisserait
 * figer le gateway avec un motif écrit hier.
 */
export async function countMatchesOffLoop(
  patterns: readonly string[],
  sampleText: string,
  options: { budgetMs?: number } = {}
): Promise<MatchReport> {
  const matches: Record<string, number> = {};
  const refused: PatternRefusal[] = [];
  if (patterns.length === 0) return { matches, refused };

  const outcome = await runOffLoop(
    { patterns, flags: 'gi', texts: patterns.map(() => [sampleText]) },
    options.budgetMs ?? DEFAULT_MATCH_BUDGET_MS
  );

  if (outcome.unsupported) {
    for (const pattern of patterns) {
      matches[pattern] = -1;
      refused.push(refusal(pattern, 'UNSUPPORTED_RUNTIME', 'Motif non évalué : fil de travail indisponible'));
    }
    return { matches, refused };
  }

  patterns.forEach((pattern, index) => {
    if (outcome.counts.has(index)) {
      matches[pattern] = outcome.counts.get(index) ?? 0;
      return;
    }
    matches[pattern] = -1;
    refused.push(refusal(
      pattern,
      outcome.invalid.has(index) ? 'INVALID_SYNTAX' : 'BACKTRACKING_BUDGET',
      outcome.invalid.has(index)
        ? 'Motif invalide'
        : index === outcome.hungIndex
          ? 'Retour arrière catastrophique : évaluation interrompue au délai maximal'
          : 'Motif non évalué : la session a été interrompue par un motif voisin'
    ));
  });

  return { matches, refused };
}
