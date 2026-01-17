/**
 * Inline Element Parser
 * - Bold, italic, strikethrough
 * - Links and images
 * - Inline code
 * - Emojis
 * - Auto-linking URLs
 */

import { PATTERNS, EMOJI_MAP } from './constants';
import type { MarkdownNode } from './types';

/**
 * Parse inline markdown elements (bold, italic, links, etc.)
 * Single-pass parsing with regex limits to prevent ReDoS
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

    // Emojis: :emoji_code:
    if (char === ':') {
      const emojiMatch = remaining.match(PATTERNS.emoji);
      if (emojiMatch) {
        const emojiCode = emojiMatch[1];
        if (EMOJI_MAP[emojiCode]) {
          flushText();
          nodes.push({
            type: 'emoji',
            emojiCode,
            content: EMOJI_MAP[emojiCode]
          });
          i += emojiMatch[0].length;
          continue;
        }
      }
    }

    // Images: ![alt](url)
    if (char === '!' && nextChar === '[') {
      flushText();
      const imageMatch = remaining.match(PATTERNS.image);
      if (imageMatch) {
        nodes.push({
          type: 'image',
          alt: imageMatch[1],
          url: imageMatch[2]
        });
        i += imageMatch[0].length;
        continue;
      }
    }

    // Links: [text](url)
    if (char === '[') {
      flushText();
      const linkMatch = remaining.match(PATTERNS.link);
      if (linkMatch) {
        nodes.push({
          type: 'link',
          content: linkMatch[1],
          url: linkMatch[2]
        });
        i += linkMatch[0].length;
        continue;
      }
    }

    // Auto-link URLs: http:// or https://
    if (char === 'h' && (remaining.startsWith('http://') || remaining.startsWith('https://'))) {
      flushText();
      const urlMatch = remaining.match(PATTERNS.autoUrl);
      if (urlMatch) {
        const url = urlMatch[1];
        nodes.push({
          type: 'link',
          content: url,
          url: url
        });
        i += url.length;
        continue;
      }
    }

    // Inline code: `code`
    if (char === '`') {
      flushText();
      const codeMatch = remaining.match(PATTERNS.inlineCode);
      if (codeMatch) {
        nodes.push({
          type: 'code-inline',
          content: codeMatch[1]
        });
        i += codeMatch[0].length;
        continue;
      }
    }

    // Bold: **text** or __text__
    if ((char === '*' && nextChar === '*') || (char === '_' && nextChar === '_')) {
      flushText();
      const pattern = char === '*' ? PATTERNS.boldStar : PATTERNS.boldUnderscore;
      const boldMatch = remaining.match(pattern);
      if (boldMatch) {
        nodes.push({
          type: 'bold',
          children: parseInline(boldMatch[1])
        });
        i += boldMatch[0].length;
        continue;
      }
    }

    // Strikethrough: ~~text~~
    if (char === '~' && nextChar === '~') {
      flushText();
      const strikeMatch = remaining.match(PATTERNS.strikethrough);
      if (strikeMatch) {
        nodes.push({
          type: 'strikethrough',
          children: parseInline(strikeMatch[1])
        });
        i += strikeMatch[0].length;
        continue;
      }
    }

    // Italic: *text* or _text_ (but not ** or __)
    if ((char === '*' && nextChar !== '*') || (char === '_' && nextChar !== '_')) {
      flushText();
      const pattern = char === '*' ? PATTERNS.italicStar : PATTERNS.italicUnderscore;
      const italicMatch = remaining.match(pattern);
      if (italicMatch) {
        nodes.push({
          type: 'italic',
          children: parseInline(italicMatch[1])
        });
        i += italicMatch[0].length;
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
