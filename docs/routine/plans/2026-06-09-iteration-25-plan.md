# Iteration 25 — Plan d'implémentation (2026-06-09)

## Phases parallèles

### Phase A
- [ ] `routes/translation.ts` (15) — `../utils/response`
- [ ] `routes/push-tokens.ts` (15) — `../utils/response`

### Phase B
- [ ] `routes/auth/register.ts` (15) — `../../utils/response`
- [ ] `routes/attachments/metadata.ts` (15) — `../../utils/response`

### Phase C
- [ ] `routes/admin/roles.ts` (15) — `../../utils/response`
- [ ] `routes/me/preferences/preference-router-factory.ts` (16) — `../../../utils/response`

## Règles
- Préserver: statusCode dynamique, result pré-structuré, champs top-level custom (details, errors, cacheInvalidation, page-pagination, message, cursorPagination, isModerator)
- Pas de helper pour 410/429/503/416 — laisser tel quel
