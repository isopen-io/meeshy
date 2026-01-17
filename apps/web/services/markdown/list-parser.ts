/**
 * List Parser Module
 * - Unordered lists
 * - Ordered lists
 * - Task lists (checkboxes)
 * - Nested list support
 */

import { PATTERNS, MAX_NESTED_LISTS } from './constants';
import { parseInline } from './inline-parser';
import type { MarkdownNode } from './types';

/**
 * Parse a task list item: - [ ] or - [x]
 */
export const parseTaskListItem = (line: string, indent: number): MarkdownNode | null => {
  const trimmed = line.trim();
  const taskMatch = trimmed.match(PATTERNS.taskList);

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

  return null;
};

/**
 * Parse an unordered list item: - item or * item
 */
export const parseUnorderedListItem = (line: string, indent: number): MarkdownNode | null => {
  const trimmed = line.trim();

  if (PATTERNS.unorderedList.test(trimmed)) {
    const itemText = trimmed.replace(PATTERNS.unorderedList, '');
    return {
      type: 'list-item',
      indent: Math.min(indent, MAX_NESTED_LISTS * 2),
      children: parseInline(itemText)
    };
  }

  return null;
};

/**
 * Parse an ordered list item: 1. item
 */
export const parseOrderedListItem = (line: string, indent: number): MarkdownNode | null => {
  const trimmed = line.trim();

  if (PATTERNS.orderedList.test(trimmed)) {
    const itemText = trimmed.replace(PATTERNS.orderedList, '');
    return {
      type: 'list-item',
      indent: Math.min(indent, MAX_NESTED_LISTS * 2),
      children: parseInline(itemText),
      ordered: true
    };
  }

  return null;
};

/**
 * Parse any list item (task, unordered, or ordered)
 */
export const parseListItem = (line: string, indent: number): MarkdownNode | null => {
  return parseTaskListItem(line, indent)
    || parseUnorderedListItem(line, indent)
    || parseOrderedListItem(line, indent);
};

/**
 * Build nested list from items with indentation
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

      // Build nested children recursively
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
