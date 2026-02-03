/**
 * Markdown Parser - Block Rendering
 *
 * Render block-level markdown elements to HTML
 */

import type { MarkdownNode, RenderOptions } from '../types';
import { renderInlineNode } from './inline-renderer';
import { escapeHtml } from '../security/sanitizer';
import { MAX_HEADING_LEVEL } from '../rules/constants';

/**
 * Render block markdown nodes to HTML
 * Handles: heading, code-block, blockquote, list, list-item, task-list-item,
 * paragraph, horizontal-rule
 *
 * @param node - Markdown node to render
 * @param index - Index in parent array
 * @param options - Rendering options
 * @returns HTML string
 */
export const renderBlockNode = (
  node: MarkdownNode,
  index: number,
  options: RenderOptions = {}
): string => {
  switch (node.type) {
    case 'heading': {
      const headingLevel = Math.min(Math.max(node.level || 1, 1), MAX_HEADING_LEVEL);
      const headingChildren = node.children?.map((child, i) => renderInlineNode(child, i, options)).join('') || '';
      const headingClasses = [
        'text-xl font-bold mt-4 mb-2',
        'text-lg font-bold mt-4 mb-2',
        'text-base font-semibold mt-3 mb-2',
        'text-sm font-semibold mt-3 mb-1',
        'text-xs font-semibold mt-2 mb-1',
        'text-xs font-semibold mt-2 mb-1',
      ];
      return `<h${headingLevel} class="${headingClasses[headingLevel - 1]}">${headingChildren}</h${headingLevel}>`;
    }

    case 'code-block': {
      // NO SYNTAX HIGHLIGHTING - plain text only for performance
      // Syntax highlighting can be added later with lazy loading
      const language = escapeHtml(node.language || 'text');
      const code = escapeHtml(node.content || '');
      return `<div class="max-w-full overflow-x-auto my-2"><pre class="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded-md text-sm font-mono overflow-x-auto"><code class="language-${language}">${code}</code></pre></div>`;
    }

    case 'blockquote': {
      const quoteChildren = node.children?.map((child, i) => renderInlineNode(child, i, options)).join('') || '';
      return `<blockquote class="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic my-4 text-gray-700 dark:text-gray-300">${quoteChildren}</blockquote>`;
    }

    case 'list': {
      const listTag = node.ordered ? 'ol' : 'ul';
      const listClass = node.ordered ? 'list-decimal list-inside my-2 space-y-1' : 'list-disc list-inside my-2 space-y-1';
      const listItems = node.children?.map((child, i) => renderListItem(child, i, options)).join('') || '';
      return `<${listTag} class="${listClass}">${listItems}</${listTag}>`;
    }

    case 'paragraph': {
      const paraChildren = node.children?.map((child, i) => renderInlineNode(child, i, options)).join('') || '';
      return `<p class="my-2 leading-relaxed whitespace-pre-wrap">${paraChildren}</p>`;
    }

    case 'horizontal-rule':
      return '<hr class="my-4 border-gray-300 dark:border-gray-600" />';

    default:
      return '';
  }
};

/**
 * Render list item node to HTML
 * Separates inline content from nested lists
 *
 * @param node - List item node to render
 * @param index - Index in parent array
 * @param options - Rendering options
 * @returns HTML string
 */
const renderListItem = (
  node: MarkdownNode,
  index: number,
  options: RenderOptions = {}
): string => {
  if (node.type === 'list-item') {
    const inlineChildren: MarkdownNode[] = [];
    const subLists: MarkdownNode[] = [];

    for (const child of node.children || []) {
      if (child.type === 'list') {
        subLists.push(child);
      } else {
        inlineChildren.push(child);
      }
    }

    const itemInlineContent = inlineChildren.map((child, i) => renderInlineNode(child, i, options)).join('');
    const itemSubLists = subLists.map((child, i) => renderBlockNode(child, i, options)).join('');

    return `<li>${itemInlineContent}${itemSubLists}</li>`;
  }

  if (node.type === 'task-list-item') {
    const taskInlineChildren: MarkdownNode[] = [];
    const taskSubLists: MarkdownNode[] = [];

    for (const child of node.children || []) {
      if (child.type === 'list') {
        taskSubLists.push(child);
      } else {
        taskInlineChildren.push(child);
      }
    }

    const taskInlineContent = taskInlineChildren.map((child, i) => renderInlineNode(child, i, options)).join('');
    const taskSubListsContent = taskSubLists.map((child, i) => renderBlockNode(child, i, options)).join('');
    const checked = node.checked ? 'checked' : '';

    return `<li class="flex items-start gap-2"><input type="checkbox" ${checked} disabled class="mt-1" /><span>${taskInlineContent}</span>${taskSubListsContent}</li>`;
  }

  return '';
};
