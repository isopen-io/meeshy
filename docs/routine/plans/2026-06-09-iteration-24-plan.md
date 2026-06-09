# Iteration 24 — Plan d'implémentation (2026-06-09)

## Phases parallèles

### Phase A
- [ ] `routes/links/admin.ts` (18) — `../../utils/response`
- [ ] `routes/voice-analysis.ts` (18) — `../utils/response`

### Phase B
- [ ] `routes/admin/posts.ts` (17) — `../../utils/response`
- [ ] `routes/friends.ts` (16) — `../utils/response`

### Phase C
- [ ] `routes/attachments/download.ts` (16) — `../../utils/response`
- [ ] `routes/users/blocking.ts` (16) — `../../utils/response`

## Règles
- Préserver: statusCode dynamique, result pré-structuré, champs top-level custom (details, errors, cacheInvalidation, page-pagination, message, cursorPagination, isModerator)
- Pas de helper pour 410/429/503 — laisser tel quel
