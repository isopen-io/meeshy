# Iteration 13 — Plan d'implémentation

**Date**: 2026-06-08
**Branche**: claude/brave-archimedes-OnFYZ-iter13

## Phases

### [x] Phase A — SecurityMonitor.ts: logger + unref + Map size cap
- Ajouter `enhancedLogger` import + instance
- Remplacer 2 `console.error` par `logger.error`
- Remplacer `console.log` du cleanup par `logger.debug` avec structured args
- Ajouter `.unref?.()` sur l'interval de cleanup (600s)
- Ajouter `MAX_EVENT_COUNTS = 10_000` et méthode `_setEventCount` avec FIFO eviction

### [x] Phase B — voice-analysis.ts: logger migration
- Ajouter `enhancedLogger` import + instance (`module: 'VoiceAnalysis'`)
- Remplacer 1 `console.error` par `logger.error`

### [x] Phase C — SmsService.ts: logger migration
- Ajouter `enhancedLogger` import + instance (`module: 'SmsService'`)
- Remplacer 9 `console.warn/log/error` par `logger.warn/info/debug/error`
- Corriger `error: any` → `error: unknown` dans le catch du provider
- Consolider les 3 console.log DEV MODE en un seul logger.debug avec structured args
