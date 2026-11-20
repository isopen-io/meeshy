import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * **Un producteur de `message:edited` qui porte des PIÈCES doit avoir
 * interrogé un plan signé — sur les DEUX canaux** (#19977).
 *
 * #9646 a fermé le transport REST, #19939 le transport socket. Les deux lots
 * ont annoncé une énumération des transports d'édition, et les deux se sont
 * trompés : il y en a un troisième — la bulle d'un enregistrement d'appel
 * (`MeeshySocketIOManager.broadcastMessageEdited`) — et c'était le SEUL qui
 * chargeait des pièces jointes au moment où on l'a trouvé. Il diffusait
 * l'adresse NUE à la room entière et l'enfilait 48 h dans Redis.
 *
 * > **Un tri est une AFFIRMATION**, et une énumération de transports l'est deux
 * > fois : « ces sites appliquent la règle » se vérifie, « ce sont les sites où
 * > elle s'applique » ne se vérifie presque jamais. Ce balayage est la forme
 * > OUTILLÉE de la seconde moitié — il ne demande pas qui applique la règle,
 * > il demande qui la DOIT.
 *
 * ─── Le discriminant, et pourquoi il a DEUX conditions ───────────────────────
 *
 * Porter `message:edited` ne suffit pas : `emitArrivalsLineUpdate`
 * (`services/conversations/globalArrivalsNotice.ts`) compose une ligne
 * d'arrivées SYSTÈME dont la charge ne déclare aucune pièce — il n'y a rien à
 * signer, et l'exempter par une ligne d'inventaire le ferait passer pour une
 * dette alors qu'il sort par CONSTRUCTION. Un fichier n'entre donc dans la
 * portée que s'il parle aussi de pièces jointes.
 *
 * Et la conjonction est volontairement LARGE côté pièces : un fichier qui
 * nomme `attachments` sans en servir est admis dans la portée et satisfait la
 * règle par sa PORTE (ci-dessous). Un balayage de confidentialité se trompe du
 * côté qui demande une preuve de plus, jamais de celui qui en dispense.
 */
export interface UnsignedEditedProducer {
  /** Chemin relatif à `src/`, pour que la clé ne dérive pas avec le dépôt. */
  readonly file: string;
  /** Ce qui manque — nommé, pour que la réparation ne se devine pas. */
  readonly missing: 'live-plan' | 'queue-decision' | 'both' | 'unresolved-unit';
}

/**
 * Les DEUX portes partagées, qui sont le SUJET du balayage et non ses
 * exceptions : `editedAudience.ts` décide du canal VIVANT (et c'est là que vit
 * `PLAN_UNAVAILABLE ⇒ rien`), `broadcastMessageMutation.ts` est la porte REST
 * qui tient les deux canaux pour ses appelants. Ce que ce balayage interdit est
 * qu'un TRANSPORT serve l'adresse d'une pièce pour son compte.
 */
const DOORS = new Set([
  join('socketio', 'editedAudience.ts'),
  join('socketio', 'broadcastMessageMutation.ts'),
]);

/**
 * Appeler une porte partagée VAUT consulter le plan : elle le fait pour son
 * appelant. **La DÉFINITION de la porte n'est pas un appel** (#19977, audit) :
 * sans ce `(?<!function\s)`, `callSummaryEditedDelivery.ts` s'auto-exemptait
 * par sa propre ligne `export async function deliverCallSummaryEdit(`.
 */
const DELEGATES = /(?<!function\s)\b(?:broadcastMessageMutation|deliverCallSummaryEdit)\s*\(/;

const EMITS_EDITED = /SERVER_EVENTS\s*\.\s*MESSAGE_EDITED/;
const QUEUES_EDITED = /eventType\s*:\s*'edited'/;
const MENTIONS_ATTACHMENTS = /\battachments\b/;

/** Le canal VIVANT : un plan à trois valeurs, lu avant toute émission. */
const LIVE_PLAN = /\breaderSignedPlan[A-Za-z]*\s*\(/;
/** Le canal DURABLE : la décision `withhold` / `as-is` / `per-reader`. */
const QUEUE_DECISION = /\bofflineSigned[A-Za-z]*\s*\(/;

/**
 * Les commentaires CITENT la forme fautive pour l'expliquer — c'est leur rôle,
 * et les effacer est donc nécessaire.
 *
 * **Le balayage est un AUTOMATE, pas une expression régulière** (#19977, audit).
 * La première rédaction remplaçait `/* … *\u002F` par une regex, donc traitait un
 * `/*` à l'intérieur d'une CHAÎNE comme l'ouverture d'un commentaire : mesuré
 * sur `services/gateway/src/`, quatorze chaînes (des chemins de route comme
 * `'/api/attachments/file/*'`) ouvraient un faux bloc et effaçaient **612
 * lignes de code réel**. Impact nul le jour où c'était écrit — aucune de ces
 * régions ne sert `message:edited` — mais l'erreur allait du mauvais CÔTÉ :
 * elle DISPENSE en silence, quand tout le reste de ce module se trompe du côté
 * qui demande une preuve de plus.
 *
 * Les longueurs sont préservées (chaque caractère effacé devient une espace,
 * les retours à la ligne restent) : les index servent à remonter la pile
 * d'accolades, et un cliquet qui nomme la mauvaise ligne a tort de façon
 * crédible.
 */
function blankComments(source: string): string {
  const out = source.split('');
  let i = 0;
  const blankTo = (end: number) => {
    for (let k = i; k < end && k < out.length; k += 1) if (out[k] !== '\n') out[k] = ' ';
  };
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blankTo(stop);
      i = stop;
      continue;
    }
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      blankTo(stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      i += 1;
      while (i < source.length && source[i] !== c) {
        if (source[i] === '\\') i += 1;
        i += 1;
      }
      i += 1;
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/**
 * Une ligne qui OUVRE une unité exécutable — fonction, méthode, fermeture.
 *
 * Les blocs de contrôle en sont retirés NOMMÉMENT : `if (…) {` a exactement la
 * même forme, et le prendre pour une unité réduirait la fenêtre à la branche
 * qui émet, où le plan calculé vingt lignes plus haut ne figure pas. Un
 * balayage de confidentialité se trompe du côté de la fenêtre TROP LARGE —
 * jamais de celui qui ferait passer un site pour gardé.
 *
 * **La tête se reconnaît sur le TEXTE, pas sur la LIGNE** (#19977, audit). La
 * première rédaction exigeait `\([^;]*\)` sur la ligne qui porte l'accolade
 * ouvrante, et manquait donc tout paramètre-objet multi-lignes — l'idiome
 * DOMINANT du dépôt, celui de `deliverCallSummaryEdit`, `emitEditedToReaders`,
 * `offlineSignedPayload`, `readerSignedPlanForMessageId` —, dont le `{` se
 * ferme sur `}): Promise<void> {`, une ligne sans aucune `(`. Aucune tête ne
 * matchait, la pile se vidait, et `enclosingUnit` rendait le FICHIER ENTIER :
 * **deux unités sur cinq**, dont `MessageHandler.ts` et ses 2 265 lignes,
 * étaient mesurées exactement à l'échelle que ce module affirme avoir
 * éliminée. On remonte donc du `{` à sa `)` appariée, puis de celle-ci à sa
 * `(`, quel que soit le nombre de lignes traversées.
 */
const CONTROL_KEYWORD = /\b(?:if|for|while|switch|catch|do|with)\s*$/;

/** L'index de la parenthèse ouvrante appariée à celle qui se ferme en `close`. */
function matchingOpenParen(source: string, close: number): number {
  let depth = 0;
  for (let i = close; i >= 0; i -= 1) {
    if (source[i] === ')') depth += 1;
    else if (source[i] === '(') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const skipBackSpace = (source: string, from: number): number => {
  let i = from;
  while (i >= 0 && /\s/.test(source[i] as string)) i -= 1;
  return i;
};

/**
 * `open` ouvre-t-il une UNITÉ exécutable (fonction, méthode, fermeture) ?
 *
 * Vrai quand le texte qui précède l'accolade est une liste de paramètres —
 * éventuellement suivie d'un type de retour, et éventuellement précédée d'une
 * flèche — dont le mot qui ouvre la parenthèse n'est pas un mot-clé de
 * contrôle. Un `) {` d'un `if` est donc écarté par son MOT, jamais par la
 * forme, qui est identique.
 */
function opensUnit(source: string, open: number): boolean {
  let i = skipBackSpace(source, open - 1);
  if (i < 0) return false;
  if (source[i] === '>' && source[i - 1] === '=') i = skipBackSpace(source, i - 2);
  if (i < 0) return false;
  if (source[i] !== ')') {
    // Type de retour (`): Promise<void> {`) : on recule jusqu'à la `)` qui le
    // précède, sans traverser de `;` ni d'accolade — ce qui exclut un bloc nu.
    const colon = source.lastIndexOf(':', i);
    if (colon === -1) return false;
    const between = source.slice(colon, i + 1);
    if (/[;{}]/.test(between)) return false;
    i = skipBackSpace(source, colon - 1);
    if (i < 0 || source[i] !== ')') return false;
  }
  const openParen = matchingOpenParen(source, i);
  if (openParen === -1) return false;
  const before = source.slice(Math.max(0, openParen - 24), openParen);
  return !CONTROL_KEYWORD.test(before);
}

/**
 * La FENÊTRE de l'unité qui contient `index` : le corps de la fonction ou de la
 * méthode englobante, pas le fichier.
 *
 * **C'est tout le lot.** Un balayage à l'échelle du FICHIER aurait été VERT sur
 * le défaut qu'il est écrit pour attraper : `MeeshySocketIOManager.ts` appelle
 * déjà `readerSignedPlanBestEffort` et `offlineSignedPayload` — pour
 * `message:new`, trois cents lignes plus haut. Chercher un idiome dans un
 * fichier mesure sa POPULARITÉ, pas une propriété du site qui sert.
 */
function enclosingUnit(source: string, index: number): { readonly body: string; readonly wholeFile: boolean } {
  const opens: number[] = [];
  for (let i = 0; i < index; i += 1) {
    const c = source[i];
    if (c === '{') opens.push(i);
    else if (c === '}') opens.pop();
  }
  for (let depth = opens.length - 1; depth >= 0; depth -= 1) {
    const open = opens[depth] as number;
    if (!opensUnit(source, open)) continue;
    let balance = 0;
    for (let i = open; i < source.length; i += 1) {
      if (source[i] === '{') balance += 1;
      else if (source[i] === '}') {
        balance -= 1;
        if (balance === 0) return { body: source.slice(open, i + 1), wholeFile: false };
      }
    }
    return { body: source.slice(open), wholeFile: false };
  }
  return { body: source, wholeFile: true };
}

function servingUnits(source: string): readonly { readonly body: string; readonly wholeFile: boolean }[] {
  const units: { readonly body: string; readonly wholeFile: boolean }[] = [];
  for (const pattern of [EMITS_EDITED, QUEUES_EDITED]) {
    const scan = new RegExp(pattern.source, 'g');
    for (let m = scan.exec(source); m !== null; m = scan.exec(source)) {
      units.push(enclosingUnit(source, m.index));
    }
  }
  return units;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
      walk(full, out);
      continue;
    }
    if (/\.(ts|mts|cts)$/.test(entry) && !entry.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

export interface EditedSigningSweep {
  /** Les unités que le discriminant retient — publié pour qu'une portée VIDE se voie. */
  readonly inScope: readonly string[];
  readonly offenders: readonly UnsignedEditedProducer[];
}

export function sweepEditedSigningDoors(srcRoot: string): EditedSigningSweep {
  const inScope: string[] = [];
  const offenders: UnsignedEditedProducer[] = [];
  for (const full of walk(srcRoot)) {
    const file = relative(srcRoot, full).split(sep).join(sep);
    if (DOORS.has(file)) continue;
    const source = blankComments(readFileSync(full, 'utf8'));
    // **Les DEUX grains, et ils ne sont pas interchangeables** (#19977, audit).
    //
    // La PORTÉE se décide au FICHIER : une charge composée dans une unité et
    // émise dans une autre — ce que ce lot vient précisément de créer en
    // sortant `callSummaryEditedPayload` — ne nomme `attachments` dans AUCUNE
    // unité émettrice, et un discriminant par unité la faisait sortir du
    // balayage en silence. Un fichier qui ne parle jamais de pièces jointes
    // (`globalArrivalsNotice.ts`) sort toujours par CONSTRUCTION.
    //
    // Le VERDICT se rend à l'UNITÉ : c'est là que vit la propriété gardée —
    // « ce site a interrogé le plan avant de remettre cette adresse » — et la
    // mesurer au fichier rend vert le défaut qui a motivé ce module.
    if (!MENTIONS_ATTACHMENTS.test(source)) continue;
    const units = servingUnits(source);
    if (units.length === 0) continue;
    inScope.push(file);
    for (const unit of units) {
      // Une unité qu'on n'a pas su délimiter est traitée comme un DÉFAUT de
      // l'instrument, pas comme une unité : la mesurer au fichier serait la
      // popularité d'un idiome, et se taire serait une dispense.
      if (unit.wholeFile) {
        offenders.push({ file, missing: 'unresolved-unit' });
        continue;
      }
      if (DELEGATES.test(unit.body)) continue;
      const live = LIVE_PLAN.test(unit.body);
      const queue = QUEUE_DECISION.test(unit.body);
      if (live && queue) continue;
      offenders.push({ file, missing: !live && !queue ? 'both' : !live ? 'live-plan' : 'queue-decision' });
    }
  }
  return { inScope, offenders };
}
