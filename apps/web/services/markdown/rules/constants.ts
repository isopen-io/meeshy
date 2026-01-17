/**
 * Markdown Parser - Security and Performance Constants
 *
 * Defines limits to prevent DoS and ReDoS attacks
 */

// Security Limits
export const MAX_CONTENT_LENGTH = 1024 * 1024; // 1MB
export const MAX_URL_LENGTH = 2048;
export const MAX_HEADING_LEVEL = 6;
export const MAX_NESTED_LISTS = 10;
export const MAX_TABLE_CELLS = 100;

// Cache Configuration
export const MAX_CACHE_SIZE = 100;
export const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
