# Iteration 10 — Plan d'implémentation

**Date**: 2026-06-08
**Branche**: claude/brave-archimedes-OnFYZ-iter10

## Phases

### [x] Phase A — StatusHandler.ts: migration console.* → logger
- Remplacer 8 `console.warn/error` par `logger.warn/error` avec structured args
- `logger` déjà déclaré (import ajouté lors du contexte précédent)

### [x] Phase B — PrivacyPreferencesService.ts: logger + unref
- Ajouter `enhancedLogger` import + instance
- Remplacer `console.log` (debug) et `console.error` (error)
- Ajouter `.unref?.()` sur l'interval de cleanup

### [x] Phase C — SocialEventsHandler.ts: type fix + logger
- Ajouter `Socket` au type import depuis `socket.io`
- Remplacer `socket: any` → `socket: Socket` sur les deux handlers
- Remplacer `console.error` dans `getFriendIds` par `logger.error`

### [x] Phase D — MessageTranslationService.ts: periodic cleanup interval
- Ajouter `processedTasksCleanupInterval` avec setInterval 30min
- `.unref?.()` pour ne pas bloquer le process
- Complémentaire au threshold guard déjà en place (iter 9)

### [x] Phase E — TusUploadManager.swift: deinit
- Passer `queue` de `var` à `nonisolated(unsafe) var` (comme `progressSubject`)
- Ajouter `deinit` qui resume chaque continuation en attente avec `CancellationError()`
- Évite les memory leaks et les tasks Swift bloquées si l'acteur est désalloué
