# Markdown Parser - Guide Rapide

## Installation

```typescript
import { markdownToHtml } from '@/services/markdown';
```

## Usage de Base

```typescript
// Conversion simple
const html = markdownToHtml('**Hello** _World_!');
console.log(html);
// Output: <p class="..."><strong>Hello</strong> <em>World</em>!</p>
```

## Exemples Complets

### 1. Message Simple
```typescript
import { markdownToHtml } from '@/services/markdown';

const message = "Hey! Check out this **cool feature** 🚀";
const html = markdownToHtml(message);
```

### 2. Message avec Liens
```typescript
const message = "Visit [Meeshy](https://meeshy.com) or track m+ABC123";
const html = markdownToHtml(message);
```

### 3. Liste de Tâches
```typescript
const tasks = `
## Todo
- [x] Parser markdown
- [x] Add security
- [ ] Write tests
`;
const html = markdownToHtml(tasks);
```

### 4. Code Block
```typescript
const code = `
Here's how to use it:

\`\`\`typescript
const result = markdownToHtml('**bold**');
\`\`\`
`;
const html = markdownToHtml(code);
```

### 5. Table
```typescript
const table = `
| Feature | Status |
|---------|--------|
| Parser  | ✅     |
| Cache   | ✅     |
| Tests   | 🚧     |
`;
const html = markdownToHtml(table);
```

### 6. Avec Options
```typescript
import type { RenderOptions } from '@/services/markdown';

const options: RenderOptions = {
  isDark: true,
  onLinkClick: (url) => {
    console.log('User clicked:', url);
  }
};

const html = markdownToHtml('[Click me](https://example.com)', options);
```

## API Bas Niveau

### Parsing vers AST
```typescript
import { parseMarkdown } from '@/services/markdown';
import type { MarkdownNode } from '@/services/markdown';

const nodes: MarkdownNode[] = parseMarkdown('**bold** text');
console.log(nodes);
// [
//   {
//     type: 'paragraph',
//     children: [
//       { type: 'bold', children: [{ type: 'text', content: 'bold' }] },
//       { type: 'text', content: ' text' }
//     ]
//   }
// ]
```

### Rendu Manuel
```typescript
import { renderMarkdownNode } from '@/services/markdown';

const html = nodes.map((node, i) => 
  renderMarkdownNode(node, i, { isDark: true })
).join('');
```

## Markdown Supporté

### Inline
```markdown
**bold** or __bold__
*italic* or _italic_
~~strikethrough~~
`inline code`
[link](url)
![image](url)
:emoji:
https://auto-link.com
```

### Block
```markdown
# Heading 1
## Heading 2
### Heading 3

> Blockquote

---

- Unordered list
* Also unordered

1. Ordered list
2. Second item

- [ ] Task unchecked
- [x] Task checked

\`\`\`language
code block
\`\`\`

| Table | Header |
|-------|--------|
| Cell  | Data   |
```

## Sécurité

### XSS Prevention
```typescript
// ✅ Safe - HTML escaped
markdownToHtml('<script>alert("XSS")</script>');
// → &lt;script&gt;...

// ✅ Safe - Dangerous protocols blocked
markdownToHtml('[Click](javascript:alert("XSS"))');
// → Texte seulement, pas de lien
```

### URL Whitelist
```typescript
// ✅ Allowed protocols
markdownToHtml('[Link](https://example.com)');   // ✅
markdownToHtml('[Link](http://example.com)');    // ✅
markdownToHtml('[Link](mailto:hi@example.com)'); // ✅
markdownToHtml('[Link](tel:+1234567890)');       // ✅
markdownToHtml('[Link](/relative/path)');        // ✅
markdownToHtml('[Link](m+ABC123)');              // ✅

// ❌ Blocked protocols
markdownToHtml('[Link](javascript:alert(1))');   // ❌
markdownToHtml('[Link](data:text/html,...)');    // ❌
markdownToHtml('[Link](vbscript:...)');          // ❌
```

## Performance

### Cache Automatique
```typescript
// Premier appel: parsing + cache
const start1 = performance.now();
markdownToHtml('**Hello**');
console.log(`First: ${performance.now() - start1}ms`); // ~3ms

// Deuxième appel: cache hit
const start2 = performance.now();
markdownToHtml('**Hello**');
console.log(`Second: ${performance.now() - start2}ms`); // ~0.1ms
```

### Benchmarks
| Opération | Temps Typique |
|-----------|---------------|
| Message simple (20 mots) | ~3ms |
| Message complexe (100 mots + formatting) | ~12ms |
| Conversation (50 messages) | ~150ms |

## Emojis

200+ emojis supportés via `:code:`:

```typescript
markdownToHtml(':smile: :heart: :rocket: :+1:');
// → 😊 ❤️ 🚀 👍
```

Voir `rules/emoji-map.ts` pour la liste complète.

## TypeScript

### Types Disponibles
```typescript
import type {
  MarkdownNode,
  RenderOptions,
  CacheEntry,
  ParseResult
} from '@/services/markdown';
```

### Type MarkdownNode
```typescript
interface MarkdownNode {
  type: 'paragraph' | 'heading' | 'bold' | 'italic' | /* ... */;
  content?: string;
  children?: MarkdownNode[];
  level?: number;        // Pour headings
  language?: string;     // Pour code blocks
  url?: string;          // Pour links/images
  // ...
}
```

## Migration

Si vous utilisez l'ancien parser:

```typescript
// ❌ Ancien
import { markdownToHtml } from '@/services/markdown-parser-v2.2-optimized';

// ✅ Nouveau (même API!)
import { markdownToHtml } from '@/services/markdown';
```

Aucun autre changement nécessaire. L'API est 100% compatible.

## Debugging

```typescript
import { parseMarkdown } from '@/services/markdown';

// Voir l'AST généré
const nodes = parseMarkdown('**bold** _italic_');
console.log(JSON.stringify(nodes, null, 2));
```

## Limites de Sécurité

| Limite | Valeur |
|--------|--------|
| Contenu total | 1 MB |
| URL | 2048 chars |
| Cellules table | 100 |
| Listes imbriquées | 10 niveaux |
| Headings | H1-H6 |

## Support

Voir documentation complète:
- `README.md` - Guide complet
- `ARCHITECTURE.md` - Architecture détaillée
- `REFACTORING_SUMMARY.md` - Résumé refactoring

## License

Internal use only - Meeshy Platform
