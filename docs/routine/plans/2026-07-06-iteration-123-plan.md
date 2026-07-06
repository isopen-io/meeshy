# Iteration 123 — Plan d'implémentation (2026-07-06)

## Objectifs
Éliminer la divergence de garde de sécurité entre `SecuritySanitizer.sanitizeJSON` et
`SecuritySanitizer.sanitizeMongoQuery` (backlog F87) en extrayant un prédicat unique de « clé
dangereuse » (NoSQL operators + prototype pollution), et durcir `sanitizeMongoQuery` contre la
prototype pollution.

## Modules affectés
- `services/gateway/src/utils/sanitize.ts` (production)
- `services/gateway/src/__tests__/unit/utils/sanitize.test.ts` (tests)
- `docs/routine/analyses/2026-07-06-iteration-123-analyse.md`
- `docs/routine/plans/2026-07-06-iteration-123-plan.md`

## Phases
1. **[fait]** Extraire `private static isDangerousKey(key)` = SSOT du garde
   (`__*` | `$*` | `constructor` | `prototype`).
2. **[fait]** Câbler `sanitizeJSON` sur `isDangerousKey` (comportement inchangé).
3. **[fait]** Câbler `sanitizeMongoQuery` sur `isDangerousKey` (durcissement prototype pollution).
4. **[fait]** Ajouter 5 tests de régression `sanitizeMongoQuery` (prototype-pollution + `__`-prefix).
5. **[fait]** Valider : suite sanitize 196/196, admin sanitization 20/20, tsc clean sur le diff.

## Dépendances
Aucune (fonction pure, pas de nouvelle dépendance).

## Risques estimés
Très faible — élargissement strict de l'ensemble de clés bloquées ; aucune clé légitime impactée ;
`sanitizeJSON` sémantiquement inchangée.

## Stratégie de rollback
Revert du commit unique — les deux fonctions retrouvent leurs gardes inline d'origine.

## Critères de validation
- [x] `sanitize.test.ts` 196/196.
- [x] `user-sanitization.service.test.ts` 20/20 (no reg).
- [x] `tsc --noEmit` sans nouvelle erreur sur `sanitize.ts`.

## Statut de complétion
**Complété.** Diff = extraction du prédicat + 2 call sites + 5 tests + 2 docs routine.

## Progression / Futur
- F88 (truncateFilename clamp défensif), F86 (dedup timestamp), F69/F74/F75/F78/F80/F81/F82b reportés.
- Suivi F87 : la garde prototype-pollution est prête pour un futur câblage middleware de
  `sanitizeMongoQuery`.
