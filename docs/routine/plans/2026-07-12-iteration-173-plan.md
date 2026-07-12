# Iteration 173 — Plan : `totalConversations` = conversations actives uniquement

## Objectif
Cesser de compter les conversations quittées / bannies / supprimées dans les
statistiques utilisateur et le succès « Connecteur ».

## Modules affectés
- `services/gateway/src/routes/user-stats.ts` (`computeUserStats`)
- `services/gateway/src/routes/users/preferences.ts` (`getUserStats`)
- Tests : `user-stats.test.ts`, `preferences-stats.test.ts`

## Phases
1. **RED** — durcir les doubles `participant.count` pour honorer `isActive`,
   ajouter les tests de comptage actif-seul + assertions de `where`.
2. **GREEN** — ajouter `isActive: true` aux deux `participant.count` de stats.
3. **VALIDATION** — suites ciblées + répertoire `routes/users` + `tsc`.

## Dépendances
Aucune (changement local, contrat d'API inchangé).

## Risques
Faible. Le seul changement de comportement est la correction voulue : un
utilisateur ayant quitté des conversations voit un `totalConversations` plus bas
(exact). Aucune migration de données. Rétro-compatible côté clients (même forme).

## Stratégie de rollback
Révert du commit unique — les deux hunks sont indépendants et purement additifs
(`isActive: true`).

## Critères de validation
- [x] Tests RED écrits et rouges avant fix
- [x] `user-stats` + `preferences-stats` verts (27 tests)
- [x] `routes/users` complet vert (401 tests)
- [x] `tsc --noEmit` exit 0
- [x] Contrat d'endpoint `UserStats` inchangé

## Statut : COMPLÉTÉ

## Améliorations futures
- Unifier `computeUserStats` / `getUserStats` (deux copies de la logique de
  stats/achievements) pour supprimer le risque de divergence dont ce bug était
  une instance. Nécessite d'harmoniser les formes de requête (`$runCommandRaw`
  vs `message.count` pour les traductions ; résolution id/username).
