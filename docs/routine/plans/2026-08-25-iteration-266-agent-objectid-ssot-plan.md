# Itération 266 — Plan : convergence ObjectId SSOT dans `services/agent`

## Objectifs
Faire rejoindre `services/agent` à la source unique `@meeshy/shared/utils/
object-id` déjà adoptée par le gateway, le web et le package shared — sans
changer le comportement — et couvrir la borne de confiance de `routes/config.ts`
jusque-là non testée.

## Modules affectés
- `services/agent/src/routes/config.ts` (2 schémas Zod).
- `services/agent/src/routes/reading.ts` (commentaire d'exception uniquement).
- `services/agent/src/__tests__/config/config-route.test.ts` (nouveau).

## Phases
1. **RED/caractérisation** — écrire `config-route.test.ts` couvrant les deux
   endpoints (chemin heureux + rejet 400 des ObjectId malformés) ; vérifier
   qu'il passe sur le code inline actuel (filet de sécurité du refactor). ✅
2. **GREEN/refactor** — remplacer les deux littéraux de `config.ts` par
   `OBJECT_ID_REGEX` importé du SSOT ; re-run des tests. ✅
3. **Décision de portée** — `reading.ts` reste inline (preuve d'imports G-126) ;
   documenter par commentaire. ✅
4. **Validation** — suite complète agent + `tsc --noEmit`. ✅

## Dépendances
`@meeshy/shared/utils/object-id` (module feuille déjà construit dans
`packages/shared/dist`, déjà résolu par le jest et le tsconfig de l'agent).

## Risques estimés
Très faibles (behavior-preserving, regex strictement identique, module feuille).

## Stratégie de rollback
Revert du commit unique de l'itération.

## Critères de validation
- 306 tests agent verts (296 existants + 10 nouveaux).
- `tsc --noEmit` exit 0.
- Aucun littéral ObjectId résiduel hors exceptions documentées.

## Statut d'achèvement
**Terminé.** Toutes les phases livrées et validées localement.

## Suivi de progression
- [x] Phase 1 — test de caractérisation vert sur code inline.
- [x] Phase 2 — refactor `config.ts` vers le SSOT.
- [x] Phase 3 — exception `reading.ts` documentée.
- [x] Phase 4 — validation complète.

## Améliorations futures
- Consolider `scripts/lib/embedded-reactions-to-rows.ts` si les scripts
  gagnent un accès stable au SSOT partagé (priorité moindre — script isolé).
