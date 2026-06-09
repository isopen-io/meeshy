# Iteration 11 — Analyse d'optimisation

**Date**: 2026-06-08
**Branche**: claude/brave-archimedes-OnFYZ-iter11

## Résumé

Continuation de la migration `console.*` → `enhancedLogger` sur les nouveaux fichiers introduits entre iter9 et iter11, correction de memory leaks dans NotificationService (Maps non bornées, intervals sans unref), et amélioration de la type safety dans `metadata.ts`.

## Problèmes identifiés

### A. console.* dans attachments/metadata.ts (nouveau fichier)
7 appels `console.error` dans le nouveau fichier `routes/attachments/metadata.ts`. Ce fichier a été ajouté après la migration iter9-10 et n'a donc pas bénéficié du refactor. Les error catches utilisaient aussi `error: any` avec `error.message` non typé.

### B. console.* dans conversations/core.ts (11 appels)
11 appels `console.error/warn/log` avec emojis (⚠️, ❌, 📩) dans `routes/conversations/core.ts`. Le fichier avait déjà un `logger = enhancedLogger.child({ module: 'conversations/core' })` déclaré mais non utilisé pour ces appels.

### C. NotificationService — intervals sans unref
Les deux `setInterval` pour `cleanupOldMentions` et `cleanupOldReactions` dans le constructeur n'avaient pas `.unref?.()`. Sur les mêmes lignes, les intervalles étaient anonymes (non sauvegardés). Cela peut bloquer la fermeture propre du process.

### D. NotificationService — Maps non bornées
`recentMentions` et `recentReactions` peuvent grossir sans limite entre deux cycles de cleanup (2 min). Sur une plateforme à forte activité avec de nombreuses paires utilisateur uniques, cela peut consommer une mémoire significative. Correction : FIFO eviction à 10 000 entrées.

### E. NotificationService — console.log RT-DIAG en production
2 `console.log` diagnostiques (`[RT-DIAG]`) dans `createNotification` contournent Pino. Migrés vers `notificationLogger.debug` (déjà importé dans le fichier).

## Portée des changements

| Fichier | Type |
|---------|------|
| `services/gateway/src/routes/attachments/metadata.ts` | Logger migration + type safety |
| `services/gateway/src/routes/conversations/core.ts` | Logger migration (11 calls) |
| `services/gateway/src/services/notifications/NotificationService.ts` | unref + size cap + logger |
