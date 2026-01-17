# Markdown Parser - Architecture Modulaire

Parser Markdown haute performance avec sécurité renforcée et architecture modulaire.

## Installation

```typescript
import { markdownToHtml } from '@/services/markdown';
```

## Usage

### Conversion Simple

```typescript
import { markdownToHtml } from '@/services/markdown';

const html = markdownToHtml('**Hello** _World_!');
// Output: <p class="my-2 leading-relaxed whitespace-pre-wrap">
//   <strong class="whitespace-pre-wrap">Hello</strong>
//   <em class="whitespace-pre-wrap">World</em>!
// </p>
```

### Avec Options

```typescript
const html = markdownToHtml('**Hello**', {
  isDark: true,
  onLinkClick: (url) => console.log('Clicked:', url)
});
```

### API Bas Niveau

```typescript
import { parseMarkdown, renderMarkdownNode } from '@/services/markdown';

// Parser vers AST
const nodes = parseMarkdown('**Hello** World!');

// Rendu manuel
const html = nodes
  .map((node, i) => renderMarkdownNode(node, i))
  .join('');
```

## Fonctionnalités

### Inline Elements

- **Bold**: `**text**` ou `__text__`
- **Italic**: `*text*` ou `_text_`
- **Strikethrough**: `~~text~~`
- **Inline code**: `` `code` ``
- **Links**: `[text](url)`
- **Images**: `![alt](url)`
- **Emojis**: `:smile:` → 😊
- **Auto-linking**: URLs détectées automatiquement

### Block Elements

- **Headings**: `# H1` à `###### H6`
- **Blockquotes**: `> quote text`
- **Horizontal rules**: `---`, `***`, `___`
- **Code blocks**: ` ```lang\ncode\n``` `
- **Paragraphs**: Texte normal

### Lists

- **Unordered**: `- item` ou `* item`
- **Ordered**: `1. item`
- **Nested**: Indentation (2 espaces)
- **Task lists**: `- [ ] todo` ou `- [x] done`

### Tables

```markdown
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
```

Alignement supporté:
- Left: `|:---|`
- Center: `|:---:|`
- Right: `|---:|`

### Meeshy URLs

Les URLs de tracking Meeshy (`m+TOKEN`) sont automatiquement converties en liens:

```typescript
markdownToHtml('Track: m+ABC123');
// → <a href="m+ABC123">m+ABC123</a>
```

## Sécurité

### XSS Prevention

Tout le contenu utilisateur est échappé:

```typescript
markdownToHtml('<script>alert("XSS")</script>');
// → &lt;script&gt;alert("XSS")&lt;/script&gt;
```

### URL Sanitization

Seuls les protocoles sûrs sont autorisés:

- ✅ `https://`, `http://`
- ✅ `mailto:`, `tel:`
- ✅ URLs relatives: `/path`, `./file`
- ✅ Meeshy URLs: `m+TOKEN`
- ❌ `javascript:`, `data:`, `vbscript:`, `file:`

```typescript
markdownToHtml('[Click](javascript:alert("XSS"))');
// → Lien bloqué, texte affiché seulement
```

### ReDoS Prevention

Limites strictes sur les regex:

- Emoji codes: max 50 caractères
- Link text: max 500 caractères
- URLs: max 2048 caractères
- Bold/italic: max 500 caractères
- Task list text: max 1000 caractères

### DoS Prevention

- **Input limit**: 1 MB maximum
- **Table cells**: 100 maximum par table
- **Nested lists**: 10 niveaux max
- **Heading level**: H1-H6 seulement

## Performance

### Cache LRU

Cache automatique avec:
- **Capacité**: 100 entrées
- **TTL**: 5 minutes
- **Éviction**: LRU (Least Recently Used)

```typescript
// Premier appel: parse + cache
markdownToHtml('**Hello**'); // ~3ms

// Second appel: cache hit
markdownToHtml('**Hello**'); // ~0.1ms
```

### Benchmarks

| Opération | Temps Cible |
|-----------|-------------|
| Message simple | <5ms |
| Message complexe | <15ms |
| 50 messages | <200ms |
| Import module | <20ms |

### Optimisations

- Single-pass parsing
- Regex pré-compilés
- Pas de highlight.js (code blocks en texte brut)
- Cache intelligent

## Architecture

### Modules

```
markdown/
├── index.ts           - API publique (facade)
├── types.ts           - TypeScript types
├── constants.ts       - Constantes, regex, emojis
├── sanitizer.ts       - Sécurité HTML/URL
├── cache-service.ts   - Cache LRU
├── inline-parser.ts   - Parsing inline elements
├── block-parser.ts    - Parsing block elements
├── list-parser.ts     - Parsing listes
├── table-parser.ts    - Parsing tables
├── parser.ts          - Orchestrateur
└── renderer.ts        - Rendu HTML
```

### Flux de Données

```
Input (markdown string)
    ↓
Validation (longueur, contenu)
    ↓
Preprocessing (Meeshy URLs)
    ↓
Parsing (AST generation)
    ├── Block elements (headings, code, quotes)
    ├── Inline elements (bold, links, emojis)
    ├── Lists (ordered, unordered, tasks)
    └── Tables (GFM format)
    ↓
Rendering (HTML generation)
    ├── Security (escaping, sanitization)
    ├── Styling (Tailwind classes)
    └── Dark mode support
    ↓
Cache (LRU storage)
    ↓
Output (HTML string)
```

## Types

### MarkdownNode

```typescript
interface MarkdownNode {
  type: 'paragraph' | 'heading' | 'code-block' | 'blockquote'
      | 'list' | 'list-item' | 'horizontal-rule' | 'line-break'
      | 'text' | 'bold' | 'italic' | 'strikethrough'
      | 'code-inline' | 'link' | 'image' | 'table'
      | 'table-row' | 'table-cell' | 'task-list-item' | 'emoji';
  content?: string;
  children?: MarkdownNode[];
  level?: number;        // Headings
  language?: string;     // Code blocks
  url?: string;          // Links, images
  alt?: string;          // Images
  ordered?: boolean;     // Lists
  checked?: boolean;     // Task lists
  isHeader?: boolean;    // Table cells
  align?: 'left' | 'center' | 'right'; // Tables
  emojiCode?: string;    // Emojis
  indent?: number;       // Lists (nested)
}
```

### RenderOptions

```typescript
interface RenderOptions {
  onLinkClick?: (url: string) => void;
  isDark?: boolean;
}
```

## Exemples

### Rich Formatting

```typescript
const markdown = `
# Welcome to Meeshy

This is a **bold** statement with *italic* emphasis.

## Features

- Multi-language support :earth_africa:
- Real-time translation :zap:
- End-to-end encryption :lock:

Check out our website: https://meeshy.com

\`\`\`typescript
const greeting = "Hello World!";
console.log(greeting);
\`\`\`
`;

const html = markdownToHtml(markdown);
```

### Task Lists

```typescript
const tasks = `
## Todo List

- [x] Implement markdown parser
- [x] Add security features
- [ ] Write documentation
- [ ] Deploy to production
`;

const html = markdownToHtml(tasks);
```

### Tables

```typescript
const table = `
| Feature | Status | Priority |
|:--------|:------:|---------:|
| Parser  | ✅ Done | High |
| Cache   | ✅ Done | Medium |
| Tests   | 🚧 WIP  | High |
`;

const html = markdownToHtml(table);
```

## Testing

```typescript
import { parseMarkdown, markdownToHtml } from '@/services/markdown';

describe('Markdown Parser', () => {
  it('should parse bold text', () => {
    const html = markdownToHtml('**bold**');
    expect(html).toContain('<strong');
    expect(html).toContain('bold</strong>');
  });

  it('should sanitize URLs', () => {
    const html = markdownToHtml('[XSS](javascript:alert("XSS"))');
    expect(html).not.toContain('javascript:');
  });

  it('should use cache', () => {
    const html1 = markdownToHtml('test');
    const html2 = markdownToHtml('test');
    expect(html1).toBe(html2);
  });
});
```

## Cache Management

```typescript
import { getCacheStats, clearCache } from '@/services/markdown/cache-service';

// Get cache statistics
const stats = getCacheStats();
console.log(stats);
// { size: 42, maxSize: 100, ttl: 300000 }

// Clear cache manually
clearCache();
```

## Migration Guide

### From V2 to V2.2 (Modular)

```typescript
// Before
import { markdownToHtml } from '@/services/markdown-parser-v2.2-optimized';

// After
import { markdownToHtml } from '@/services/markdown';

// API identique, aucun changement de code nécessaire
```

## Support

### Emojis

200+ emojis supportés. Voir `constants.ts` pour la liste complète.

Exemples:
- `:smile:` → 😊
- `:heart:` → ❤️
- `:+1:` → 👍
- `:rocket:` → 🚀

### Markdown Syntax

Suit la spécification CommonMark avec extensions GFM (GitHub-Flavored Markdown):
- Tables
- Task lists
- Strikethrough
- Auto-linking URLs

## License

Internal use only - Meeshy Platform
