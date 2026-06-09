# Iteration 30 — Plan d'implémentation (2026-06-09)

## Phases parallèles

### Phase A
- [ ] `routes/links/retrieval.ts` (4) — `../../utils/response`
- [ ] `routes/links/messages-retrieval.ts` (4) — `../../utils/response`
- [ ] `routes/admin/anonymous-users.ts` (4) — `../../utils/response`

### Phase B
- [ ] `routes/mentions.ts` (3) — `../utils/response`
- [ ] `routes/conversations/messages.ts` (3) — `../../utils/response`
- [ ] `routes/communities/search.ts` (3) — `../../utils/response`
- [ ] `routes/me/index.ts` (3) — `../../utils/response`

### Phase C
- [ ] `routes/links/validation.ts` (2) — `../../utils/response`
- [ ] `routes/posts/audio.ts` (1) — `../../utils/response`
- [ ] `routes/conversations/sharing.ts` (1) — `../../utils/response`
- [ ] `routes/conversations/participants.ts` (1) — `../../utils/response`
- [ ] `routes/conversations/core.ts` (1) — `../../utils/response`

## Règles
- Préserver: statusCode dynamique, result pré-structuré, champs top-level custom (details, errors, cacheInvalidation, page-pagination, message, cursorPagination, isModerator, errorCode)
- Pas de helper pour 410/429/503/416 — laisser tel quel
