/**
 * Markdown Parser Type Definitions
 */

export interface MarkdownNode {
  type:
    | 'paragraph'
    | 'heading'
    | 'code-block'
    | 'blockquote'
    | 'list'
    | 'list-item'
    | 'horizontal-rule'
    | 'line-break'
    | 'text'
    | 'bold'
    | 'italic'
    | 'strikethrough'
    | 'code-inline'
    | 'link'
    | 'image'
    | 'table'
    | 'table-row'
    | 'table-cell'
    | 'task-list-item'
    | 'emoji';
  content?: string;
  children?: MarkdownNode[];
  level?: number; // Headings (1-6)
  language?: string; // Code blocks
  url?: string; // Links and images
  alt?: string; // Images
  ordered?: boolean; // Lists
  checked?: boolean; // Task lists
  isHeader?: boolean; // Table cells
  align?: 'left' | 'center' | 'right'; // Table alignment
  emojiCode?: string; // Emoji shortcode
  indent?: number; // List indentation (0, 2, 4, 6)
}

export interface RenderOptions {
  onLinkClick?: (url: string) => void;
  isDark?: boolean;
}

export interface CacheEntry {
  html: string;
  timestamp: number;
}

export interface ParseResult {
  node: MarkdownNode;
  endIndex: number;
}
