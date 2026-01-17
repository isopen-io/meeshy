/**
 * Markdown Parser - Table Rendering
 *
 * Render markdown tables to HTML
 */

import type { MarkdownNode, RenderOptions } from '../types';
import { renderInlineNode } from './inline-renderer';

/**
 * Render table node to HTML
 *
 * @param node - Table node to render
 * @param index - Index in parent array
 * @param options - Rendering options
 * @returns HTML string
 */
export const renderTable = (
  node: MarkdownNode,
  index: number,
  options: RenderOptions = {}
): string => {
  const tableChildren = node.children?.map((child, i) => renderTableRow(child, i, options)).join('') || '';
  return `<div class="overflow-x-auto my-4"><table class="min-w-full border border-gray-300 dark:border-gray-600">${tableChildren}</table></div>`;
};

/**
 * Render table row node to HTML
 *
 * @param node - Table row node to render
 * @param index - Index in parent array
 * @param options - Rendering options
 * @returns HTML string
 */
const renderTableRow = (
  node: MarkdownNode,
  index: number,
  options: RenderOptions = {}
): string => {
  const rowChildren = node.children?.map((child, i) => renderTableCell(child, i, options)).join('') || '';
  return `<tr class="border-b border-gray-300 dark:border-gray-600">${rowChildren}</tr>`;
};

/**
 * Render table cell node to HTML
 *
 * @param node - Table cell node to render
 * @param index - Index in parent array
 * @param options - Rendering options
 * @returns HTML string
 */
const renderTableCell = (
  node: MarkdownNode,
  index: number,
  options: RenderOptions = {}
): string => {
  const cellTag = node.isHeader ? 'th' : 'td';
  const cellChildren = node.children?.map((child, i) => renderInlineNode(child, i, options)).join('') || '';
  const cellClass = node.isHeader
    ? 'px-4 py-2 bg-gray-100 dark:bg-gray-800 font-semibold text-left border border-gray-300 dark:border-gray-600'
    : 'px-4 py-2 border border-gray-300 dark:border-gray-600';
  const alignStyle = node.align ? `text-${node.align}` : '';
  return `<${cellTag} class="${cellClass} ${alignStyle}">${cellChildren}</${cellTag}>`;
};
