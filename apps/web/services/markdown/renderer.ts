/**
 * HTML Renderer Module
 * - Converts AST nodes to HTML
 * - Applies Tailwind classes
 * - Security: All user content is escaped
 */

import { MAX_HEADING_LEVEL } from './constants';
import { escapeHtml, sanitizeUrl } from './sanitizer';
import type { MarkdownNode, RenderOptions } from './types';

/**
 * Render a markdown node to HTML
 */
export const renderMarkdownNode = (
  node: MarkdownNode,
  index: number,
  options: RenderOptions = {}
): string => {
  const { onLinkClick, isDark } = options;

  switch (node.type) {
    case 'text':
      return escapeHtml(node.content || '');

    case 'bold':
      const boldChildren = node.children?.map((child, i) => renderMarkdownNode(child, i, options)).join('') || '';
      return `<strong class="whitespace-pre-wrap">${boldChildren}</strong>`;

    case 'italic':
      const italicChildren = node.children?.map((child, i) => renderMarkdownNode(child, i, options)).join('') || '';
      return `<em class="whitespace-pre-wrap">${italicChildren}</em>`;

    case 'strikethrough':
      const strikeChildren = node.children?.map((child, i) => renderMarkdownNode(child, i, options)).join('') || '';
      return `<del class="whitespace-pre-wrap">${strikeChildren}</del>`;

    case 'code-inline':
      return `<code class="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono break-all whitespace-pre-wrap">${escapeHtml(node.content || '')}</code>`;

    case 'link':
      const sanitizedUrl = sanitizeUrl(node.url);
      if (!sanitizedUrl) return escapeHtml(node.content || '');

      const isExternalLink = sanitizedUrl.startsWith('http') || sanitizedUrl.startsWith('https');
      const isMention = sanitizedUrl.startsWith('/u/');
      const target = isMention ? '' : 'target="_blank" rel="noopener noreferrer"';
      const linkClass = isMention
        ? 'text-purple-600 dark:text-purple-400 hover:underline font-medium whitespace-pre-wrap'
        : 'text-blue-600 dark:text-blue-400 underline hover:text-blue-700 dark:hover:text-blue-300 whitespace-pre-wrap';
      return `<a href="${sanitizedUrl}" ${target} class="${linkClass}">${escapeHtml(node.content || '')}</a>`;

    case 'image':
      const sanitizedImgUrl = sanitizeUrl(node.url);
      if (!sanitizedImgUrl) return '';
      return `<img src="${sanitizedImgUrl}" alt="${escapeHtml(node.alt || '')}" class="max-w-full h-auto rounded-lg my-2" loading="lazy" />`;

    case 'heading':
      const headingLevel = Math.min(Math.max(node.level || 1, 1), MAX_HEADING_LEVEL);
      const headingChildren = node.children?.map((child, i) => renderMarkdownNode(child, i, options)).join('') || '';
      const headingClasses = [
        'text-xl font-bold mt-4 mb-2',
        'text-lg font-bold mt-4 mb-2',
        'text-base font-semibold mt-3 mb-2',
        'text-sm font-semibold mt-3 mb-1',
        'text-xs font-semibold mt-2 mb-1',
        'text-xs font-semibold mt-2 mb-1',
      ];
      return `<h${headingLevel} class="${headingClasses[headingLevel - 1]}">${headingChildren}</h${headingLevel}>`;

    case 'code-block':
      const language = escapeHtml(node.language || 'text');
      const code = escapeHtml(node.content || '');
      return `<div class="max-w-full overflow-x-auto my-2"><pre class="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded-md text-sm font-mono overflow-x-auto"><code class="language-${language}">${code}</code></pre></div>`;

    case 'blockquote':
      const quoteChildren = node.children?.map((child, i) => renderMarkdownNode(child, i, options)).join('') || '';
      return `<blockquote class="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic my-4 text-gray-700 dark:text-gray-300">${quoteChildren}</blockquote>`;

    case 'list':
      const listTag = node.ordered ? 'ol' : 'ul';
      const listClass = node.ordered ? 'list-decimal list-inside my-2 space-y-1' : 'list-disc list-inside my-2 space-y-1';
      const listItems = node.children?.map((child, i) => renderMarkdownNode(child, i, options)).join('') || '';
      return `<${listTag} class="${listClass}">${listItems}</${listTag}>`;

    case 'list-item':
      const inlineChildren: MarkdownNode[] = [];
      const subLists: MarkdownNode[] = [];

      for (const child of node.children || []) {
        if (child.type === 'list') {
          subLists.push(child);
        } else {
          inlineChildren.push(child);
        }
      }

      const itemInlineContent = inlineChildren.map((child, i) => renderMarkdownNode(child, i, options)).join('');
      const itemSubLists = subLists.map((child, i) => renderMarkdownNode(child, i, options)).join('');

      return `<li>${itemInlineContent}${itemSubLists}</li>`;

    case 'paragraph':
      const paraChildren = node.children?.map((child, i) => renderMarkdownNode(child, i, options)).join('') || '';
      return `<p class="my-2 leading-relaxed whitespace-pre-wrap">${paraChildren}</p>`;

    case 'horizontal-rule':
      return '<hr class="my-4 border-gray-300 dark:border-gray-600" />';

    case 'line-break':
      return '<br />';

    case 'emoji':
      return node.content || '';

    case 'table':
      const tableChildren = node.children?.map((child, i) => renderMarkdownNode(child, i, options)).join('') || '';
      return `<div class="overflow-x-auto my-4"><table class="min-w-full border border-gray-300 dark:border-gray-600">${tableChildren}</table></div>`;

    case 'table-row':
      const rowChildren = node.children?.map((child, i) => renderMarkdownNode(child, i, options)).join('') || '';
      return `<tr class="border-b border-gray-300 dark:border-gray-600">${rowChildren}</tr>`;

    case 'table-cell':
      const cellTag = node.isHeader ? 'th' : 'td';
      const cellChildren = node.children?.map((child, i) => renderMarkdownNode(child, i, options)).join('') || '';
      const cellClass = node.isHeader
        ? 'px-4 py-2 bg-gray-100 dark:bg-gray-800 font-semibold text-left border border-gray-300 dark:border-gray-600'
        : 'px-4 py-2 border border-gray-300 dark:border-gray-600';
      const alignStyle = node.align ? `text-${node.align}` : '';
      return `<${cellTag} class="${cellClass} ${alignStyle}">${cellChildren}</${cellTag}>`;

    case 'task-list-item':
      const taskInlineChildren: MarkdownNode[] = [];
      const taskSubLists: MarkdownNode[] = [];

      for (const child of node.children || []) {
        if (child.type === 'list') {
          taskSubLists.push(child);
        } else {
          taskInlineChildren.push(child);
        }
      }

      const taskInlineContent = taskInlineChildren.map((child, i) => renderMarkdownNode(child, i, options)).join('');
      const taskSubListsContent = taskSubLists.map((child, i) => renderMarkdownNode(child, i, options)).join('');
      const checked = node.checked ? 'checked' : '';

      return `<li class="flex items-start gap-2"><input type="checkbox" ${checked} disabled class="mt-1" /><span>${taskInlineContent}</span>${taskSubListsContent}</li>`;

    default:
      return '';
  }
};
