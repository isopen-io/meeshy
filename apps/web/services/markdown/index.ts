/**
 * Markdown Parser - Public API
 *
 * Main entry point for the markdown parser
 * Exports the same API as the original markdown-parser-v2.2-optimized.ts
 */

// Main API - bundle-barrel-imports: Direct exports, not re-exporting from barrel
export { parseMarkdown, renderMarkdownNode, markdownToHtml } from './markdown-parser';

// Types
export type { MarkdownNode, RenderOptions } from './types';

// Default export for backward compatibility
export { default } from './markdown-parser';
