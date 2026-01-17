/**
 * Main Markdown Parser
 * - Orchestrates parsing pipeline
 * - Validates input
 * - Manages preprocessing
 */

import { MAX_CONTENT_LENGTH } from './constants';
import { processMeeshyUrls } from './sanitizer';
import { parseCodeBlock, parseLine } from './block-parser';
import { parseListItem } from './list-parser';
import { groupListItems } from './list-parser';
import { parseTable, isTableLine, isTableSeparator } from './table-parser';
import type { MarkdownNode } from './types';

/**
 * Parse markdown content into AST nodes
 */
export const parseMarkdown = (content: string): MarkdownNode[] => {
  if (!content || !content.trim()) {
    return [];
  }

  // CVE Fix: Validate input length
  if (content.length > MAX_CONTENT_LENGTH) {
    console.warn(`Content exceeds maximum length of ${MAX_CONTENT_LENGTH} bytes`);
    return [{
      type: 'paragraph',
      children: [{
        type: 'text',
        content: 'Content too large to display'
      }]
    }];
  }

  // Preprocess: Convert Meeshy URLs (m+TOKEN)
  const processedContent = processMeeshyUrls(content);

  const lines = processedContent.split('\n');
  const nodes: MarkdownNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code block
    if (trimmed.startsWith('```')) {
      const { node, endIndex } = parseCodeBlock(lines, i);
      nodes.push(node);
      i = endIndex;
      continue;
    }

    // Table
    if (isTableLine(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const { node, endIndex } = parseTable(lines, i);
      nodes.push(node);
      i = endIndex;
      continue;
    }

    // Try parsing as list item first
    const indent = line.match(/^(\s*)/)?.[1].length || 0;
    const listItem = parseListItem(line, indent);

    if (listItem) {
      nodes.push(listItem);
      i++;
      continue;
    }

    // Normal line (heading, blockquote, paragraph, etc.)
    const node = parseLine(line, false, false);
    if (node) {
      // Merge consecutive paragraphs with line breaks
      if (node.type === 'paragraph' && node.children && node.children.length > 0 && nodes.length > 0) {
        const lastNode = nodes[nodes.length - 1];
        if (lastNode.type === 'paragraph' && lastNode.children && lastNode.children.length > 0) {
          lastNode.children.push({ type: 'line-break' });
          lastNode.children.push(...(node.children || []));
          i++;
          continue;
        }
      }

      // Skip empty paragraphs (blank lines)
      if (node.type === 'paragraph' && (!node.children || node.children.length === 0)) {
        i++;
        continue;
      }

      nodes.push(node);
    }

    i++;
  }

  // Group list items into lists
  return groupListItems(nodes);
};
