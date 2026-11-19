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
 * | lecteur | ce qu'il cherche |
 * |---|---|
 * | `MaintenanceService.cleanupOrphanedAttachments` | les orphelines à balayer |
 * | `FREE_ATTACHMENT` (`services/calls/callRecordingLink.ts`) | la pièce à rattacher à une bulle d'appel |
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
 * Trois verdicts, et le troisième est un ROUGE :
 *
 * | verdict | forme |
 * |---|---|
 * | `poses` | la clé `messageId` est au premier niveau du littéral |
 * | `missing` | le littéral est résolu et ne la porte pas |
 * | `unresolved` | le littéral ne l'est pas (variable, spread, tableau) |
 *
 * **Un site non résolu reste GARDÉ** : la direction sûre d'un cliquet est le
 * faux positif, qui fait regarder. Un `...spread` au premier niveau PEUT porter
 * la clé — et c'est précisément ce qu'on ne sait pas, donc ce qu'il faut rendre
 * explicite au site plutôt que supposer ici (cycle 182, constat A).
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
 */
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

const verdictOf = (literal: string): { verdict: AttachmentCreationSite['verdict']; why: string } => {
  const start = nextCode(literal, 0);
  if (start === -1 || literal[start] !== '{') {
    return { verdict: 'unresolved', why: 'le littéral de création n’est pas un objet écrit sur place' };
  }
  const end = blockEnd(literal, start, '{', '}');
  if (end === -1) return { verdict: 'unresolved', why: 'littéral non refermé' };
  const { keys, spread } = topLevelLiteral(literal.slice(start + 1, end));
  if (keys.includes(PENDING_KEY)) return { verdict: 'poses', why: '' };
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
