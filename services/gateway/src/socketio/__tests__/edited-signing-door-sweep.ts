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
  readonly missing: 'live-plan' | 'queue-decision' | 'both';
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

/** Appeler une porte partagée VAUT consulter le plan : elle le fait pour son appelant. */
const DELEGATES = /\b(?:broadcastMessageMutation|deliverCallSummaryEdit)\s*\(/;

const EMITS_EDITED = /SERVER_EVENTS\s*\.\s*MESSAGE_EDITED/;
const QUEUES_EDITED = /eventType\s*:\s*'edited'/;
const MENTIONS_ATTACHMENTS = /\battachments\b/;

/** Le canal VIVANT : un plan à trois valeurs, lu avant toute émission. */
const LIVE_PLAN = /\breaderSignedPlan[A-Za-z]*\s*\(/;
/** Le canal DURABLE : la décision `withhold` / `as-is` / `per-reader`. */
const QUEUE_DECISION = /\bofflineSigned[A-Za-z]*\s*\(/;

/** Les commentaires CITENT la forme fautive pour l'expliquer — c'est leur rôle. */
function blankComments(source: string): string {
  const blank = (match: string) => match.replace(/[^\n]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])(\/\/.*)$/gm, (_m, head: string, comment: string) => head + blank(comment));
}

/**
 * Une ligne qui OUVRE une unité exécutable — fonction, méthode, fermeture.
 *
 * Les blocs de contrôle en sont retirés NOMMÉMENT : `if (…) {` a exactement la
 * même forme, et le prendre pour une unité réduirait la fenêtre à la branche
 * qui émet, où le plan calculé vingt lignes plus haut ne figure pas. Un
 * balayage de confidentialité se trompe du côté de la fenêtre TROP LARGE —
 * jamais de celui qui ferait passer un site pour gardé.
 */
const CONTROL_HEAD = /^\s*(?:\}\s*)?(?:else\s+)?(?:if|for|while|switch|catch|do|try)\b/;
const UNIT_HEAD = /\([^;]*\)\s*(?::[^{;=]*)?(?:=>\s*)?\{\s*$/;

/** La ligne qui porte l'index donné. */
const lineAt = (source: string, index: number): string => {
  const start = source.lastIndexOf('\n', index - 1) + 1;
  const end = source.indexOf('\n', index);
  return source.slice(start, end === -1 ? source.length : end);
};

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
function enclosingUnit(source: string, index: number): string {
  const opens: number[] = [];
  for (let i = 0; i < index; i += 1) {
    const c = source[i];
    if (c === '{') opens.push(i);
    else if (c === '}') opens.pop();
  }
  for (let depth = opens.length - 1; depth >= 0; depth -= 1) {
    const open = opens[depth] as number;
    const head = lineAt(source, open);
    if (CONTROL_HEAD.test(head) || !UNIT_HEAD.test(head)) continue;
    let balance = 0;
    for (let i = open; i < source.length; i += 1) {
      if (source[i] === '{') balance += 1;
      else if (source[i] === '}') {
        balance -= 1;
        if (balance === 0) return source.slice(open, i + 1);
      }
    }
    return source.slice(open);
  }
  return source;
}

function servingUnits(source: string): readonly string[] {
  const units: string[] = [];
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
    for (const unit of servingUnits(source)) {
      if (!MENTIONS_ATTACHMENTS.test(unit)) continue;
      if (inScope.includes(file)) {
        // Une unité de plus dans un fichier déjà retenu : la portée reste
        // clé par FICHIER (lisible), le verdict reste par UNITÉ.
      } else inScope.push(file);
      if (DELEGATES.test(unit)) continue;
      const live = LIVE_PLAN.test(unit);
      const queue = QUEUE_DECISION.test(unit);
      if (live && queue) continue;
      offenders.push({ file, missing: !live && !queue ? 'both' : !live ? 'live-plan' : 'queue-decision' });
    }
  }
  return { inScope, offenders };
}
