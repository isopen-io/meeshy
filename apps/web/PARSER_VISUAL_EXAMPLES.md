# Exemples Visuels - Problèmes et Solutions du Parser Markdown

## 🔴 Problème 1 : Espaces Horizontaux Multiples

### Input Markdown
```markdown
Hello    world    with    multiple    spaces
```

### ❌ Rendu Actuel (INCORRECT)
```html
<p>Hello    world    with    multiple    spaces</p>
```
**Rendu visuel** :
```
Hello    world    with    multiple    spaces
```
> Les espaces multiples sont préservés tels quels

### ✅ Rendu Attendu (CommonMark)
```html
<p>Hello world with multiple spaces</p>
```
**Rendu visuel** :
```
Hello world with multiple spaces
```
> Espaces multiples normalisés en 1 seul espace

---

## 🔴 Problème 2 : Délimiteurs avec Espaces

### Input Markdown
```markdown
Voici du texte ** avec espaces ** autour des délimiteurs
Voici du texte **sans espaces** correctement formaté
```

### ❌ Rendu Actuel (INCORRECT)
```html
<p>Voici du texte <strong> avec espaces </strong> autour des délimiteurs</p>
<p>Voici du texte <strong>sans espaces</strong> correctement formaté</p>
```
**Rendu visuel** :
```
Voici du texte  avec espaces  autour des délimiteurs
Voici du texte sans espaces correctement formaté
```
> Les deux sont formatés en gras, ce qui est incorrect pour le premier

### ✅ Rendu Attendu (CommonMark)
```html
<p>Voici du texte ** avec espaces ** autour des délimiteurs</p>
<p>Voici du texte <strong>sans espaces</strong> correctement formaté</p>
```
**Rendu visuel** :
```
Voici du texte ** avec espaces ** autour des délimiteurs
Voici du texte sans espaces correctement formaté
```
> Seul le second est formaté car le premier a des espaces invalides

---

## 🔴 Problème 3 : Paragraphes et Lignes Vides

### Input Markdown
```markdown
Premier paragraphe.
Deuxième ligne du même paragraphe.

Nouveau paragraphe après 1 ligne vide.


Paragraphe après 2 lignes vides.
```

### ❌ Rendu Actuel (INCORRECT)
```html
<p>Premier paragraphe.<br />Deuxième ligne du même paragraphe.</p>
<p>Nouveau paragraphe après 1 ligne vide.</p>
<p>Paragraphe après 2 lignes vides.</p>
```
**Rendu visuel** :
```
Premier paragraphe.
Deuxième ligne du même paragraphe.

Nouveau paragraphe après 1 ligne vide.

Paragraphe après 2 lignes vides.
```
> Les lignes sont séparées par `<br />` au lieu d'un espace

### ✅ Rendu Attendu (CommonMark)
```html
<p>Premier paragraphe. Deuxième ligne du même paragraphe.</p>
<p>Nouveau paragraphe après 1 ligne vide.</p>
<p>Paragraphe après 2 lignes vides.</p>
```
**Rendu visuel** :
```
Premier paragraphe. Deuxième ligne du même paragraphe.

Nouveau paragraphe après 1 ligne vide.

Paragraphe après 2 lignes vides.
```
> Lignes fusionnées avec espace, pas de `<br />`

---

## 🔴 Problème 4 : Indentation Mixte (Tabs + Espaces)

### Input Markdown
```markdown
- Item niveau 1
	- Item niveau 2 (1 tab = 1 caractère)
    - Item niveau 2 (4 espaces = 4 caractères)
```

### ❌ Rendu Actuel (INCORRECT)
**Interprétation interne** :
- Item 1 : indent = 0
- Item 2 : indent = 1 (1 tab)
- Item 3 : indent = 4 (4 espaces)

```html
<ul>
  <li>Item niveau 1
    <ul>
      <li>Item niveau 2 (1 tab)</li>
    </ul>
    <ul>
      <li>Item niveau 2 (4 espaces)</li>
    </ul>
  </li>
</ul>
```
> Items au même niveau visuel mais considérés comme différents

### ✅ Rendu Attendu (Après Normalisation)
**Normalisation** : 1 tab = 4 espaces

**Interprétation interne** :
- Item 1 : indent = 0
- Item 2 : indent = 4 (1 tab normalisé)
- Item 3 : indent = 4 (4 espaces)

```html
<ul>
  <li>Item niveau 1
    <ul>
      <li>Item niveau 2 (1 tab)</li>
      <li>Item niveau 2 (4 espaces)</li>
    </ul>
  </li>
</ul>
```
> Les deux items sont au même niveau

---

## 🔴 Problème 5 : Espacement Vertical entre Blocs

### Input Markdown
```markdown
# Titre Principal

Paragraphe après titre.

## Sous-titre

Paragraphe après sous-titre.

- Liste item 1
- Liste item 2

Paragraphe après liste.
```

### ❌ Rendu Actuel (INCORRECT)
```html
<h1 class="text-xl font-bold mt-4 mb-2">Titre Principal</h1>
<p class="my-2 leading-relaxed">Paragraphe après titre.</p>
<h2 class="text-lg font-bold mt-4 mb-2">Sous-titre</h2>
<p class="my-2 leading-relaxed">Paragraphe après sous-titre.</p>
<ul class="list-disc list-inside my-2 space-y-1">
  <li>Liste item 1</li>
  <li>Liste item 2</li>
</ul>
<p class="my-2 leading-relaxed">Paragraphe après liste.</p>
```

**Espacement visuel** :
```
Titre Principal      [mt-4=16px, mb-2=8px]
                     [my-2=8px top]
Paragraphe après     [my-2=8px bottom]
                     [mt-4=16px, mb-2=8px]
Sous-titre
                     [my-2=8px top]
Paragraphe après     [my-2=8px bottom]
                     [my-2=8px top]
- Liste item 1       [my-2=8px bottom]
                     [my-2=8px top]
Paragraphe après
```
> Espacement uniforme, pas de distinction selon le contexte

### ✅ Rendu Attendu (Espacement Dynamique)
```html
<h1 class="text-xl font-bold mt-0 mb-4">Titre Principal</h1>
<p class="my-3 leading-relaxed">Paragraphe après titre.</p>
<h2 class="text-lg font-bold mt-6 mb-3">Sous-titre</h2>
<p class="my-3 leading-relaxed">Paragraphe après sous-titre.</p>
<ul class="list-disc list-inside my-3 space-y-1">
  <li>Liste item 1</li>
  <li>Liste item 2</li>
</ul>
<p class="my-3 leading-relaxed">Paragraphe après liste.</p>
```

**Espacement visuel** :
```
Titre Principal      [mt-0=0px, mb-4=16px]
                     [my-3=12px top]
Paragraphe après     [my-3=12px bottom]
                     [mt-6=24px, mb-3=12px] ← Plus d'espace avant heading
Sous-titre
                     [my-3=12px top]
Paragraphe après     [my-3=12px bottom]
                     [my-3=12px top]
- Liste item 1       [my-3=12px bottom]
                     [my-3=12px top]
Paragraphe après
```
> Espacement contextuel : plus d'espace avant les headings

---

## 🔴 Problème 6 : Formatage Imbriqué Complexe

### Input Markdown
```markdown
**Texte en gras avec *italique* imbriqué**

*Italique avec **gras** imbriqué*

**Gras ~~barré~~ et `code`**
```

### ❌ Rendu Actuel (PEUT ÉCHOUER)
Le parser actuel peut échouer sur certains cas complexes de formatage imbriqué car il utilise des regex simples.

**Exemple d'échec** :
```markdown
**Bold *italic** still italic*
```

Le parser peut interpréter :
- `**Bold *italic**` = gras de "Bold *italic"
- Reste ` still italic*` = texte normal avec `*`

### ✅ Rendu Attendu (avec Lexer)
Avec un lexer basé sur des tokens, on peut gérer correctement l'imbrication :

**Tokens** :
```
[BOLD_OPEN, TEXT("Bold "), ITALIC_OPEN, TEXT("italic"), BOLD_CLOSE, TEXT(" still italic"), ITALIC_CLOSE]
```

**Parsing** :
- Ouvrir BOLD
  - Texte "Bold "
  - Ouvrir ITALIC
    - Texte "italic"
  - Fermer BOLD (ferme aussi ITALIC automatiquement)
- Texte " still italic"
- Fermer ITALIC (déjà fermé)

**HTML** :
```html
<strong>Bold <em>italic</em></strong> still italic
```

---

## 📊 Tableau Comparatif des Problèmes

| Problème | Input | Rendu Actuel | Rendu Attendu | Impact |
|----------|-------|--------------|---------------|--------|
| Espaces multiples | `Hello    world` | `Hello    world` | `Hello world` | 🔴 Moyen |
| Délimiteurs espaces | `** text **` | `<strong> text </strong>` | `** text **` | 🔴 Critique |
| Paragraphes | `Line 1\nLine 2` | `Line 1<br />Line 2` | `Line 1 Line 2` | 🔴 Critique |
| Tabs vs Espaces | `\t- Item` vs `    - Item` | Niveaux différents | Même niveau | 🟡 Moyen |
| Espacement vertical | Uniforme | `my-2` partout | Contextuel | 🟢 Faible |
| Formatage imbriqué | `**bold *italic** text*` | Peut échouer | Correct | 🔴 Critique |

---

## 🧪 Test Cases Automatiques Recommandés

### Test Suite 1 : Whitespace Normalization
```typescript
describe('Whitespace Normalization', () => {
  it('should collapse multiple spaces into one', () => {
    const input = 'Hello    world';
    const expected = '<p>Hello world</p>';
    expect(markdownToHtml(input)).toBe(expected);
  });

  it('should trim leading/trailing spaces in paragraphs', () => {
    const input = '   Hello world   ';
    const expected = '<p>Hello world</p>';
    expect(markdownToHtml(input)).toBe(expected);
  });

  it('should normalize tabs to spaces (4 spaces per tab)', () => {
    const input = '- Item\n\t- Sub-item\n    - Sub-item 2';
    const output = parseMarkdown(input);

    expect(output[0].children[0].indent).toBe(0);
    expect(output[0].children[1].indent).toBe(4);
    expect(output[0].children[2].indent).toBe(4);
  });
});
```

### Test Suite 2 : Delimiter Validation
```typescript
describe('Delimiter Validation', () => {
  it('should NOT format bold with spaces after opening delimiter', () => {
    const input = '** text**';
    const expected = '<p>** text**</p>';
    expect(markdownToHtml(input)).toBe(expected);
  });

  it('should NOT format bold with spaces before closing delimiter', () => {
    const input = '**text **';
    const expected = '<p>**text **</p>';
    expect(markdownToHtml(input)).toBe(expected);
  });

  it('should format bold correctly without spaces', () => {
    const input = '**text**';
    const expected = '<p><strong>text</strong></p>';
    expect(markdownToHtml(input)).toBe(expected);
  });
});
```

### Test Suite 3 : Paragraph Merging
```typescript
describe('Paragraph Merging', () => {
  it('should merge lines with single newline into one paragraph', () => {
    const input = 'Line 1\nLine 2';
    const expected = '<p>Line 1 Line 2</p>';
    expect(markdownToHtml(input)).toBe(expected);
  });

  it('should separate paragraphs with double newline', () => {
    const input = 'Paragraph 1\n\nParagraph 2';
    const expected = '<p>Paragraph 1</p><p>Paragraph 2</p>';
    expect(markdownToHtml(input)).toBe(expected);
  });

  it('should treat multiple newlines as one paragraph separator', () => {
    const input = 'Paragraph 1\n\n\n\nParagraph 2';
    const expected = '<p>Paragraph 1</p><p>Paragraph 2</p>';
    expect(markdownToHtml(input)).toBe(expected);
  });
});
```

### Test Suite 4 : Nested Formatting
```typescript
describe('Nested Formatting', () => {
  it('should handle bold inside italic', () => {
    const input = '*italic with **bold** inside*';
    const expected = '<p><em>italic with <strong>bold</strong> inside</em></p>';
    expect(markdownToHtml(input)).toBe(expected);
  });

  it('should handle italic inside bold', () => {
    const input = '**bold with *italic* inside**';
    const expected = '<p><strong>bold with <em>italic</em> inside</strong></p>';
    expect(markdownToHtml(input)).toBe(expected);
  });

  it('should handle complex nesting with strikethrough', () => {
    const input = '**bold ~~strikethrough~~ and `code`**';
    const expected = '<p><strong>bold <del>strikethrough</del> and <code>code</code></strong></p>';
    expect(markdownToHtml(input)).toBe(expected);
  });
});
```

---

## 🎯 Conclusion

Les problèmes identifiés affectent principalement :

1. **La conformité CommonMark** (60% actuellement)
2. **La cohérence du rendu visuel** (espaces incohérents)
3. **La robustesse** (cas complexes peuvent échouer)

Les solutions proposées (Lexer + Parser multi-pass) permettront d'atteindre :
- ✅ Conformité CommonMark : **95%+**
- ✅ Rendu visuel cohérent : **100%**
- ✅ Robustesse : **95%+**
- ⚠️ Performance : **-5%** (acceptable)

**Recommandation** : Implémenter les solutions en 4 phases sur 5-7 jours.
