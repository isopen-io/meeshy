# Cycle — Annuler / reproduire les notifications sur retrait & édition

## Constat
Le retrait DUR est déjà couvert (famille `retract*` : message, post, commentaire,
demande d'ami). Deux trous restent, et ce sont exactement ceux de la demande :

- [ ] **Retrait de réaction** — `reaction:remove` (message, post, commentaire) ne
      retire RIEN. Le « X a réagi ❤️ » survit à la réaction qui l'a produit.
- [ ] **Édition** — `message:edit`, `updatePost`, `updateComment` ne touchent
      aucune notification : la copie DÉNORMALISÉE (`content`, `subtitle`,
      `metadata.postPreview` / `commentPreview` / `messageContent`) garde le
      texte d'AVANT, définitivement.

## Plan
- [ ] 1. `retractReactionNotifications` — jumeau « réaction » de la famille
      `retract*`, scopé (type × cible × acteur × emoji).
- [ ] 2. Câbler les 3 familles de retrait de réaction (message / post / commentaire),
      sur TOUS les transports (socket + REST).
- [ ] 3. `reproduceEditedSubjectNotifications` — l'édition RÉÉCRIT la copie
      dénormalisée puis ré-annonce (`notification:deleted` + `notification:new`).
- [ ] 4. Câbler les 3 chemins d'édition.
