/**
 * Markdown Parser - Inline Rendering
 *
 * Render inline markdown elements to HTML
 */

import type { MarkdownNode, RenderOptions } from '../types';
import { escapeHtml, sanitizeUrl } from '../security/sanitizer';

/**
 * Render inline markdown nodes to HTML
 * Handles: text, bold, italic, strikethrough, code-inline, link, image, emoji, line-break
 *
 * @param node - Markdown node to render
 * @param index - Index in parent array
 * @param options - Rendering options
 * @returns HTML string
 */
export const renderInlineNode = (
  node: MarkdownNode,
  index: number,
  options: RenderOptions = {}
): string => {
  switch (node.type) {
    case 'text':
      return escapeHtml(node.content || '');

    case 'bold': {
      const boldChildren = node.children?.map((child, i) => renderInlineNode(child, i, options)).join('') || '';
      return `<strong class="whitespace-pre-wrap">${boldChildren}</strong>`;
    }

    case 'italic': {
      const italicChildren = node.children?.map((child, i) => renderInlineNode(child, i, options)).join('') || '';
      return `<em class="whitespace-pre-wrap">${italicChildren}</em>`;
    }

    case 'strikethrough': {
      const strikeChildren = node.children?.map((child, i) => renderInlineNode(child, i, options)).join('') || '';
      return `<del class="whitespace-pre-wrap">${strikeChildren}</del>`;
    }

    case 'code-inline':
      return `<code class="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono break-all whitespace-pre-wrap">${escapeHtml(node.content || '')}</code>`;

    case 'link': {
      const sanitizedUrl = sanitizeUrl(node.url);
      // js-early-exit pattern
      if (!sanitizedUrl) return escapeHtml(node.content || '');

      const isExternalLink = sanitizedUrl.startsWith('http') || sanitizedUrl.startsWith('https');
      const isMention = sanitizedUrl.startsWith('/u/');
      const target = isMention ? '' : 'target="_blank" rel="noopener noreferrer"';
      const linkClass = isMention
        ? 'text-purple-600 dark:text-purple-400 hover:underline font-medium whitespace-pre-wrap'
        : 'text-blue-600 dark:text-blue-400 underline hover:text-blue-700 dark:hover:text-blue-300 whitespace-pre-wrap';
      return `<a href="${sanitizedUrl}" ${target} class="${linkClass}">${escapeHtml(node.content || '')}</a>`;
    }

    case 'image': {
      const sanitizedImgUrl = sanitizeUrl(node.url);
      // js-early-exit pattern
      if (!sanitizedImgUrl) return '';
      return `<img src="${sanitizedImgUrl}" alt="${escapeHtml(node.alt || '')}" class="max-w-full h-auto rounded-lg my-2" loading="lazy" />`;
    }

    case 'emoji':
      return node.content || '';

    case 'line-break':
      return '<br />';

    default:
      return '';
  }
};
