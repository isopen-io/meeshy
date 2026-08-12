# Iteration 123 — Plan d'implémentation (2026-07-06)

## Objectifs
1. Corriger l'affichage trompeur « 0m » de `formatTimeRemaining` (partagé) durant la dernière minute
   avant expiration d'une story/statut.
2. Supprimer le doublon mort et divergent `formatTimeRemaining` de `apps/web/utils/time-remaining.ts`
   (conserver `isExpired`), rétablissant une source unique pour le formatage « temps restant ».

## Modules affectés
- `packages/shared/utils/time-remaining.ts` (fix 1 ligne + docstring)
- `packages/shared/__tests__/utils/time-remaining.test.ts` (cas frontière sous-minute)
- `apps/web/utils/time-remaining.ts` (suppression fonction morte + docstring)
- `apps/web/__tests__/utils/time-remaining.test.ts` (retaillé sur `isExpired`)

## Phases d'implémentation
1. **[fait]** Clamp `Math.max(1, minutes)` dans la branche sous-heure du helper partagé.
2. **[fait]** Ajout du test frontière (`+1ms`, `+30s`, `+MIN-1` → `1m`).
3. **[fait]** Suppression de la copie web morte (`isExpired` conservé), docstring consolidée.
4. **[fait]** Retaille du test web sur `isExpired` uniquement.
5. **[fait]** Validation `bun` (source TS directe) : 16/16 partagé, 10/10 web ; export mort absent.

## Dépendances
Aucune. Changements purs, sans nouvelle dépendance ni migration.

## Risques estimés
- **Très faibles.** Fix behavior-preserving hors du cas sous-minute ; les 3 appelants rendent la chaîne
  comme texte. Copie web supprimée prouvée sans importeur de production.

## Stratégie de rollback
`git revert` du commit unique. Aucune donnée persistée, aucun format d'API modifié.

## Critères de validation
- [x] 16/16 assertions `formatTimeRemaining` (nouveaux cas + non-régression).
- [x] 10/10 assertions `isExpired`.
- [x] Export `formatTimeRemaining` absent du module web.
- [x] Aucun importeur résiduel de la copie supprimée (full-repo grep).
- [ ] CI verte (jest web + vitest shared) après push.

## Statut de complétion
**Implémentation complète, validée localement (bun).** En attente de CI.

## Suivi de progression / prochaines priorités
- **Prochaine cible candidate (F89)** : extraction pure de `normalizeMarkdown` (web) pour supprimer la
  copie de test dérivée et restaurer une couverture réelle — voir analyse iter 123 § Future improvements.
- Backlog reporté : F87 (unification sanitizers), F88 (clamp `truncateFilename`).
