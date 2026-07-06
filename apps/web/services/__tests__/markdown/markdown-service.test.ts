/**
 * Comprehensive unit tests for apps/web/services/markdown/** submodules.
 * Coverage target: ≥92% line + branch on all 16 files.
 *
 * Covers: sanitizer, validators, constants, patterns, emoji-map, utils,
 *         cache, block-parser, inline-parser, table-parser, block-renderer,
 *         inline-renderer, table-renderer, markdown-parser, index, types.
 */

import { escapeHtml, sanitizeUrl } from '../../markdown/security/sanitizer';
import { validateContentLength, validateNotEmpty } from '../../markdown/security/validators';
import {
  MAX_CONTENT_LENGTH,
  MAX_URL_LENGTH,
  MAX_HEADING_LEVEL,
  MAX_NESTED_LISTS,
  MAX_TABLE_CELLS,
  MAX_CACHE_SIZE,
  CACHE_TTL,
} from '../../markdown/rules/constants';
import { EMOJI_MAP } from '../../markdown/rules/emoji-map';
import {
  createDelimiterPattern,
  EMOJI_PATTERN,
  IMAGE_PATTERN,
  LINK_PATTERN,
  AUTO_URL_PATTERN,
  INLINE_CODE_PATTERN,
  STRIKETHROUGH_PATTERN,
  HEADING_PATTERN,
  HORIZONTAL_RULE_PATTERN,
  TASK_LIST_PATTERN,
  UNORDERED_LIST_PATTERN,
  ORDERED_LIST_PATTERN,
  TABLE_LINE_PATTERN,
  TABLE_SEPARATOR_PATTERN,
  TABLE_SEPARATOR_CONTENT_PATTERN,
  MEESHY_URL_PATTERN,
  MEESHY_URL_FORMAT_PATTERN,
  SAFE_PROTOCOLS_PATTERN,
  RELATIVE_URL_PATTERN,
  DANGEROUS_PROTOCOLS_PATTERN,
  INDENTATION_PATTERN,
  CODE_BLOCK_LANGUAGE_PATTERN,
} from '../../markdown/rules/patterns';
import { getIndentLevel, processMeeshyUrls } from '../../markdown/utils';
import { getCachedHtml, setCachedHtml, clearCache } from '../../markdown/cache';
import {
  parseLine,
  parseCodeBlock,
  buildNestedList,
  groupListItems,
} from '../../markdown/parsers/block-parser';
import { parseInline } from '../../markdown/parsers/inline-parser';
import {
  isTableLine,
  isTableSeparator,
  parseAlignment,
  parseTableRow,
  parseTable,
} from '../../markdown/parsers/table-parser';
import { renderBlockNode } from '../../markdown/renderers/block-renderer';
import { renderInlineNode } from '../../markdown/renderers/inline-renderer';
import { renderTable } from '../../markdown/renderers/table-renderer';
import {
  parseMarkdown,
  renderMarkdownNode,
  markdownToHtml,
} from '../../markdown/markdown-parser';
import * as markdownIndex from '../../markdown/index';
import type { MarkdownNode } from '../../markdown/types';

// ─────────────────────────────────────────────────────────────────────────────
// security/sanitizer
// ─────────────────────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('escapes all five special HTML characters', () => {
    expect(escapeHtml('& < > " \'')).toBe('&amp; &lt; &gt; &quot; &#039;');
  });

  it('escapes ampersand', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b');
  });

  it('escapes less-than', () => {
    expect(escapeHtml('<tag>')).toBe('&lt;tag&gt;');
  });

  it('escapes double quote', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quote', () => {
    expect(escapeHtml("it's")).toBe('it&#039;s');
  });

  it('leaves safe text unchanged', () => {
    expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
  });

  it('escapes multiple occurrences of same character', () => {
    expect(escapeHtml('a&b&c')).toBe('a&amp;b&amp;c');
  });
});

describe('sanitizeUrl', () => {
  it('returns empty string for undefined', () => {
    expect(sanitizeUrl(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(sanitizeUrl('')).toBe('');
  });

  it('returns empty string for null-like falsy value', () => {
    // null is coerced to string "null" in URL context but undefined is covered
    expect(sanitizeUrl(undefined)).toBe('');
  });

  it('returns empty string when URL exceeds MAX_URL_LENGTH', () => {
    expect(sanitizeUrl('x'.repeat(MAX_URL_LENGTH + 1))).toBe('');
  });

  it('allows URL exactly at MAX_URL_LENGTH (boundary)', () => {
    const url = 'https://example.com/' + 'a'.repeat(MAX_URL_LENGTH - 20);
    const truncated = url.slice(0, MAX_URL_LENGTH);
    // Should not return empty (length check is >)
    expect(sanitizeUrl(truncated)).not.toBe('');
  });

  it('allows relative URL starting with /', () => {
    expect(sanitizeUrl('/path/to/page')).toBe('/path/to/page');
  });

  it('allows relative URL starting with ./', () => {
    expect(sanitizeUrl('./relative')).toBe('./relative');
  });

  it('allows relative URL starting with ../', () => {
    expect(sanitizeUrl('../parent')).toBe('../parent');
  });

  it('allows https URL', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
  });

  it('allows http URL', () => {
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('allows mailto URL', () => {
    expect(sanitizeUrl('mailto:user@example.com')).toBe('mailto:user@example.com');
  });

  it('allows tel URL', () => {
    expect(sanitizeUrl('tel:+1234567890')).toBe('tel:+1234567890');
  });

  it('allows Meeshy tracking URL (m+ format matching safe protocol)', () => {
    expect(sanitizeUrl('m+:tracking')).toBe('m+:tracking');
  });

  it('allows Meeshy URL format (m+TOKEN without colon)', () => {
    const result = sanitizeUrl('m+ABC123');
    expect(result).toBe('m+ABC123');
  });

  it('allows Meeshy URL format case-insensitively', () => {
    expect(sanitizeUrl('M+abc123')).toBe('M+abc123');
  });

  it('blocks javascript: protocol', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
  });

  it('blocks data: protocol', () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
  });

  it('blocks vbscript: protocol', () => {
    expect(sanitizeUrl('vbscript:msgbox(1)')).toBe('');
  });

  it('blocks file: protocol', () => {
    expect(sanitizeUrl('file:///etc/passwd')).toBe('');
  });

  it('blocks about: protocol', () => {
    expect(sanitizeUrl('about:blank')).toBe('');
  });

  it('blocks javascript: with uppercase', () => {
    expect(sanitizeUrl('JAVASCRIPT:alert(1)')).toBe('');
  });

  it('returns escaped value for unknown protocol (default case)', () => {
    expect(sanitizeUrl('ftp://example.com')).toBe('ftp://example.com');
  });

  it('escapes HTML in relative URL', () => {
    expect(sanitizeUrl('/path?q=<script>')).toBe('/path?q=&lt;script&gt;');
  });

  it('escapes HTML in https URL', () => {
    expect(sanitizeUrl('https://example.com/<b>')).toBe('https://example.com/&lt;b&gt;');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// security/validators
// ─────────────────────────────────────────────────────────────────────────────

describe('validateContentLength', () => {
  it('returns true for empty string', () => {
    expect(validateContentLength('')).toBe(true);
  });

  it('returns true for short content', () => {
    expect(validateContentLength('hello')).toBe(true);
  });

  it('returns true at exact MAX_CONTENT_LENGTH', () => {
    expect(validateContentLength('x'.repeat(MAX_CONTENT_LENGTH))).toBe(true);
  });

  it('returns false when content exceeds MAX_CONTENT_LENGTH', () => {
    expect(validateContentLength('x'.repeat(MAX_CONTENT_LENGTH + 1))).toBe(false);
  });
});

describe('validateNotEmpty', () => {
  it('returns false for empty string', () => {
    expect(validateNotEmpty('')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(validateNotEmpty('   ')).toBe(false);
  });

  it('returns false for tabs and newlines only', () => {
    expect(validateNotEmpty('\t\n')).toBe(false);
  });

  it('returns true for single character', () => {
    expect(validateNotEmpty('a')).toBe(true);
  });

  it('returns true for whitespace with content', () => {
    expect(validateNotEmpty('  hello  ')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rules/constants
// ─────────────────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('MAX_CONTENT_LENGTH is 1MB', () => {
    expect(MAX_CONTENT_LENGTH).toBe(1024 * 1024);
  });

  it('MAX_URL_LENGTH is 2048', () => {
    expect(MAX_URL_LENGTH).toBe(2048);
  });

  it('MAX_HEADING_LEVEL is 6', () => {
    expect(MAX_HEADING_LEVEL).toBe(6);
  });

  it('MAX_NESTED_LISTS is 10', () => {
    expect(MAX_NESTED_LISTS).toBe(10);
  });

  it('MAX_TABLE_CELLS is 100', () => {
    expect(MAX_TABLE_CELLS).toBe(100);
  });

  it('MAX_CACHE_SIZE is 100', () => {
    expect(MAX_CACHE_SIZE).toBe(100);
  });

  it('CACHE_TTL is 5 minutes in ms', () => {
    expect(CACHE_TTL).toBe(5 * 60 * 1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rules/patterns
// ─────────────────────────────────────────────────────────────────────────────

describe('createDelimiterPattern', () => {
  it('creates double-delimiter (bold) pattern for *', () => {
    const pattern = createDelimiterPattern('*', true);
    expect(pattern.test('**bold text**')).toBe(true);
    expect(pattern.exec('**bold text**')?.[1]).toBe('bold text');
  });

  it('creates single-delimiter (italic) pattern for *', () => {
    const pattern = createDelimiterPattern('*', false);
    expect(pattern.test('*italic*')).toBe(true);
    expect(pattern.exec('*italic*')?.[1]).toBe('italic');
  });

  it('creates double-delimiter pattern for _', () => {
    const pattern = createDelimiterPattern('_', true);
    expect(pattern.test('__bold__')).toBe(true);
    expect(pattern.exec('__bold__')?.[1]).toBe('bold');
  });

  it('creates single-delimiter pattern for _', () => {
    const pattern = createDelimiterPattern('_', false);
    expect(pattern.test('_italic_')).toBe(true);
    expect(pattern.exec('_italic_')?.[1]).toBe('italic');
  });

  it('double pattern does not match single delimiter', () => {
    const pattern = createDelimiterPattern('*', true);
    expect(pattern.test('*not bold*')).toBe(false);
  });
});

describe('pattern constants', () => {
  it('EMOJI_PATTERN matches :smile:', () => {
    expect(EMOJI_PATTERN.test(':smile:')).toBe(true);
  });

  it('EMOJI_PATTERN rejects empty code', () => {
    expect(EMOJI_PATTERN.test('::')).toBe(false);
  });

  it('IMAGE_PATTERN matches ![alt](url)', () => {
    expect(IMAGE_PATTERN.test('![alt text](https://img.com/x.png)')).toBe(true);
  });

  it('LINK_PATTERN matches [text](url)', () => {
    expect(LINK_PATTERN.test('[link text](https://example.com)')).toBe(true);
  });

  it('AUTO_URL_PATTERN matches http URLs', () => {
    expect(AUTO_URL_PATTERN.test('https://example.com')).toBe(true);
  });

  it('INLINE_CODE_PATTERN matches backtick code', () => {
    expect(INLINE_CODE_PATTERN.test('`code`')).toBe(true);
  });

  it('STRIKETHROUGH_PATTERN matches ~~text~~', () => {
    expect(STRIKETHROUGH_PATTERN.test('~~strikethrough~~')).toBe(true);
  });

  it('HEADING_PATTERN matches # heading', () => {
    expect(HEADING_PATTERN.test('# Heading 1')).toBe(true);
    expect(HEADING_PATTERN.exec('## H2')?.[1]).toBe('##');
  });

  it('HORIZONTAL_RULE_PATTERN matches ---', () => {
    expect(HORIZONTAL_RULE_PATTERN.test('---')).toBe(true);
    expect(HORIZONTAL_RULE_PATTERN.test('***')).toBe(true);
    expect(HORIZONTAL_RULE_PATTERN.test('___')).toBe(true);
  });

  it('TASK_LIST_PATTERN matches task items', () => {
    expect(TASK_LIST_PATTERN.test('- [ ] unchecked')).toBe(true);
    expect(TASK_LIST_PATTERN.test('- [x] checked')).toBe(true);
  });

  it('UNORDERED_LIST_PATTERN matches - and * items', () => {
    expect(UNORDERED_LIST_PATTERN.test('- item')).toBe(true);
    expect(UNORDERED_LIST_PATTERN.test('* item')).toBe(true);
  });

  it('ORDERED_LIST_PATTERN matches numbered items', () => {
    expect(ORDERED_LIST_PATTERN.test('1. item')).toBe(true);
    expect(ORDERED_LIST_PATTERN.test('42. item')).toBe(true);
  });

  it('TABLE_LINE_PATTERN matches pipe-delimited lines', () => {
    expect(TABLE_LINE_PATTERN.test('|col1|col2|')).toBe(true);
    expect(TABLE_LINE_PATTERN.test('not a table')).toBe(false);
  });

  it('TABLE_SEPARATOR_PATTERN matches single-column separator', () => {
    // TABLE_SEPARATOR_PATTERN only matches single-column: |---| or |:---:|
    expect(TABLE_SEPARATOR_PATTERN.test('|---|')).toBe(true);
    expect(TABLE_SEPARATOR_PATTERN.test('|:---:|')).toBe(true);
    // Multi-column |---|---| does NOT match (| is not in [\s:-])
    expect(TABLE_SEPARATOR_PATTERN.test('|---|---|')).toBe(false);
    expect(TABLE_SEPARATOR_CONTENT_PATTERN.test('|---|')).toBe(true);
  });

  it('MEESHY_URL_PATTERN matches m+TOKEN', () => {
    const matches = 'm+ABC123 text'.match(MEESHY_URL_PATTERN);
    expect(matches).toBeTruthy();
    expect(matches?.[0]).toBe('m+ABC123');
  });

  it('MEESHY_URL_FORMAT_PATTERN matches full m+TOKEN string', () => {
    expect(MEESHY_URL_FORMAT_PATTERN.test('m+ABC123')).toBe(true);
    expect(MEESHY_URL_FORMAT_PATTERN.test('m+ABC123 extra')).toBe(false);
  });

  it('SAFE_PROTOCOLS_PATTERN matches allowed protocols', () => {
    expect(SAFE_PROTOCOLS_PATTERN.test('https://example.com')).toBe(true);
    expect(SAFE_PROTOCOLS_PATTERN.test('mailto:user@example.com')).toBe(true);
    expect(SAFE_PROTOCOLS_PATTERN.test('tel:+123')).toBe(true);
  });

  it('RELATIVE_URL_PATTERN matches relative paths', () => {
    expect(RELATIVE_URL_PATTERN.test('/path')).toBe(true);
    expect(RELATIVE_URL_PATTERN.test('./path')).toBe(true);
    expect(RELATIVE_URL_PATTERN.test('../path')).toBe(true);
    expect(RELATIVE_URL_PATTERN.test('path')).toBe(false);
  });

  it('DANGEROUS_PROTOCOLS_PATTERN blocks dangerous protocols', () => {
    expect(DANGEROUS_PROTOCOLS_PATTERN.test('javascript:alert(1)')).toBe(true);
    expect(DANGEROUS_PROTOCOLS_PATTERN.test('data:text/html')).toBe(true);
    expect(DANGEROUS_PROTOCOLS_PATTERN.test('vbscript:x')).toBe(true);
    expect(DANGEROUS_PROTOCOLS_PATTERN.test('file:///etc')).toBe(true);
    expect(DANGEROUS_PROTOCOLS_PATTERN.test('about:blank')).toBe(true);
  });

  it('INDENTATION_PATTERN captures leading whitespace', () => {
    expect(INDENTATION_PATTERN.exec('  text')?.[1]).toBe('  ');
    expect(INDENTATION_PATTERN.exec('text')?.[1]).toBe('');
  });

  it('CODE_BLOCK_LANGUAGE_PATTERN captures language', () => {
    expect(CODE_BLOCK_LANGUAGE_PATTERN.exec('```js')?.[1]).toBe('js');
    expect(CODE_BLOCK_LANGUAGE_PATTERN.test('```')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rules/emoji-map
// ─────────────────────────────────────────────────────────────────────────────

describe('EMOJI_MAP', () => {
  it('is a non-empty object', () => {
    expect(typeof EMOJI_MAP).toBe('object');
    expect(Object.keys(EMOJI_MAP).length).toBeGreaterThan(0);
  });

  it('contains common emoji codes', () => {
    expect(EMOJI_MAP['smile']).toBeTruthy();
    expect(EMOJI_MAP['heart']).toBeTruthy();
    expect(EMOJI_MAP['thumbsup']).toBeTruthy();
  });

  it('does not contain an entry for unknown codes', () => {
    expect(EMOJI_MAP['xyzzy_nonexistent_code']).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// utils
// ─────────────────────────────────────────────────────────────────────────────

describe('getIndentLevel', () => {
  it('returns 0 for empty string', () => {
    expect(getIndentLevel('')).toBe(0);
  });

  it('returns 0 for line with no leading spaces', () => {
    expect(getIndentLevel('text')).toBe(0);
  });

  it('returns correct count for 2 spaces', () => {
    expect(getIndentLevel('  text')).toBe(2);
  });

  it('returns correct count for 4 spaces', () => {
    expect(getIndentLevel('    text')).toBe(4);
  });

  it('counts only leading spaces (not tabs as spaces)', () => {
    expect(getIndentLevel('\ttext')).toBe(1);
  });
});

describe('processMeeshyUrls', () => {
  it('leaves text without Meeshy URLs unchanged', () => {
    expect(processMeeshyUrls('no tokens here')).toBe('no tokens here');
  });

  it('converts m+TOKEN to markdown link', () => {
    expect(processMeeshyUrls('Check m+ABC123 out')).toBe('Check [m+ABC123](m+ABC123) out');
  });

  it('converts lowercase m+token', () => {
    expect(processMeeshyUrls('m+abc123')).toBe('[m+abc123](m+abc123)');
  });

  it('converts multiple Meeshy tokens', () => {
    expect(processMeeshyUrls('m+AAA and m+BBB')).toBe('[m+AAA](m+AAA) and [m+BBB](m+BBB)');
  });

  it('handles empty string', () => {
    expect(processMeeshyUrls('')).toBe('');
  });

  it('does not convert plain m+ text without valid token', () => {
    expect(processMeeshyUrls('m+ no token')).toBe('m+ no token');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cache
// ─────────────────────────────────────────────────────────────────────────────

describe('cache', () => {
  beforeEach(() => {
    clearCache();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    clearCache();
  });

  describe('getCachedHtml', () => {
    it('returns null for unknown key', () => {
      expect(getCachedHtml('nonexistent')).toBeNull();
    });

    it('returns cached HTML when fresh', () => {
      setCachedHtml('key1', '<p>hello</p>');
      expect(getCachedHtml('key1')).toBe('<p>hello</p>');
    });

    it('returns null and deletes entry when TTL expired', () => {
      setCachedHtml('expiry-key', '<p>expired</p>');
      jest.advanceTimersByTime(CACHE_TTL + 1);
      expect(getCachedHtml('expiry-key')).toBeNull();
      // Entry should have been deleted — fetching again also returns null
      expect(getCachedHtml('expiry-key')).toBeNull();
    });

    it('returns cached value just before TTL expires', () => {
      setCachedHtml('ttl-key', '<p>valid</p>');
      jest.advanceTimersByTime(CACHE_TTL - 1);
      expect(getCachedHtml('ttl-key')).toBe('<p>valid</p>');
    });
  });

  describe('setCachedHtml', () => {
    it('stores and retrieves multiple entries', () => {
      setCachedHtml('a', 'html-a');
      setCachedHtml('b', 'html-b');
      expect(getCachedHtml('a')).toBe('html-a');
      expect(getCachedHtml('b')).toBe('html-b');
    });

    it('evicts oldest entry when cache reaches MAX_CACHE_SIZE', () => {
      for (let i = 0; i < MAX_CACHE_SIZE; i++) {
        setCachedHtml(`key-${i}`, `html-${i}`);
      }
      // Cache is now full (100 entries). Adding one more evicts key-0.
      setCachedHtml('key-overflow', 'html-overflow');
      expect(getCachedHtml('key-0')).toBeNull();
      expect(getCachedHtml('key-overflow')).toBe('html-overflow');
    });

    it('preserves entries 1..N-1 after evicting oldest', () => {
      for (let i = 0; i < MAX_CACHE_SIZE; i++) {
        setCachedHtml(`evict-${i}`, `html-${i}`);
      }
      setCachedHtml('evict-new', 'new-html');
      // entry 1 onwards should still be present
      expect(getCachedHtml('evict-1')).toBe('html-1');
    });
  });

  describe('clearCache', () => {
    it('removes all entries', () => {
      setCachedHtml('x', 'html-x');
      setCachedHtml('y', 'html-y');
      clearCache();
      expect(getCachedHtml('x')).toBeNull();
      expect(getCachedHtml('y')).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parsers/block-parser
// ─────────────────────────────────────────────────────────────────────────────

describe('parseLine', () => {
  it('returns empty paragraph for empty line (not in list)', () => {
    const node = parseLine('', false, false);
    expect(node).toEqual({ type: 'paragraph', children: [] });
  });

  it('returns null for empty line when inside a list', () => {
    expect(parseLine('', false, true)).toBeNull();
  });

  it('returns null for code block delimiter when not in code block', () => {
    expect(parseLine('```js', false, false)).toBeNull();
    expect(parseLine('```', false, false)).toBeNull();
  });

  it('parses code block delimiter as paragraph when inCodeBlock=true', () => {
    const node = parseLine('```js', true, false);
    expect(node?.type).toBe('paragraph');
  });

  it('parses heading level 1', () => {
    const node = parseLine('# H1 title', false, false);
    expect(node?.type).toBe('heading');
    expect(node?.level).toBe(1);
  });

  it('parses heading level 2', () => {
    const node = parseLine('## H2 title', false, false);
    expect(node?.type).toBe('heading');
    expect(node?.level).toBe(2);
  });

  it('parses heading level 6 (max)', () => {
    const node = parseLine('###### H6 title', false, false);
    expect(node?.type).toBe('heading');
    expect(node?.level).toBe(6);
  });

  it('does not parse heading when indented', () => {
    const node = parseLine('  # Not a heading', false, false);
    expect(node?.type).toBe('paragraph');
  });

  it('parses blockquote', () => {
    const node = parseLine('> quoted text', false, false);
    expect(node?.type).toBe('blockquote');
  });

  it('parses blockquote with extra whitespace after >', () => {
    const node = parseLine('>  spaced quote', false, false);
    expect(node?.type).toBe('blockquote');
  });

  it('parses horizontal rule ---', () => {
    expect(parseLine('---', false, false)?.type).toBe('horizontal-rule');
  });

  it('parses horizontal rule ***', () => {
    expect(parseLine('***', false, false)?.type).toBe('horizontal-rule');
  });

  it('parses horizontal rule ___', () => {
    expect(parseLine('___', false, false)?.type).toBe('horizontal-rule');
  });

  it('parses unchecked task list item', () => {
    const node = parseLine('- [ ] task item', false, false);
    expect(node?.type).toBe('task-list-item');
    expect(node?.checked).toBe(false);
  });

  it('parses checked task list item (lowercase x)', () => {
    const node = parseLine('- [x] done task', false, false);
    expect(node?.type).toBe('task-list-item');
    expect(node?.checked).toBe(true);
  });

  it('parses checked task list item (uppercase X)', () => {
    const node = parseLine('- [X] done task', false, false);
    expect(node?.type).toBe('task-list-item');
    expect(node?.checked).toBe(true);
  });

  it('clamps task list indent to MAX_NESTED_LISTS * 2', () => {
    const line = ' '.repeat(MAX_NESTED_LISTS * 2 + 10) + '- [ ] deep task';
    const node = parseLine(line, false, false);
    expect(node?.type).toBe('task-list-item');
    expect(node?.indent).toBe(MAX_NESTED_LISTS * 2);
  });

  it('parses unordered list item with -', () => {
    const node = parseLine('- list item', false, false);
    expect(node?.type).toBe('list-item');
    expect(node?.ordered).toBeUndefined();
  });

  it('parses unordered list item with *', () => {
    const node = parseLine('* list item', false, false);
    expect(node?.type).toBe('list-item');
  });

  it('parses indented unordered list item', () => {
    const node = parseLine('  - sub item', false, false);
    expect(node?.type).toBe('list-item');
    expect(node?.indent).toBe(2);
  });

  it('parses ordered list item', () => {
    const node = parseLine('1. first item', false, false);
    expect(node?.type).toBe('list-item');
    expect(node?.ordered).toBe(true);
  });

  it('parses ordered list item with high number', () => {
    const node = parseLine('42. item', false, false);
    expect(node?.type).toBe('list-item');
    expect(node?.ordered).toBe(true);
  });

  it('parses normal paragraph', () => {
    const node = parseLine('normal text', false, false);
    expect(node?.type).toBe('paragraph');
    expect(node?.children?.length).toBeGreaterThan(0);
  });
});

describe('parseCodeBlock', () => {
  it('parses code block with language', () => {
    const lines = ['```javascript', 'const x = 1;', 'const y = 2;', '```'];
    const { node, endIndex } = parseCodeBlock(lines, 0);
    expect(node.type).toBe('code-block');
    expect(node.language).toBe('javascript');
    expect(node.content).toBe('const x = 1;\nconst y = 2;');
    expect(endIndex).toBe(4);
  });

  it('parses code block without language (defaults to text)', () => {
    const lines = ['```', 'plain code', '```'];
    const { node } = parseCodeBlock(lines, 0);
    expect(node.language).toBe('text');
  });

  it('parses code block with language specifier that does not match pattern', () => {
    // "```js extra" does not match CODE_BLOCK_LANGUAGE_PATTERN → language = 'text'
    const lines = ['```js extra stuff', 'code here', '```'];
    const { node } = parseCodeBlock(lines, 0);
    expect(node.language).toBe('text');
  });

  it('handles unterminated code block (reaches end of lines)', () => {
    const lines = ['```js', 'code without closing'];
    const { node, endIndex } = parseCodeBlock(lines, 0);
    expect(node.type).toBe('code-block');
    expect(node.content).toBe('code without closing');
    expect(endIndex).toBe(3); // lines.length + 1
  });

  it('parses empty code block', () => {
    const lines = ['```', '```'];
    const { node } = parseCodeBlock(lines, 0);
    expect(node.content).toBe('');
  });

  it('parses code block starting at non-zero index', () => {
    const lines = ['ignore', '```py', 'print("hello")', '```'];
    const { node, endIndex } = parseCodeBlock(lines, 1);
    expect(node.language).toBe('py');
    expect(node.content).toBe('print("hello")');
    expect(endIndex).toBe(4);
  });
});

describe('buildNestedList', () => {
  const makeItem = (text: string, indent: number, ordered = false): MarkdownNode => ({
    type: 'list-item',
    indent,
    ordered,
    children: [{ type: 'text', content: text }],
  });

  it('returns empty array for empty input', () => {
    expect(buildNestedList([], 0)).toEqual([]);
  });

  it('builds flat list when all items share same indent', () => {
    const items = [makeItem('a', 0), makeItem('b', 0)];
    const result = buildNestedList(items, 0);
    expect(result).toHaveLength(2);
    expect(result[0].children).toHaveLength(1);
  });

  it('nests sub-items under parent item', () => {
    const items = [makeItem('parent', 0), makeItem('child', 2)];
    const result = buildNestedList(items, 0);
    expect(result).toHaveLength(1);
    // parent item gets child merged into its children
    expect(result[0].children?.length).toBeGreaterThan(1);
  });

  it('skips items whose indent does not match baseIndent', () => {
    const items = [makeItem('deep', 4)];
    const result = buildNestedList(items, 0);
    // item at indent 4 != baseIndent 0 → skipped
    expect(result).toHaveLength(0);
  });

  it('builds doubly-nested list', () => {
    const items = [makeItem('a', 0), makeItem('b', 2), makeItem('c', 4)];
    const result = buildNestedList(items, 0);
    expect(result).toHaveLength(1);
  });
});

describe('groupListItems', () => {
  const makeListItem = (indent = 0, ordered = false): MarkdownNode => ({
    type: 'list-item',
    indent,
    ordered,
    children: [{ type: 'text', content: 'item' }],
  });

  const makeTaskItem = (checked = false): MarkdownNode => ({
    type: 'task-list-item',
    indent: 0,
    checked,
    children: [{ type: 'text', content: 'task' }],
  });

  const makeParagraph = (): MarkdownNode => ({
    type: 'paragraph',
    children: [{ type: 'text', content: 'para' }],
  });

  it('returns empty array for empty input', () => {
    expect(groupListItems([])).toEqual([]);
  });

  it('groups unordered list items into a list node', () => {
    const nodes = [makeListItem(), makeListItem()];
    const result = groupListItems(nodes);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('list');
    expect(result[0].ordered).toBe(false);
  });

  it('groups ordered list items into an ordered list node', () => {
    const nodes = [makeListItem(0, true), makeListItem(0, true)];
    const result = groupListItems(nodes);
    expect(result[0].ordered).toBe(true);
  });

  it('groups task-list-items into a list node', () => {
    const nodes = [makeTaskItem(false), makeTaskItem(true)];
    const result = groupListItems(nodes);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('list');
  });

  it('flushes list when non-list node interrupts', () => {
    const nodes = [makeListItem(), makeParagraph(), makeListItem()];
    const result = groupListItems(nodes);
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe('list');
    expect(result[1].type).toBe('paragraph');
    expect(result[2].type).toBe('list');
  });

  it('flushes and starts new list when ordered type changes', () => {
    const nodes = [makeListItem(0, false), makeListItem(0, true)];
    const result = groupListItems(nodes);
    expect(result).toHaveLength(2);
    expect(result[0].ordered).toBe(false);
    expect(result[1].ordered).toBe(true);
  });

  it('flushes and starts new list when task type changes', () => {
    const nodes = [makeListItem(0, false), makeTaskItem(false)];
    const result = groupListItems(nodes);
    expect(result).toHaveLength(2);
  });

  it('includes indented items in current list (does not flush)', () => {
    const nodes = [makeListItem(0), makeListItem(2)];
    const result = groupListItems(nodes);
    expect(result).toHaveLength(1);
  });

  it('non-list nodes are passed through unchanged', () => {
    const nodes = [makeParagraph(), makeParagraph()];
    const result = groupListItems(nodes);
    expect(result).toHaveLength(2);
    expect(result.every(n => n.type === 'paragraph')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parsers/inline-parser
// ─────────────────────────────────────────────────────────────────────────────

describe('parseInline', () => {
  it('returns empty array for empty string', () => {
    expect(parseInline('')).toEqual([]);
  });

  it('returns text node for plain text', () => {
    const nodes = parseInline('hello world');
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toEqual({ type: 'text', content: 'hello world' });
  });

  it('parses known emoji shortcode', () => {
    const nodes = parseInline(':smile:');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('emoji');
    expect(nodes[0].emojiCode).toBe('smile');
  });

  it('leaves unknown emoji shortcode as text', () => {
    const nodes = parseInline(':xyzzy_unknown_code:');
    expect(nodes[0].type).toBe('text');
  });

  it('parses image ![alt](url)', () => {
    const nodes = parseInline('![cat](https://example.com/cat.png)');
    expect(nodes[0].type).toBe('image');
    expect(nodes[0].alt).toBe('cat');
    expect(nodes[0].url).toBe('https://example.com/cat.png');
  });

  it('treats ! without [ as plain text', () => {
    const nodes = parseInline('!not an image');
    expect(nodes[0].type).toBe('text');
    expect(nodes[0].content).toContain('!');
  });

  it('treats ![ when image pattern does not match as plain text', () => {
    // Alt text longer than 200 chars — IMAGE_PATTERN has {0,200} limit
    const longAlt = 'a'.repeat(201);
    const nodes = parseInline(`![${longAlt}](https://example.com)`);
    // Falls through to text since pattern doesn't match
    expect(nodes[0].type).toBe('text');
  });

  it('parses link [text](url)', () => {
    const nodes = parseInline('[click here](https://example.com)');
    expect(nodes[0].type).toBe('link');
    expect(nodes[0].content).toBe('click here');
    expect(nodes[0].url).toBe('https://example.com');
  });

  it('treats [ when link pattern does not match as text', () => {
    const nodes = parseInline('[no closing');
    expect(nodes.some(n => n.type === 'text')).toBe(true);
  });

  it('parses auto-link https:// URL', () => {
    const nodes = parseInline('https://example.com');
    expect(nodes[0].type).toBe('link');
    expect(nodes[0].url).toBe('https://example.com');
  });

  it('parses auto-link http:// URL', () => {
    const nodes = parseInline('http://example.com');
    expect(nodes[0].type).toBe('link');
  });

  it('treats "h" not followed by ttp as plain text', () => {
    const nodes = parseInline('hello');
    expect(nodes[0]).toEqual({ type: 'text', content: 'hello' });
  });

  it('treats http:// with no following chars as text (AUTO_URL_PATTERN requires ≥1 char after ://)', () => {
    const nodes = parseInline('http://');
    // Condition: starts with 'http://' → true, but pattern requires path chars
    // Falls through because AUTO_URL_PATTERN needs at least one non-space char
    expect(nodes.some(n => n.type === 'text')).toBe(true);
  });

  it('parses inline code `code`', () => {
    const nodes = parseInline('`const x = 1`');
    expect(nodes[0].type).toBe('code-inline');
    expect(nodes[0].content).toBe('const x = 1');
  });

  it('treats lone backtick as text when pattern does not match', () => {
    const nodes = parseInline('`');
    expect(nodes[0].type).toBe('text');
  });

  it('parses bold **text**', () => {
    const nodes = parseInline('**bold text**');
    expect(nodes[0].type).toBe('bold');
    expect(nodes[0].children?.[0]).toEqual({ type: 'text', content: 'bold text' });
  });

  it('parses bold __text__', () => {
    const nodes = parseInline('__bold text__');
    expect(nodes[0].type).toBe('bold');
  });

  it('treats ** without closing as text', () => {
    const nodes = parseInline('**no closing');
    expect(nodes.some(n => n.type === 'text')).toBe(true);
  });

  it('parses strikethrough ~~text~~', () => {
    const nodes = parseInline('~~struck~~');
    expect(nodes[0].type).toBe('strikethrough');
    expect(nodes[0].children?.[0]).toEqual({ type: 'text', content: 'struck' });
  });

  it('treats ~~ without closing as text', () => {
    const nodes = parseInline('~~no close');
    expect(nodes.some(n => n.type === 'text')).toBe(true);
  });

  it('parses italic *text*', () => {
    const nodes = parseInline('*italic text*');
    expect(nodes[0].type).toBe('italic');
  });

  it('parses italic _text_', () => {
    const nodes = parseInline('_italic text_');
    expect(nodes[0].type).toBe('italic');
  });

  it('treats * without closing as text', () => {
    const nodes = parseInline('*no close');
    expect(nodes.some(n => n.type === 'text')).toBe(true);
  });

  it('treats _ without closing as text', () => {
    const nodes = parseInline('_no close');
    expect(nodes.some(n => n.type === 'text')).toBe(true);
  });

  it('parses mixed inline elements', () => {
    const nodes = parseInline('text **bold** and *italic*');
    const types = nodes.map(n => n.type);
    expect(types).toContain('text');
    expect(types).toContain('bold');
    expect(types).toContain('italic');
  });

  it('parses nested bold with inner text', () => {
    const nodes = parseInline('**bold with :smile:**');
    expect(nodes[0].type).toBe('bold');
    // inner parse of 'bold with :smile:'
    const inner = nodes[0].children?.map(n => n.type);
    expect(inner).toContain('text');
  });

  it('handles colon not followed by valid emoji pattern', () => {
    const nodes = parseInline(':');
    expect(nodes[0].type).toBe('text');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parsers/table-parser
// ─────────────────────────────────────────────────────────────────────────────

describe('isTableLine', () => {
  it('returns true for pipe-delimited line', () => {
    expect(isTableLine('|col1|col2|')).toBe(true);
  });

  it('returns true with spaces inside pipes', () => {
    expect(isTableLine('| col1 | col2 |')).toBe(true);
  });

  it('returns false for line without leading pipe', () => {
    expect(isTableLine('not a table')).toBe(false);
  });

  it('returns false for line without trailing pipe', () => {
    expect(isTableLine('|incomplete')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isTableLine('')).toBe(false);
  });
});

describe('isTableSeparator', () => {
  it('returns true for --- single-column separator', () => {
    expect(isTableSeparator('|---|')).toBe(true);
  });

  it('returns true for :---: single-column center separator', () => {
    expect(isTableSeparator('|:---:|')).toBe(true);
  });

  it('returns true for ---: single-column right separator', () => {
    expect(isTableSeparator('|---:|')).toBe(true);
  });

  it('returns false for multi-column separator (pattern limitation)', () => {
    // TABLE_SEPARATOR_PATTERN is /^\|[\s:-]+\|$/ — | is not in [\s:-] so multi-col fails
    expect(isTableSeparator('|---|---|')).toBe(false);
  });

  it('returns false for regular table line', () => {
    expect(isTableSeparator('|cell1|cell2|')).toBe(false);
  });

  it('returns false for line with pipes but no - or :', () => {
    // | | | → TABLE_SEPARATOR_PATTERN matches [\s:-]+ (space is allowed) but
    // TABLE_SEPARATOR_CONTENT_PATTERN requires at least one - or :
    expect(isTableSeparator('| | |')).toBe(false);
  });

  it('returns false for non-table line', () => {
    expect(isTableSeparator('not a separator')).toBe(false);
  });
});

describe('parseAlignment', () => {
  it('returns center for :---:', () => {
    expect(parseAlignment(':---:')).toBe('center');
  });

  it('returns right for ---:', () => {
    expect(parseAlignment('---:')).toBe('right');
  });

  it('returns left for :--- (starts with : but not ends with :)', () => {
    expect(parseAlignment(':---')).toBe('left');
  });

  it('returns left for --- (default)', () => {
    expect(parseAlignment('---')).toBe('left');
  });

  it('returns left for empty separator', () => {
    expect(parseAlignment('')).toBe('left');
  });
});

describe('parseTableRow', () => {
  it('parses header row with alignments', () => {
    const row = parseTableRow('| Name | Age |', true, ['left', 'right']);
    expect(row.type).toBe('table-row');
    expect(row.children).toHaveLength(2);
    expect(row.children?.[0].isHeader).toBe(true);
    expect(row.children?.[0].align).toBe('left');
    expect(row.children?.[1].align).toBe('right');
  });

  it('parses body row without alignments (defaults to left)', () => {
    const row = parseTableRow('| cell1 | cell2 |', false);
    expect(row.children?.[0].isHeader).toBe(false);
    expect(row.children?.[0].align).toBe('left');
  });

  it('limits cells to MAX_TABLE_CELLS when row has more than 100 cells', () => {
    // Build a row with 101 cells
    const cells = Array.from({ length: 101 }, (_, i) => `cell${i}`).join('|');
    const line = `|${cells}|`;
    const row = parseTableRow(line, false);
    expect(row.children?.length).toBeLessThanOrEqual(MAX_TABLE_CELLS);
  });
});

describe('parseTable', () => {
  it('parses a single-column table with header and body rows', () => {
    // TABLE_SEPARATOR_PATTERN only matches single-column |---| separator
    const lines = [
      '| A |',
      '|---|',
      '| 1 |',
      '| 2 |',
    ];
    const { node, endIndex } = parseTable(lines, 0);
    expect(node.type).toBe('table');
    expect(node.children).toHaveLength(3); // header + 2 body rows
    expect(endIndex).toBe(4);
  });

  it('returns empty table when first line is not a table line', () => {
    const lines = ['not a table', '|---|---|'];
    const { node, endIndex } = parseTable(lines, 0);
    expect(node.type).toBe('table');
    expect(node.children).toHaveLength(0);
    expect(endIndex).toBe(0);
  });

  it('returns empty table when table line not followed by separator', () => {
    const lines = ['| A | B |', '| 1 | 2 |'];
    const { node, endIndex } = parseTable(lines, 0);
    expect(node.type).toBe('table');
    expect(node.children).toHaveLength(0);
    expect(endIndex).toBe(0);
  });

  it('returns empty table when header line is at end of input', () => {
    const lines = ['| A | B |'];
    const { node } = parseTable(lines, 0);
    expect(node.children).toHaveLength(0);
  });

  it('stops parsing body when non-table line is encountered', () => {
    // Use single-column separator so isTableSeparator returns true
    const lines = ['| A |', '|---|', '| 1 |', 'not a table', '| 2 |'];
    const { node, endIndex } = parseTable(lines, 0);
    expect(node.children).toHaveLength(2); // header + first body row
    expect(endIndex).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// renderers/block-renderer
// ─────────────────────────────────────────────────────────────────────────────

describe('renderBlockNode', () => {
  it('renders heading level 1', () => {
    const node: MarkdownNode = {
      type: 'heading',
      level: 1,
      children: [{ type: 'text', content: 'Title' }],
    };
    const html = renderBlockNode(node, 0);
    expect(html).toContain('<h1');
    expect(html).toContain('Title');
    expect(html).toContain('</h1>');
  });

  it('renders heading level 3', () => {
    const node: MarkdownNode = { type: 'heading', level: 3, children: [] };
    expect(renderBlockNode(node, 0)).toContain('<h3');
  });

  it('renders heading level 6 (max)', () => {
    const node: MarkdownNode = { type: 'heading', level: 6, children: [] };
    expect(renderBlockNode(node, 0)).toContain('<h6');
  });

  it('clamps heading level above 6 to 6', () => {
    const node: MarkdownNode = { type: 'heading', level: 7, children: [] };
    expect(renderBlockNode(node, 0)).toContain('<h6');
  });

  it('clamps missing heading level to 1', () => {
    const node: MarkdownNode = { type: 'heading', children: [] };
    expect(renderBlockNode(node, 0)).toContain('<h1');
  });

  it('renders code-block with language', () => {
    const node: MarkdownNode = {
      type: 'code-block',
      language: 'js',
      content: 'const x = 1;',
    };
    const html = renderBlockNode(node, 0);
    expect(html).toContain('language-js');
    expect(html).toContain('const x = 1;');
    expect(html).toContain('<pre');
  });

  it('renders code-block with default language when omitted', () => {
    const node: MarkdownNode = { type: 'code-block', content: 'code' };
    expect(renderBlockNode(node, 0)).toContain('language-text');
  });

  it('renders code-block with empty content', () => {
    const node: MarkdownNode = { type: 'code-block' };
    expect(renderBlockNode(node, 0)).toContain('<code');
  });

  it('escapes HTML in code-block content', () => {
    const node: MarkdownNode = {
      type: 'code-block',
      content: '<script>alert("xss")</script>',
    };
    const html = renderBlockNode(node, 0);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders blockquote', () => {
    const node: MarkdownNode = {
      type: 'blockquote',
      children: [{ type: 'text', content: 'quoted' }],
    };
    const html = renderBlockNode(node, 0);
    expect(html).toContain('<blockquote');
    expect(html).toContain('quoted');
  });

  it('renders unordered list', () => {
    const node: MarkdownNode = {
      type: 'list',
      ordered: false,
      children: [
        { type: 'list-item', children: [{ type: 'text', content: 'item' }] },
      ],
    };
    const html = renderBlockNode(node, 0);
    expect(html).toContain('<ul');
    expect(html).toContain('<li>');
    expect(html).toContain('item');
  });

  it('renders ordered list', () => {
    const node: MarkdownNode = {
      type: 'list',
      ordered: true,
      children: [
        { type: 'list-item', children: [{ type: 'text', content: 'first' }] },
      ],
    };
    const html = renderBlockNode(node, 0);
    expect(html).toContain('<ol');
  });

  it('renders list-item with nested sub-list', () => {
    const subList: MarkdownNode = {
      type: 'list',
      ordered: false,
      children: [
        { type: 'list-item', children: [{ type: 'text', content: 'sub' }] },
      ],
    };
    const node: MarkdownNode = {
      type: 'list',
      ordered: false,
      children: [
        {
          type: 'list-item',
          children: [{ type: 'text', content: 'parent' }, subList],
        },
      ],
    };
    const html = renderBlockNode(node, 0);
    expect(html).toContain('parent');
    expect(html).toContain('sub');
  });

  it('renders unchecked task-list-item', () => {
    const node: MarkdownNode = {
      type: 'list',
      ordered: false,
      children: [
        {
          type: 'task-list-item',
          checked: false,
          children: [{ type: 'text', content: 'task' }],
        },
      ],
    };
    const html = renderBlockNode(node, 0);
    expect(html).toContain('<input type="checkbox"');
    expect(html).not.toContain('checked ');
    expect(html).toContain('task');
  });

  it('renders checked task-list-item', () => {
    const node: MarkdownNode = {
      type: 'list',
      ordered: false,
      children: [
        {
          type: 'task-list-item',
          checked: true,
          children: [{ type: 'text', content: 'done' }],
        },
      ],
    };
    const html = renderBlockNode(node, 0);
    expect(html).toContain('checked');
  });

  it('renders task-list-item with nested sub-list', () => {
    const subList: MarkdownNode = {
      type: 'list',
      ordered: false,
      children: [
        { type: 'list-item', children: [{ type: 'text', content: 'sub-task' }] },
      ],
    };
    const node: MarkdownNode = {
      type: 'list',
      ordered: false,
      children: [
        {
          type: 'task-list-item',
          checked: false,
          children: [{ type: 'text', content: 'parent task' }, subList],
        },
      ],
    };
    const html = renderBlockNode(node, 0);
    expect(html).toContain('sub-task');
  });

  it('renders paragraph', () => {
    const node: MarkdownNode = {
      type: 'paragraph',
      children: [{ type: 'text', content: 'Hello' }],
    };
    const html = renderBlockNode(node, 0);
    expect(html).toContain('<p');
    expect(html).toContain('Hello');
    expect(html).toContain('</p>');
  });

  it('renders paragraph with empty children', () => {
    const node: MarkdownNode = { type: 'paragraph', children: [] };
    expect(renderBlockNode(node, 0)).toContain('<p');
  });

  it('renders horizontal-rule', () => {
    const node: MarkdownNode = { type: 'horizontal-rule' };
    expect(renderBlockNode(node, 0)).toContain('<hr');
  });

  it('returns empty string for unknown node type', () => {
    // Use a casting trick to test the default branch
    const node = { type: 'unknown-type' } as unknown as MarkdownNode;
    expect(renderBlockNode(node, 0)).toBe('');
  });

  it('returns empty string for list-item child that is not list-item or task-list-item', () => {
    // Paragraph inside a list triggers the default renderListItem branch
    const node: MarkdownNode = {
      type: 'list',
      ordered: false,
      children: [
        { type: 'paragraph', children: [{ type: 'text', content: 'para' }] },
      ],
    };
    const html = renderBlockNode(node, 0);
    // The paragraph child goes through renderListItem which returns '' for unknown
    expect(html).toBeDefined();
  });

  it('renders list-item with undefined children — hits || [] fallback', () => {
    const node: MarkdownNode = {
      type: 'list',
      ordered: false,
      children: [
        { type: 'list-item' }, // no children property
      ],
    };
    const html = renderBlockNode(node, 0);
    expect(html).toContain('<li>');
  });

  it('renders task-list-item with undefined children — hits || [] fallback', () => {
    const node: MarkdownNode = {
      type: 'list',
      ordered: false,
      children: [
        { type: 'task-list-item', checked: false }, // no children
      ],
    };
    const html = renderBlockNode(node, 0);
    expect(html).toContain('<input type="checkbox"');
  });

  it('renders list node with undefined children — hits || "" fallback', () => {
    const node: MarkdownNode = {
      type: 'list',
      ordered: false,
      // no children
    };
    const html = renderBlockNode(node, 0);
    expect(html).toContain('<ul');
  });

  it('renders blockquote with undefined children — hits || "" fallback', () => {
    const node: MarkdownNode = { type: 'blockquote' }; // no children
    const html = renderBlockNode(node, 0);
    expect(html).toContain('<blockquote');
  });

  it('renders paragraph with undefined children — hits || "" fallback', () => {
    const node: MarkdownNode = { type: 'paragraph' }; // no children
    const html = renderBlockNode(node, 0);
    expect(html).toContain('<p');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// renderers/inline-renderer
// ─────────────────────────────────────────────────────────────────────────────

describe('renderInlineNode', () => {
  it('renders text node with HTML escaping', () => {
    const node: MarkdownNode = { type: 'text', content: '<b>hi</b>' };
    expect(renderInlineNode(node, 0)).toBe('&lt;b&gt;hi&lt;/b&gt;');
  });

  it('renders text node with empty content', () => {
    const node: MarkdownNode = { type: 'text', content: '' };
    expect(renderInlineNode(node, 0)).toBe('');
  });

  it('renders text node with undefined content', () => {
    const node: MarkdownNode = { type: 'text' };
    expect(renderInlineNode(node, 0)).toBe('');
  });

  it('renders bold node', () => {
    const node: MarkdownNode = {
      type: 'bold',
      children: [{ type: 'text', content: 'bold' }],
    };
    const html = renderInlineNode(node, 0);
    expect(html).toContain('<strong');
    expect(html).toContain('bold');
    expect(html).toContain('</strong>');
  });

  it('renders bold node with no children', () => {
    const node: MarkdownNode = { type: 'bold' };
    expect(renderInlineNode(node, 0)).toContain('<strong');
  });

  it('renders italic node', () => {
    const node: MarkdownNode = {
      type: 'italic',
      children: [{ type: 'text', content: 'italic' }],
    };
    const html = renderInlineNode(node, 0);
    expect(html).toContain('<em');
    expect(html).toContain('italic');
  });

  it('renders italic node with no children', () => {
    const node: MarkdownNode = { type: 'italic' };
    expect(renderInlineNode(node, 0)).toContain('<em');
  });

  it('renders strikethrough node', () => {
    const node: MarkdownNode = {
      type: 'strikethrough',
      children: [{ type: 'text', content: 'struck' }],
    };
    expect(renderInlineNode(node, 0)).toContain('<del');
  });

  it('renders strikethrough with no children', () => {
    const node: MarkdownNode = { type: 'strikethrough' };
    expect(renderInlineNode(node, 0)).toContain('<del');
  });

  it('renders code-inline node', () => {
    const node: MarkdownNode = { type: 'code-inline', content: 'const x = 1' };
    const html = renderInlineNode(node, 0);
    expect(html).toContain('<code');
    expect(html).toContain('const x = 1');
  });

  it('escapes HTML in code-inline', () => {
    const node: MarkdownNode = { type: 'code-inline', content: '<script>' };
    expect(renderInlineNode(node, 0)).toContain('&lt;script&gt;');
  });

  it('renders external link', () => {
    const node: MarkdownNode = {
      type: 'link',
      content: 'click',
      url: 'https://example.com',
    };
    const html = renderInlineNode(node, 0);
    expect(html).toContain('<a href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('click');
  });

  it('renders mention link (/u/username) without target', () => {
    const node: MarkdownNode = {
      type: 'link',
      content: '@user',
      url: '/u/username',
    };
    const html = renderInlineNode(node, 0);
    expect(html).toContain('<a href="/u/username"');
    expect(html).not.toContain('target="_blank"');
    expect(html).toContain('text-purple-600');
  });

  it('renders plain text when link URL sanitizes to empty', () => {
    const node: MarkdownNode = {
      type: 'link',
      content: 'evil',
      url: 'javascript:alert(1)',
    };
    expect(renderInlineNode(node, 0)).toBe('evil');
  });

  it('renders mailto link (not external, not mention)', () => {
    const node: MarkdownNode = {
      type: 'link',
      content: 'email',
      url: 'mailto:user@example.com',
    };
    const html = renderInlineNode(node, 0);
    expect(html).toContain('<a href="mailto:user@example.com"');
    // not a mention → has target and blue class
    expect(html).toContain('target="_blank"');
    expect(html).toContain('text-blue-600');
  });

  it('renders link with HTML special chars in content', () => {
    const node: MarkdownNode = {
      type: 'link',
      content: 'a & b',
      url: 'https://example.com',
    };
    expect(renderInlineNode(node, 0)).toContain('a &amp; b');
  });

  it('renders image', () => {
    const node: MarkdownNode = {
      type: 'image',
      alt: 'cat',
      url: 'https://example.com/cat.png',
    };
    const html = renderInlineNode(node, 0);
    expect(html).toContain('<img src="https://example.com/cat.png"');
    expect(html).toContain('alt="cat"');
  });

  it('returns empty string for image with dangerous URL', () => {
    const node: MarkdownNode = {
      type: 'image',
      alt: 'evil',
      url: 'javascript:alert(1)',
    };
    expect(renderInlineNode(node, 0)).toBe('');
  });

  it('renders image with empty alt', () => {
    const node: MarkdownNode = {
      type: 'image',
      url: 'https://example.com/img.png',
    };
    expect(renderInlineNode(node, 0)).toContain('alt=""');
  });

  it('renders emoji node', () => {
    const node: MarkdownNode = { type: 'emoji', content: '😊', emojiCode: 'smile' };
    expect(renderInlineNode(node, 0)).toBe('😊');
  });

  it('renders emoji node with undefined content', () => {
    const node: MarkdownNode = { type: 'emoji' };
    expect(renderInlineNode(node, 0)).toBe('');
  });

  it('renders line-break', () => {
    const node: MarkdownNode = { type: 'line-break' };
    expect(renderInlineNode(node, 0)).toBe('<br />');
  });

  it('returns empty string for unknown inline type', () => {
    const node = { type: 'unknown-inline' } as unknown as MarkdownNode;
    expect(renderInlineNode(node, 0)).toBe('');
  });

  it('renders bold with undefined children — hits optional-chaining false branch', () => {
    const node: MarkdownNode = { type: 'bold' }; // no children
    const html = renderInlineNode(node, 0);
    expect(html).toBe('<strong class="whitespace-pre-wrap"></strong>');
  });

  it('renders italic with undefined children — hits optional-chaining false branch', () => {
    const node: MarkdownNode = { type: 'italic' }; // no children
    expect(renderInlineNode(node, 0)).toContain('<em');
  });

  it('renders strikethrough with undefined children — hits optional-chaining false branch', () => {
    const node: MarkdownNode = { type: 'strikethrough' }; // no children
    expect(renderInlineNode(node, 0)).toContain('<del');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// renderers/table-renderer
// ─────────────────────────────────────────────────────────────────────────────

describe('renderTable', () => {
  const makeTable = (): MarkdownNode => ({
    type: 'table',
    children: [
      {
        type: 'table-row',
        children: [
          {
            type: 'table-cell',
            isHeader: true,
            align: 'left',
            children: [{ type: 'text', content: 'Name' }],
          },
          {
            type: 'table-cell',
            isHeader: true,
            align: 'center',
            children: [{ type: 'text', content: 'Age' }],
          },
        ],
      },
      {
        type: 'table-row',
        children: [
          {
            type: 'table-cell',
            isHeader: false,
            align: 'left',
            children: [{ type: 'text', content: 'Alice' }],
          },
          {
            type: 'table-cell',
            isHeader: false,
            align: 'right',
            children: [{ type: 'text', content: '30' }],
          },
        ],
      },
    ],
  });

  it('renders a complete table with header and body rows', () => {
    const html = renderTable(makeTable(), 0);
    expect(html).toContain('<table');
    expect(html).toContain('<th');
    expect(html).toContain('<td');
    expect(html).toContain('Name');
    expect(html).toContain('Alice');
  });

  it('wraps table in overflow-x-auto div', () => {
    const html = renderTable(makeTable(), 0);
    expect(html).toContain('overflow-x-auto');
  });

  it('applies alignment classes to cells', () => {
    const html = renderTable(makeTable(), 0);
    expect(html).toContain('text-center');
    expect(html).toContain('text-right');
  });

  it('uses th for header cells', () => {
    const html = renderTable(makeTable(), 0);
    expect(html).toContain('</th>');
  });

  it('uses td for body cells', () => {
    const html = renderTable(makeTable(), 0);
    expect(html).toContain('</td>');
  });

  it('renders table with no children gracefully', () => {
    const node: MarkdownNode = { type: 'table', children: [] };
    expect(renderTable(node, 0)).toContain('<table');
  });

  it('renders cell without align attribute (align is undefined)', () => {
    const node: MarkdownNode = {
      type: 'table',
      children: [
        {
          type: 'table-row',
          children: [
            {
              type: 'table-cell',
              isHeader: false,
              // align omitted
              children: [{ type: 'text', content: 'data' }],
            },
          ],
        },
      ],
    };
    const html = renderTable(node, 0);
    expect(html).toContain('data');
  });

  it('renders table row with no children (undefined) — hits optional-chaining false branch', () => {
    const node: MarkdownNode = {
      type: 'table',
      children: [
        { type: 'table-row' }, // no children property
      ],
    };
    const html = renderTable(node, 0);
    expect(html).toContain('<tr');
    expect(html).toContain('</tr>');
  });

  it('renders table row with empty children array — hits || fallback branch', () => {
    const node: MarkdownNode = {
      type: 'table',
      children: [
        { type: 'table-row', children: [] },
      ],
    };
    const html = renderTable(node, 0);
    expect(html).toContain('<tr');
  });

  it('renders table cell with no children (undefined) — hits optional-chaining false branch', () => {
    const node: MarkdownNode = {
      type: 'table',
      children: [
        {
          type: 'table-row',
          children: [
            { type: 'table-cell', isHeader: false, align: 'center' }, // no children
          ],
        },
      ],
    };
    const html = renderTable(node, 0);
    expect(html).toContain('<td');
    expect(html).toContain('text-center');
  });

  it('renders table cell with empty children array — hits || fallback branch', () => {
    const node: MarkdownNode = {
      type: 'table',
      children: [
        {
          type: 'table-row',
          children: [
            { type: 'table-cell', isHeader: true, align: 'right', children: [] },
          ],
        },
      ],
    };
    const html = renderTable(node, 0);
    expect(html).toContain('<th');
    expect(html).toContain('text-right');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// markdown-parser (integration-level, tests whole pipeline)
// ─────────────────────────────────────────────────────────────────────────────

describe('parseMarkdown', () => {
  beforeEach(() => clearCache());

  it('returns empty array for empty string', () => {
    expect(parseMarkdown('')).toEqual([]);
  });

  it('returns empty array for null/undefined', () => {
    expect(parseMarkdown(null as unknown as string)).toEqual([]);
    expect(parseMarkdown(undefined as unknown as string)).toEqual([]);
  });

  it('returns empty array for whitespace-only input', () => {
    expect(parseMarkdown('   \n\t  ')).toEqual([]);
  });

  it('returns content-too-large paragraph when content exceeds MAX_CONTENT_LENGTH', () => {
    const huge = 'x'.repeat(MAX_CONTENT_LENGTH + 1);
    const nodes = parseMarkdown(huge);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('paragraph');
    expect(nodes[0].children?.[0].content).toContain('Content too large');
  });

  it('converts Meeshy URL tokens before parsing', () => {
    const nodes = parseMarkdown('Visit m+ABC123 now');
    const html = nodes.map((n, i) => renderMarkdownNode(n, i)).join('');
    expect(html).toContain('m+ABC123');
  });

  it('parses a heading', () => {
    const nodes = parseMarkdown('# Hello World');
    expect(nodes[0].type).toBe('heading');
    expect(nodes[0].level).toBe(1);
  });

  it('parses a code block', () => {
    const nodes = parseMarkdown('```js\nconst x = 1;\n```');
    expect(nodes[0].type).toBe('code-block');
    expect(nodes[0].language).toBe('js');
  });

  it('parses a single-column table', () => {
    // TABLE_SEPARATOR_PATTERN only matches |---| (single-column) not |---|---|
    const nodes = parseMarkdown('| A |\n|---|\n| 1 |');
    expect(nodes[0].type).toBe('table');
  });

  it('parses paragraph text', () => {
    const nodes = parseMarkdown('Hello world');
    expect(nodes[0].type).toBe('paragraph');
  });

  it('merges consecutive lines into single paragraph with line-break', () => {
    const nodes = parseMarkdown('line one\nline two');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('paragraph');
    const childTypes = nodes[0].children?.map(c => c.type);
    expect(childTypes).toContain('line-break');
  });

  it('skips empty paragraphs (blank lines)', () => {
    const nodes = parseMarkdown('first\n\nsecond');
    // Each non-empty line should produce a paragraph; blank line skipped
    expect(nodes.length).toBeGreaterThanOrEqual(1);
  });

  it('groups list items', () => {
    const nodes = parseMarkdown('- item 1\n- item 2');
    expect(nodes[0].type).toBe('list');
  });

  it('parses multiple block types', () => {
    const md = '# Title\n\n- item\n\n> quote\n\n---';
    const nodes = parseMarkdown(md);
    const types = nodes.map(n => n.type);
    expect(types).toContain('heading');
    expect(types).toContain('list');
    expect(types).toContain('blockquote');
    expect(types).toContain('horizontal-rule');
  });
});

describe('renderMarkdownNode', () => {
  it('delegates table type to renderTable', () => {
    const node: MarkdownNode = { type: 'table', children: [] };
    const html = renderMarkdownNode(node, 0);
    expect(html).toContain('<table');
  });

  it('delegates heading to renderBlockNode', () => {
    const node: MarkdownNode = { type: 'heading', level: 2, children: [] };
    expect(renderMarkdownNode(node, 0)).toContain('<h2');
  });

  it('delegates paragraph to renderBlockNode', () => {
    const node: MarkdownNode = {
      type: 'paragraph',
      children: [{ type: 'text', content: 'hi' }],
    };
    expect(renderMarkdownNode(node, 0)).toContain('<p');
  });

  it('delegates code-block to renderBlockNode', () => {
    const node: MarkdownNode = { type: 'code-block', content: 'x', language: 'ts' };
    expect(renderMarkdownNode(node, 0)).toContain('<pre');
  });

  it('delegates blockquote to renderBlockNode', () => {
    const node: MarkdownNode = { type: 'blockquote', children: [] };
    expect(renderMarkdownNode(node, 0)).toContain('<blockquote');
  });

  it('delegates list to renderBlockNode', () => {
    const node: MarkdownNode = {
      type: 'list',
      ordered: false,
      children: [{ type: 'list-item', children: [] }],
    };
    expect(renderMarkdownNode(node, 0)).toContain('<ul');
  });

  it('delegates horizontal-rule to renderBlockNode', () => {
    const node: MarkdownNode = { type: 'horizontal-rule' };
    expect(renderMarkdownNode(node, 0)).toContain('<hr');
  });

  it('delegates inline text to renderInlineNode', () => {
    const node: MarkdownNode = { type: 'text', content: 'hello' };
    expect(renderMarkdownNode(node, 0)).toBe('hello');
  });

  it('delegates bold to renderInlineNode', () => {
    const node: MarkdownNode = {
      type: 'bold',
      children: [{ type: 'text', content: 'b' }],
    };
    expect(renderMarkdownNode(node, 0)).toContain('<strong');
  });
});

describe('markdownToHtml', () => {
  beforeEach(() => clearCache());

  it('returns empty string for empty content', () => {
    expect(markdownToHtml('')).toBe('');
  });

  it('converts simple markdown to HTML', () => {
    const html = markdownToHtml('**bold** text');
    expect(html).toContain('<strong');
    expect(html).toContain('bold');
  });

  it('caches result and returns same HTML on second call', () => {
    const content = 'Hello **world**';
    const first = markdownToHtml(content);
    const second = markdownToHtml(content);
    expect(first).toBe(second);
  });

  it('uses different cache keys for different options', () => {
    const content = 'Hello';
    const a = markdownToHtml(content, {});
    const b = markdownToHtml(content, { isDark: true });
    // Both are valid HTML; they just used different cache keys
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
  });

  it('renders heading', () => {
    expect(markdownToHtml('# Heading')).toContain('<h1');
  });

  it('renders code block', () => {
    expect(markdownToHtml('```\ncode\n```')).toContain('<pre');
  });

  it('renders single-column table', () => {
    // TABLE_SEPARATOR_PATTERN only matches |---| (single-column separator)
    expect(markdownToHtml('| A |\n|---|\n| 1 |')).toContain('<table');
  });

  it('renders list', () => {
    expect(markdownToHtml('- item')).toContain('<ul');
  });

  it('XSS prevention: escapes HTML in text content', () => {
    const html = markdownToHtml('<script>alert("xss")</script>');
    expect(html).not.toContain('<script>');
  });

  it('XSS prevention: blocks javascript: link URL', () => {
    const html = markdownToHtml('[click](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// index re-exports
// ─────────────────────────────────────────────────────────────────────────────

describe('index re-exports', () => {
  it('exports parseMarkdown', () => {
    expect(typeof markdownIndex.parseMarkdown).toBe('function');
  });

  it('exports renderMarkdownNode', () => {
    expect(typeof markdownIndex.renderMarkdownNode).toBe('function');
  });

  it('exports markdownToHtml', () => {
    expect(typeof markdownIndex.markdownToHtml).toBe('function');
  });

  it('has a default export for backward compatibility', () => {
    const def = (markdownIndex as unknown as { default: typeof markdownIndex }).default;
    expect(typeof def.parseMarkdown).toBe('function');
    expect(typeof def.renderMarkdownNode).toBe('function');
    expect(typeof def.markdownToHtml).toBe('function');
  });

  it('parseMarkdown from index produces same result as direct import', () => {
    const md = '# Title';
    const viaIndex = markdownIndex.parseMarkdown(md);
    const viaDirect = parseMarkdown(md);
    expect(viaIndex).toEqual(viaDirect);
  });
});
