# Iteration 15 — Plan d'implémentation (2026-06-08)

## Phases

### Phase A — Auth routes (PII critique)
- [ ] `routes/auth/login.ts` — 17 console.* → logger (username/IP en contexte)
- [ ] `routes/auth/register.ts` — 9 console.* → logger

### Phase B — Conversations routes
- [ ] `routes/conversations/sharing.ts` — 17 console.* → logger
- [ ] `routes/conversations/participants.ts` — 9 console.* → logger

### Phase C — Messages route
- [ ] `routes/messages.ts` — 16 console.* → logger

### Phase D — Services
- [ ] `services/AttachmentTranslateService.ts` — 16 console.* → logger
- [ ] `services/MagicLinkService.ts` — 14 console.* → logger

## Règles critiques
- **PII** : username/email/userId/IP → `{ username }` dans context, jamais dans la string
- **Signature** : `logger.error('message', error as Error)` / `logger.info('message', { context })`
- **Import path** : `'../utils/logger-enhanced.js'` (routes), `'../utils/logger-enhanced.js'` (services)
- Ne pas supprimer les informations de contexte utiles, les déplacer dans le 2e argument
