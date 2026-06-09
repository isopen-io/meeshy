# Iteration 17 — Plan d'implémentation (2026-06-08)

## Phases parallèles

### Phase A — Routes principales (9+5+4 calls)
- [ ] `routes/users/devices.ts` (9)
- [ ] `routes/attachments/upload.ts` (5)
- [ ] `routes/communities/members.ts` (4)

### Phase B — Services principaux (5+4+4 calls)
- [ ] `services/attachments/AttachmentService.ts` (5)
- [ ] `services/zmq-translation/utils/zmq-helpers.ts` (4)
- [ ] `services/GeoIPService.ts` (4)
- [ ] `services/AffiliateTrackingService.ts` (4)

### Phase C — Services petits + routes petites (3+3+3+2+2 calls)
- [ ] `services/notifications/NotificationFormatter.ts` (3)
- [ ] `services/messaging/MessageValidator.ts` (3)
- [ ] `routes/voice-profile.ts` (3)
- [ ] `services/ZmqSingleton.ts` (2)
- [ ] `services/SecurityMonitor.ts` (2)
- [ ] `routes/translation-jobs.ts` (2)
- [ ] `routes/communities/settings.ts` (2)
- [ ] `routes/attachments/translation.ts` (2)

### Phase D — Single-call files (1 each, 8 files)
- [ ] `routes/users/profile.ts`
- [ ] `routes/me/preferences/index.ts`
- [ ] `routes/me/preferences/categories.ts`
- [ ] `routes/links/validation.ts`
- [ ] `routes/conversations/search.ts`
- [ ] `routes/communities/search.ts`
- [ ] `routes/attachments/download.ts`
- [ ] `utils/rate-limiter.ts`
- [ ] `utils/normalize.ts`
- [ ] `middleware/admin-permissions.middleware.ts`
- [ ] `errors/custom-errors.ts`
- [ ] `adapters/node-signal-stores.ts`
- [ ] `server.ts`
- [ ] `services/preferences/PreferencesService.ts`

## Règles
- `routes/users/`, `routes/me/` → `../../utils/logger-enhanced.js`
- `routes/communities/`, `routes/attachments/` → `../../utils/logger-enhanced.js`
- `routes/` (flat) → `../utils/logger-enhanced.js`
- `services/` (flat) → `../utils/logger-enhanced.js`
- `services/attachments/`, `services/zmq-translation/utils/` → `../../utils/logger-enhanced.js`
- `services/notifications/`, `services/messaging/`, `services/preferences/` → `../../utils/logger-enhanced.js`
- `utils/`, `middleware/`, `errors/`, `adapters/` → `../utils/logger-enhanced.js` ou selon profondeur
- PII → contexte, jamais en message string
