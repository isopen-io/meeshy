# Iteration 13 — Plan d'implémentation

**Date**: 2026-06-08
**Branche**: claude/brave-archimedes-nq8uv6

## Phases

### [ ] Phase A — Jobs : logger migration + .unref()

#### A1. `jobs/mutation-log-cleanup.ts`
- Ajouter `import { enhancedLogger } from '../utils/logger-enhanced.js'`
- Ajouter `const logger = enhancedLogger.child({ module: 'MutationLogCleanup' })`
- Remplacer 7 `console.*` par `logger.warn/info/error`
- Ajouter `.unref?.()` après `this.intervalId = setInterval(...)`

#### A2. `jobs/cleanup-expired-tokens.ts`
- Ajouter `import { enhancedLogger } from '../utils/logger-enhanced.js'`
- Ajouter `const logger = enhancedLogger.child({ module: 'CleanupExpiredTokens' })`
- Remplacer 6 `console.*` par `logger.warn/info/error`
- Ajouter `.unref?.()` après `this.intervalId = setInterval(...)`

#### A3. `jobs/unlock-accounts.ts`
- Ajouter `import { enhancedLogger } from '../utils/logger-enhanced.js'`
- Ajouter `const logger = enhancedLogger.child({ module: 'UnlockAccountsJob' })`
- Remplacer 8 `console.*` par `logger.warn/info/error`
- Ajouter `.unref?.()` après `this.intervalId = setInterval(...)`
- **N+1 fix** : remplacer boucle `for (const user of expiredLocks) { prisma.securityEvent.create() }` par `prisma.securityEvent.createMany({ data: expiredLocks.map(...) })`

#### A4. `jobs/index.ts`
- Ajouter `import { enhancedLogger } from '../utils/logger-enhanced.js'`
- Ajouter `const logger = enhancedLogger.child({ module: 'BackgroundJobs' })`
- Remplacer 8 `console.*` par `logger.warn/info`

#### A5. `jobs/notification-digest.ts` — .unref() uniquement
- Ajouter `.unref?.()` après `this.timeoutId = setTimeout(...)`
- Ajouter `.unref?.()` après `this.intervalId = setInterval(...)`

### [ ] Phase B — SessionService : logger migration (PII)

- Ajouter `import { enhancedLogger } from '../utils/logger-enhanced.js'`
- Ajouter `const logger = enhancedLogger.child({ module: 'SessionService' })`
- Remplacer 13 `console.*` par `logger.debug/warn/error`
- Attention : `userAgent.substring(0, 50)` devient `{ userAgent: userAgent.substring(0, 50) }` (PII hashing)
- `sessionId` → passer via objet contexte (PII hash automatique)

### [ ] Phase C — TwoFactorService : logger migration (PII)

- Ajouter `import { enhancedLogger } from '../utils/logger-enhanced.js'`
- Ajouter `const logger = enhancedLogger.child({ module: 'TwoFactorService' })`
- Remplacer 12 `console.*` par `logger.debug/error`
- `user.username` → `{ username: user.username }` (PII hash)
- `userId` → `{ userId }` (PII hash)

### [ ] Phase D — ZmqConnectionManager : logger migration

- Ajouter `import { enhancedLogger } from '../../utils/logger-enhanced.js'`
- Ajouter `const logger = enhancedLogger.child({ module: 'ZmqConnectionManager' })`
- Remplacer 15 `console.*` par `logger.debug/info/error`
- Supprimer les emojis dans les messages de log (appartiennent aux console.*)
