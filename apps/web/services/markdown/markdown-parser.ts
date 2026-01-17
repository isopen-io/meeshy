/**
 * Markdown Parser V2.2-OPTIMIZED - Main Orchestrator
 *
 * OPTIMIZATIONS vs V2:
 * - NO highlight.js (code blocks = plain text for now)
 * - 2 phases instead of 5 (Parser/Transformer → Renderer)
 * - LRU cache (100 entries) for parsed HTML
 * - Pre-compiled regex patterns
 * - Single-pass parsing
 *
 * SECURITY vs V1:
 * - CVE-1 Fix: XSS via code blocks - No dynamic code execution
 * - CVE-2 Fix: XSS via URLs - sanitizeUrl() with strict whitelist
 * - CVE-3 Fix: ReDoS - Strict limits on regex {1,2048}
 * - escapeHtml() on all user content
 * - Input validation (MAX_CONTENT_LENGTH = 1MB)
 *
 * PERFORMANCE TARGETS:
 * - Module import: <20ms (vs 100ms V2)
 * - Parse simple message: <5ms (vs 15ms V2)
 * - Parse complex message: <15ms (vs 50ms V2)
 * - Conversation 50 messages: <200ms (vs 2500ms V2)
 */

import type { MarkdownNode, RenderOptions } from './types';
import { MAX_CONTENT_LENGTH } from './rules/constants';
import { validateContentLength, validateNotEmpty } from './security/validators';
import { processMeeshyUrls } from './utils';
import { parseLine, parseCodeBlock, groupListItems } from './parsers/block-parser';
import { isTableLine, isTableSeparator, parseTable } from './parsers/table-parser';
import { renderBlockNode } from './renderers/block-renderer';
import { renderInlineNode } from './renderers/inline-renderer';
import { renderTable } from './renderers/table-renderer';
import { getCachedHtml, setCachedHtml } from './cache';

/**
 * Parse markdown content into AST nodes
 *
 * @param content - Markdown content to parse
 * @returns Array of markdown nodes
 *
 * @example
 * const nodes = parseMarkdown('# Hello\n\nThis is **bold**');
 * // Returns: [{ type: 'heading', level: 1, ... }, { type: 'paragraph', ... }]
 */
export const parseMarkdown = (content: string): MarkdownNode[] => {
  // js-early-exit pattern
  if (!content || !validateNotEmpty(content)) {
    return [];
  }

  // CVE Fix: Validate input length - js-early-exit pattern
  if (!validateContentLength(content)) {
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

    // Code block - js-early-exit pattern
    if (trimmed.startsWith('```')) {
      const { node, endIndex } = parseCodeBlock(lines, i);
      nodes.push(node);
      i = endIndex;
      continue;
    }

    // Table - js-early-exit pattern
    if (isTableLine(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const { node, endIndex } = parseTable(lines, i);
      nodes.push(node);
      i = endIndex;
      continue;
    }

    // Normal line
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

      // Skip empty paragraphs (blank lines) - js-early-exit pattern
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

/**
 * Render a markdown node to HTML
 *
 * @param node - Markdown node to render
 * @param index - Index in parent array
 * @param options - Rendering options
 * @returns HTML string
 */
export const renderMarkdownNode = (
  node: MarkdownNode,
  index: number,
  options: RenderOptions = {}
): string => {
  // Handle table rendering separately
  if (node.type === 'table') {
    return renderTable(node, index, options);
  }

  // Handle block-level elements
  if (['heading', 'code-block', 'blockquote', 'list', 'paragraph', 'horizontal-rule'].includes(node.type)) {
    return renderBlockNode(node, index, options);
  }

  // Handle inline elements
  return renderInlineNode(node, index, options);
};

/**
 * Convert markdown to HTML with caching
 *
 * Performance optimizations:
 * - LRU cache (100 entries, 5min TTL)
 * - Single-pass parsing
 * - No highlight.js (plain code blocks)
 * - Pre-compiled regex with length limits
 *
 * Security features:
 * - HTML escaping (XSS prevention)
 * - URL sanitization (whitelist protocols)
 * - Input length validation (DoS prevention)
 * - Regex length limits (ReDoS prevention)
 *
 * @param content - Markdown content
 * @param options - Rendering options
 * @returns HTML string
 *
 * @example
 * const html = markdownToHtml('**Hello** world!');
 * // Returns: '<p class="my-2 leading-relaxed whitespace-pre-wrap"><strong class="whitespace-pre-wrap">Hello</strong> world!</p>'
 */
export const markdownToHtml = (
  content: string,
  options: RenderOptions = {}
): string => {
  // Generate cache key
  const cacheKey = content + JSON.stringify(options);

  // Check cache first - js-early-exit pattern
  const cachedHtml = getCachedHtml(cacheKey);
  if (cachedHtml) {
    return cachedHtml;
  }

  // Parse and render
  const nodes = parseMarkdown(content);
  const html = nodes.map((node, i) => renderMarkdownNode(node, i, options)).join('');

  // Store in cache
  setCachedHtml(cacheKey, html);

  return html;
};

// Export default object for backward compatibility
export default {
  parseMarkdown,
  renderMarkdownNode,
  markdownToHtml
};
