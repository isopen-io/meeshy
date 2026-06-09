# Iteration 13 — Analyse d'optimisation

**Date**: 2026-06-08
**Branche**: claude/brave-archimedes-nq8uv6

## Contexte

Itérations précédentes (1-12) ont couvert : auth cache, N+1 conversations, reconnect backoff,
event dedup, i18n/a11y, typing throttle, currentUserParticipants, VoiceCharacteristics, rate-limit
userId, présence snapshot, AuthHandler/ReactionHandler/ConversationHandler/MessageHandler/
StatusHandler/PrivacyPreferencesService/SocialEventsHandler/attachments-metadata/conversations-core
/NotificationService/EncryptionService/MaintenanceService/ZmqTranslationClient/CaptchaService logger
migrations. Cette itération cible les 5 derniers groupes de fichiers gateway avec `console.*` +
un N+1 dans UnlockAccountsJob.

---

## Problème 1 — Jobs directory : console.* + .unref() manquants

### A. `jobs/mutation-log-cleanup.ts` (7 console.*)
`console.warn`, `console.log` (×3), `console.error` (×3). Aucun logger structuré. L'`intervalId`
(setInterval 24h) n'appelle pas `.unref?.()` — bloque le shutdown propre du process node.

### B. `jobs/cleanup-expired-tokens.ts` (6 console.*)
`console.warn`, `console.log` (×3), `console.error`. Aucun logger. L'`intervalId` (setInterval
15 min) sans `.unref?.()`.

### C. `jobs/unlock-accounts.ts` (8 console.* + N+1 CRITIQUE)
`console.warn`, `console.log` (×4), `console.error`. Aucun logger. L'`intervalId` (setInterval 24h)
sans `.unref?.()`. **N+1 critique** : boucle `for (const user of expiredLocks)` avec
`prisma.securityEvent.create()` pour chaque compte déverrouillé — N appels DB au lieu de 1
`createMany`.

### D. `jobs/index.ts` (8 console.*)
Orchestrateur BackgroundJobsManager : `console.warn` (×2), `console.log` (×6). Pas d'intervals
ici (délégue aux sous-jobs). Besoin d'un logger.

### E. `jobs/notification-digest.ts` — .unref() seulement
Aucun `console.*` résiduel. Mais `this.timeoutId` (setTimeout initial) et `this.intervalId`
(setInterval 24h) n'ont pas `.unref?.()`. Même impact sur graceful shutdown.

---

## Problème 2 — SessionService : 13 console.* (PII CRITIQUE)

**Fichier** : `services/gateway/src/services/SessionService.ts`

13 appels `console.log/warn/error` sans logger. **Risque PII grave** : des fragments de `userAgent`
(50 chars substring) et des `sessionId` (identifiant unique) sont loggés en clair via `console.log`
contournant le PII-hashing de Pino. SessionService n'importe aucun logger.

---

## Problème 3 — TwoFactorService : 12 console.* (PII CRITIQUE)

**Fichier** : `services/gateway/src/services/TwoFactorService.ts`

12 appels `console.log/error` sans logger. **Risque PII grave** : `user.username` loggé en clair
(lignes 147, 220, 290), `userId` loggé (lignes 356, 428, 451). Contournement du PII-hashing.
TwoFactorService n'importe aucun logger.

---

## Problème 4 — ZmqConnectionManager : 15 console.* (infra critique)

**Fichier** : `services/gateway/src/services/zmq-translation/ZmqConnectionManager.ts`

15 appels `console.log/error` avec emojis (🔧, ✅, 🔌, ❌) dans `initialize()` et méthodes
connexion ZMQ. Fichier critique d'infrastructure — logs non indexables, pas de level filtering en
production, pas de structured JSON pour ELK. Aucun logger importé.

---

## Portée des changements

| Fichier | Console.* | Unref | N+1 fix |
|---------|-----------|-------|---------|
| `services/gateway/src/jobs/mutation-log-cleanup.ts` | 7 | ✓ | — |
| `services/gateway/src/jobs/cleanup-expired-tokens.ts` | 6 | ✓ | — |
| `services/gateway/src/jobs/unlock-accounts.ts` | 8 | ✓ | ✓ |
| `services/gateway/src/jobs/index.ts` | 8 | — | — |
| `services/gateway/src/jobs/notification-digest.ts` | — | ✓ | — |
| `services/gateway/src/services/SessionService.ts` | 13 | — | — |
| `services/gateway/src/services/TwoFactorService.ts` | 12 | — | — |
| `services/gateway/src/services/zmq-translation/ZmqConnectionManager.ts` | 15 | — | — |

**Total** : ~69 console.* replacements + 4 `.unref?.()` + 1 N+1 fix (createMany)
