# Cycle — Annuler / reproduire les notifications sur retrait & édition

## Constat
Le retrait DUR était déjà couvert (famille `retract*` : message, post,
commentaire, demande d'ami — celle-ci sur `DELETE /friend-requests/:id`, qui
couvre l'annulation par l'expéditeur ET le retrait par le destinataire). Deux
trous restaient, et ce sont exactement ceux de la demande.

## Fait
- [x] 1. `retractReactionNotifications` — jumeau « réaction » de la famille
      `retract*`, scopé par la conjonction (type × cible × acteur × emoji).
- [x] 2. Câblé sur TOUS les transports de retrait de réaction :
      - message : handler socket, `DELETE /reactions/…`, route conversations
        avancée — via la source unique `notifyReactionRemoved` ;
      - post : handler socket (cible RÉSOLUE) + `unlikePost` (où vit `foundEmoji`) ;
      - commentaire : handler socket + `DELETE …/comments/:id/like`.
      - SWAP d'emoji (`replacedEmojis`) sur les deux chemins d'ajout.
- [x] 3. `reproduceEditedMessageNotifications` — réécriture EN PLACE (donc
      `isRead` survit) + annonce en couple `notification:deleted` +
      `notification:new`. Substitution de PRÉFIXE (le corps est l'extrait suivi
      des badges de pièces jointes) + purge de la traduction embarquée.
- [x] 4. `reproduceEditedSubjectNotifications` — jumeau post/commentaire. Ici
      l'extrait est SERTI au milieu d'une phrase composée, donc substitution de
      l'ANCIEN EXTRAIT lui-même, lu en métadonnée.
- [x] 5. Câblé sur `applyMessageEditEffects` (4 transports d'un coup),
      `PostService.updatePost` (post/story/réel) et
      `PostCommentService.updateComment` (borné à `contentChanged`).
- [x] 6. `comment_reaction` range désormais son extrait en métadonnée : sans
      cela, ce type — et lui seul du fil — n'aurait jamais pu être réécrit.

## Revue
- 4 modules neufs, 44 tests neufs. Suite gateway : **701 suites / 17 218 tests
  vertes**, `tsc --noEmit` propre.
- Arbitrage central : réécriture en place plutôt que `delete` + `create`. Un
  `create` ferait repasser en NON LUE une notification consommée — la moindre
  correction de faute de frappe re-sonnerait et remonterait le compteur.
  L'annonce, elle, EST un couple annuler/reproduire : c'est le seul vocabulaire
  que web et iOS savent déjà recevoir (pas d'événement « modifiée »).
- Limite assumée : un message à pièce jointe SANS légende dont l'édition AJOUTE
  une légende garde son libellé de pièce jointe comme corps (le libellé reste
  exact, il ignore la légende). Documenté dans `rewriteBody`.
