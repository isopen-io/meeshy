/**
 * Markdown Parser - Inline Parsing
 *
 * Parse inline markdown elements: bold, italic, links, code, emojis
 * Single-pass parsing with regex limits to prevent ReDoS
 */

import type { MarkdownNode } from '../types';
import { EMOJI_MAP } from '../rules/emoji-map';
import {
  EMOJI_PATTERN,
  IMAGE_PATTERN,
  LINK_PATTERN,
  AUTO_URL_PATTERN,
  INLINE_CODE_PATTERN,
  STRIKETHROUGH_PATTERN,
  createDelimiterPattern
} from '../rules/patterns';

/**
 * Parse inline markdown elements (bold, italic, links, etc.)
 * Single-pass parsing with regex limits to prevent ReDoS
 *
 * @param text - Text to parse
 * @returns Array of markdown nodes
 */
export const parseInline = (text: string): MarkdownNode[] => {
  const nodes: MarkdownNode[] = [];
  let currentText = '';
  let i = 0;

  const flushText = () => {
    if (currentText) {
      nodes.push({ type: 'text', content: currentText });
      currentText = '';
    }
  };

  while (i < text.length) {
    const char = text[i];
    const nextChar = text[i + 1];
    const remaining = text.slice(i);

    // Emojis: :emoji_code: - js-early-exit pattern
    if (char === ':') {
      const match = EMOJI_PATTERN.exec(remaining);
      if (match) {
        const emojiCode = match[1];
        if (EMOJI_MAP[emojiCode]) {
          flushText();
          nodes.push({
            type: 'emoji',
            emojiCode,
            content: EMOJI_MAP[emojiCode]
          });
          i += match[0].length;
          continue;
        }
      }
    }

    // Images: ![alt](url) - js-early-exit pattern
    if (char === '!' && nextChar === '[') {
      flushText();
      const match = IMAGE_PATTERN.exec(remaining);
      if (match) {
        nodes.push({
          type: 'image',
          alt: match[1],
          url: match[2]
        });
        i += match[0].length;
        continue;
      }
    }

    // Links: [text](url) - js-early-exit pattern
    if (char === '[') {
      flushText();
      const match = LINK_PATTERN.exec(remaining);
      if (match) {
        nodes.push({
          type: 'link',
          content: match[1],
          url: match[2]
        });
        i += match[0].length;
        continue;
      }
    }

    // Auto-link URLs: http:// or https:// - js-early-exit pattern
    if (char === 'h' && (remaining.startsWith('http://') || remaining.startsWith('https://'))) {
      flushText();
      const match = AUTO_URL_PATTERN.exec(remaining);
      if (match) {
        const url = match[1];
        nodes.push({
          type: 'link',
          content: url,
          url: url
        });
        i += url.length;
        continue;
      }
    }

    // Inline code: `code` - js-early-exit pattern
    if (char === '`') {
      flushText();
      const match = INLINE_CODE_PATTERN.exec(remaining);
      if (match) {
        nodes.push({
          type: 'code-inline',
          content: match[1]
        });
        i += match[0].length;
        continue;
      }
    }

    // Bold: **text** or __text__ - js-early-exit pattern
    if ((char === '*' && nextChar === '*') || (char === '_' && nextChar === '_')) {
      flushText();
      const delimiter = char;
      const regex = createDelimiterPattern(delimiter, true);
      const match = regex.exec(remaining);
      if (match) {
        nodes.push({
          type: 'bold',
          children: parseInline(match[1])
        });
        i += match[0].length;
        continue;
      }
    }

    // Strikethrough: ~~text~~ - js-early-exit pattern
    if (char === '~' && nextChar === '~') {
      flushText();
      const match = STRIKETHROUGH_PATTERN.exec(remaining);
      if (match) {
        nodes.push({
          type: 'strikethrough',
          children: parseInline(match[1])
        });
        i += match[0].length;
        continue;
      }
    }

    // Italic: *text* or _text_ (but not ** or __) - js-early-exit pattern
    if ((char === '*' && nextChar !== '*') || (char === '_' && nextChar !== '_')) {
      flushText();
      const delimiter = char;
      const regex = createDelimiterPattern(delimiter, false);
      const match = regex.exec(remaining);
      if (match) {
        nodes.push({
          type: 'italic',
          children: parseInline(match[1])
        });
        i += match[0].length;
        continue;
      }
    }

    // Normal character
    currentText += char;
    i++;
  }

  flushText();
  return nodes;
};
