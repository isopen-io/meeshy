# Iteration 29 — Plan d'implémentation (2026-06-09)

## Phases parallèles

### Phase A
- [ ] `routes/admin/messages.ts` (8) — `../../utils/response`
- [ ] `routes/admin/languages.ts` (8) — `../../utils/response`

### Phase B
- [ ] `routes/links/user.ts` (6) — `../../utils/response`
- [ ] `routes/me/preferences/index.ts` (6) — `../../../utils/response`

### Phase C
- [ ] `routes/invitations.ts` (5) — `../utils/response`
- [ ] `routes/me/delete-account.ts` (5) — `../../utils/response`
- [ ] `routes/admin/system-rankings.ts` (5) — `../../utils/response`

## Règles
- Préserver: statusCode dynamique, result pré-structuré, champs top-level custom (details, errors, cacheInvalidation, page-pagination, message, cursorPagination, isModerator, errorCode)
- Pas de helper pour 410/429/503/416 — laisser tel quel
