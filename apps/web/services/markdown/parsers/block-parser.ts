/**
 * Markdown Parser - Block Parsing
 *
 * Parse block-level elements: headings, lists, code blocks, blockquotes
 */

import type { MarkdownNode, ParseResult } from '../types';
import { parseInline } from './inline-parser';
import { getIndentLevel } from '../utils';
import {
  MAX_HEADING_LEVEL,
  MAX_NESTED_LISTS
} from '../rules/constants';
import {
  HEADING_PATTERN,
  HORIZONTAL_RULE_PATTERN,
  TASK_LIST_PATTERN,
  UNORDERED_LIST_PATTERN,
  ORDERED_LIST_PATTERN,
  CODE_BLOCK_LANGUAGE_PATTERN
} from '../rules/patterns';

/**
 * Parse a single line and determine its type
 *
 * @param line - Line to parse
 * @param inCodeBlock - Whether currently inside a code block
 * @param inList - Whether currently inside a list
 * @returns Parsed markdown node or null
 */
export const parseLine = (line: string, inCodeBlock: boolean, inList: boolean): MarkdownNode | null => {
  const trimmed = line.trim();
  const indent = getIndentLevel(line);

  // Empty line - js-early-exit pattern
  if (!trimmed) {
    return inList ? null : { type: 'paragraph', children: [] };
  }

  // Code block delimiter (handled separately) - js-early-exit pattern
  if (trimmed.startsWith('```') && !inCodeBlock) {
    return null;
  }

  // Heading: # H1, ## H2, etc. (no indentation) - js-early-exit pattern
  if (indent === 0) {
    const match = HEADING_PATTERN.exec(trimmed);
    if (match) {
      const level = Math.min(match[1].length, MAX_HEADING_LEVEL);
      return {
        type: 'heading',
        level,
        children: parseInline(match[2])
      };
    }
  }

  // Blockquote: > text - js-early-exit pattern
  if (trimmed.startsWith('>')) {
    const quoteText = trimmed.slice(1).trim();
    return {
      type: 'blockquote',
      children: parseInline(quoteText)
    };
  }

  // Horizontal rule: --- or *** or ___ - js-early-exit pattern
  if (HORIZONTAL_RULE_PATTERN.test(trimmed)) {
    return {
      type: 'horizontal-rule'
    };
  }

  // Task list: - [ ] or - [x] - js-early-exit pattern
  const taskMatch = TASK_LIST_PATTERN.exec(trimmed);
  if (taskMatch) {
    const checked = taskMatch[1].toLowerCase() === 'x';
    const itemText = taskMatch[2];
    return {
      type: 'task-list-item',
      checked,
      indent: Math.min(indent, MAX_NESTED_LISTS * 2),
      children: parseInline(itemText)
    };
  }

  // Unordered list: - item or * item - js-early-exit pattern
  if (UNORDERED_LIST_PATTERN.test(trimmed)) {
    const itemText = trimmed.replace(UNORDERED_LIST_PATTERN, '');
    return {
      type: 'list-item',
      indent: Math.min(indent, MAX_NESTED_LISTS * 2),
      children: parseInline(itemText)
    };
  }

  // Ordered list: 1. item - js-early-exit pattern
  if (ORDERED_LIST_PATTERN.test(trimmed)) {
    const itemText = trimmed.replace(ORDERED_LIST_PATTERN, '');
    return {
      type: 'list-item',
      indent: Math.min(indent, MAX_NESTED_LISTS * 2),
      children: parseInline(itemText),
      ordered: true
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
 *
 * @param lines - All lines in the document
 * @param startIndex - Index where code block starts
 * @returns Parsed code block node and end index
 */
export const parseCodeBlock = (lines: string[], startIndex: number): ParseResult => {
  const firstLine = lines[startIndex].trim();
  const match = CODE_BLOCK_LANGUAGE_PATTERN.exec(firstLine);
  const language = match ? match[1] || 'text' : 'text';

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

/**
 * Build nested list from items with indentation
 *
 * @param items - List items to nest
 * @param baseIndent - Base indentation level
 * @returns Nested list structure
 */
export const buildNestedList = (items: MarkdownNode[], baseIndent: number = 0): MarkdownNode[] => {
  const result: MarkdownNode[] = [];
  let i = 0;

  while (i < items.length) {
    const item = items[i];
    const currentIndent = item.indent || 0;

    if (currentIndent === baseIndent) {
      // Look for sub-items (higher indentation)
      const subItems: MarkdownNode[] = [];
      let j = i + 1;

      while (j < items.length) {
        const nextItem = items[j];
        const nextIndent = nextItem.indent || 0;

        if (nextIndent > baseIndent) {
          subItems.push(nextItem);
          j++;
        } else {
          break;
        }
      }

      // Build nested children recursively - js-early-exit pattern
      if (subItems.length > 0) {
        const nestedChildren = buildNestedList(subItems, baseIndent + 2);
        const itemWithNested = {
          ...item,
          children: [
            ...(item.children || []),
            ...nestedChildren
          ]
        };
        result.push(itemWithNested);
        i = j;
      } else {
        result.push(item);
        i++;
      }
    } else {
      i++;
    }
  }

  return result;
};

/**
 * Group consecutive list-items into lists with nesting support
 *
 * @param nodes - Nodes to group
 * @returns Nodes with lists grouped
 */
export const groupListItems = (nodes: MarkdownNode[]): MarkdownNode[] => {
  const result: MarkdownNode[] = [];
  let currentListItems: MarkdownNode[] = [];
  let currentListOrdered = false;
  let currentListIsTask = false;

  const flushList = () => {
    if (currentListItems.length > 0) {
      const nestedItems = buildNestedList(currentListItems, 0);
      result.push({
        type: 'list',
        ordered: currentListOrdered,
        children: nestedItems
      });
      currentListItems = [];
    }
  };

  for (const node of nodes) {
    if (node.type === 'list-item' || node.type === 'task-list-item') {
      const isTaskItem = node.type === 'task-list-item';
      const isOrdered = node.ordered || false;
      const indent = node.indent || 0;

      if (currentListItems.length === 0 && indent === 0) {
        currentListOrdered = isOrdered;
        currentListIsTask = isTaskItem;
        currentListItems.push(node);
      } else if (indent === 0 && (currentListOrdered !== isOrdered || currentListIsTask !== isTaskItem)) {
        flushList();
        currentListOrdered = isOrdered;
        currentListIsTask = isTaskItem;
        currentListItems.push(node);
      } else {
        currentListItems.push(node);
      }
    } else {
      flushList();
      result.push(node);
    }
  }

  flushList();
  return result;
};
