# Iteration 16 — Plan d'implémentation (2026-06-08)

## Phases

### Phase A — Services attachments
- [ ] `services/attachments/UploadProcessor.ts` (17)
- [ ] `services/AttachmentEncryptionService.ts` (8)

### Phase B — Routes
- [ ] `routes/user-deletions.ts` (13)
- [ ] `routes/two-factor.ts` (9)
- [ ] `routes/auth/phone-transfer.ts` (7)
- [ ] `routes/communities/core.ts` (6)

### Phase C — Services métier
- [ ] `services/messaging/MessagingService.ts` (11)
- [ ] `services/zmq-agent/ZmqAgentClient.ts` (8)

## Règles
- Import depth: `../../utils/logger-enhanced.js` pour services/attachments/, `../utils/` pour services/, `../utils/` pour routes/
- PII → contexte object, jamais dans message string
- Signature: `logger.error('msg', error as Error)` ou `logger.info('msg', { ctx })`
