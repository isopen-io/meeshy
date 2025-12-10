# Markdown Parser V2 - Exemples de Tests

Ce document fournit des exemples concrets de tests pour valider le Parser V2.

---

## Test Suite 1 : Normalisation des Espaces Horizontaux

### Test 1.1 : Espaces Multiples

```typescript
describe('Horizontal Whitespace Normalization', () => {
  it('should collapse multiple spaces into one', () => {
    const input = 'Hello    world    test';
    const expected = '<p class="my-2 leading-relaxed">Hello world test</p>';
    expect(markdownToHtml(input)).toBe(expected);
  });

  it('should handle mixed multiple spaces', () => {
    const input = 'One  two   three    four';
    const expected = '<p class="my-2 leading-relaxed">One two three four</p>';
    expect(markdownToHtml(input)).toBe(expected);
  });

  it('should trim leading and trailing spaces', () => {
    const input = '   Hello world   ';
    const expected = '<p class="my-2 leading-relaxed">Hello world</p>';
    expect(markdownToHtml(input)).toBe(expected);
  });
});
```

### Test 1.2 : Espaces dans Code Blocks (Doivent être Préservés)

```typescript
describe('Code Block Whitespace Preservation', () => {
  it('should preserve multiple spaces in code blocks', () => {
    const input = '```\nfunction    test()    {\n    return    true;\n}\n```';
    const output = markdownToHtml(input);

    // Vérifier que les espaces sont préservés
    expect(output).toContain('function    test()');
    expect(output).toContain('return    true');
  });

  it('should preserve indentation in code blocks', () => {
    const input = '```python\ndef test():\n    if True:\n        return "indented"\n```';
    const output = markdownToHtml(input);

    expect(output).toContain('    if True:');
    expect(output).toContain('        return');
  });
});
```

---

## Test Suite 2 : Validation des Délimiteurs

### Test 2.1 : Bold avec Espaces (Devrait Rejeter)

```typescript
describe('Bold Delimiter Validation', () => {
  it('should NOT format bold with space after opening delimiter', () => {
    const input = '** text**';
    const expected = '<p class="my-2 leading-relaxed">** text**</p>';
    expect(markdownToHtml(input)).toBe(expected);
  });

  it('should NOT format bold with space before closing delimiter', () => {
    const input = '**text **';
    const expected = '<p class="my-2 leading-relaxed">**text **</p>';
    expect(markdownToHtml(input)).toBe(expected);
  });

  it('should NOT format bold with spaces on both sides', () => {
    const input = '** text **';
    const expected = '<p class="my-2 leading-relaxed">** text **</p>';
    expect(markdownToHtml(input)).toBe(expected);
  });

  it('should format bold correctly without spaces', () => {
    const input = '**text**';
    const expected = '<p class="my-2 leading-relaxed"><strong>text</strong></p>';
    expect(markdownToHtml(input)).toBe(expected);
  });

  it('should format bold in middle of sentence', () => {
    const input = 'This is **bold** text';
    const expected = '<p class="my-2 leading-relaxed">This is <strong>bold</strong> text</p>';
    expect(markdownToHtml(input)).toBe(expected);
  });
});
```

### Test 2.2 : Italic avec Espaces

```typescript
describe('Italic Delimiter Validation', () => {
  it('should NOT format italic with space after opening', () => {
    const input = '* text*';
    const expected = '<p class="my-2 leading-relaxed">* text*</p>';
    expect(markdownToHtml(input)).toBe(expected);
  });

  it('should NOT format italic with space before closing', () => {
    const input = '*text *';
    const expected = '<p class="my-2 leading-relaxed">*text *</p>';
    expect(markdownToHtml(input)).toBe(expected);
  });

  it('should format italic correctly', () => {
    const input = '*text*';
    const expected = '<p class="my-2 leading-relaxed"><em>text</em></p>';
    expect(markdownToHtml(input)).toBe(expected);
  });
});
```

### Test 2.3 : Strikethrough avec Espaces

```typescript
describe('Strikethrough Delimiter Validation', () => {
  it('should NOT format strikethrough with spaces', () => {
    const input = '~~ text ~~';
    const expected = '<p class="my-2 leading-relaxed">~~ text ~~</p>';
    expect(markdownToHtml(input)).toBe(expected);
  });

  it('should format strikethrough correctly', () => {
    const input = '~~text~~';
    const expected = '<p class="my-2 leading-relaxed"><del>text</del></p>';
    expect(markdownToHtml(input)).toBe(expected);
  });
});
```

---

## Test Suite 3 : Fusion des Paragraphes

### Test 3.1 : 1 Newline = Même Paragraphe

```typescript
describe('Paragraph Merging - Single Newline', () => {
  it('should merge lines with single newline using space', () => {
    const input = 'Line 1\nLine 2';
    const expected = '<p class="my-2 leading-relaxed">Line 1 Line 2</p>';
    expect(markdownToHtml(input)).toBe(expected);
  });

  it('should merge multiple lines with single newlines', () => {
    const input = 'Line 1\nLine 2\nLine 3';
    const expected = '<p class="my-2 leading-relaxed">Line 1 Line 2 Line 3</p>';
    expect(markdownToHtml(input)).toBe(expected);
  });

  it('should NOT use <br /> for single newline', () => {
    const input = 'Line 1\nLine 2';
    const output = markdownToHtml(input);
    expect(output).not.toContain('<br />');
  });
});
```

### Test 3.2 : 2+ Newlines = Nouveau Paragraphe

```typescript
describe('Paragraph Merging - Double Newline', () => {
  it('should separate paragraphs with double newline', () => {
    const input = 'Paragraph 1\n\nParagraph 2';
    const output = markdownToHtml(input);

    expect(output).toContain('<p class="my-2 leading-relaxed">Paragraph 1</p>');
    expect(output).toContain('<p class="my-2 leading-relaxed">Paragraph 2</p>');
  });

  it('should treat multiple newlines as one separator', () => {
    const input = 'Paragraph 1\n\n\n\nParagraph 2';
    const output = markdownToHtml(input);

    expect(output).toContain('<p class="my-2 leading-relaxed">Paragraph 1</p>');
    expect(output).toContain('<p class="my-2 leading-relaxed">Paragraph 2</p>');

    // Ne devrait pas créer de paragraphes vides
    const paragraphCount = (output.match(/<p class/g) || []).length;
    expect(paragraphCount).toBe(2);
  });
});
```

---

## Test Suite 4 : Normalisation Tabs → Espaces

### Test 4.1 : Conversion Tabs

```typescript
describe('Tab to Space Normalization', () => {
  it('should convert 1 tab to 4 spaces', () => {
    const input = '- Item 1\n\t- Item 2';
    const ast = parseMarkdown(input);

    // Vérifier que l'indentation est normalisée
    const list = ast[0] as MarkdownNode;
    expect(list.type).toBe('list');

    const items = list.children || [];
    expect(items[0].indent).toBe(0);
    expect(items[1].indent).toBe(4); // 1 tab = 4 espaces
  });

  it('should treat tab and 4 spaces identically', () => {
    const inputTab = '- Item 1\n\t- Item 2';
    const inputSpaces = '- Item 1\n    - Item 2';

    const astTab = parseMarkdown(inputTab);
    const astSpaces = parseMarkdown(inputSpaces);

    // Les deux devraient produire la même structure
    expect(JSON.stringify(astTab)).toBe(JSON.stringify(astSpaces));
  });
});
```

### Test 4.2 : Tabs Multiples

```typescript
describe('Multiple Tabs', () => {
  it('should convert 2 tabs to 8 spaces', () => {
    const input = '- Item 1\n\t\t- Item 2';
    const ast = parseMarkdown(input);

    const list = ast[0] as MarkdownNode;
    const items = list.children || [];

    expect(items[1].indent).toBe(8); // 2 tabs = 8 espaces
  });

  it('should handle mixed tabs and spaces', () => {
    const input = '- Item 1\n\t  - Item 2'; // 1 tab + 2 espaces
    const ast = parseMarkdown(input);

    const list = ast[0] as MarkdownNode;
    const items = list.children || [];

    expect(items[1].indent).toBe(6); // 4 (tab) + 2 (espaces) = 6
  });
});
```

---

## Test Suite 5 : Formatage Imbriqué

### Test 5.1 : Bold dans Italic

```typescript
describe('Nested Formatting - Bold in Italic', () => {
  it('should handle bold inside italic', () => {
    const input = '*italic with **bold** inside*';
    const expected = '<p class="my-2 leading-relaxed"><em>italic with <strong>bold</strong> inside</em></p>';
    expect(markdownToHtml(input)).toBe(expected);
  });
});
```

### Test 5.2 : Italic dans Bold

```typescript
describe('Nested Formatting - Italic in Bold', () => {
  it('should handle italic inside bold', () => {
    const input = '**bold with *italic* inside**';
    const expected = '<p class="my-2 leading-relaxed"><strong>bold with <em>italic</em> inside</strong></p>';
    expect(markdownToHtml(input)).toBe(expected);
  });
});
```

### Test 5.3 : Imbrication Complexe

```typescript
describe('Complex Nested Formatting', () => {
  it('should handle strikethrough and code in bold', () => {
    const input = '**bold with ~~strike~~ and `code`**';
    const expected = '<p class="my-2 leading-relaxed"><strong>bold with <del>strike</del> and <code class="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono break-all">code</code></strong></p>';
    expect(markdownToHtml(input)).toBe(expected);
  });

  it('should handle all formatters nested', () => {
    const input = '**bold *italic ~~strike~~***';
    const output = markdownToHtml(input);

    expect(output).toContain('<strong>');
    expect(output).toContain('<em>');
    expect(output).toContain('<del>');
  });
});
```

---

## Test Suite 6 : Edge Cases

### Test 6.1 : Délimiteurs Non Appariés

```typescript
describe('Unmatched Delimiters', () => {
  it('should treat unmatched bold as text', () => {
    const input = '**bold without closing';
    const output = markdownToHtml(input);
    expect(output).toContain('**bold without closing');
    expect(output).not.toContain('<strong>');
  });

  it('should treat closing without opening as text', () => {
    const input = 'text without opening**';
    const output = markdownToHtml(input);
    expect(output).toContain('text without opening**');
    expect(output).not.toContain('</strong>');
  });
});
```

### Test 6.2 : Délimiteurs Consécutifs

```typescript
describe('Consecutive Delimiters', () => {
  it('should handle multiple bold sections', () => {
    const input = '**bold1** and **bold2**';
    const output = markdownToHtml(input);

    const boldCount = (output.match(/<strong>/g) || []).length;
    expect(boldCount).toBe(2);
  });

  it('should handle bold followed by italic', () => {
    const input = '**bold** *italic*';
    const expected = '<p class="my-2 leading-relaxed"><strong>bold</strong> <em>italic</em></p>';
    expect(markdownToHtml(input)).toBe(expected);
  });
});
```

### Test 6.3 : Délimiteurs en Début/Fin de Ligne

```typescript
describe('Delimiters at Line Boundaries', () => {
  it('should format bold at start of line', () => {
    const input = '**bold** text';
    const expected = '<p class="my-2 leading-relaxed"><strong>bold</strong> text</p>';
    expect(markdownToHtml(input)).toBe(expected);
  });

  it('should format bold at end of line', () => {
    const input = 'text **bold**';
    const expected = '<p class="my-2 leading-relaxed">text <strong>bold</strong></p>';
    expect(markdownToHtml(input)).toBe(expected);
  });

  it('should format entire line as bold', () => {
    const input = '**entire line bold**';
    const expected = '<p class="my-2 leading-relaxed"><strong>entire line bold</strong></p>';
    expect(markdownToHtml(input)).toBe(expected);
  });
});
```

---

## Test Suite 7 : Liens et Images

### Test 7.1 : Liens Markdown

```typescript
describe('Markdown Links', () => {
  it('should parse simple links', () => {
    const input = '[Google](https://google.com)';
    const output = markdownToHtml(input);

    expect(output).toContain('<a href="https://google.com"');
    expect(output).toContain('Google</a>');
  });

  it('should parse links with special characters in text', () => {
    const input = '[Link with **bold**](https://example.com)';
    const output = markdownToHtml(input);

    expect(output).toContain('<a href="https://example.com"');
  });
});
```

### Test 7.2 : Auto-linkify

```typescript
describe('Auto-linkify URLs', () => {
  it('should auto-linkify https URLs', () => {
    const input = 'Visit https://example.com for more';
    const output = markdownToHtml(input);

    expect(output).toContain('<a href="https://example.com"');
    expect(output).toContain('target="_blank"');
    expect(output).toContain('rel="noopener noreferrer"');
  });

  it('should auto-linkify http URLs', () => {
    const input = 'Visit http://example.com for more';
    const output = markdownToHtml(input);

    expect(output).toContain('<a href="http://example.com"');
  });

  it('should NOT linkify invalid URLs', () => {
    const input = 'Visit example.com for more';
    const output = markdownToHtml(input);

    expect(output).not.toContain('<a href=');
  });
});
```

### Test 7.3 : URLs Meeshy

```typescript
describe('Meeshy URLs', () => {
  it('should convert m+TOKEN to link', () => {
    const input = 'Tracking: m+ABC123';
    const output = markdownToHtml(input);

    expect(output).toContain('<a href="m+ABC123"');
    expect(output).toContain('>m+ABC123</a>');
  });

  it('should handle multiple Meeshy URLs', () => {
    const input = 'm+TOKEN1 and m+TOKEN2';
    const output = markdownToHtml(input);

    const linkCount = (output.match(/<a href="m\+/g) || []).length;
    expect(linkCount).toBe(2);
  });
});
```

### Test 7.4 : Images

```typescript
describe('Images', () => {
  it('should parse images', () => {
    const input = '![Alt text](https://example.com/image.png)';
    const output = markdownToHtml(input);

    expect(output).toContain('<img src="https://example.com/image.png"');
    expect(output).toContain('alt="Alt text"');
  });

  it('should handle images without alt text', () => {
    const input = '![](https://example.com/image.png)';
    const output = markdownToHtml(input);

    expect(output).toContain('<img src="https://example.com/image.png"');
    expect(output).toContain('alt=""');
  });
});
```

---

## Test Suite 8 : Emojis

### Test 8.1 : Conversion Emojis

```typescript
describe('Emoji Conversion', () => {
  it('should convert :smile: to emoji', () => {
    const input = 'Hello :smile:';
    const output = markdownToHtml(input);
    expect(output).toContain('😊');
  });

  it('should convert multiple emojis', () => {
    const input = ':heart: :fire: :rocket:';
    const output = markdownToHtml(input);

    expect(output).toContain('❤️');
    expect(output).toContain('🔥');
    expect(output).toContain('🚀');
  });

  it('should NOT convert invalid emoji codes', () => {
    const input = ':invalid_emoji_code:';
    const output = markdownToHtml(input);
    expect(output).toContain(':invalid_emoji_code:');
  });
});
```

---

## Test Suite 9 : Listes

### Test 9.1 : Listes Non Ordonnées

```typescript
describe('Unordered Lists', () => {
  it('should parse simple unordered list', () => {
    const input = '- Item 1\n- Item 2\n- Item 3';
    const output = markdownToHtml(input);

    expect(output).toContain('<ul class="list-disc list-inside my-2 space-y-1">');
    expect(output).toContain('<li>Item 1</li>');
    expect(output).toContain('<li>Item 2</li>');
    expect(output).toContain('<li>Item 3</li>');
  });

  it('should parse nested lists', () => {
    const input = '- Item 1\n    - Subitem 1.1\n    - Subitem 1.2\n- Item 2';
    const output = markdownToHtml(input);

    const ulCount = (output.match(/<ul/g) || []).length;
    expect(ulCount).toBeGreaterThan(1); // Au moins 2 listes (principale + nested)
  });
});
```

### Test 9.2 : Task Lists

```typescript
describe('Task Lists', () => {
  it('should parse checked task', () => {
    const input = '- [x] Completed task';
    const output = markdownToHtml(input);

    expect(output).toContain('<input type="checkbox" checked disabled');
    expect(output).toContain('Completed task');
  });

  it('should parse unchecked task', () => {
    const input = '- [ ] Pending task';
    const output = markdownToHtml(input);

    expect(output).toContain('<input type="checkbox"');
    expect(output).not.toContain('checked');
    expect(output).toContain('Pending task');
  });

  it('should handle uppercase X', () => {
    const input = '- [X] Completed task';
    const output = markdownToHtml(input);

    expect(output).toContain('checked');
  });
});
```

---

## Test Suite 10 : Performance

### Test 10.1 : Benchmarks

```typescript
describe('Performance Benchmarks', () => {
  it('should parse 1000 lines in < 10ms', () => {
    const lines = Array(1000).fill('Line of text').join('\n');

    const start = performance.now();
    markdownToHtml(lines);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(10);
  });

  it('should parse complex document in < 50ms', () => {
    const complex = `
# Heading

Paragraph with **bold** and *italic*.

- List item 1
- List item 2

\`\`\`javascript
const code = 'block';
\`\`\`

[Link](https://example.com)
    `.repeat(100);

    const start = performance.now();
    markdownToHtml(complex);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(50);
  });
});
```

---

## Utilisation des Tests

### Run All Tests

```bash
npm test markdown-parser-v2.test.ts
```

### Run Specific Suite

```bash
npm test -- --testNamePattern="Horizontal Whitespace"
```

### Coverage Report

```bash
npm test -- --coverage markdown-parser-v2.test.ts
```

**Target Coverage** :
- Statements : > 95%
- Branches : > 90%
- Functions : > 95%
- Lines : > 95%

---

## Validation Manuelle

### Checklist Visuelle

1. [ ] Espaces multiples normalisés
2. [ ] Délimiteurs avec espaces rejetés
3. [ ] Paragraphes fusionnés avec espaces
4. [ ] Tabs convertis en espaces
5. [ ] Formatage imbriqué fonctionne
6. [ ] Code blocks préservent espaces
7. [ ] Liens auto-linkifiés
8. [ ] Emojis convertis
9. [ ] Listes imbriquées correctes
10. [ ] Tables affichées correctement

### Test Manuel Interactif

Créer un composant de test :

```typescript
// frontend/components/test/MarkdownParserTester.tsx
import { useState } from 'react';
import { markdownToHtml as v1 } from '../../services/markdown-parser';
import { markdownToHtml as v2 } from '../../services/markdown-parser-v2';

export const MarkdownParserTester = () => {
  const [input, setInput] = useState('');

  return (
    <div className="grid grid-cols-2 gap-4 p-4">
      <div>
        <h3>Input</h3>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="w-full h-64 p-2 border"
          placeholder="Enter markdown..."
        />
      </div>

      <div>
        <h3>V1 Output</h3>
        <div
          className="border p-2 h-64 overflow-auto"
          dangerouslySetInnerHTML={{ __html: v1(input) }}
        />
      </div>

      <div>
        <h3>V2 Output</h3>
        <div
          className="border p-2 h-64 overflow-auto"
          dangerouslySetInnerHTML={{ __html: v2(input) }}
        />
      </div>
    </div>
  );
};
```

---

## Résultat Attendu

Tous les tests devraient passer avec **100% de succès** avant d'approuver la migration en production.

**Next Steps** :
1. Implémenter suite de tests complète
2. Exécuter sur CI/CD
3. Valider coverage > 95%
4. Tester manuellement edge cases
5. Approuver migration Phase 1
