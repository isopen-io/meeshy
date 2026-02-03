/**
 * Markdown Parser - Regex Patterns
 *
 * All pre-compiled regex patterns with length limits to prevent ReDoS
 * Hoisted outside functions for performance (js-hoist-regexp pattern)
 */

// Emoji Pattern - CVE Fix: Limit emoji code length {1,50}
export const EMOJI_PATTERN = /^:([a-zA-Z0-9_+-]{1,50}):/;

// Image Pattern - CVE Fix: Limit alt text and URL length
export const IMAGE_PATTERN = /^!\[([^\]]{0,200})\]\(([^)]{1,2048})\)/;

// Link Pattern - CVE Fix: Limit link text and URL length
export const LINK_PATTERN = /^\[([^\]]{1,500})\]\(([^)]{1,2048})\)/;

// Auto-link URL Pattern - CVE Fix: Limit URL length
export const AUTO_URL_PATTERN = /^(https?:\/\/[^\s<>()[\]]{1,2048})/;

// Inline Code Pattern - CVE Fix: Limit code length {1,500}
export const INLINE_CODE_PATTERN = /^`([^`]{1,500})`/;

// Strikethrough Pattern - CVE Fix: Limit strikethrough length {1,500}
export const STRIKETHROUGH_PATTERN = /^~~([^~]{1,500})~~/;

// Heading Pattern - CVE Fix: Limit heading text length
export const HEADING_PATTERN = /^(#{1,6})\s+(.{1,500})$/;

// Horizontal Rule Pattern
export const HORIZONTAL_RULE_PATTERN = /^(-{3,}|\*{3,}|_{3,})$/;

// Task List Pattern - CVE Fix: Limit task text length
export const TASK_LIST_PATTERN = /^[-*]\s+\[([ xX])\]\s+(.{1,1000})$/;

// Unordered List Pattern
export const UNORDERED_LIST_PATTERN = /^[-*]\s+/;

// Ordered List Pattern
export const ORDERED_LIST_PATTERN = /^\d+\.\s+/;

// Code Block Language Pattern
export const CODE_BLOCK_LANGUAGE_PATTERN = /^```(\w{1,20})?$/;

// Table Patterns
export const TABLE_LINE_PATTERN = /^\|.*\|$/;
export const TABLE_SEPARATOR_PATTERN = /^\|[\s:-]+\|$/;
export const TABLE_SEPARATOR_CONTENT_PATTERN = /[-:]/;

// Meeshy URL Pattern - CVE Fix: Limit token length
export const MEESHY_URL_PATTERN = /(m\+[A-Z0-9]{1,100})/gi;
export const MEESHY_URL_FORMAT_PATTERN = /^m\+[A-Z0-9]{1,100}$/i;

// URL Protocol Patterns
export const SAFE_PROTOCOLS_PATTERN = /^(https?|mailto|tel|m\+):/i;
export const RELATIVE_URL_PATTERN = /^(\/|\.\/|\.\.\/)/;
export const DANGEROUS_PROTOCOLS_PATTERN = /^(javascript|data|vbscript|file|about):/i;

// Indentation Pattern
export const INDENTATION_PATTERN = /^(\s*)/;

/**
 * Create dynamic bold/italic pattern for specific delimiter
 * @param delimiter The delimiter character (* or _)
 * @param double Whether to match double delimiter (bold) or single (italic)
 */
export const createDelimiterPattern = (delimiter: string, double: boolean): RegExp => {
  const escaped = `\\${delimiter}`;
  if (double) {
    return new RegExp(`^${escaped}${escaped}([^${delimiter}]{1,500})${escaped}${escaped}`);
  }
  return new RegExp(`^${escaped}([^${delimiter}]{1,500})${escaped}`);
};
