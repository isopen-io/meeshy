/**
 * Markdown Parser - Table Parsing
 *
 * Parse markdown tables with alignment support
 */

import type { MarkdownNode, ParseResult } from '../types';
import { parseInline } from './inline-parser';
import { MAX_TABLE_CELLS } from '../rules/constants';
import {
  TABLE_LINE_PATTERN,
  TABLE_SEPARATOR_PATTERN,
  TABLE_SEPARATOR_CONTENT_PATTERN
} from '../rules/patterns';

/**
 * Check if line is a table line
 *
 * @param line - Line to check
 * @returns true if line is a table line
 */
export const isTableLine = (line: string): boolean => {
  const trimmed = line.trim();
  return TABLE_LINE_PATTERN.test(trimmed);
};

/**
 * Check if line is a table separator (header separator)
 *
 * @param line - Line to check
 * @returns true if line is a table separator
 */
export const isTableSeparator = (line: string): boolean => {
  const trimmed = line.trim();
  return TABLE_SEPARATOR_PATTERN.test(trimmed) && TABLE_SEPARATOR_CONTENT_PATTERN.test(trimmed);
};

/**
 * Parse column alignment from separator
 *
 * @param separator - Separator cell content
 * @returns Alignment direction
 */
export const parseAlignment = (separator: string): 'left' | 'center' | 'right' => {
  const trimmed = separator.trim();
  // js-early-exit pattern
  if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
  if (trimmed.endsWith(':')) return 'right';
  return 'left';
};

/**
 * Parse a table row into cells
 *
 * @param line - Table row line
 * @param isHeader - Whether this is a header row
 * @param alignments - Column alignments (optional)
 * @returns Parsed table row node
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
 *
 * @param lines - All lines in the document
 * @param startIndex - Index where table starts
 * @returns Parsed table node and end index
 */
export const parseTable = (lines: string[], startIndex: number): ParseResult => {
  const rows: MarkdownNode[] = [];
  let endIndex = startIndex;
  let alignments: ('left' | 'center' | 'right')[] = [];

  // Parse header row - js-early-exit pattern
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
