/**
 * Markdown Parser - Input Validation
 *
 * Validates input to prevent DoS and other attacks
 */

import { MAX_CONTENT_LENGTH } from '../rules/constants';

/**
 * Validate markdown content length
 *
 * @param content - Markdown content to validate
 * @returns true if valid, false otherwise
 */
export const validateContentLength = (content: string): boolean => {
  return content.length <= MAX_CONTENT_LENGTH;
};

/**
 * Validate that content is not empty
 *
 * @param content - Content to validate
 * @returns true if valid, false otherwise
 */
export const validateNotEmpty = (content: string): boolean => {
  return content.trim().length > 0;
};
