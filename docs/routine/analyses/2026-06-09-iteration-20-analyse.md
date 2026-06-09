# Iteration 20 — Analyse d'optimisation (2026-06-09)

## Contexte
Suite iter 19 (PR #447 mergée). 6 fichiers migrés (~100 calls). Focus : grands fichiers non encore migrés.

## Fichiers ciblés iter 20 (6 fichiers, ~283 calls)

| Fichier | Count | Import depth |
|---------|-------|-------------|
| `routes/communities.ts` | 78 | `../utils/response` |
| `routes/admin/users.ts` | 64 | `../../utils/response` |
| `routes/users/profile.ts` | 50 | `../../utils/response` |
| `routes/admin/agent.ts` | ~13 restants (35 déjà std) | `../../utils/response` |
| `routes/password-reset.ts` | 26 | `../utils/response` |
| `routes/user-deletions.ts` | 25 | `../utils/response` |

## Exceptions à préserver
- Patterns avec `statusCode` dynamique variable
- Objets `result` déjà structurés en retour de service
- Champs top-level custom attendus par iOS SDK (voir iter 19)
