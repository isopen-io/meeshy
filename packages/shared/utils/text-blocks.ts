/**
 * **LES BLOCS D'UN MESSAGE** (#7849) — titres, listes, citations et blocs de
 * code, découpés LIGNE PAR LIGNE. Jumelle de `text-segments.ts`, qui découpe
 * l'INTÉRIEUR d'une ligne : un bloc porte une chaîne que le rendu passe à
 * `segmentText`, sauf le bloc de code, littéral.
 *
 * Comme sa jumelle, elle ne rend AUCUN HTML — des objets. Et elle se tait par
 * défaut : un texte sans syntaxe de bloc est UN paragraphe identique à
 * l'entrée (`hasBlockSyntax` permet au rendu de ne rien changer à ce chemin,
 * l'immense majorité des messages).
 *
 * La syntaxe est volontairement RÉDUITE : trois niveaux de titre (`#` à `###`,
 * suivis d'une espace — `#projet` reste un hashtag), puces `-`/`*`/`+`, listes
 * `1.`/`1)`, citations `>` et blocs ```` ``` ````. Miroir iOS :
 * `MessageBlockParser` (`packages/MeeshySDK/.../MessageTextRenderer+Blocks.swift`).
 */

export type TextBlock =
  | { readonly kind: 'paragraph'; readonly text: string }
  | { readonly kind: 'heading'; readonly level: 1 | 2 | 3; readonly text: string }
  | { readonly kind: 'list'; readonly ordered: boolean; readonly start: number; readonly items: readonly string[] }
  | { readonly kind: 'quote'; readonly text: string }
  | { readonly kind: 'code'; readonly language: string | null; readonly text: string };

const HEADING = /^(#{1,3})[ \t]+(\S.*)$/;
const BULLET = /^[ \t]{0,3}[-*+][ \t]+(\S.*)$/;
const ORDERED = /^[ \t]{0,3}(\d{1,9})[.)][ \t]+(\S.*)$/;
const QUOTE = /^[ \t]{0,3}>[ \t]?(.*)$/;
const FENCE = /^[ \t]{0,3}```[ \t]*([\w+#.-]*)[ \t]*$/;

const isBlockLine = (line: string): boolean =>
  HEADING.test(line) || BULLET.test(line) || ORDERED.test(line) || QUOTE.test(line) || FENCE.test(line);

/** Le texte porte-t-il AU MOINS une ligne de bloc ? */
export function hasBlockSyntax(content: string): boolean {
  return content.split('\n').some(isBlockLine);
}

const trimBlankLines = (lines: readonly string[]): readonly string[] => {
  const first = lines.findIndex((line) => line.trim() !== '');
  if (first === -1) return [];
  const last = lines.length - 1 - [...lines].reverse().findIndex((line) => line.trim() !== '');
  return lines.slice(first, last + 1);
};

type Cursor = { readonly blocks: readonly TextBlock[]; readonly index: number };

const takeWhile = (lines: readonly string[], from: number, keep: (line: string) => boolean): number => {
  const stop = lines.slice(from).findIndex((line) => !keep(line));
  return stop === -1 ? lines.length : from + stop;
};

function step(lines: readonly string[], index: number): { readonly block: TextBlock | null; readonly next: number } {
  const line = lines[index] ?? '';

  const fence = FENCE.exec(line);
  if (fence !== null) {
    const close = takeWhile(lines, index + 1, (candidate) => !/^[ \t]{0,3}```[ \t]*$/.test(candidate));
    const language = fence[1] === undefined || fence[1] === '' ? null : fence[1];
    return { block: { kind: 'code', language, text: lines.slice(index + 1, close).join('\n') }, next: close + 1 };
  }

  const heading = HEADING.exec(line);
  if (heading !== null) {
    const level = (heading[1] ?? '#').length as 1 | 2 | 3;
    return { block: { kind: 'heading', level, text: (heading[2] ?? '').trim() }, next: index + 1 };
  }

  if (QUOTE.test(line)) {
    const end = takeWhile(lines, index, (candidate) => QUOTE.test(candidate));
    const text = lines
      .slice(index, end)
      .map((candidate) => QUOTE.exec(candidate)?.[1] ?? '')
      .join('\n');
    return { block: { kind: 'quote', text }, next: end };
  }

  if (BULLET.test(line)) {
    const end = takeWhile(lines, index, (candidate) => BULLET.test(candidate));
    const items = lines.slice(index, end).map((candidate) => BULLET.exec(candidate)?.[1] ?? '');
    return { block: { kind: 'list', ordered: false, start: 1, items }, next: end };
  }

  const ordered = ORDERED.exec(line);
  if (ordered !== null) {
    const end = takeWhile(lines, index, (candidate) => ORDERED.test(candidate));
    const items = lines.slice(index, end).map((candidate) => ORDERED.exec(candidate)?.[2] ?? '');
    return { block: { kind: 'list', ordered: true, start: Number(ordered[1]), items }, next: end };
  }

  const end = takeWhile(lines, index, (candidate) => !isBlockLine(candidate));
  const paragraph = trimBlankLines(lines.slice(index, end));
  return { block: paragraph.length === 0 ? null : { kind: 'paragraph', text: paragraph.join('\n') }, next: end };
}

/** Découpe `content` en blocs ; sans syntaxe de bloc, UN paragraphe identique à l'entrée. */
export function parseBlocks(content: string): readonly TextBlock[] {
  if (content === '') return [];
  if (!hasBlockSyntax(content)) return [{ kind: 'paragraph', text: content }];
  const lines = content.split('\n');
  const walk = ({ blocks, index }: Cursor): readonly TextBlock[] => {
    if (index >= lines.length) return blocks;
    const { block, next } = step(lines, index);
    return walk({ blocks: block === null ? blocks : [...blocks, block], index: next });
  };
  return walk({ blocks: [], index: 0 });
}
