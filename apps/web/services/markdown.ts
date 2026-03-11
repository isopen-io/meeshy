/**
 * Markdown Parser - Public API
 *
 * Re-export from modular implementation
 */

export { markdownToHtml, parseMarkdown, renderMarkdownNode } from './markdown/index';
export type { MarkdownNode, RenderOptions } from './markdown/index';

// Default export for backward compatibility
import parser from './markdown/index';
export default parser;
