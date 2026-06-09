# Iteration 20 — Plan d'implémentation (2026-06-09)

## Phases parallèles

### Phase A
- [ ] `routes/communities.ts` (78 calls) — `../utils/response`
- [ ] `routes/admin/users.ts` (64 calls) — `../../utils/response`

### Phase B
- [ ] `routes/users/profile.ts` (50 calls) — `../../utils/response`
- [ ] `routes/admin/agent.ts` (~13 restants) — `../../utils/response`

### Phase C
- [ ] `routes/password-reset.ts` (26 calls) — `../utils/response`
- [ ] `routes/user-deletions.ts` (25 calls) — `../utils/response`

## Règles
- Vérifier profondeur d'import par fichier
- Préserver exceptions documentées (statusCode dynamique, result pré-structuré)
- Ajouter `return` avant les helpers si le pattern existant l'avait
