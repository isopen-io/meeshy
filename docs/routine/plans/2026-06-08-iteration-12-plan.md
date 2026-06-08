# Iteration 12 — Plan d'implémentation

**Date**: 2026-06-08
**Branche**: claude/brave-archimedes-OnFYZ-iter12

## Phases

### [x] Phase A — EncryptionService.ts: unref
- Ajouter `.unref?.()` après `this.cacheCleanupInterval = setInterval(...)`

### [x] Phase B — MaintenanceService.ts: unref ×2
- Ajouter `.unref?.()` après `this.maintenanceInterval = setInterval(...)`
- Ajouter `.unref?.()` après `this.dailyCleanupInterval = setInterval(...)`

### [x] Phase C — ZmqTranslationClient.ts: unref
- Ajouter `.unref?.()` après `this.pollingIntervalId = setInterval(checkForMessages, 100)`

### [x] Phase D — CaptchaService.ts: logger + unref
- Ajouter `enhancedLogger` import + instance (`module: 'CaptchaService'`)
- Remplacer 6 `console.warn/error/log` par `logger.warn/error/debug`
- Sauvegarder l'interval dans `cleanupInterval`, ajouter `.unref?.()` après
