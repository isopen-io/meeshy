# Iteration 173 — `totalConversations` sur-comptait les conversations quittées / bannies / supprimées

## Symptôme
Les statistiques utilisateur (`totalConversations`) et le succès
« Connecteur » (« Rejoindre 10+ conversations », seuil 10) comptaient **toutes**
les conversations jamais rejointes par l'utilisateur — y compris celles qu'il a
quittées, dont il a été banni, ou qu'il a masquées via « supprimer pour moi ».
Un utilisateur actuellement dans 5 conversations mais en ayant quitté 8 + banni
de 2 voyait `totalConversations = 15` et débloquait « Connecteur » à tort.

## Cause racine
`Participant` n'est **jamais** hard-delete : quitter / bannir / « delete for me »
passe la ligne en `isActive: false` (+ `leftAt` / `bannedAt`) :
- `routes/conversations/leave.ts:66` → `isActive: false, leftAt`
- `routes/conversations/participants.ts` → `isActive: false, leftAt`
- `routes/conversations/ban.ts:81` → `bannedAt, isActive: false, leftAt`
- `routes/conversations/delete-for-me.ts` → `isActive: false`

Deux implémentations parallèles du calcul de stats comptaient les participants
avec un filtre nu `{ userId }`, **sans** `isActive: true` :
1. `routes/user-stats.ts:61-63` — `computeUserStats` (endpoints `/users/me/stats*`)
2. `routes/users/preferences.ts:414-416` — `getUserStats` (endpoint public `/users/:userId/stats`)

Le reste du codebase filtre uniformément l'appartenance active :
`ConversationStatsService.computeStats` (`isActive: true`),
`PostFeedService.getDirectConversationContactIds`, le dashboard admin, et —
révélateur — les compteurs de complétion de profil **dans le même fichier**
`preferences.ts:117,123` (`isActive: true`). Les deux compteurs de stats étaient
les seuls outliers.

## Impact
- **Métrique** : `totalConversations` gonflé de façon monotone (n'inclut jamais
  de décrément) — l'utilisateur ne peut pas voir ce chiffre baisser en quittant.
- **Gamification** : succès « Connecteur » débloqué / `progress: 1.0` de façon
  erronée pour des utilisateurs actifs dans < 10 conversations.
- **Sémantique** : compter des conversations dont on a été **banni** ou qu'on a
  **explicitement supprimées** est faux sous toute interprétation.

## Correctif (TDD)
- **RED** :
  - `user-stats.test.ts` : le double `participant.count` honore désormais le
    filtre `isActive` (retourne le compte actif si `where.isActive === true`,
    sinon le compte historique). 2 nouveaux tests : comptage actif-seul (5 vs 15
    + « Connecteur » verrouillé), et assertion du `where: { userId, isActive: true }`.
  - `preferences-stats.test.ts` : 1 nouveau test assertant que `getUserStats`
    filtre `participant.count` par `isActive: true`.
  Les 3 échouaient sur le code actuel (`where: { userId }` seul).
- **GREEN** : ajout de `isActive: true` aux deux `participant.count` de stats.

## Vérification
- `user-stats` + `preferences-stats` : 3 suites / 27 tests verts.
- Répertoire `routes/users` complet : 26 suites / 401 tests verts.
- `tsc --noEmit` : exit 0.
- Contrat d'endpoint inchangé (forme `UserStats` identique iOS) — corrige
  uniquement le périmètre du comptage.

## Environnement
Linux (pas de toolchain Swift/Xcode). Surface 100 % TypeScript testable en
isolation via le stub prisma. `bun install --ignore-scripts` + `prisma generate`
+ `bun run build` (shared) + `jest`.

## Dette résiduelle (hors périmètre)
`computeUserStats` (user-stats.ts) et `getUserStats` (preferences.ts) restent
**deux copies** de la même logique de stats/achievements (seuils, mapping,
member-days). Une unification vers `computeUserStats` unique éliminerait ce
risque de divergence (dont ce bug était une manifestation), mais les formes de
requête diffèrent — `getUserStats` utilise `$runCommandRaw` pour les traductions
et résout l'utilisateur par id/username. Candidat pour une itération dédiée.
