# Iteration 27 — Plan d'implémentation (2026-06-09)

## Phases parallèles

### Phase A
- [ ] `routes/conversation-encryption.ts` (12) — `../utils/response`
- [ ] `routes/links/management.ts` (12) — `../../utils/response`

### Phase B
- [ ] `routes/community-preferences.ts` (12) — `../utils/response`
- [ ] `routes/conversation-preferences.ts` (12) — `../utils/response`

### Phase C
- [ ] `routes/maintenance.ts` (11) — `../utils/response`
- [ ] `routes/communities/settings.ts` (11) — `../../utils/response`

## Règles
- Préserver: statusCode dynamique, result pré-structuré, champs top-level custom (details, errors, cacheInvalidation, page-pagination, message, cursorPagination, isModerator)
- Pas de helper pour 410/429/503/416 — laisser tel quel
