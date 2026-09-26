## 2026-08-13 : Un accusé NOMINATIF se tait comme un compteur — et une page de statuts a une borne

**Contexte.** Le cycle précédent avait unifié le comptage des accusés sur
`MessageReadStatusService` et laissé, explicitement, deux surfaces de la même famille : elles
servaient leur résumé DEPUIS les colonnes `deliveredCount`/`readCount`/`deliveredToAllAt`/
`readByAllAt` de la ligne `Message` — des champs sans écrivain, donc `{0, 0, null, null}` sur toute
la collection. `GET /conversations/:id/status` se contredisait ainsi **dans la même charge utile** :
un résumé à zéro à côté d'`entries` qui portaient, elles, les vraies dates de lecture.

**Le défaut n'était pas seulement une valeur fausse.** Ces `entries` exposent des accusés
**NOMINATIFS** — `participantId`, `displayName`, `avatar`, `username`, `readAt` — sans aucun filtre
`showReadReceipts`, alors que les cinq autres lecteurs le posent. Un participant qui avait coupé
ses accusés y voyait sa lecture datée et son nom servis à quiconque pouvait lire la conversation.
Une fuite plus directe que celle fermée au cycle précédent : là un compteur, ici une identité et
un horodatage. Et la requête n'avait **aucune borne** — chaque message non supprimé de la
conversation, avec ses entrées de statut et le participant joint sur chacune : sur un fil de
plusieurs dizaines de milliers de messages, un déni de service qu'un simple participant
déclenchait.

**Décision.** Les deux routes délèguent leur résumé à `getConversationReadStatuses`, comme la liste
de messages. `GET /conversations/:id/status` filtre en outre ses `entries` par une nouvelle méthode
publique du service, `filterReadReceiptVisible(participants)`, et borne sa page à
`CONVERSATION_STATUS_PAGE_SIZE = 50` messages les plus récents. `GET /messages/:messageId` écrase
aussi ses champs de PREMIER NIVEAU (`deliveredCount`/`readCount`), que les trois clients décodent
pour leurs coches — les laisser au contenu de la ligne aurait servi zéro ici pendant que la liste
sert le compte réel.

**Pourquoi une méthode publique plutôt que de rendre l'ensemble des exclus.** `filterReadReceiptVisible`
répond à la question telle que l'appelant se la pose — « lesquels ai-je le droit de montrer ? » —
et non « qui s'est retiré ? », dont la seule TAILLE trahirait déjà le nombre de retraits. Le cœur
(`_loadReadReceiptOptOuts`) reste privé.

**Alternatives rejetées** :
- **RETIRER `GET /conversations/:id/status`.** Aucun client des quatre plateformes ne l'appelle
  (vérifié par grep sur `apps/` et `packages/MeeshySDK`), sa fonction est déjà rendue, correctement
  et paginée, par `GET /messages/:messageId/status-details` — l'argument du cycle 100 (« un champ
  mort sort entier ») s'appliquerait. Écarté quand même : supprimer un endpoint d'une API PUBLIÉE
  est une décision produit irréversible, du même genre que celles que cette routine confie à un
  humain. La réparation ferme les trois défauts sans la prendre. **La question reste ouverte et
  mérite d'être posée.**
- **Relire `UserPreference` depuis la route** pour filtrer les `entries` : c'est exactement la
  réimplémentation qui a fait diverger la règle une première fois (§ 2026-08-13, première entrée).
- **Paginer par paramètre de requête** plutôt qu'un plafond fixe : ajoute un contrat à un endpoint
  sans consommateur. Le plafond suffit à fermer le déni de service ; le détail exhaustif d'un
  message précis vit derrière la route paginée qui existe déjà.

**Conséquences** :
- `summary` gagne `recipientCount` (dénominateur faisant autorité) et perd `deliveredToAllAt` /
  `readByAllAt`, qui ne pouvaient être que `null`. Aucun client ne les lisait.
- Le plafond de 50 est un CHANGEMENT DE CONTRAT pour un endpoint qui rendait tout : `total` compte
  désormais les messages RENDUS, pas ceux de la conversation. Sans consommateur connu, l'impact est
  nul aujourd'hui ; il est consigné ici pour qui en ajouterait un.
- Un test qui figeait `deliveredCount: 3` sur ce handler a été repointé : il verrouillait une
  valeur que la production ne produit jamais, donc le comportement du double et non celui de la
  route.
