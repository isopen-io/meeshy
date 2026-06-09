# Iteration 19 — Plan d'implémentation (2026-06-09)

## Phases parallèles

### Phase A (parallèle)
- [ ] `routes/message-read-status.ts` (21 calls)
- [ ] `routes/affiliate.ts` (29 calls)

### Phase B (parallèle)
- [ ] `routes/calls.ts` (20 calls)
- [ ] `routes/two-factor.ts` (20 calls)

### Phase C (parallèle)
- [ ] `routes/reactions.ts` (22 calls)
- [ ] `routes/voice-profile.ts` (21 calls)

## Règles
- Import depuis `../../utils/response` ou `../utils/response` selon profondeur
- Ne pas toucher aux exceptions documentées (ETag, iOS SDK compat)
- Vérifier que la pagination est standard avant d'utiliser sendPaginatedSuccess
- Toujours `return sendX(...)` (comme les appels existants dans le fichier)
