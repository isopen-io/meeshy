/**
 * Markdown Parser V2.2-OPTIMIZED - Modular Architecture
 *
 * Main Facade - Public API
 *
 * ARCHITECTURE:
 * - Facade pattern for clean API
 * - Separated concerns (parsing, rendering, caching, sanitization)
 * - Modular design for maintainability
 *
 * PERFORMANCE:
 * - LRU cache (100 entries, 5min TTL)
 * - Single-pass parsing
 * - No highlight.js (plain code blocks)
 * - Pre-compiled regex with length limits
 *
 * SECURITY:
 * - HTML escaping (XSS prevention)
 * - URL sanitization (whitelist protocols)
 * - Input length validation (DoS prevention)
 * - Regex length limits (ReDoS prevention)
 */

import { parseMarkdown } from './parser';
import { renderMarkdownNode } from './renderer';
import { getCachedHtml, setCachedHtml } from './cache-service';
import type { RenderOptions, MarkdownNode } from './types';

/**
 * Convert markdown to HTML with caching
 *
 * Main entry point for the markdown parser
 */
export const markdownToHtml = (
  content: string,
  options: RenderOptions = {}
): string => {
  // Generate cache key
  const cacheKey = content + JSON.stringify(options);

  // Check cache first
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

// ============================================================================
// PUBLIC API EXPORTS
// ============================================================================

// Main function
export { parseMarkdown, renderMarkdownNode };

// Types
export type { MarkdownNode, RenderOptions } from './types';

// Default export for backward compatibility
export default {
  parseMarkdown,
  renderMarkdownNode,
  markdownToHtml
};
