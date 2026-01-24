// Mock for dompurify to work in Jest tests
const DOMPurify = {
  sanitize: (dirty, config) => {
    if (!dirty) return '';

    let cleaned = dirty;

    // If ALLOWED_TAGS is empty array, strip all tags
    if (config && Array.isArray(config.ALLOWED_TAGS) && config.ALLOWED_TAGS.length === 0) {
      // Remove script tags and their content
      cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      // Remove style tags and their content
      cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
      // Remove all other HTML tags but keep content
      cleaned = cleaned.replace(/<[^>]+>/g, '');
      return cleaned;
    }

    // Default sanitization - remove dangerous tags
    cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    cleaned = cleaned.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
    cleaned = cleaned.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
    cleaned = cleaned.replace(/<embed[^>]*>/gi, '');
    cleaned = cleaned.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
    cleaned = cleaned.replace(/on\w+\s*=\s*[^\s>]*/gi, '');

    // If specific tags are allowed, only keep those
    if (config && config.ALLOWED_TAGS) {
      const allowedTags = config.ALLOWED_TAGS.join('|');
      const regex = new RegExp(`<(?!\\/?(${allowedTags})\\b)[^>]+>`, 'gi');
      cleaned = cleaned.replace(regex, '');
    }

    return cleaned;
  },

  isSupported: true,
};

module.exports = DOMPurify;
