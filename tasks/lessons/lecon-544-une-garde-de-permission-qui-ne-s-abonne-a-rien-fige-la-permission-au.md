## Leçon 544 — Une garde de permission qui ne s'abonne à rien fige la permission au premier rendu

**Contexte** (#5407, même retour porteur). La section « Lieu » de la palette de
stickers affichait « Active la position pour épingler un lieu » alors que la
localisation était active.

**Le défaut.** `stickerNearbyPlacesProvided()` lisait
`CLLocationManager().authorizationStatus` **à la volée, dans une expression de
`body`**. La valeur est juste à cet instant — et rien ne la relit : SwiftUI ne
réévalue un `body` que si un état OBSERVÉ change, et un statut système n'en est
pas un. Un refus puis une autorisation accordée dans Réglages laissait le
fournisseur à `nil` pour toute la session.

> **La question à poser à toute lecture d'autorisation n'est pas « lit-elle la
> bonne propriété ? » mais « que se passe-t-il quand la réponse CHANGE ? »**
> L'API qui le dit existait et n'était pas branchée :
> `locationManagerDidChangeAuthorization(_:)`.

**Le message ne mentait pas — il rendait fidèlement un fournisseur absent.**
C'est ce qui rend ce défaut coûteux à diagnostiquer : la chaîne d'affichage est
correcte de bout en bout, et l'erreur est trois couches plus haut, dans la
FRAÎCHEUR de la valeur injectée.

**Le second manque, en aval.** Le chargement des lieux n'avait qu'un
déclencheur : l'`onAppear` de la section. Une section déjà montée ne réapparaît
pas — une permission fraîchement accordée n'avait donc aucun site où déclencher
la recherche. Sans ce second déclencheur, le correctif aurait fait disparaître
le message sur une grille restée vide : **pire que le message**.

**Forme générale** : quand on rend une valeur d'environnement RÉACTIVE, chercher
tout consommateur dont le déclencheur est un événement de CYCLE DE VIE
(`onAppear`, `task`) — il ne se rejouera pas, et son travail restera à faire.

---
