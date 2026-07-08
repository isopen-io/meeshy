# Iteration 142 — Plan d'implémentation (2026-07-08)

**Note de renumérotation (merge PR #1661 vers main, 2026-07-08)** : documenté en session sous le numéro
**141** ; PR #1659 (`R-AR1`, idempotence `attachment:reaction`) a mergé sur `main` sous ce même numéro en
parallèle — collision de numérotation entre sessions concurrentes, pas de conflit de contenu. Renumérotée
**142** (prochain numéro libre sur `main`) au moment de la résolution du conflit de merge ; le plan
ci-dessous est inchangé.

## Objectifs
Corriger F109 : rattacher correctement la tranche du matin d'une fenêtre DND nocturne au jour de **début**
de la fenêtre dans `PushNotificationService.isPushAllowed`, pour que le mode Ne-Pas-Déranger respecte la
sémantique « silence de la nuit du jour choisi ».

## Modules affectés
- `services/gateway/src/services/PushNotificationService.ts` (bloc DND de `isPushAllowed`).
- `services/gateway/src/__tests__/unit/services/PushNotificationService.test.ts` (2 tests ajoutés).
- `docs/routine/analyses/2026-07-08-iteration-142-analyse.md`, `docs/routine/plans/2026-07-08-iteration-142-plan.md`
  (renumérotés depuis 141, voir note de renumérotation ci-dessus).

## Phases
1. **RED** — Ajouter 2 tests (tranche du matin bloquée / autorisée selon le jour de début) — échouent sur le code actuel.
2. **GREEN** — Réécrire le bloc DND : `inWindow` d'abord, puis `dndDays` testé contre le jour de début
   (`(getUTCDay()+6)%7` pour la tranche du matin nocturne, sinon jour courant), puis `if (inWindow) return false`.
3. **VALIDATION** — Suite `PushNotificationService.test.ts` complète verte (5 existants + 2 nouveaux), `tsc --noEmit`.

## Dépendances
Aucune (fonction pure de `Date`, aucun changement de schéma / d'API / de contrat externe).

## Risques estimés
Faible. Modification confinée à la tranche du matin d'une fenêtre nocturne avec `dndDays` non vide. Les autres
branches (fenêtre intra-journée, soir nocturne, hors-fenêtre, `dndDays` vide) sont inchangées.

## Stratégie de rollback
Revert du commit unique. Aucune migration, aucun état persistant modifié.

## Critères de validation
- [x] 2 tests de non-régression ajoutés (les deux sens du bug).
- [ ] 5 tests DND existants toujours verts.
- [ ] `tsc --noEmit` gateway propre.
- [ ] Suite gateway sans régression.

## Statut d'achèvement
- [x] Analyse rédigée.
- [x] Fix implémenté.
- [x] Tests ajoutés.
- [ ] Validation locale (bun).
- [ ] Merge dans `main` + suppression branche.

## Améliorations futures
- F110 : `deviceLocale` dans `getUserLanguagePreferences`.
- F108 : nettoyage `MessageValidator.checkPermissions`.
- Alignement casse du match de langue de `MediaVideoCard` sur ses jumeaux quand le composant sera câblé.
- Décision produit séparée : `dndStartTime/dndEndTime` en heure locale utilisateur plutôt qu'UTC.
