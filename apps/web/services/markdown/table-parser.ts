/**
 * Table Parser Module
 * - GitHub-flavored markdown tables
 * - Header row with separator
 * - Column alignment (left, center, right)
 * - Cell limit for security
 */

import { MAX_TABLE_CELLS } from './constants';
import { parseInline } from './inline-parser';
import type { MarkdownNode, ParseResult } from './types';

/**
 * Check if line is a table line
 */
export const isTableLine = (line: string): boolean => {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|');
};

/**
 * Check if line is a table separator (header separator)
 */
export const isTableSeparator = (line: string): boolean => {
  const trimmed = line.trim();
  return /^\|[\s:-]+\|$/.test(trimmed) && /[-:]/.test(trimmed);
};

/**
 * Parse column alignment from separator
 */
export const parseAlignment = (separator: string): 'left' | 'center' | 'right' => {
  const trimmed = separator.trim();
  if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
  if (trimmed.endsWith(':')) return 'right';
  return 'left';
};

/**
 * Parse a table row into cells
 */
export const parseTableRow = (
  line: string,
  isHeader: boolean,
  alignments?: ('left' | 'center' | 'right')[]
): MarkdownNode => {
  const trimmed = line.trim();
  const cellsContent = trimmed.slice(1, -1).split('|').map(cell => cell.trim());

  // CVE Fix: Limit number of table cells
  const limitedCells = cellsContent.slice(0, MAX_TABLE_CELLS);

  const cells: MarkdownNode[] = limitedCells.map((content, index) => ({
    type: 'table-cell',
    isHeader,
    align: alignments ? alignments[index] : 'left',
    children: parseInline(content)
  }));

  return {
    type: 'table-row',
    children: cells
  };
};

/**
 * Parse a complete table block
 */
export const parseTable = (lines: string[], startIndex: number): ParseResult => {
  const rows: MarkdownNode[] = [];
  let endIndex = startIndex;
  let alignments: ('left' | 'center' | 'right')[] = [];

  // Parse header row
  if (isTableLine(lines[startIndex])) {
    // Check if next line is separator
    if (endIndex + 1 < lines.length && isTableSeparator(lines[endIndex + 1])) {
      const separatorLine = lines[endIndex + 1].trim();
      const separators = separatorLine.slice(1, -1).split('|').map(s => s.trim());
      alignments = separators.map(parseAlignment);

      // Parse header row
      rows.push(parseTableRow(lines[startIndex], true, alignments));
      endIndex += 2;

      // Parse body rows
      while (endIndex < lines.length && isTableLine(lines[endIndex])) {
        rows.push(parseTableRow(lines[endIndex], false, alignments));
        endIndex++;
      }
    }
  }

  return {
    node: {
      type: 'table',
      children: rows
    },
    endIndex
  };
};
