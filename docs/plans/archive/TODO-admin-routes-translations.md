# TODO: Refactoriser routes admin pour translations JSON

## Routes nécessitant refactorisation

### ❌ admin/languages.ts
**Lignes:** 111, 340
**Opération:** `prisma.messageTranslation.findMany()`
**Action requise:** Remplacer par agrégation sur `Message.translations`

### ❌ admin/content.ts
**Lignes:** 429, 458
**Opérations:** `findMany()`, `count()`
**Action requise:** Remplacer par agrégation sur `Message.translations`

### ❌ admin/messages.ts
**Ligne:** 145
**Opération:** `prisma.messageTranslation.count()`
**Action requise:** Compter messages avec `translations != null`

### ❌ messages.ts
**Lignes:** 282, 421
**Opérations:** `deleteMany()` traductions
**Action requise:** Modifier `Message.translations` JSON (supprimer langues)

### ❌ conversations/messages-advanced.ts
**Lignes:** 426, 615
**Opérations:** `deleteMany()` traductions
**Action requise:** Modifier `Message.translations` JSON

## Pattern de refactorisation

### Avant (collection séparée):
```typescript
// Compter traductions
const count = await prisma.messageTranslation.count({
  where: { targetLanguage: 'fr' }
});

// Trouver traductions
const translations = await prisma.messageTranslation.findMany({
  where: { targetLanguage: 'fr' },
  select: { messageId, translatedContent, ... }
});
```

### Après (JSON dans Message):
```typescript
// Compter messages avec traductions FR
const messages = await prisma.message.findMany({
  where: {
    translations: {
      path: ['fr'],
      not: null
    }
  },
  select: { id: true, translations: true }
});

// Transformer et filtrer
const count = messages.length;
const translations = messages
  .map(m => {
    const trans = m.translations as unknown as Record<string, any>;
    return trans['fr'] ? {
      messageId: m.id,
      translatedContent: trans['fr'].text,
      ...
    } : null;
  })
  .filter(Boolean);
```

## Impact

**Fonctionnalités critiques:** ✅ FONCTIONNENT
- Chat en temps réel
- Traductions de messages
- SocketIO
- API principales

**Routes admin:** ❌ CRASHENT
- Statistiques de langues
- Modération de contenu
- Comptage de traductions
- Suppression de traductions individuelles

## Priorisation

1. **Phase 1 (complétée):** Fonctionnalités utilisateur principales
2. **Phase 2 (TODO):** Routes admin et statistiques
3. **Phase 3 (TODO):** Tests complets

## Estimation

- Refactorisation complète: ~2-3 heures
- Tests et validation: ~1 heure
- **Total:** ~3-4 heures

Date de création: 2026-01-26
