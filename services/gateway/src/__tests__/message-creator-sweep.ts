/**
 * Balayage des CRÉATEURS de `Message`, et de ce qu'ils écrivent dans
 * `deletedAt` (#20172).
 *
 * `Message` a résolu le piège MongoDB de l'égalité nue par la discipline
 * d'ÉCRITURE — `LIVE_MESSAGE_MARK = { deletedAt: null }`
 * (`services/messaging/liveMessage.ts`) — là où `Post` l'a résolu par la
 * LECTURE (`{ isSet: false }`, #19909). Les ~119 lectures qui filtrent
 * `deletedAt: null` ne sont donc justes que tant que CHAQUE créateur rend ce
 * filtre vrai.
 *
 * Et la discipline n'était tenue par RIEN : `liveMessage.test.ts` n'assert que
 * la FORME de la constante, et `deletedAt` est explicitement hors du cliquet
 * `soft-state-equality-filter-guard` (#19748). Ce n'est pas théorique —
 * `liveMessage.ts` dit lui-même que deux créateurs (les messages d'appel de
 * `CallService`) l'avaient PERDU, et `git log -S` date leur réparation du
 * 2026-11-18. Les lignes écrites avant ont la clé ABSENTE, et aucune migration
 * ne les rattrape.
 *
 * ## Ce que ce balayage mesure, et ce qu'il ne mesure pas
 *
 * Il juge ce qu'un site ÉCRIT, quand il peut le lire, et **PUBLIE ce qu'il ne
 * sait pas juger** plutôt que de rendre un verdict sur une intuition. Il ne
 * mesure RIEN des lignes déjà en base : une passe verte ne dit pas que la
 * population est saine, elle dit que le prochain créateur ne la dégradera pas.
 * Le comptage et la migration sont l'autre moitié de #20172, et ils touchent
 * des données de production.
 *
 * ## LE CRÉATEUR N'EST PAS TOUJOURS LE SITE D'APPEL
 *
 * C'est le point qui rend ce balayage plus qu'un `grep`, et il est mesuré :
 * `routes/links/messageIdempotency.ts` appelle `prisma.message.create({ data })`
 * sur un `data` qui est un **paramètre** — la marque, elle, est posée par son
 * appelant, `routes/links/messages.ts`, un fichier plus loin. Un balayage qui
 * ne regarde que les sites de `message.create` publierait donc ce relais comme
 * indécidable pour toujours, **et manquerait un second appelant qui oublierait
 * la marque**.
 *
 * Les RELAIS sont donc reconnus (une fonction qui reçoit un
 * `Prisma.Message…CreateInput` et le passe à `message.create`), et ce sont
 * leurs APPELANTS qui sont jugés — c'est la leçon « une audience imbriquée est
 * une audience » (#20100) appliquée à une écriture.
 *
 * ## La clé est `fichier#rang`, jamais un numéro de ligne
 *
 * Un numéro de ligne dérive à la première édition et transforme le cliquet en
 * bruit (doctrine du cliquet de l'audience vivante). Le rang est l'ordre
 * d'apparition dans le fichier.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export const SRC_ROOT = join(__dirname, '..');

/** La constante qui porte la discipline, et la colonne qu'elle écrit. */
export const MARKER = 'LIVE_MESSAGE_MARK';
const COLUMN = 'deletedAt';

const CREATE_METHODS = ['create', 'createMany', 'upsert'] as const;
export type CreateMethod = (typeof CREATE_METHODS)[number];

/**
 * `relais` n'est PAS une variante d'`indecidable` : il dit que ce site REÇOIT
 * son `data`, donc que le verdict se rend chez ses APPELANTS — qui sont jugés,
 * eux. Les confondre transformerait une délégation en dette, et l'inventaire se
 * lirait « on ne sait pas » là où on sait très bien (leçon des deux inventaires
 * du cliquet de l'audience vivante : « décidé large » et « pas encore
 * instruit » ne sont pas la même phrase).
 */
export type Verdict = 'marque' | 'nu' | 'indecidable' | 'relais';

export type MessageCreator = {
  /** Chemin relatif à `src/`, séparateurs POSIX. */
  readonly file: string;
  readonly method: CreateMethod;
  /** Rang d'apparition dans le fichier — stable à l'édition, pas à l'élargissement du discriminant. */
  readonly rank: number;
  readonly verdict: Verdict;
  /** Pourquoi le balayage ne juge pas (verdict `indecidable`) — jamais vide dans ce cas. */
  readonly why?: string;
  /** Le relais traversé, quand le site jugé n'est pas celui de `message.create`. */
  readonly via?: string;
};

const isProductionFile = (relativePath: string): boolean =>
  relativePath.endsWith('.ts') &&
  !relativePath.endsWith('.d.ts') &&
  !relativePath.split('/').includes('__tests__');

function collectFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const absolute = join(dir, entry);
    const relative = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(absolute).isDirectory()) return collectFiles(absolute, relative);
    return isProductionFile(relative) ? [relative] : [];
  });
}

/**
 * Les commentaires partent avant la recherche : sans cela le balayage retrouve
 * les commentaires des cycles précédents — qui CITENT les sites — au lieu des
 * sites. C'est la leçon du balayage des schémas de réponse.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/** Le texte équilibré qui suit `from`, jusqu'à la fermeture de son premier ouvrant. */
export function readBalanced(code: string, from: number): string {
  const closers: string[] = [];
  let out = '';
  for (let i = from; i < code.length; i += 1) {
    const c = code[i];
    if (c === '(' ) closers.push(')');
    else if (c === '{') closers.push('}');
    else if (c === '[') closers.push(']');
    else if (closers.length > 0 && c === closers[closers.length - 1]) closers.pop();
    out += c;
    if (closers.length === 0 && out.trim().length > 0) break;
  }
  return out.trim();
}

/** La valeur d'une clé dans un littéral d'objet, lue à la profondeur de la clé. */
export function readKeyValue(literal: string, key: string): string | null {
  const pattern = new RegExp(`(^|[{,\\s])${key}\\s*:\\s*`, 'g');
  for (let match = pattern.exec(literal); match !== null; match = pattern.exec(literal)) {
    const start = match.index + match[0].length;
    const before = literal.slice(0, match.index);
    const depth = [...before].reduce((d, c) => d + (c === '{' || c === '[' ? 1 : c === '}' || c === ']' ? -1 : 0), 0);
    if (depth !== 1) continue;
    const closers: string[] = [];
    let out = '';
    for (let i = start; i < literal.length; i += 1) {
      const c = literal[i];
      if (closers.length === 0 && (c === ',' || c === '}')) break;
      if (c === '(') closers.push(')');
      else if (c === '{') closers.push('}');
      else if (c === '[') closers.push(']');
      else if (c === closers[closers.length - 1]) closers.pop();
      out += c;
    }
    return out.trim();
  }
  return null;
}

/** Un littéral porte la discipline s'il répand la constante, ou écrit la colonne en clair. */
export const carriesMarker = (literal: string): boolean =>
  literal.includes(MARKER) || new RegExp(`\\b${COLUMN}\\s*:`).test(literal);

/** La déclaration `const <nom> = { … }` du même fichier, si elle existe. */
function resolveLocalLiteral(code: string, name: string): string | null {
  const pattern = new RegExp(`\\bconst\\s+${name}\\s*(?::[^=]*)?=\\s*`);
  const match = pattern.exec(code);
  if (match === null) return null;
  const value = readBalanced(code, match.index + match[0].length);
  return value.startsWith('{') ? value : null;
}

const judge = (literal: string): { verdict: Verdict; why?: string } => {
  if (literal.startsWith('{') || literal.startsWith('[')) {
    return carriesMarker(literal) ? { verdict: 'marque' } : { verdict: 'nu' };
  }
  if (/^[A-Za-z_$][\w$]*$/.test(literal)) return { verdict: 'indecidable', why: `\`data\` vient de \`${literal}\`, qui n'est pas un \`const\` littéral de ce fichier` };
  if (literal.includes('?')) return { verdict: 'indecidable', why: '`data` est un ternaire' };
  if (literal.includes('(')) return { verdict: 'indecidable', why: '`data` est un appel' };
  return { verdict: 'indecidable', why: '`data` n\'est pas un littéral lisible' };
};

/** Les noms de fonction qui RELAIENT un `Message…CreateInput` vers `message.create`. */
export function relayNames(root: string = SRC_ROOT): readonly string[] {
  const names = new Set<string>();
  for (const file of collectFiles(root)) {
    const code = stripComments(readFileSync(join(root, file), 'utf8'));
    if (!/\.message\s*\.\s*create\s*\(/.test(code)) continue;
    if (!/Message(Unchecked)?CreateInput/.test(code)) continue;
    const declaration = /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g;
    for (let match = declaration.exec(code); match !== null; match = declaration.exec(code)) {
      if (match[1] !== undefined) names.add(match[1]);
    }
  }
  return [...names].sort();
}

function sitesIn(file: string, code: string, relays: readonly string[]): MessageCreator[] {
  const found: MessageCreator[] = [];
  const ranks = new Map<CreateMethod, number>();

  for (const method of CREATE_METHODS) {
    const pattern = new RegExp(`\\.message\\s*\\.\\s*${method}\\s*\\(`, 'g');
    for (let match = pattern.exec(code); match !== null; match = pattern.exec(code)) {
      const rank = (ranks.get(method) ?? 0) + 1;
      ranks.set(method, rank);
      const args = readBalanced(code, match.index + match[0].length - 1);
      const inner = args.replace(/^\(/, '').replace(/\)$/, '').trim();
      const key = method === 'upsert' ? 'create' : 'data';
      const data = readKeyValue(inner, key);
      if (data === null) {
        const shorthand = new RegExp(`(^|[{,\\s])${key}\\s*(,|}|$)`).test(inner);
        const relayed = shorthand && relays.some((relay) => new RegExp(`\\b${relay}\\b`).test(code));
        found.push(relayed
          ? { file, method, rank, verdict: 'relais', why: `ce site REÇOIT son \`${key}\` ; ses appelants sont jugés à sa place` }
          : { file, method, rank, verdict: 'indecidable', why: `aucune clé \`${key}\` lisible dans l'argument` });
        continue;
      }
      const resolved = /^[A-Za-z_$][\w$]*$/.test(data) ? resolveLocalLiteral(code, data) : null;
      found.push({ file, method, rank, ...judge(resolved ?? data) });
    }
  }

  for (const relay of relays) {
    const pattern = new RegExp(`\\b${relay}\\s*\\(`, 'g');
    let rank = 0;
    for (let match = pattern.exec(code); match !== null; match = pattern.exec(code)) {
      if (/\bfunction\s+$/.test(code.slice(0, match.index)) || new RegExp(`(export\\s+(async\\s+)?function\\s+)$`).test(code.slice(0, match.index))) continue;
      const args = readBalanced(code, match.index + match[0].length - 1);
      const inner = args.replace(/^\(/, '').replace(/\)$/, '').trim();
      const data = readKeyValue(inner, 'data');
      if (data === null) continue;
      rank += 1;
      const resolved = /^[A-Za-z_$][\w$]*$/.test(data) ? resolveLocalLiteral(code, data) : null;
      found.push({ file, method: 'create', rank, via: relay, ...judge(resolved ?? data) });
    }
  }

  return found;
}

export function sweepMessageCreators(root: string = SRC_ROOT): readonly MessageCreator[] {
  const relays = relayNames(root);
  const sites = collectFiles(root).flatMap((file) =>
    sitesIn(file, stripComments(readFileSync(join(root, file), 'utf8')), relays)
  );
  return sites.sort((a, b) => a.file.localeCompare(b.file) || a.method.localeCompare(b.method) || a.rank - b.rank);
}

export const formatCreator = (site: MessageCreator): string =>
  `${site.file}#${site.method}${site.rank}${site.via === undefined ? '' : ` (via ${site.via})`}`;
