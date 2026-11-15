## `CommunityMember` d'un compte purgé : désactiver, jamais purger ni ignorer (2026-09-09, #5801)

**Contexte.** #5801 mesurait ce que #5760 (PR #5799) avait explicitement laissé
de côté : aucun des trois chemins de suppression de compte
(`routes/user-deletions.ts`, `routes/account-deletion.ts`,
`routes/me/delete-account.ts`) ne recherche ni ne touche `CommunityMember` —
confirmé par une recherche `communityMember|CommunityMember` sur les trois
fichiers, sans occurrence.

**Ce qui a été mesuré, en réponse aux trois questions posées par l'issue :**

1. **Combien de lignes ?** Non mesurable sans base vivante depuis cette
   session — et non décisif : le verdict ci-dessous ne dépend pas du volume,
   il dépend de ce que la table PORTE.
2. **La suppression de compte anonymise-t-elle déjà `User` ?** Non — à ce
   jour, `User` ne reçoit que `isActive: false` + `deletedAt`. L'anonymisation
   complète (`username`/`email`/`displayName`/`avatar`/…) est l'objet de
   #5691 (ouverte, PR #5700 en cours), qui répète explicitement la décision
   déjà écrite dans `## Suppression de compte` ci-dessus : **`CommunityMember`
   y est classé ANONYMISER**, dans le même groupe que `Participant` — « le
   contenu demeure, l'auteur devient une pierre tombale ».
3. **`CommunityMember` porte-t-il une donnée personnelle au-delà de
   l'identifiant ?** Mesuré sur `schema.prisma` : `role` (chaîne libre,
   `admin`/`moderator`/`member`), `joinedAt`, `leftAt`, `isActive` — rien
   d'identifiant en soi. **Contrairement à `Participant.displayName`
   (#5689), `CommunityMember` ne porte AUCUN champ dénormalisé qui recopie
   l'identité de l'utilisateur.** Son identité vient ENTIÈREMENT de la
   relation `User`, que #5691 anonymisera en place.

**Décision : ni purger, ni ignorer — DÉSACTIVER (`isActive: false` +
`leftAt`).**

- **Ce n'est pas une purge (`deleteMany`).** #4225 a déjà tranché : la
  ligne reste, `User` devient la pierre tombale — dupliquer cette
  anonymisation ici en supprimant la ligne romprait ce que #5691 s'apprête
  à construire, et effacerait au passage un historique de modération
  (qui a été admin/modérateur de quelle communauté) sans bénéfice de
  confidentialité supplémentaire, puisqu'aucune donnée PERSONNELLE ne vit
  sur la ligne elle-même.
- **Ce n'est pas non plus « ne rien faire ».** Contrairement à
  `Participant`, où la ligne active reste correcte tant que le fil de la
  conversation en a besoin, une ligne `CommunityMember.isActive: true`
  d'un compte purgé est un défaut de CORRECTION indépendant de l'identité :
  le compte continue de compter dans les effectifs de la communauté, peut
  y conserver un rôle `admin`/`moderator`, et apparaît dans
  `GET /communities/:id/members` comme membre actif — alors que le compte
  n'existe plus. C'est exactement le défaut que #5760/#5799/#5800 corrigent
  pour un départ vivant ; un compte purgé n'a pas moins « quitté » ses
  communautés qu'un compte qui clique sur `leave`.
- **La forme retenue est donc celle du départ ordinaire** :
  `communityMember.updateMany({ where: { userId, isActive: true }, data: {
  isActive: false, leftAt: now } })` — jamais un `deleteMany`. Câblé dans
  `MaintenanceService.processAccountDeletionRequests()`, au même point que
  la purge des données isolées (#3632), l'anonymisation des messages (#5689)
  et la purge des médias (#5690). Best-effort, idempotent (ne touche que ce
  qui reste actif).

**Ce que cette décision n'exécute PAS** : l'anonymisation de `User`
lui-même (#5691, en cours) — dont dépend la seule PARTIE identifiante de
ce que voit encore la communauté (le nom, l'avatar). Un `CommunityMember`
désactivé aujourd'hui, une fois #5691 mergée, se présentera aux membres de
la communauté comme « ancien membre — Compte supprimé », sans action
supplémentaire de ce lot : c'est précisément parce que `CommunityMember` ne
porte aucune copie de l'identité qu'aucun second correctif n'est nécessaire
ici.
