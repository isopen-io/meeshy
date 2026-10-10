import { parseBlocks, type TextBlock } from '@meeshy/shared/utils/text-blocks';
import { segmentText } from '@meeshy/shared/utils/text-segments';

import { displaySegments, type DisplaySegment } from './link-display';

/**
 * **CE QU'ON LIT D'UN TEXTE, SES LIENS LUS PAR LA LOI** (#9687, jumelle de
 * `MessageTextRenderer.plainText` iOS, `bdae65102a`) — la forme de
 * `plainTextOf` (`@meeshy/shared/utils/text-plain`, mêmes blocs, même
 * découpage), dont chaque lien est lu par la loi d'affichage
 * (`link-display.ts`, #9093) : `plainTextOf` seul garderait les crochets d'une
 * adresse écrite « [[https://…]] ». Ainsi :
 * « [libellé](url) » se lit « libellé », « [[url]] » se lit « url », sans
 * seconde règle — la carte dit ce que le fil montre.
 */
const flatten = (segments: readonly DisplaySegment[]): string =>
  segments.map((segment) => (segment.kind === 'emphasis' ? flatten(segment.children) : segment.kind === 'link' ? segment.display.text : segment.text)).join('');

const inline = (text: string): string => flatten(displaySegments(segmentText(text), undefined));

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

export function readableTextOf(content: string): string {
  return parseBlocks(content).map(blockText).join('\n');
}
