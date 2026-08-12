# Iteration 185 — Plan : Unicode-aware `normalizeName` dans `compareFullNames`

## Objectives
Corriger la comparaison d'identité de récupération de compte pour qu'elle
fonctionne sur les noms non-latins (Cyrillique, Arabe, CJK, Grec…), en éliminant
à la fois le faux négatif (récupération refusée au propriétaire légitime) et le
faux positif (récupération proposée à un tiers partageant un token latin).

## Affected modules
- `services/gateway/src/utils/name-similarity.ts` (fix + docstring)
- `services/gateway/src/__tests__/unit/utils/name-similarity.test.ts` (3 tests)

## Implementation phases
1. **RED** — Ajouter 3 tests : (a) Cyrillique identique → `exact` ;
   (b) CJK + Arabe identiques → `exact` ; (c) `Jean Петров` vs `Jean Иванов`
   → `not exact`. Vérifier l'échec (3 fail / 10 pass).
2. **GREEN** — Remplacer `[^a-z0-9]+/g` par `[^\p{L}\p{N}]+/gu` dans
   `normalizeName`. Ajouter la docstring expliquant le lien avec la surface
   `\p{L}` de l'inscription.
3. **REFACTOR** — Aucun (changement minimal, algorithme déjà pur).

## Dependencies
- Prisma client généré + `dist` shared (prérequis harnais gateway jest).

## Estimated risks
Très faible. Une classe de caractères. Repliement d'accents latins (NFD +
`\p{M}`) inchangé → cas latins existants préservés. Seul appelant
(`PhoneTransferService`) ne gate que `exact`/`similar`.

## Rollback strategy
Revert du commit (2 fichiers). Aucune migration de données, aucun changement de
schéma, aucun impact API.

## Validation criteria
- `bunx jest --config=jest.config.json --testPathPatterns name-similarity` → 13/13.
- Aucune régression sur les 10 tests latins préexistants.

## Completion status
- [x] Phase 1 RED (3 tests échouent)
- [x] Phase 2 GREEN (fix appliqué, 13/13)
- [x] Analyse + plan documentés
- [ ] Commit + push + merge dans main

## Progress tracking
Fix implémenté et validé localement. Commit/push/merge en cours.

## Future improvements
Voir la section « Future improvements » de l'analyse : `routes/anonymous.ts`
(handle dégénéré non-latin) et `call-session-response.ts` (fallback userId)
partagent des root causes voisines et sont candidats pour les prochains cycles.
