---
"@meeshy/web": patch
---

Les accusés de lecture ne reculent plus — un instantané REST en retard ne repeint plus les coches bleues en gris

Deux écrivains alimentent `readStatusSummaries` / `messageReadStatuses`, et un seul des deux est
ordonné :

- le **socket** (`presence.service.ts` → `updateReadStatusSummary`) — ordonné par connexion, il
  porte toujours l'état le plus frais que le serveur connaisse ;
- le **lot REST** (`use-conversation-messages-rq.ts` →
  `messagesService.getReadStatuses(…).then(updateMessageReadStatusBatch)`) — un INSTANTANÉ pris au
  départ de la requête, appliqué au retour, **sans garde d'ordre**. `updateMessageReadStatusBatch`
  faisait un `{ ...state.messageReadStatuses, ...statuses }` : le dernier arrivé écrasait, quelle
  que soit son ancienneté.

La fenêtre n'est pas une curiosité de démarrage à froid. La clé de garde du lot
(`batchFetchedRef`) est indexée sur l'id du dernier message propre : **chaque envoi de message
relance la lecture REST**. Il suffit donc qu'un pair lise un message pendant que la requête est en
vol pour que l'instantané, parti avant cette lecture, atterrisse après elle.

Et la régression est VISIBLE : `DeliveryIndicator` rend `readCount > 0` en **double coche bleue**
et `readCount === 0 && deliveredCount > 0` en **double coche grise**. Perdre cette course fait donc
passer les coches au bleu puis les ramène au gris — et elles restent fausses jusqu'à ce qu'un
prochain accusé passe par là. Le même écrasement pouvait aussi « dé-livrer » un message
(`deliveredCount` qui redescend).

**Le correctif** : un unique prédicat `isStaleReceipt(current, incoming)` dans le store, appliqué
par les TROIS écrivains (`updateReadStatusSummary`, `updateMessageReadStatus`,
`updateMessageReadStatusBatch`) — un seul énoncé de la règle, là où l'état vit, plutôt qu'une garde
recopiée chez chaque appelant.

Trois décisions, chacune verrouillée par un test.

**`totalMembers` est le discriminant, et il empêche la garde de figer les compteurs à vie.** Les
accusés ne sont croissants que pour un effectif FIXE. Quand quelqu'un quitte la conversation, le
serveur recompte sur les survivants et rapporte légitimement moins de lectures. Un `totalMembers`
qui bouge signifie donc que l'instantané décrit une autre conversation : il gagne sans condition.

**Un résumé qui recule est rejeté ENTIER, jamais fusionné champ par champ.** Un maximum par champ
synthétiserait un état qu'aucun serveur n'a jamais rapporté, alors que c'est précisément
`readCount >= totalMembers` qui pilote la branche « lu par tous » de l'indicateur. Chaque résumé
stocké reste un instantané serveur réel.

**Le lot filtre par ENTRÉE, pas en tout-ou-rien.** Un message dont l'instantané a perdu sa course ne
doit pas coûter au lot les accusés qu'il porte pour tous les autres. Et le miroir vers le dernier
message propre (`updateReadStatusSummary` écrit aussi `messageReadStatuses[latestOwnMsgId]`) est
gardé sur SA propre histoire, pas sur celle de la conversation : le lot REST écrit cette entrée
directement, elle peut donc légitimement être en avance sur le résumé conversationnel.

Vérification : 10 tests neufs (`conversation-ui-store-read-receipts.test.ts`), rouges avant
(6 échecs / 10) et verts après. **Mutation appliquée et vérifiée — 7 réversions, 7 rouges** :
prédicat neutralisé, discriminant `totalMembers` retiré, garde du lot retirée, garde du miroir
retirée, garde de `updateMessageReadStatus` retirée, garde conversationnelle retirée, `||` changé
en `&&`. Restauré, re-vérifié vert. Suite web complète : **563/563 fichiers, 12 077 tests verts**.
`tsc --noEmit` : 1 757 diagnostics avant comme après, aucun dans les fichiers touchés.
