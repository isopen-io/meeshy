/**
 * Block Element Parser
 * - Headings
 * - Code blocks
 * - Blockquotes
 * - Horizontal rules
 * - Paragraphs
 */

import { PATTERNS, MAX_HEADING_LEVEL } from './constants';
import { parseInline } from './inline-parser';
import type { MarkdownNode, ParseResult } from './types';

/**
 * Get indentation level of a line (number of leading spaces)
 */
export const getIndentLevel = (line: string): number => {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
};

/**
 * Parse a single line for block-level elements
 */
export const parseLine = (line: string, inCodeBlock: boolean, inList: boolean): MarkdownNode | null => {
  const trimmed = line.trim();
  const indent = getIndentLevel(line);

  // Empty line
  if (!trimmed) {
    return inList ? null : { type: 'paragraph', children: [] };
  }

  // Code block delimiter (handled separately)
  if (trimmed.startsWith('```') && !inCodeBlock) {
    return null;
  }

  // Heading: # H1, ## H2, etc. (no indentation)
  if (indent === 0) {
    const headingMatch = trimmed.match(PATTERNS.heading);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, MAX_HEADING_LEVEL);
      return {
        type: 'heading',
        level,
        children: parseInline(headingMatch[2])
      };
    }
  }

  // Blockquote: > text
  if (trimmed.startsWith('>')) {
    const quoteText = trimmed.slice(1).trim();
    return {
      type: 'blockquote',
      children: parseInline(quoteText)
    };
  }

  // Horizontal rule: --- or *** or ___
  if (PATTERNS.horizontalRule.test(trimmed)) {
    return {
      type: 'horizontal-rule'
    };
  }

  // Normal paragraph
  return {
    type: 'paragraph',
    children: parseInline(line)
  };
};

/**
 * Parse a code block (no syntax highlighting for performance)
 */
export const parseCodeBlock = (lines: string[], startIndex: number): ParseResult => {
  const firstLine = lines[startIndex].trim();
  const languageMatch = firstLine.match(PATTERNS.codeBlock);
  const language = languageMatch ? languageMatch[1] || 'text' : 'text';

  let endIndex = startIndex + 1;
  const codeLines: string[] = [];

  while (endIndex < lines.length && !lines[endIndex].trim().startsWith('```')) {
    codeLines.push(lines[endIndex]);
    endIndex++;
  }

  return {
    node: {
      type: 'code-block',
      content: codeLines.join('\n'),
      language
    },
    endIndex: endIndex + 1
  };
};
