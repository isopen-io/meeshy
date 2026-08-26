# Itération 269 — Plan : SSOT de troncature d'aperçu sûre pour l'UTF-16

## Objectifs
Supprimer le substitut orphelin (`�`) en fin des sept troncateurs d'aperçu de
notification servis, en les collapsant sur une SSOT sûre par points de code.

## Modules affectés
- **Nouveau** : `services/gateway/src/utils/truncate-text.ts` + test.
- `services/gateway/src/services/messaging/reproduceEditedMessageNotifications.ts`
- `services/gateway/src/services/posts/reproduceEditedSubjectNotifications.ts`
- `services/gateway/src/services/notifications/NotificationService.ts` (5 sites)

## Phases
1. **RED** — `truncate-text.test.ts` : orphan surrogate, cap points de code,
   suffixe conditionnel, passthrough court, cap sans suffixe.
2. **GREEN** — `truncateByCodePoints(content, maxCodePoints, ellipsis = '')`.
3. **Câblage** — remplacer les sept `.substring(0, N)` ; supprimer les deux
   `truncatePreview` dupliqués et leurs usages.
4. **Validation** — test util + suites `reproduce*` + suites NotificationService
   atteignables + suite gateway complète.

## Dépendances
Aucune (util pur, pas de nouvelle dépendance).

## Risques estimés
Faible : sur-ensemble strict de correction ; changement invisible pour l'ASCII.
Seul point d'attention : le compteur de garde passe en points de code (#1/#2/#3).

## Stratégie de rollback
Revert du commit unique ; util isolé sans autre consommateur.

## Critères de validation
Voir analyse § Critères. CI gateway verte.

## Statut
- [x] Analyse
- [x] RED (module absent + assertion de substitut orphelin)
- [x] GREEN (`truncateByCodePoints`, 7 tests verts)
- [x] Câblage (7 sites, 3 fichiers ; 2 `truncatePreview` dupliqués supprimés)
- [x] Validation (`tsc` 0 erreur ; 48 + 173 + 8 témoins verts sur les suites touchées)
- [ ] Merge (PR ouverte, CI en attente)

## Améliorations futures
- Sûreté par grappe de graphèmes (ZWJ/drapeaux) si un besoin produit émerge —
  hors scope ici (le bug fermé est la demi-paire, pas la grappe).
- Étendre l'audit aux troncateurs d'aperçu web/iOS si non déjà sûrs.
