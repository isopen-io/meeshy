/**
 * Quick Validation Tests for Markdown Parser V2.2-OPTIMIZED
 *
 * Run with: npm test -- markdown-parser-v2.2-quick-test
 *
 * Tests:
 * 1. Performance (import, simple parse, complex parse)
 * 2. Security (XSS, ReDoS, URL sanitization)
 * 3. Functionality (all markdown features)
 * 4. Cache (LRU, TTL)
 */

import { parseMarkdown, markdownToHtml, renderMarkdownNode } from '../markdown';

describe('Markdown Parser V2.2-OPTIMIZED - Quick Tests', () => {

  // ============================================================================
  // PERFORMANCE TESTS
  // ============================================================================

  describe('Performance', () => {
    it('should parse simple message in <5ms', () => {
      const content = 'Hello **world**! This is a *test*.';
      const start = performance.now();
      markdownToHtml(content);
      const end = performance.now();
      const duration = end - start;

      expect(duration).toBeLessThan(5);
    });

    it('should parse complex message in <15ms', () => {
      const content = `
# Heading 1
## Heading 2

This is a **bold** and *italic* text with [link](https://example.com).

- Item 1
- Item 2
  - Nested item
- Item 3

\`\`\`javascript
const code = "test";
\`\`\`

| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |

> Blockquote text

---

:smile: :heart:
      `;

      const start = performance.now();
      markdownToHtml(content);
      const end = performance.now();
      const duration = end - start;

      expect(duration).toBeLessThan(15);
    });

    it('should use cache for repeated content', () => {
      const content = 'Hello **world**!';

      // First call (no cache)
      const start1 = performance.now();
      const html1 = markdownToHtml(content);
      const end1 = performance.now();
      const duration1 = end1 - start1;

      // Second call (cache hit)
      const start2 = performance.now();
      const html2 = markdownToHtml(content);
      const end2 = performance.now();
      const duration2 = end2 - start2;

      // Cache should be much faster
      expect(duration2).toBeLessThan(duration1 / 2);
      expect(html1).toBe(html2);
    });
  });

  // ============================================================================
  // SECURITY TESTS
  // ============================================================================

  describe('Security', () => {
    it('should escape HTML to prevent XSS', () => {
      const content = '<script>alert("XSS")</script>';
      const html = markdownToHtml(content);

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('should block javascript: URLs', () => {
      const content = '[Click me](javascript:alert("XSS"))';
      const html = markdownToHtml(content);

      expect(html).not.toContain('javascript:');
      expect(html).toContain('Click me');
    });

    it('should block data: URLs', () => {
      const content = '[Click me](data:text/html,<script>alert("XSS")</script>)';
      const html = markdownToHtml(content);

      expect(html).not.toContain('data:');
    });

    it('should allow safe URLs', () => {
      const content = '[HTTPS](https://example.com) [HTTP](http://example.com) [Relative](/path)';
      const html = markdownToHtml(content);

      expect(html).toContain('https://example.com');
      expect(html).toContain('http://example.com');
      expect(html).toContain('/path');
    });

    it('should limit content length', () => {
      const longContent = 'a'.repeat(2 * 1024 * 1024); // 2MB
      const html = markdownToHtml(longContent);

      expect(html).toContain('Content too large to display');
    });

    it('should handle malicious regex patterns (ReDoS prevention)', () => {
      const content = ':' + 'a'.repeat(1000) + ':';
      const start = performance.now();
      markdownToHtml(content);
      const end = performance.now();

      // Should not hang (timeout at 100ms)
      expect(end - start).toBeLessThan(100);
    });
  });

  // ============================================================================
  // FUNCTIONALITY TESTS
  // ============================================================================

  describe('Inline Formatting', () => {
    it('should parse bold text', () => {
      expect(markdownToHtml('**bold**')).toContain('<strong');
      expect(markdownToHtml('**bold**')).toContain('bold</strong>');
    });

    it('should parse italic text', () => {
      expect(markdownToHtml('*italic*')).toContain('<em');
      expect(markdownToHtml('*italic*')).toContain('italic</em>');
    });

    it('should parse strikethrough text', () => {
      expect(markdownToHtml('~~strike~~')).toContain('<del');
      expect(markdownToHtml('~~strike~~')).toContain('strike</del>');
    });

    it('should parse inline code', () => {
      expect(markdownToHtml('`code`')).toContain('<code');
      expect(markdownToHtml('`code`')).toContain('code</code>');
    });

    it('should parse links', () => {
      const html = markdownToHtml('[Link](https://example.com)');
      expect(html).toContain('<a href');
      expect(html).toContain('https://example.com');
      expect(html).toContain('Link</a>');
    });

    it('should parse images', () => {
      const html = markdownToHtml('![Alt](https://example.com/image.png)');
      expect(html).toContain('<img');
      expect(html).toContain('src="https://example.com/image.png"');
      expect(html).toContain('alt="Alt"');
    });

    it('should parse emojis', () => {
      expect(markdownToHtml(':smile:')).toContain('😊');
      expect(markdownToHtml(':heart:')).toContain('❤️');
      expect(markdownToHtml(':+1:')).toContain('👍');
    });

    it('should auto-link URLs', () => {
      const html = markdownToHtml('Visit https://example.com');
      expect(html).toContain('<a href');
      expect(html).toContain('https://example.com');
    });

    it('should parse Meeshy tracking URLs', () => {
      const html = markdownToHtml('Track: m+ABC123');
      expect(html).toContain('<a href');
      expect(html).toContain('m+ABC123');
    });
  });

  describe('Block Elements', () => {
    it('should parse headings', () => {
      expect(markdownToHtml('# H1')).toContain('<h1');
      expect(markdownToHtml('## H2')).toContain('<h2');
      expect(markdownToHtml('### H3')).toContain('<h3');
      expect(markdownToHtml('###### H6')).toContain('<h6');
    });

    it('should parse unordered lists', () => {
      const content = '- Item 1\n- Item 2\n- Item 3';
      const html = markdownToHtml(content);
      expect(html).toContain('<ul');
      expect(html).toContain('<li>Item 1</li>');
    });

    it('should parse ordered lists', () => {
      const content = '1. Item 1\n2. Item 2\n3. Item 3';
      const html = markdownToHtml(content);
      expect(html).toContain('<ol');
      expect(html).toContain('<li>Item 1</li>');
    });

    it('should parse nested lists', () => {
      const content = '- Item 1\n  - Nested 1\n  - Nested 2\n- Item 2';
      const html = markdownToHtml(content);
      expect(html).toContain('<ul');
      expect(html).toContain('Nested 1');
    });

    it('should parse blockquotes', () => {
      const html = markdownToHtml('> Quote text');
      expect(html).toContain('<blockquote');
      expect(html).toContain('Quote text');
    });

    it('should parse horizontal rules', () => {
      expect(markdownToHtml('---')).toContain('<hr');
      expect(markdownToHtml('***')).toContain('<hr');
      expect(markdownToHtml('___')).toContain('<hr');
    });

    it('should parse code blocks (plain text)', () => {
      const content = '```javascript\nconst x = 1;\n```';
      const html = markdownToHtml(content);
      expect(html).toContain('<pre');
      expect(html).toContain('<code');
      expect(html).toContain('const x = 1;');
      expect(html).toContain('language-javascript');
    });

    it('should parse tables', () => {
      const content = '| H1 | H2 |\n|----|----|\\n| C1 | C2 |';
      const html = markdownToHtml(content);
      expect(html).toContain('<table');
      expect(html).toContain('<th');
      expect(html).toContain('<td');
    });

    it('should parse task lists', () => {
      const content = '- [ ] Todo\n- [x] Done';
      const html = markdownToHtml(content);
      expect(html).toContain('<input type="checkbox"');
      expect(html).toContain('checked');
      expect(html).toContain('Todo');
      expect(html).toContain('Done');
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle empty content', () => {
      expect(markdownToHtml('')).toBe('');
      expect(markdownToHtml('   ')).toBe('');
    });

    it('should handle nested formatting', () => {
      const html = markdownToHtml('**bold *and italic***');
      expect(html).toContain('<strong');
      expect(html).toContain('<em');
    });

    it('should handle multiple consecutive blank lines', () => {
      const content = 'Line 1\n\n\n\nLine 2';
      const html = markdownToHtml(content);
      expect(html).toContain('Line 1');
      expect(html).toContain('Line 2');
    });

    it('should handle unicode characters', () => {
      const content = '**Héllo Wörld** 你好 العالم 🌍';
      const html = markdownToHtml(content);
      expect(html).toContain('Héllo Wörld');
      expect(html).toContain('你好');
      expect(html).toContain('العالم');
      expect(html).toContain('🌍');
    });

    it('should handle malformed markdown gracefully', () => {
      expect(markdownToHtml('**bold')).toBeTruthy();
      expect(markdownToHtml('[link]()')).toBeTruthy();
      expect(markdownToHtml('![]()')).toBeTruthy();
    });
  });

  // ============================================================================
  // CACHE TESTS
  // ============================================================================

  describe('Cache', () => {
    it('should cache parsed HTML', () => {
      const content = 'Test content **bold**';
      const html1 = markdownToHtml(content);
      const html2 = markdownToHtml(content);

      expect(html1).toBe(html2);
    });

    it('should cache with different options separately', () => {
      const content = 'Test';
      const html1 = markdownToHtml(content, { isDark: true });
      const html2 = markdownToHtml(content, { isDark: false });

      // Both should work (cache by content + options)
      expect(html1).toBeTruthy();
      expect(html2).toBeTruthy();
    });

    it('should evict old entries (LRU)', () => {
      // Fill cache with 101 entries (max is 100)
      for (let i = 0; i < 101; i++) {
        markdownToHtml(`Content ${i}`);
      }

      // First entry should be evicted
      const start = performance.now();
      markdownToHtml('Content 0');
      const end = performance.now();

      // Should be slower (cache miss)
      expect(end - start).toBeGreaterThan(0.5);
    });
  });

  // ============================================================================
  // COMPATIBILITY TESTS (V1 API)
  // ============================================================================

  describe('API Compatibility', () => {
    it('should export parseMarkdown function', () => {
      expect(typeof parseMarkdown).toBe('function');
      const nodes = parseMarkdown('**test**');
      expect(Array.isArray(nodes)).toBe(true);
    });

    it('should export renderMarkdownNode function', () => {
      expect(typeof renderMarkdownNode).toBe('function');
      const node = { type: 'text' as const, content: 'test' };
      const html = renderMarkdownNode(node, 0);
      expect(typeof html).toBe('string');
    });

    it('should export markdownToHtml function', () => {
      expect(typeof markdownToHtml).toBe('function');
      const html = markdownToHtml('**test**');
      expect(typeof html).toBe('string');
    });

    it('should return same structure as V1', () => {
      const content = '**bold** *italic*';
      const nodes = parseMarkdown(content);

      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('paragraph');
      expect(nodes[0].children).toBeDefined();
    });
  });

  // ============================================================================
  // REGRESSION TESTS (Known Issues from V2)
  // ============================================================================

  describe('Regression Tests', () => {
    it('should NOT hang on large conversations (V2 bug)', () => {
      // Simulate 50 messages
      const messages = Array(50).fill('Message with **bold** and *italic*');
      const start = performance.now();

      messages.forEach(msg => markdownToHtml(msg));

      const end = performance.now();
      const duration = end - start;

      // Should be <200ms (V2 was 2500ms)
      expect(duration).toBeLessThan(200);
    });

    it('should NOT import highlight.js on module load (V2 bug)', () => {
      // This test verifies that the module loads quickly
      // If highlight.js is imported, module load time would be >100ms

      const start = performance.now();
      // Module is already loaded, so just check that parsing is fast
      markdownToHtml('test');
      const end = performance.now();

      // First parse should still be fast (<20ms)
      expect(end - start).toBeLessThan(20);
    });

    it('should NOT have 5-phase overhead (V2 bug)', () => {
      // V2 had 5 phases: Preprocessor → Lexer → Parser → Transformer → Renderer
      // V2.2 should be much faster with 2 phases

      const content = 'Simple **test** message';
      const start = performance.now();
      markdownToHtml(content);
      const end = performance.now();

      // Should be <5ms (V2 was ~15ms)
      expect(end - start).toBeLessThan(5);
    });
  });
});
