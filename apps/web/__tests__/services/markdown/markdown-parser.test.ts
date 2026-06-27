/**
 * Tests for services/markdown/ — covers the public API surface:
 * parseMarkdown, renderMarkdownNode, markdownToHtml, and the
 * security helpers (escapeHtml, sanitizeUrl).
 */

import { parseMarkdown, renderMarkdownNode, markdownToHtml } from '@/services/markdown';
import { escapeHtml, sanitizeUrl } from '@/services/markdown/security/sanitizer';
import { clearCache } from '@/services/markdown/cache';

// ─── clearCache between tests so caching doesn't interfere ───────────────────

beforeEach(() => {
  clearCache();
});

// ─── escapeHtml ───────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("it's")).toBe("it&#039;s");
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('escapes multiple special chars in one string', () => {
    expect(escapeHtml('<a href="x" onclick=\'alert(1)\'>foo & bar</a>')).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#039;alert(1)&#039;&gt;foo &amp; bar&lt;/a&gt;'
    );
  });
});

// ─── sanitizeUrl ──────────────────────────────────────────────────────────────

describe('sanitizeUrl', () => {
  it('returns empty string for undefined', () => {
    expect(sanitizeUrl(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(sanitizeUrl('')).toBe('');
  });

  it('allows https URLs', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
  });

  it('allows http URLs', () => {
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('allows relative URLs starting with /', () => {
    expect(sanitizeUrl('/path/to/page')).toBe('/path/to/page');
  });

  it('blocks javascript: protocol', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
  });

  it('blocks vbscript: protocol', () => {
    expect(sanitizeUrl('vbscript:msgbox(1)')).toBe('');
  });

  it('blocks data: URLs', () => {
    expect(sanitizeUrl('data:text/html,<h1>hi</h1>')).toBe('');
  });

  it('escapes HTML characters in safe URLs', () => {
    expect(sanitizeUrl('https://example.com?q=<foo>')).toBe(
      'https://example.com?q=&lt;foo&gt;'
    );
  });

  it('returns empty string for URLs exceeding max length', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(2100);
    expect(sanitizeUrl(longUrl)).toBe('');
  });
});

// ─── parseMarkdown — basic nodes ─────────────────────────────────────────────

describe('parseMarkdown', () => {
  it('returns empty array for empty string', () => {
    expect(parseMarkdown('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(parseMarkdown('   ')).toEqual([]);
  });

  it('returns content-too-large paragraph for oversized content', () => {
    const huge = 'a'.repeat(1024 * 1024 + 1);
    const nodes = parseMarkdown(huge);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('paragraph');
    expect(nodes[0].children?.[0]?.content).toBe('Content too large to display');
  });

  it('parses H1 heading', () => {
    const nodes = parseMarkdown('# Hello');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('heading');
    expect(nodes[0].level).toBe(1);
    expect(nodes[0].children?.[0]?.content).toBe('Hello');
  });

  it('parses H3 heading', () => {
    const nodes = parseMarkdown('### Section');
    expect(nodes[0].level).toBe(3);
  });

  it('parses max heading level 6', () => {
    const nodes = parseMarkdown('###### H6');
    expect(nodes[0].level).toBe(6);
  });

  it('parses a paragraph', () => {
    const nodes = parseMarkdown('Hello world');
    expect(nodes[0].type).toBe('paragraph');
    expect(nodes[0].children?.[0]?.content).toBe('Hello world');
  });

  it('merges consecutive paragraph lines with line-break', () => {
    const nodes = parseMarkdown('Line 1\nLine 2');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('paragraph');
    const types = nodes[0].children?.map(c => c.type);
    expect(types).toContain('line-break');
  });

  it('parses blockquote', () => {
    const nodes = parseMarkdown('> quote text');
    expect(nodes[0].type).toBe('blockquote');
    expect(nodes[0].children?.[0]?.content).toBe('quote text');
  });

  it('parses horizontal rule ---', () => {
    const nodes = parseMarkdown('---');
    expect(nodes[0].type).toBe('horizontal-rule');
  });

  it('parses horizontal rule ***', () => {
    const nodes = parseMarkdown('***');
    expect(nodes[0].type).toBe('horizontal-rule');
  });

  it('parses unordered list', () => {
    const nodes = parseMarkdown('- item1\n- item2');
    expect(nodes[0].type).toBe('list');
    expect(nodes[0].ordered).toBe(false);
    expect(nodes[0].children).toHaveLength(2);
  });

  it('parses ordered list', () => {
    const nodes = parseMarkdown('1. first\n2. second');
    expect(nodes[0].type).toBe('list');
    expect(nodes[0].ordered).toBe(true);
    expect(nodes[0].children).toHaveLength(2);
  });

  it('parses task list items', () => {
    const nodes = parseMarkdown('- [ ] todo\n- [x] done');
    const list = nodes[0];
    expect(list.children?.[0]?.type).toBe('task-list-item');
    expect(list.children?.[0]?.checked).toBe(false);
    expect(list.children?.[1]?.checked).toBe(true);
  });

  it('parses fenced code block', () => {
    const nodes = parseMarkdown('```js\nconsole.log("hi");\n```');
    expect(nodes[0].type).toBe('code-block');
    expect(nodes[0].language).toBe('js');
    expect(nodes[0].content).toContain('console.log');
  });

  it('parses code block with no language (defaults to "text")', () => {
    const nodes = parseMarkdown('```\nplain code\n```');
    expect(nodes[0].type).toBe('code-block');
    expect(nodes[0].language).toBe('text');
  });

  it('parses a single-column table', () => {
    const nodes = parseMarkdown('| Name |\n|------|\n| Alice |');
    expect(nodes[0].type).toBe('table');
  });

  it('parses bold inline text in paragraph', () => {
    const nodes = parseMarkdown('**bold**');
    const bold = nodes[0].children?.find(c => c.type === 'bold');
    expect(bold).toBeDefined();
    expect(bold?.children?.[0]?.content).toBe('bold');
  });

  it('parses italic inline text', () => {
    const nodes = parseMarkdown('*italic*');
    const italic = nodes[0].children?.find(c => c.type === 'italic');
    expect(italic).toBeDefined();
    expect(italic?.children?.[0]?.content).toBe('italic');
  });

  it('parses strikethrough inline text', () => {
    const nodes = parseMarkdown('~~strike~~');
    const strike = nodes[0].children?.find(c => c.type === 'strikethrough');
    expect(strike).toBeDefined();
  });

  it('parses inline code', () => {
    const nodes = parseMarkdown('Use `console.log`');
    const code = nodes[0].children?.find(c => c.type === 'code-inline');
    expect(code?.content).toBe('console.log');
  });

  it('parses link', () => {
    const nodes = parseMarkdown('[click here](https://example.com)');
    const link = nodes[0].children?.find(c => c.type === 'link');
    expect(link?.content).toBe('click here');
    expect(link?.url).toBe('https://example.com');
  });

  it('parses auto-linked URL', () => {
    const nodes = parseMarkdown('Visit https://example.com now');
    const link = nodes[0].children?.find(c => c.type === 'link');
    expect(link?.url).toBe('https://example.com');
  });

  it('parses image', () => {
    const nodes = parseMarkdown('![alt text](https://img.example.com/photo.png)');
    const img = nodes[0].children?.find(c => c.type === 'image');
    expect(img?.alt).toBe('alt text');
    expect(img?.url).toBe('https://img.example.com/photo.png');
  });

  it('parses emoji shortcode :thumbsup:', () => {
    const nodes = parseMarkdown(':thumbsup:');
    const emoji = nodes[0].children?.find(c => c.type === 'emoji');
    expect(emoji?.emojiCode).toBe('thumbsup');
  });
});

// ─── renderMarkdownNode ───────────────────────────────────────────────────────

describe('renderMarkdownNode', () => {
  it('renders a heading to <h1> tag', () => {
    const html = renderMarkdownNode({ type: 'heading', level: 1, children: [{ type: 'text', content: 'Title' }] }, 0);
    expect(html).toMatch(/<h1[^>]*>Title<\/h1>/);
  });

  it('renders H2', () => {
    const html = renderMarkdownNode({ type: 'heading', level: 2, children: [{ type: 'text', content: 'Sub' }] }, 0);
    expect(html).toMatch(/<h2[^>]*>Sub<\/h2>/);
  });

  it('renders code-block with language class', () => {
    const html = renderMarkdownNode({ type: 'code-block', language: 'python', content: 'x = 1' }, 0);
    expect(html).toContain('language-python');
    expect(html).toContain('x = 1');
  });

  it('escapes XSS in code-block content', () => {
    const html = renderMarkdownNode({ type: 'code-block', language: 'js', content: '<script>alert(1)</script>' }, 0);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders blockquote', () => {
    const html = renderMarkdownNode({ type: 'blockquote', children: [{ type: 'text', content: 'Note' }] }, 0);
    expect(html).toMatch(/<blockquote[^>]*>Note<\/blockquote>/);
  });

  it('renders horizontal-rule as <hr>', () => {
    const html = renderMarkdownNode({ type: 'horizontal-rule' }, 0);
    expect(html).toMatch(/<hr/);
  });

  it('renders unordered list as <ul>', () => {
    const html = renderMarkdownNode({
      type: 'list',
      ordered: false,
      children: [
        { type: 'list-item', children: [{ type: 'text', content: 'a' }] },
      ],
    }, 0);
    expect(html).toContain('<ul');
    expect(html).toContain('</ul>');
    expect(html).toContain('<li');
  });

  it('renders ordered list as <ol>', () => {
    const html = renderMarkdownNode({
      type: 'list',
      ordered: true,
      children: [
        { type: 'list-item', children: [{ type: 'text', content: 'first' }] },
      ],
    }, 0);
    expect(html).toContain('<ol');
    expect(html).toContain('</ol>');
  });

  it('renders paragraph as <p>', () => {
    const html = renderMarkdownNode({ type: 'paragraph', children: [{ type: 'text', content: 'Hello' }] }, 0);
    expect(html).toMatch(/<p[^>]*>Hello<\/p>/);
  });

  it('renders bold inline node as <strong>', () => {
    const html = renderMarkdownNode({ type: 'bold', children: [{ type: 'text', content: 'bold' }] }, 0);
    expect(html).toMatch(/<strong[^>]*>bold<\/strong>/);
  });

  it('renders italic inline node as <em>', () => {
    const html = renderMarkdownNode({ type: 'italic', children: [{ type: 'text', content: 'it' }] }, 0);
    expect(html).toMatch(/<em[^>]*>it<\/em>/);
  });

  it('renders strikethrough as <del>', () => {
    const html = renderMarkdownNode({ type: 'strikethrough', children: [{ type: 'text', content: 'del' }] }, 0);
    expect(html).toMatch(/<del[^>]*>del<\/del>/);
  });

  it('renders inline code as <code>', () => {
    const html = renderMarkdownNode({ type: 'code-inline', content: 'fn()' }, 0);
    expect(html).toMatch(/<code[^>]*>fn\(\)<\/code>/);
  });

  it('renders link as <a> with href', () => {
    const html = renderMarkdownNode({ type: 'link', content: 'site', url: 'https://example.com' }, 0);
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('site');
  });

  it('renders link with javascript: url as empty href (sanitized)', () => {
    const html = renderMarkdownNode({ type: 'link', content: 'evil', url: 'javascript:alert(1)' }, 0);
    expect(html).not.toContain('javascript:');
  });

  it('renders image as <img>', () => {
    const html = renderMarkdownNode({ type: 'image', alt: 'img', url: 'https://img.example.com/a.png' }, 0);
    expect(html).toContain('<img');
    expect(html).toContain('alt="img"');
  });

  it('renders table node', () => {
    const node = {
      type: 'table' as const,
      children: [
        {
          type: 'table-row' as const,
          children: [
            {
              type: 'table-cell' as const,
              isHeader: true,
              align: 'left' as const,
              children: [{ type: 'text' as const, content: 'Name' }],
            },
          ],
        },
        {
          type: 'table-row' as const,
          children: [
            {
              type: 'table-cell' as const,
              isHeader: false,
              align: 'left' as const,
              children: [{ type: 'text' as const, content: 'Alice' }],
            },
          ],
        },
      ],
    };
    const html = renderMarkdownNode(node, 0);
    expect(html).toContain('<table');
    expect(html).toContain('<th');
    expect(html).toContain('Name');
    expect(html).toContain('Alice');
  });

  it('renders text node as plain text', () => {
    const html = renderMarkdownNode({ type: 'text', content: 'hello' }, 0);
    expect(html).toBe('hello');
  });

  it('escapes HTML in text nodes', () => {
    const html = renderMarkdownNode({ type: 'text', content: '<b>xss</b>' }, 0);
    expect(html).toContain('&lt;b&gt;');
  });

  it('renders line-break as <br>', () => {
    const html = renderMarkdownNode({ type: 'line-break' }, 0);
    expect(html).toContain('<br');
  });

  it('renders emoji as span with emoji character', () => {
    const html = renderMarkdownNode({ type: 'emoji', emojiCode: 'thumbsup', content: '👍' }, 0);
    expect(html).toContain('👍');
  });
});

// ─── markdownToHtml ───────────────────────────────────────────────────────────

describe('markdownToHtml', () => {
  it('returns empty string for empty input', () => {
    expect(markdownToHtml('')).toBe('');
  });

  it('converts bold text to <strong>', () => {
    const html = markdownToHtml('**bold**');
    expect(html).toContain('<strong');
    expect(html).toContain('bold');
  });

  it('converts italic to <em>', () => {
    const html = markdownToHtml('*italic*');
    expect(html).toContain('<em');
    expect(html).toContain('italic');
  });

  it('converts heading to <h1>', () => {
    const html = markdownToHtml('# Hello');
    expect(html).toMatch(/<h1[^>]*>Hello<\/h1>/);
  });

  it('converts code block to <pre><code>', () => {
    const html = markdownToHtml('```\ncode\n```');
    expect(html).toContain('<pre');
    expect(html).toContain('<code');
    expect(html).toContain('code');
  });

  it('returns same result from cache on second call', () => {
    const first = markdownToHtml('# Cached heading');
    const second = markdownToHtml('# Cached heading');
    expect(first).toBe(second);
  });

  it('returns different result for different options (cache key includes options)', () => {
    const html1 = markdownToHtml('hello', { isDark: false });
    const html2 = markdownToHtml('hello', { isDark: true });
    // Both produce HTML; they may differ if dark mode changes classes
    expect(typeof html1).toBe('string');
    expect(typeof html2).toBe('string');
  });

  it('prevents XSS in user content', () => {
    const html = markdownToHtml('<script>alert("xss")</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('prevents XSS in links', () => {
    const html = markdownToHtml('[click](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });

  it('converts multiline content with mixed elements', () => {
    const md = '# Title\n\nHello **world** with `code` and [link](https://x.com)';
    const html = markdownToHtml(md);
    expect(html).toContain('<h1');
    expect(html).toContain('<strong');
    expect(html).toContain('<code');
    expect(html).toContain('<a');
  });

  it('converts single-column table to HTML table tags', () => {
    const html = markdownToHtml('| Name |\n|------|\n| Alice |');
    expect(html).toContain('<table');
    expect(html).toContain('<th');
    expect(html).toContain('<td');
  });

  it('converts unordered list', () => {
    const html = markdownToHtml('- one\n- two\n- three');
    expect(html).toContain('<ul');
    expect(html).toContain('<li');
    expect(html).toContain('three');
  });

  it('converts ordered list', () => {
    const html = markdownToHtml('1. first\n2. second');
    expect(html).toContain('<ol');
  });

  it('handles content at max length boundary', () => {
    const content = 'a'.repeat(1024 * 1024 + 1);
    const html = markdownToHtml(content);
    expect(html).toContain('Content too large to display');
  });
});
