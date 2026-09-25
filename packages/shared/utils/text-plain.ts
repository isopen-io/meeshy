/**
 * **CE QU'ON LIT, SANS LA NOTATION** (#7849) — le texte d'un message débarrassé
 * de son markdown léger : `**gras**` → `gras`, `[doc](https://…)` → `doc`,
 * `# Titre` → `Titre`, une puce → sa ligne. Pour les surfaces qui n'ont
 * qu'UNE ligne de texte brut — l'aperçu d'une conversation, le libellé lu par
 * un lecteur d'écran — et qui montreraient sinon des étoiles.
 *
 * Il se DÉRIVE des deux lois de découpage (`text-blocks.ts`,
 * `text-segments.ts`), jamais d'expressions régulières à lui : ce qui
 * disparaît ici est exactement ce que le rendu enrichi transforme.
 */
import { parseBlocks, type TextBlock } from './text-blocks.js';
import { segmentText, type TextSegment } from './text-segments.js';

const flatten = (segments: readonly TextSegment[]): string =>
  segments.map((segment) => (segment.kind === 'emphasis' ? flatten(segment.children) : segment.text)).join('');

const inline = (text: string): string => flatten(segmentText(text));

const blockText = (block: TextBlock): string => {
  switch (block.kind) {
    case 'code':
      return block.text;
    case 'list':
      return block.items.map(inline).join('\n');
    default:
      return inline(block.text);
  }
};

export function plainTextOf(content: string): string {
  return parseBlocks(content).map(blockText).join('\n');
}
