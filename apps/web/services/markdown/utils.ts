/**
 * Markdown Parser - Utility Functions
 *
 * Helper functions for text processing
 */

import { INDENTATION_PATTERN, MEESHY_URL_PATTERN } from './rules/patterns';

/**
 * Get indentation level of a line (number of leading spaces)
 *
 * @param line - Line to analyze
 * @returns Number of leading spaces
 */
export const getIndentLevel = (line: string): number => {
  const match = INDENTATION_PATTERN.exec(line);
  return match ? match[1].length : 0;
};

/**
 * Convert Meeshy tracking URLs (m+TOKEN) to markdown links
 * Must be called BEFORE markdown parsing
 *
 * @param text - Text containing potential Meeshy URLs
 * @returns Text with Meeshy URLs converted to markdown links
 *
 * @example
 * processMeeshyUrls('Check m+ABC123 for details')
 * // Returns: 'Check [m+ABC123](m+ABC123) for details'
 */
export const processMeeshyUrls = (text: string): string => {
  return text.replace(MEESHY_URL_PATTERN, (match) => {
    return `[${match}](${match})`;
  });
};
