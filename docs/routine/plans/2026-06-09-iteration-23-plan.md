# Iteration 23 — Plan d'implémentation (2026-06-09)

## Phases parallèles

### Phase A
- [ ] `routes/users/devices.ts` (22) — `../../utils/response`
- [ ] `routes/me/preferences/categories.ts` (22) — `../../../utils/response`

### Phase B
- [ ] `routes/auth/phone-transfer.ts` (22) — `../../utils/response`
- [ ] `routes/communities/members.ts` (21) — `../../utils/response`

### Phase C
- [ ] `routes/attachments/translation.ts` (19) — `../../utils/response`
- [ ] `routes/links/messages.ts` (18) — `../../utils/response`

## Règles
- Préserver: statusCode dynamique, result pré-structuré, champs top-level custom (details, errors, cacheInvalidation, page-pagination, message, cursorPagination, isModerator)
- Pas de helper pour 410/429/503 — laisser tel quel
