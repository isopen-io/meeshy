# Iteration 26 — Plan d'implémentation (2026-06-09)

## Phases parallèles

### Phase A
- [ ] `routes/signal-protocol.ts` (14) — `../utils/response`
- [ ] `routes/admin/invitations.ts` (14) — `../../utils/response`

### Phase B
- [ ] `routes/admin/content.ts` (14) — `../../utils/response`
- [ ] `routes/translation-non-blocking.ts` (13) — `../utils/response`

### Phase C
- [ ] `routes/admin/analytics.ts` (16) — `../../utils/response`
- [ ] `routes/voice/analysis.ts` (15) — `../../utils/response`

## Règles
- Préserver: statusCode dynamique, result pré-structuré, champs top-level custom (details, errors, cacheInvalidation, page-pagination, message, cursorPagination, isModerator)
- Pas de helper pour 410/429/503/416 — laisser tel quel
