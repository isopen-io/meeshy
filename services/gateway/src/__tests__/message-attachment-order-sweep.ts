/**
 * Balayage de #9776 — toute lecture Prisma qui SERT les pièces d'un message
 * les trie par `MESSAGE_ATTACHMENT_ORDER`.
 *
 * Sans `orderBy`, MongoDB ne promet aucun ordre, et un `orderBy` sur
 * `createdAt` seul rend l'ordre de FIN des téléversements parallèles — jamais
 * celui du composeur. Le balayage part de la RELATION (`attachments: …` dans un
 * `select`/`include`) et de la lecture directe par message
 * (`messageAttachment.findMany({ where: { messageId: … } })`).
 *
 * Il ne se prononce PAS sur ce qui ne sert aucune pièce : un compteur
 * (`_count`), un filtre (`some`/`none`/`every`), un schéma de réponse
 * (`type:`), ou une projection qui ne lit que la protection, l'id ou le type
 * MIME (rien d'ordonné ne part au client). Ces formes sont énumérées dans
 * `NON_SERVING_SELECTS` — une forme de plus s'y ajoute avec sa raison.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ORDER = 'MESSAGE_ATTACHMENT_ORDER';

/** Projections qui ne servent rien d'ordonné : la protection, l'id, le type. */
const NON_SERVING_SELECTS: readonly RegExp[] = [
  /^select:\{(id:true,?|mimeType:true,?)+\}$/,
  /^select:\{(isViewOnce:true,?|isBlurred:true,?|effectFlags:true,?)+\}$/,
  /^select:(attachmentProtectionSelect|PROTECTION_SELECT|PIECE_PROTECTION_SELECT)$/,
];

export type OrderSweepFinding = { readonly file: string; readonly line: number; readonly snippet: string };

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : walk(path);
    return path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.endsWith('.d.ts') ? [path] : [];
  });

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');

/** L'objet `{ … }` qui commence à `open`, accolades équilibrées. */
const balancedObject = (source: string, open: number): string => {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(open, index + 1);
  }
  return source.slice(open);
};

const compact = (text: string) => text.replace(/\s+/g, '').replace(/;/g, ',').replace(/,}/g, '}');

/** Les clés de premier niveau de `{ … }` (compacté). */
const topLevelKeys = (body: string): string[] => {
  const keys: string[] = [];
  let depth = 0;
  let start = 1;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === '{' || char === '[' || char === '(') depth += 1;
    if (char === '}' || char === ']' || char === ')') depth -= 1;
    if ((char === ',' && depth === 1) || index === body.length - 1) {
      const key = body.slice(start, index).split(':')[0].replace(/^\.\.\./, '');
      if (key) keys.push(key);
      start = index + 1;
    }
  }
  return keys;
};

/** Les seuls arguments d'une lecture de relation Prisma. */
const RELATION_ARGS = new Set(['select', 'include', 'orderBy', 'take', 'skip', 'where', 'cursor', 'distinct']);

const isNonServing = (body: string): boolean => {
  const flat = compact(body);
  if (!topLevelKeys(flat).every((key) => RELATION_ARGS.has(key))) return true;
  const withoutTake = flat.slice(1, -1).replace(/,?take:[^,}]+/, '');
  return NON_SERVING_SELECTS.some((shape) => shape.test(withoutTake));
};

const lineOf = (source: string, index: number) => source.slice(0, index).split('\n').length;

export function sweepUnorderedAttachmentReads(root: string): OrderSweepFinding[] {
  return walk(root).flatMap((path) => {
    const source = stripComments(readFileSync(path, 'utf8'));
    const file = relative(root, path);
    const relationReads = [...source.matchAll(/\battachments:\s*(\{|true\b)/g)].flatMap((match) => {
      const at = match.index ?? 0;
      const before = compact(source.slice(Math.max(0, at - 40), at));
      if (/_count:\{select:\{$/.test(before) || /select:\{$/.test(before) && /_count/.test(before)) return [];
      if (match[1] === 'true') {
        return /_count:\{select:\{[^}]*$/.test(compact(source.slice(Math.max(0, at - 200), at)))
          ? []
          : [{ file, line: lineOf(source, at), snippet: 'attachments: true' }];
      }
      const body = balancedObject(source, at + match[0].length - 1);
      if (body.includes(ORDER) || isNonServing(body)) return [];
      return [{ file, line: lineOf(source, at), snippet: compact(body).slice(0, 80) }];
    });
    const directReads = [...source.matchAll(/messageAttachment\.findMany\(\s*\{/g)].flatMap((match) => {
      const at = match.index ?? 0;
      const body = balancedObject(source, at + match[0].length - 1);
      const servesOneMessage = /where:\{messageId:[A-Za-z_.]+\}/.test(compact(body));
      if (!servesOneMessage || body.includes(ORDER) || /distinct:/.test(body)) return [];
      return [{ file, line: lineOf(source, at), snippet: compact(body).slice(0, 80) }];
    });
    return [...relationReads, ...directReads];
  });
}
