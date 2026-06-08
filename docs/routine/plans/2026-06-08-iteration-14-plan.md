# Iteration 14 — Plan d'implémentation (2026-06-08)

## Phases

### Phase A — Routes gateway : console.* → enhancedLogger
- [ ] `src/routes/communities.ts`
- [ ] `src/routes/affiliate.ts`
- [ ] `src/routes/maintenance.ts`
- [ ] `src/routes/conversation-encryption.ts`
- [ ] `src/routes/magic-link.ts`
- [ ] `src/routes/message-read-status.ts`

Pattern :
```typescript
import { enhancedLogger } from '../utils/logger-enhanced.js';
const logger = enhancedLogger.child({ module: 'ModuleName' });
// console.error('msg', err) → logger.error('msg', err as Error)
// console.log('msg') → logger.info('msg')
```

### Phase B — socketio/utils : console.* → logger
- [ ] `src/socketio/utils/socket-helpers.ts`

### Phase C — Translator : print() → logging
- [ ] `services/translator/src/main.py` — startup prints
- [ ] Autres fichiers si impactants (batch_translation_api.py, etc.)

### Phase D — .unref?.() services
- [ ] Vérifier TusCleanupService et autres cleanup services

## Contraintes
- Pattern logger: `enhancedLogger.child({ module: 'X' })`, import `.js`
- Signature: `logger.info('message', context?)` — PAS `logger.info(obj, 'message')`
- Ne pas toucher aux tests
