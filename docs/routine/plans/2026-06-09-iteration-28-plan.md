# Iteration 28 — Plan d'implémentation (2026-06-09)

## Phases parallèles

### Phase A
- [ ] `routes/magic-link.ts` (11) — `../utils/response`
- [ ] `routes/users/preferences.ts` (11) — `../../utils/response`

### Phase B
- [ ] `routes/attachments/upload.ts` (10) — `../../utils/response`
- [ ] `routes/translation-jobs.ts` (10) — `../utils/response`

### Phase C
- [ ] `routes/auth/login.ts` (10) — `../../utils/response`
- [ ] `routes/admin/dashboard.ts` (8) — `../../utils/response`

## Règles
- Préserver: statusCode dynamique, result pré-structuré, champs top-level custom (details, errors, cacheInvalidation, page-pagination, message, cursorPagination, isModerator, errorCode)
- Pas de helper pour 410/429/503/416 — laisser tel quel
