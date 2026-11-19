import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * **TOUT CRÉATEUR DE `MessageAttachment` POSE LA CLÉ `messageId`** (#19801).
 *
 * Prisma n'écrit pas un champ optionnel qu'on ne lui donne pas. Un créateur qui
 * omet `messageId` produit donc un document SANS la clé, et les deux lectures
 * qui cherchent une pièce « encore libre » sont des ÉGALITÉS ou des
 * alternatives sur `null` :
 *
 * | lecteur | ce qu'il cherche | comment il le dit |
 * |---|---|---|
 * | `MaintenanceService.cleanupOrphanedAttachments` | les orphelines à balayer | égalité NUE — d'où #19801 |
 * | `FREE_ATTACHMENT` (`services/calls/callRecordingLink.ts`) | la pièce à rattacher à une bulle d'appel | `OR` des deux absences |
 * | `AttachmentService.associateAttachmentsToMessage` (2 sites) | la pièce à ATTACHER à son message | `unsetOrNull('messageId')` |
 *
 * Le troisième manquait à cette liste jusqu'à l'audit du cycle 183, et il
 * change la lecture de l'arriéré : **une pièce d'avant #19801 reste
 * ATTACHABLE** — elle n'est pas perdue, elle est seulement inbalayable.
 *
 * `tus-handler` (branche MESSAGE) omettait la clé : **aucune pièce jointe venue
 * d'un téléversement reprenable n'était balayable**, et le balayage journalisait
 * qu'il n'avait rien trouvé à nettoyer. Fuite de stockage silencieuse, pour
 * toute la population de ce chemin.
 *
 * ─── POURQUOI UN CLIQUET, ET PAS UN COMMENTAIRE ──────────────────────────────
 *
 * La règle était déjà la réponse du dépôt : `UploadProcessor` pose
 * `messageId: messageId || null` à ses deux sites, et la branche `PostMedia` du
 * MÊME `else` de `tus-handler` pose `postId: null` pour son propre balayage. La
 * discipline existait, elle était appliquée par trois sites sur quatre, et le
 * quatrième ne rougissait nulle part — « une règle ne se propage pas depuis son
 * énoncé : elle vaut là où quelqu'un l'a récitée » (leçon 307).
 *
 * ─── CE QUE LE BALAYAGE RETIENT ──────────────────────────────────────────────
 *
 * Il part des CRÉATEURS, jamais d'un idiome : `create`, `createMany` et `upsert`
 * sont les trois façons dont Prisma fabrique une ligne, et un balayage qui n'en
 * chercherait qu'une mesurerait la popularité d'une méthode (règle du cycle 107).
 * Pour chacun, il résout le littéral de création et lit ses clés de PREMIER
 * NIVEAU.
 *
 * Trois verdicts, et seul le premier est vert :
 *
 * | verdict | forme |
 * |---|---|
 * | `poses` | la clé est au premier niveau, sous une valeur qui ne peut pas être `undefined` |
 * | `missing` | le littéral est résolu et ne porte pas la clé |
 * | `unresolved` | le littéral ne l'est pas (variable, spread, tableau), ou la valeur peut être `undefined` |
 *
 * **Un site non résolu reste GARDÉ** : la direction sûre d'un cliquet est le
 * faux positif, qui fait regarder. Un `...spread` au premier niveau PEUT porter
 * la clé — et c'est précisément ce qu'on ne sait pas, donc ce qu'il faut rendre
 * explicite au site plutôt que supposer ici (cycle 182, constat A).
 *
 * ─── POSER LA CLÉ NE SUFFIT PAS : SA VALEUR NE DOIT PAS ÊTRE `undefined` ─────
 *
 * Trouvé par l'audit adversarial du cycle 183, et c'est le constat qui attaquait
 * la garantie que ce cliquet prétend installer. **Prisma IGNORE un champ
 * `undefined` exactement comme un champ absent** — le double du dépôt l'écrit
 * en tête (`helpers/mongo-where.ts` : « un champ `undefined` est IGNORÉ, comme
 * chez Prisma »). Un créateur qui écrit `messageId: peutÊtre?.id` produit donc,
 * sur le chemin où la chaîne est vide, **un document SANS la clé** — le défaut
 * exact du cycle 183 — et la première version de ce balayage rendait `poses`,
 * parce qu'elle ne testait que la PRÉSENCE SYNTAXIQUE de la clé.
 *
 * La discipline réelle du dépôt est plus forte que « la clé est posée » :
 * `UploadProcessor.ts:431` écrit `const finalMessageId = messageId || null;`
 * PRÉCISÉMENT pour fermer ce trou. Le cliquet garde donc les deux moitiés.
 *
 * Ce qu'il peut décider, et ce qu'il ne peut pas : `null`, `x || null`,
 * `x ?? null` sont sûrs ; `undefined` littéral et toute chaîne OPTIONNELLE
 * (`?.`) sont rougies, parce qu'elles peuvent prouvablement rendre `undefined`.
 * Un identifiant simple (`newMessageId`) est admis — c'est la forme des trois
 * créateurs qui écrivent un identifiant RÉEL, et le compilateur la gouverne.
 * **Cette limite est DITE plutôt que cachée** : un cliquet qui prétend décider
 * ce qu'il ne décide pas est la forme que le cycle 182 a payée.
 *
 * ─── CE QU'IL NE VOIT PAS, MESURÉ LE 2026-11-19 ──────────────────────────────
 *
 * Quatre formes lui échappent, toutes ABSENTES du dépôt à cette date — ce qui
 * en fait une dette dite, pas un angle mort :
 *
 * | forme | mesure |
 * |---|---|
 * | un ALIAS du modèle (`const m = prisma.messageAttachment; m.create(…)`) | aucun site |
 * | un accès par INDEX (`prisma.messageAttachment['create'](…)`) | aucun site |
 * | la création IMBRIQUÉE par relation (`message.create({ data: { attachments: { create: … } } })`) | aucun site |
 * | le littéral d'un `createMany` (le tableau n'est pas descendu) | aucun site — et il sort `unresolved`, donc gardé |
 *
 * La troisième mérite d'être nommée : l'en-tête disait « les trois façons dont
 * Prisma fabrique une ligne », et il y en a QUATRE. La création imbriquée
 * n'existe pas sur ce modèle aujourd'hui ; le cliquet du cycle 182 avait compté
 * les `participants: { create }` imbriqués, celui-ci ne le fait pas. C'est la
 * règle du cycle 107 — ne pas mesurer la popularité d'une méthode — prise en
 * défaut sur la méthode qu'on n'a pas vue.
 *
 * Et une forme qu'il rougit alors qu'elle est JUSTE : `message: { connect: { id } }`
 * écrit bien la colonne, et le remède que ce cliquet nomme (« poser
 * `messageId: null` ») serait REFUSÉ par Prisma (conflit scalaire/relation).
 * Aucun site ne l'emploie ; si l'un le fait, c'est l'exception à nommer ici, pas
 * le site à corriger.
 */
export type AttachmentCreationSite = {
  /** Chemin relatif à `src/` — jamais un numéro de ligne, qui dérive (cycle 87 bis). */
  readonly file: string;
  /** `create` | `createMany` | `upsert`. */
  readonly method: string;
  readonly verdict: 'poses' | 'missing' | 'unresolved';
  /** Pourquoi le littéral n'a pas été résolu — vide sinon. */
  readonly why: string;
};

const PENDING_KEY = 'messageId';
const MODEL = 'messageAttachment';

/**
 * Blanchit commentaires ET contenus de chaînes **en préservant la longueur**.
 *
 * Il existe déjà `stripCommentsPreservingStrings`
 * (`__tests__/route-manifest/root-mounted-surfaces.ts`), et elle ne convient
 * pas ici : elle GARDE les chaînes, parce qu'elle y cherche des chemins de
 * route. Ce balayage, lui, compte des accolades — et un `${…}` de gabarit ou
 * une accolade dans un littéral faussent la profondeur, donc le verdict. Les
 * commentaires sont blanchis pour la raison habituelle : ils CITENT la forme
 * fautive pour l'expliquer, et celui de `tus-handler` la cite en entier.
 *
 * ─── ET LES LITTÉRAUX DE REGEX, depuis l'audit du cycle 183 ──────────────────
 *
 * Sans état « regex », une APOSTROPHE dans un jeu de caractères — `/[^']+/` —
 * ouvre une chaîne qui se referme à l'apostrophe suivante, ou **à la fin du
 * fichier** s'il n'y en a pas : tout créateur situé plus bas devient INVISIBLE.
 * Reproduit par l'audit, et le dépôt porte déjà un tel motif
 * (`jobs/backfill-search-tokens.ts` → `/for the field '([^']+)'/`), qui ne doit
 * sa survie qu'à la PARITÉ de ses quatre apostrophes : le parseur se recalait
 * par accident.
 *
 * > **La borne d'un balayage garde contre un balayage VIDE, pas contre un
 * > balayage PARTIEL.** Un sixième créateur écrit sous un tel motif laissait
 * > `sites.length >= 5` et `toContain('tus-handler.ts')` au VERT. La borne est
 * > donc EXACTE désormais, pas un plancher.
 *
 * Le discriminant est celui d'usage : un `/` qui suit un opérateur ou une
 * ouverture commence une regex ; après un identifiant, une parenthèse fermante
 * ou un littéral, c'est une division.
 */
const AVANT_UNE_REGEX = /[=(,;:!&|?+\-*%~^[{<>]$/;

const blanked = (source: string): string => {
  const out = source.split('');
  let index = 0;
  let quote: string | null = null;
  const blank = (at: number) => {
    if (out[at] !== '\n') out[at] = ' ';
  };
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (quote !== null) {
      if (char === '\\') {
        blank(index);
        blank(index + 1);
        index += 2;
        continue;
      }
      if (char === quote) {
        quote = null;
        index += 1;
        continue;
      }
      blank(index);
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      index += 1;
      continue;
    }
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') {
        blank(index);
        index += 1;
      }
      continue;
    }
    if (char === '/' && next === '*') {
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        blank(index);
        index += 1;
      }
      blank(index);
      blank(index + 1);
      index += 2;
      continue;
    }
    if (char === '/' && AVANT_UNE_REGEX.test(source.slice(0, index).replace(/\s+$/, ''))) {
      index += 1;
      let classe = false;
      while (index < source.length && source[index] !== '\n') {
        const dans = source[index];
        if (dans === '\\') {
          blank(index);
          blank(index + 1);
          index += 2;
          continue;
        }
        if (dans === '[') classe = true;
        else if (dans === ']') classe = false;
        else if (dans === '/' && !classe) {
          index += 1;
          break;
        }
        blank(index);
        index += 1;
      }
      continue;
    }
    index += 1;
  }
  return out.join('');
};

/** L'index du caractère non blanc qui suit `from`, ou `-1`. */
const nextCode = (source: string, from: number): number => {
  let index = from;
  while (index < source.length && /\s/.test(source[index])) index += 1;
  return index < source.length ? index : -1;
};

/** La fin du bloc ouvert en `start` (qui doit porter `open`), ou `-1`. */
const blockEnd = (source: string, start: number, open: '{' | '(', close: '}' | ')'): number => {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === open) depth += 1;
    else if (source[index] === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
};

type Literal = { readonly keys: readonly string[]; readonly spread: boolean };

/** Les clés de PREMIER NIVEAU d'un littéral objet, et s'il porte un spread. */
const topLevelLiteral = (body: string): Literal => {
  const keys: string[] = [];
  let spread = false;
  let depth = 0;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === '{' || char === '[' || char === '(') depth += 1;
    else if (char === '}' || char === ']' || char === ')') depth -= 1;
    else if (depth === 0 && char === '.' && body.slice(index, index + 3) === '...') spread = true;
    else if (depth === 0 && char === ':') {
      const before = body.slice(0, index).match(/([A-Za-z_$][\w$]*)\s*$/);
      if (before) keys.push(before[1]);
    }
  }
  return { keys, spread };
};

/** La valeur de la clé `name` au premier niveau de `body`, ou `null`. */
const valueOf = (body: string, name: string): string | null => {
  let depth = 0;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === '{' || char === '[' || char === '(') depth += 1;
    else if (char === '}' || char === ']' || char === ')') depth -= 1;
    else if (depth === 0 && char === ':') {
      const before = body.slice(0, index).match(/([A-Za-z_$][\w$]*)\s*$/);
      if (before && before[1] === name) return body.slice(index + 1);
    }
  }
  return null;
};

/**
 * La valeur de la clé peut-elle PROUVABLEMENT rendre `undefined` ?
 *
 * `undefined` littéral, et toute chaîne optionnelle (`?.`) — Prisma ignorant un
 * champ `undefined` comme un champ absent, une telle valeur reproduit le défaut
 * que ce cliquet garde. `x || null` et `x ?? null` ferment le cas et sont donc
 * sûrs même s'ils portent un `?.` à gauche.
 */
const peutEtreUndefined = (value: string): boolean => {
  const borne = value.search(/[,}]/);
  const expression = (borne === -1 ? value : value.slice(0, borne)).trim();
  if (/(\|\||\?\?)\s*null$/.test(expression)) return false;
  return /\bundefined\b/.test(expression) || expression.includes('?.');
};

const verdictOf = (literal: string): { verdict: AttachmentCreationSite['verdict']; why: string } => {
  const start = nextCode(literal, 0);
  if (start === -1 || literal[start] !== '{') {
    return { verdict: 'unresolved', why: 'le littéral de création n’est pas un objet écrit sur place' };
  }
  const end = blockEnd(literal, start, '{', '}');
  if (end === -1) return { verdict: 'unresolved', why: 'littéral non refermé' };
  const body = literal.slice(start + 1, end);
  const { keys, spread } = topLevelLiteral(body);
  if (keys.includes(PENDING_KEY)) {
    const value = valueOf(body, PENDING_KEY) ?? '';
    return peutEtreUndefined(value)
      ? { verdict: 'unresolved', why: `la clé est posée mais sa valeur peut rendre \`undefined\`, que Prisma IGNORE comme une clé absente — la fermer par \`|| null\`` }
      : { verdict: 'poses', why: '' };
  }
  if (spread) return { verdict: 'unresolved', why: `un spread de premier niveau peut porter \`${PENDING_KEY}\`` };
  return { verdict: 'missing', why: '' };
};

export function attachmentCreationsIn(file: string, source: string): AttachmentCreationSite[] {
  const text = blanked(source);
  const sites: AttachmentCreationSite[] = [];
  const call = new RegExp(`\\b${MODEL}\\s*\\.\\s*(create|createMany|upsert)\\s*\\(`, 'g');
  for (let match = call.exec(text); match !== null; match = call.exec(text)) {
    const method = match[1];
    const paren = text.indexOf('(', match.index);
    const close = blockEnd(text, paren, '(', ')');
    const args = close === -1 ? '' : text.slice(paren + 1, close);
    const brace = nextCode(args, 0);
    if (close === -1 || brace === -1 || args[brace] !== '{') {
      sites.push({ file, method, verdict: 'unresolved', why: 'arguments non écrits sur place' });
      continue;
    }
    const body = args.slice(brace + 1, blockEnd(args, brace, '{', '}'));
    // `upsert` crée par sa clé `create` ; `create`/`createMany` par `data`.
    const key = method === 'upsert' ? 'create' : 'data';
    const literal = valueOf(body, key);
    if (literal === null) {
      sites.push({ file, method, verdict: 'unresolved', why: `aucune clé \`${key}\` de premier niveau` });
      continue;
    }
    sites.push({ file, method, ...verdictOf(literal) });
  }
  return sites;
}

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === '__tests__' || name === 'node_modules' ? [] : walk(path);
    }
    return name.endsWith('.ts') && !name.endsWith('.d.ts') && !name.includes('.test.') ? [path] : [];
  });

export type AttachmentPendingKeySweep = {
  /** Tous les créateurs vus — la BORNE : un balayage vide passerait au vert. */
  readonly sites: readonly AttachmentCreationSite[];
  /** Ceux qui ne posent pas la clé, ou dont on ne peut pas le dire. */
  readonly offenders: readonly AttachmentCreationSite[];
};

export function sweepAttachmentPendingKey(root: string): AttachmentPendingKeySweep {
  const sites = walk(root).flatMap((path) =>
    attachmentCreationsIn(relative(root, path).split(sep).join('/'), readFileSync(path, 'utf8')),
  );
  return { sites, offenders: sites.filter((site) => site.verdict !== 'poses') };
}
