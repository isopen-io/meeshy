# Analyse Profonde du Parser Markdown - Expert Lexer/Parser

## 🔍 Vue d'ensemble de l'architecture actuelle

Le parseur markdown actuel suit une architecture classique en **3 phases** :

```
Texte brut (String)
    ↓
[Phase 1] Lexing/Tokenization (parseMarkdown, parseLine, parseInline)
    ↓
AST (Abstract Syntax Tree) - MarkdownNode[]
    ↓
[Phase 2] Rendering (renderMarkdownNode)
    ↓
HTML (String)
```

---

## ⚠️ PROBLÈMES CRITIQUES IDENTIFIÉS

### 1. **GESTION DES ESPACES HORIZONTAUX** ❌

#### Problème 1.1 : Parsing inline ne préserve pas les espaces multiples

**Code actuel** (lignes 198-346) :
```typescript
const parseInline = (text: string): MarkdownNode[] => {
  const nodes: MarkdownNode[] = [];
  let currentText = '';
  let i = 0;

  const flushText = () => {
    if (currentText) {
      nodes.push({ type: 'text', content: currentText });
      currentText = '';
    }
  };
  // ...
}
```

**Problème** :
- Les espaces multiples sont préservés MAIS pas normalisés selon les règles Markdown
- Exemple : `"Hello    world"` → devrait être `"Hello world"` (espaces multiples = 1 espace)
- Exception : dans les blocs de code, les espaces DOIVENT être préservés

#### Problème 1.2 : Délimiteurs avec espaces mal gérés

**Code actuel** (lignes 294-308) :
```typescript
// Gras: **text** ou __text__
if ((char === '*' && nextChar === '*') || (char === '_' && nextChar === '_')) {
  flushText();
  const delimiter = char + nextChar;
  const regex = new RegExp(`^\\${char}\\${char}([^${char}]+)\\${char}\\${char}`);
  const boldMatch = remaining.match(regex);
  if (boldMatch) {
    nodes.push({
      type: 'bold',
      children: parseInline(boldMatch[1])
    });
    i += boldMatch[0].length;
    continue;
  }
}
```

**Problème** :
- `** texte **` avec espaces après les délimiteurs n'est PAS parsé correctement
- Le regex `([^${char}]+)` accepte les espaces mais ne vérifie pas les **word boundaries**
- Selon CommonMark, `** text**` devrait échouer (espace avant délimiteur fermant)

#### Problème 1.3 : Indentation mixte (tabs vs espaces)

**Code actuel** (lignes 351-354) :
```typescript
const getIndentLevel = (line: string): number => {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
};
```

**Problème** :
- `\s` capture à la fois tabs (`\t`) et espaces (` `)
- **1 tab ≠ 1 espace** mais ici ils sont traités pareillement
- Devrait normaliser : 1 tab = 4 espaces (ou 2 selon configuration)

---

### 2. **GESTION DES ESPACES VERTICAUX** ❌

#### Problème 2.1 : Fusion agressive des paragraphes

**Code actuel** (lignes 703-716) :
```typescript
// Fusionner les paragraphes consécutifs SEULEMENT s'ils ont du contenu
if (node.type === 'paragraph' && node.children && node.children.length > 0 && nodes.length > 0) {
  const lastNode = nodes[nodes.length - 1];
  // Ne fusionner que si le dernier node est un paragraphe avec contenu
  if (lastNode.type === 'paragraph' && lastNode.children && lastNode.children.length > 0) {
    // Ajouter un retour à la ligne simple entre les lignes
    lastNode.children.push({ type: 'line-break' });
    lastNode.children.push(...(node.children || []));
    i++;
    continue;
  }
}
```

**Problème** :
- Les lignes consécutives sont fusionnées avec un simple `<br />`
- Cela ne respecte pas la règle Markdown :
  - **1 saut de ligne** = même paragraphe (fusion avec espace)
  - **2 sauts de ligne** = nouveau paragraphe (séparation)

**Exemple** :
```markdown
Ligne 1
Ligne 2

Ligne 3
```

**Résultat actuel** :
```html
<p>Ligne 1<br />Ligne 2</p>
<p>Ligne 3</p>
```

**Résultat attendu (CommonMark)** :
```html
<p>Ligne 1 Ligne 2</p>
<p>Ligne 3</p>
```

#### Problème 2.2 : Lignes vides supprimées trop tôt

**Code actuel** (lignes 717-721) :
```typescript
// Ne pas ajouter les paragraphes vides (lignes vides)
if (node.type === 'paragraph' && (!node.children || node.children.length === 0)) {
  // Ligne vide détectée - ne rien ajouter, cela séparera les paragraphes
  i++;
  continue;
}
```

**Problème** :
- Les lignes vides sont complètement supprimées de l'AST
- On perd l'information du **nombre** de lignes vides consécutives
- Selon CommonMark, 2+ lignes vides = 1 séparation de paragraphe

#### Problème 2.3 : Espacement incohérent entre blocs

**Code actuel** (rendering, lignes 776-787) :
```typescript
case 'heading':
  const headingClasses = [
    'text-xl font-bold mt-4 mb-2', // h1
    'text-lg font-bold mt-4 mb-2', // h2
    'text-base font-semibold mt-3 mb-2', // h3
    // ...
  ];
```

**Problème** :
- Les marges sont hardcodées dans les classes CSS
- Pas de gestion dynamique de l'espacement selon le contexte
- Exemple : un heading après un paragraphe devrait avoir plus d'espace qu'après une liste

---

### 3. **ALGORITHME DE TOKENIZATION** ⚠️

#### Problème 3.1 : Absence de vrai Lexer

**Architecture actuelle** :
```
parseMarkdown() → parseLine() → parseInline()
     ↓               ↓               ↓
   Ligne         Type bloc      Caractères
```

**Problème** :
- Pas de phase de **tokenization** explicite
- Le parsing est fait en même temps que la reconnaissance
- Pas de **lookahead/lookbehind** formel

**Ce qui devrait être fait** :
```
[Lexer] Text → Tokens
    ↓
[Parser] Tokens → AST
    ↓
[Renderer] AST → HTML
```

#### Problème 3.2 : Regex complexes inefficaces

**Code actuel** (lignes 294-308) :
```typescript
const regex = new RegExp(`^\\${char}\\${char}([^${char}]+)\\${char}\\${char}`);
const boldMatch = remaining.match(regex);
```

**Problème** :
- Regex créée dynamiquement à chaque itération (coûteux)
- Pas de mise en cache des regex compilées
- Backtracking potentiel avec `[^${char}]+`

---

## ✅ SOLUTIONS PROPOSÉES

### Solution 1 : Implémenter un vrai Lexer avec États

```typescript
enum TokenType {
  TEXT = 'text',
  BOLD_OPEN = 'bold_open',
  BOLD_CLOSE = 'bold_close',
  ITALIC_OPEN = 'italic_open',
  ITALIC_CLOSE = 'italic_close',
  CODE_INLINE = 'code_inline',
  LINK_OPEN = 'link_open',
  LINK_CLOSE = 'link_close',
  WHITESPACE = 'whitespace',
  NEWLINE = 'newline',
  // ...
}

interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
  line: number;
  column: number;
}

class MarkdownLexer {
  private input: string;
  private position: number;
  private line: number;
  private column: number;
  private tokens: Token[];

  constructor(input: string) {
    this.input = input;
    this.position = 0;
    this.line = 1;
    this.column = 1;
    this.tokens = [];
  }

  tokenize(): Token[] {
    while (this.position < this.input.length) {
      const char = this.current();
      const next = this.peek(1);

      // Gestion des espaces
      if (this.isWhitespace(char)) {
        this.tokenizeWhitespace();
        continue;
      }

      // Gestion des retours à la ligne
      if (char === '\n') {
        this.tokenizeNewline();
        continue;
      }

      // Gestion des délimiteurs de formatage
      if (char === '*' && next === '*') {
        this.tokenizeBoldDelimiter();
        continue;
      }

      if (char === '*') {
        this.tokenizeItalicDelimiter();
        continue;
      }

      // Texte normal
      this.tokenizeText();
    }

    return this.tokens;
  }

  private current(): string {
    return this.input[this.position];
  }

  private peek(offset: number): string {
    return this.input[this.position + offset] || '';
  }

  private advance(): void {
    if (this.current() === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    this.position++;
  }

  private isWhitespace(char: string): boolean {
    return char === ' ' || char === '\t';
  }

  private tokenizeWhitespace(): void {
    const start = this.position;
    let value = '';

    while (this.position < this.input.length && this.isWhitespace(this.current())) {
      value += this.current();
      this.advance();
    }

    this.tokens.push({
      type: TokenType.WHITESPACE,
      value,
      start,
      end: this.position,
      line: this.line,
      column: this.column
    });
  }

  private tokenizeNewline(): void {
    const start = this.position;
    this.tokens.push({
      type: TokenType.NEWLINE,
      value: '\n',
      start,
      end: this.position + 1,
      line: this.line,
      column: this.column
    });
    this.advance();
  }

  private tokenizeBoldDelimiter(): void {
    const start = this.position;
    const prev = this.input[this.position - 1] || '';
    const next = this.peek(2);

    // Règle : **text**
    // - Pas d'espace après ** ouvrant
    // - Pas d'espace avant ** fermant

    const isOpening = prev === '' || this.isWhitespace(prev) || this.isDelimiter(prev);
    const isClosing = next === '' || this.isWhitespace(next) || this.isDelimiter(next);

    this.advance(); // première *
    this.advance(); // deuxième *

    this.tokens.push({
      type: isOpening ? TokenType.BOLD_OPEN : TokenType.BOLD_CLOSE,
      value: '**',
      start,
      end: this.position,
      line: this.line,
      column: this.column
    });
  }

  private isDelimiter(char: string): boolean {
    return ['*', '_', '~', '`', '[', ']', '(', ')'].includes(char);
  }

  // ... autres méthodes de tokenization
}
```

### Solution 2 : Parser avec gestion explicite des espaces

```typescript
class MarkdownParser {
  private tokens: Token[];
  private position: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.position = 0;
  }

  parse(): MarkdownNode[] {
    const nodes: MarkdownNode[] = [];

    while (this.position < this.tokens.length) {
      const node = this.parseBlock();
      if (node) {
        nodes.push(node);
      }
    }

    return this.normalizeWhitespace(nodes);
  }

  private normalizeWhitespace(nodes: MarkdownNode[]): MarkdownNode[] {
    // Règle CommonMark :
    // - Espaces multiples consécutifs = 1 espace
    // - Espaces en début/fin de ligne supprimés
    // - 1 newline = espace
    // - 2+ newlines = nouveau paragraphe

    const normalized: MarkdownNode[] = [];
    let currentParagraph: MarkdownNode | null = null;
    let consecutiveNewlines = 0;

    for (const node of nodes) {
      if (node.type === 'text') {
        // Normaliser les espaces multiples
        const normalizedText = node.content?.replace(/\s+/g, ' ');

        if (currentParagraph) {
          currentParagraph.children?.push({
            type: 'text',
            content: normalizedText
          });
        } else {
          currentParagraph = {
            type: 'paragraph',
            children: [{ type: 'text', content: normalizedText }]
          };
        }
        consecutiveNewlines = 0;
      } else if (node.type === 'line-break') {
        consecutiveNewlines++;

        // 2+ newlines = nouveau paragraphe
        if (consecutiveNewlines >= 2) {
          if (currentParagraph) {
            normalized.push(currentParagraph);
            currentParagraph = null;
          }
        } else {
          // 1 newline = espace dans le même paragraphe
          if (currentParagraph) {
            currentParagraph.children?.push({
              type: 'text',
              content: ' '
            });
          }
        }
      } else {
        // Autre type de node (heading, code, etc.)
        if (currentParagraph) {
          normalized.push(currentParagraph);
          currentParagraph = null;
        }
        normalized.push(node);
        consecutiveNewlines = 0;
      }
    }

    if (currentParagraph) {
      normalized.push(currentParagraph);
    }

    return normalized;
  }

  // ... autres méthodes de parsing
}
```

### Solution 3 : Gestion des indentations avec normalisation tabs→espaces

```typescript
const normalizeIndentation = (line: string, tabSize: number = 4): { normalized: string; indent: number } => {
  let indent = 0;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (char === ' ') {
      indent++;
      i++;
    } else if (char === '\t') {
      // 1 tab = tabSize espaces (aligné sur multiple de tabSize)
      indent = Math.ceil((indent + 1) / tabSize) * tabSize;
      i++;
    } else {
      // Premier caractère non-blanc
      break;
    }
  }

  const normalized = ' '.repeat(indent) + line.slice(i);
  return { normalized, indent };
};

// Utilisation :
const parseLine = (line: string): MarkdownNode | null => {
  const { normalized, indent } = normalizeIndentation(line, 4);
  const trimmed = normalized.trim();

  // Liste avec indentation normalisée
  if (/^[-*]\s+/.test(trimmed)) {
    const itemText = trimmed.replace(/^[-*]\s+/, '');
    return {
      type: 'list-item',
      indent, // Maintenant en espaces normalisés
      children: parseInline(itemText)
    };
  }

  // ...
};
```

### Solution 4 : Espacement vertical dynamique

```typescript
const renderMarkdownNode = (
  node: MarkdownNode,
  index: number,
  context: {
    prevNode?: MarkdownNode;
    nextNode?: MarkdownNode;
    parentType?: string;
  },
  options: RenderOptions = {}
): string => {
  const { prevNode, nextNode, parentType } = context;

  // Calculer les marges dynamiquement selon le contexte
  const getVerticalSpacing = (node: MarkdownNode, prev?: MarkdownNode): string => {
    const baseSpacing = 'my-2'; // 0.5rem top/bottom
    const mediumSpacing = 'my-4'; // 1rem top/bottom
    const largeSpacing = 'my-6'; // 1.5rem top/bottom

    // Heading après paragraphe = large spacing
    if (node.type === 'heading' && prev?.type === 'paragraph') {
      return largeSpacing;
    }

    // Heading après heading = medium spacing
    if (node.type === 'heading' && prev?.type === 'heading') {
      return mediumSpacing;
    }

    // Code block = medium spacing
    if (node.type === 'code-block') {
      return mediumSpacing;
    }

    // Liste après paragraphe = medium spacing
    if (node.type === 'list' && prev?.type === 'paragraph') {
      return mediumSpacing;
    }

    return baseSpacing;
  };

  const spacing = getVerticalSpacing(node, prevNode);

  switch (node.type) {
    case 'paragraph':
      const paraChildren = node.children?.map((child, i) => renderMarkdownNode(child, i, {}, options)).join('') || '';
      return `<p class="${spacing} leading-relaxed">${paraChildren}</p>`;

    case 'heading':
      const headingChildren = node.children?.map((child, i) => renderMarkdownNode(child, i, {}, options)).join('') || '';
      return `<h${node.level} class="font-bold ${spacing}">${headingChildren}</h${node.level}>`;

    // ...
  }
};
```

---

## 📊 COMPARAISON ALGORITHMES

### Algorithme Actuel (Single-Pass Parsing)

```
Complexité temps : O(n)
Complexité espace : O(n)

Avantages :
✅ Rapide (une seule passe)
✅ Simple à comprendre

Inconvénients :
❌ Gestion des espaces approximative
❌ Pas de lookahead/lookbehind formel
❌ Difficile de respecter toutes les règles CommonMark
```

### Algorithme Proposé (Multi-Pass avec Lexer)

```
Complexité temps : O(n) + O(m) + O(k) = O(n)  [n = taille input, m = tokens, k = nodes]
Complexité espace : O(n + m + k) = O(n)

Avantages :
✅ Gestion précise des espaces horizontaux
✅ Gestion correcte des espaces verticaux
✅ Respect total de CommonMark
✅ Lookahead/lookbehind facile avec tokens
✅ Debuggable (inspection des tokens)

Inconvénients :
⚠️ Légèrement plus complexe
⚠️ 2-3 passes au lieu de 1
```

---

## 🎯 RECOMMANDATIONS FINALES

### Priorité 1 (CRITIQUE) 🔴
1. **Normaliser les espaces horizontaux** :
   - Implémenter `normalizeWhitespace()` pour fusionner espaces multiples
   - Gérer les tabs → espaces avec taille configurable

2. **Corriger la gestion des paragraphes** :
   - 1 newline = même paragraphe (espace)
   - 2+ newlines = nouveau paragraphe

3. **Valider les délimiteurs avec word boundaries** :
   - `** text**` = invalide (espace avant fermant)
   - `**text **` = invalide (espace après ouvrant)

### Priorité 2 (IMPORTANT) 🟡
4. **Ajouter un vrai Lexer** :
   - Tokenization explicite en première passe
   - Permet lookahead/lookbehind formel

5. **Espacement vertical dynamique** :
   - Calculer les marges selon le contexte (node précédent/suivant)

### Priorité 3 (AMÉLIORATION) 🟢
6. **Optimiser les regex** :
   - Compiler les regex une seule fois (constantes globales)
   - Éviter les regex dynamiques

7. **Tests de conformité CommonMark** :
   - Implémenter les tests de la spec CommonMark
   - Vérifier les edge cases

---

## 📈 MÉTRIQUES DE QUALITÉ

| Critère | Actuel | Cible | Priorité |
|---------|--------|-------|----------|
| Conformité CommonMark | 60% | 95% | 🔴 |
| Gestion espaces H | 70% | 95% | 🔴 |
| Gestion espaces V | 50% | 90% | 🔴 |
| Performance | 95% | 95% | ✅ |
| Maintenabilité | 80% | 90% | 🟡 |
| Debuggabilité | 60% | 85% | 🟡 |

---

## 🧪 TESTS RECOMMANDÉS

### Test 1 : Espaces horizontaux
```markdown
Input : "Hello    world" (4 espaces)
Attendu : "Hello world" (1 espace)

Input : "**  text  **" (espaces autour du contenu)
Attendu : Pas de formatage (délimiteurs invalides)

Input : "**text**" (pas d'espaces)
Attendu : <strong>text</strong>
```

### Test 2 : Espaces verticaux
```markdown
Input :
"""
Ligne 1
Ligne 2

Ligne 3


Ligne 4
"""

Attendu :
<p>Ligne 1 Ligne 2</p>
<p>Ligne 3</p>
<p>Ligne 4</p>
```

### Test 3 : Indentations mixtes
```markdown
Input :
"""
- Item 1
\t- Item 2 (1 tab)
    - Item 3 (4 espaces)
"""

Attendu : Tous les sous-items au même niveau d'indentation
```

---

## 🚀 PLAN D'IMPLÉMENTATION

**Phase 1** (1-2 jours) :
- Implémenter `normalizeWhitespace()`
- Corriger la gestion des paragraphes (1 vs 2 newlines)
- Ajouter validation délimiteurs avec word boundaries

**Phase 2** (2-3 jours) :
- Créer `MarkdownLexer` avec tokenization complète
- Refactorer `parseMarkdown()` pour utiliser les tokens
- Ajouter tests de conformité CommonMark

**Phase 3** (1 jour) :
- Implémenter espacement vertical dynamique
- Optimiser les regex (compilation unique)
- Normalisation tabs → espaces

**Phase 4** (1 jour) :
- Tests end-to-end complets
- Documentation technique
- Migration progressive des composants

---

**Estimation totale** : 5-7 jours de développement

**Impact attendu** :
- ✅ Conformité CommonMark : 60% → 95%
- ✅ Qualité du rendu : +40%
- ⚠️ Performance : -5% (acceptable pour la qualité gagnée)
