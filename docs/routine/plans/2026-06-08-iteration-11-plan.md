# Iteration 11 — Plan d'implémentation

**Date**: 2026-06-08
**Branche**: claude/brave-archimedes-OnFYZ-iter11

## Phases

### [x] Phase A — attachments/metadata.ts: logger + type safety
- Ajouter `enhancedLogger` import + instance (`module: 'AttachmentMetadataRoutes'`)
- Remplacer 7 `console.error` calls par `logger.error`
- Changer `error: any` → `error: unknown` avec guards `instanceof Error`
- Supprimer les console.error redondants dans les branches 403 (pas de valeur ajoutée)
- Corriger `(attachment as any).updatedAt` → cast typé

### [x] Phase B — conversations/core.ts: logger migration (11 calls)
- `logger` déjà déclaré, non utilisé pour ces appels
- Remplacer `console.error/warn/log` par `logger.error/warn/debug`
- Supprimer préfixes emojis (⚠️, ❌, 📩) et interpolations de chaînes en faveur de structured args

### [x] Phase C — NotificationService: unref cleanup intervals
- Sauvegarder les deux intervals dans des variables
- Appeler `.unref?.()` sur chacun

### [x] Phase D — NotificationService: size cap sur Maps anti-spam
- Ajouter `MAX_MENTION_MAP_ENTRIES = 10_000` et `MAX_REACTION_MAP_ENTRIES = 10_000`
- Ajouter FIFO eviction dans `shouldCreateMentionNotification` et `shouldCreateReactionNotification`
- Évite la croissance non bornée entre cycles de cleanup

### [x] Phase E — NotificationService: console.log RT-DIAG → notificationLogger.debug
- 2 appels `console.log([RT-DIAG] ...)` → `notificationLogger.debug` avec structured args
- `notificationLogger` déjà importé dans le fichier
