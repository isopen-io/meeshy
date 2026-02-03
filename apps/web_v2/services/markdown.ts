/**
 * Markdown Parser - Public API
 * 
 * Re-export from modular implementation
 */

export { markdownToHtml, parseMarkdown, renderMarkdownNode } from './markdown';
export type { MarkdownNode, RenderOptions } from './markdown';

// Default export for backward compatibility
import parser from './markdown';
export default parser;
