## 2026-08-13 — Les DATES du seuil « tous servis » se calculent ; `receivedByAllAt` sort

**Contexte.** Les deux entrées précédentes ont ramené les COMPTEURS d'accusés à leur unique source
de vérité (`MessageReadStatusService.getConversationReadStatuses`, union curseur/reçu figé, opt-out
`showReadReceipts` retiré du numérateur comme du dénominateur). Elles ont laissé une couche
au-dessus intacte : les DATES de seuil `deliveredToAllAt` / `readByAllAt` sortaient encore de la
ligne `Message`.

**Le défaut.** `MessageReadStatusService.updateMessageComputedStatus` est un **no-op documenté**
depuis le passage aux curseurs — « Computed fields are no longer stored on Message to improve write
performance ». Aucun autre site n'écrit ces colonnes : sur toute la collection, elles valent `null`.
Or `GET /conversations/:id/messages` et `GET /messages/:messageId` les relayaient telles quelles, et
les **trois clients** lisent `readByAllAt != null` comme la PREUVE que tous les destinataires ont lu
(`DeliveryStatusResolver` iOS et Android, `MessageRecord+ToMessage`, `MessagePersistenceActor`).
La branche `!= null` de leurs résolveurs était donc morte depuis le passage aux curseurs, et le
serveur promettait dans son schéma OpenAPI un horodatage « lu par TOUS » qu'il ne pouvait jamais
produire.

**Décision.** `getConversationReadStatuses` rend désormais aussi `deliveredToAllAt` / `readByAllAt`,
dérivés de la MÊME union que les compteurs : l'instant du **dernier** destinataire servi, `null`
tant qu'il en manque un (`count >= totalMembers`). Les deux routes les servent de là et ne
`select`ent plus aucune des cinq colonnes dénormalisées de statut.

**`receivedByAllAt` est RETIRÉ entièrement** — Prisma, `MessageEntity` (`message-types.ts`),
`ConversationMessage` (`conversation.ts`), `messageSchema` (`api-schemas.ts`) et les deux `select`.
Contrairement à ses deux voisines, il n'a **ni écrivain ni lecteur** : aucun des trois clients ne le
décode (vérifié par grep sur `apps/web`, `apps/ios`, `apps/android`, `packages/MeeshySDK`). C'est le
cas du cycle 100 à l'état pur, et il sort avec ses déclarations.

**Alternatives rejetées** :
- **Retirer les trois d'un même geste**, comme la note de suivi le proposait. Refusé après relecture
  du code plutôt que de la note : `deliveredToAllAt` / `readByAllAt` ont de VRAIS lecteurs sur iOS,
  Android et le SDK. Les retirer du contrat aurait cassé trois décodeurs pour supprimer un défaut
  qui se répare. Un champ mort à l'ÉCRITURE et un champ mort tout court ne se traitent pas pareil.
- **Réanimer les colonnes** en réactivant `updateMessageComputedStatus`. C'est la décision d'archi
  que le passage aux curseurs a explicitement prise à l'envers (une écriture par accusé et par
  message) ; la dériver à la lecture coûte zéro requête de plus, tout étant déjà chargé.
- **Ajouter une garde `totalMembers > 0`** au seuil : `totalMembers` ne vaut zéro que si l'ensemble
  des destinataires évalués est vide, auquel cas les deux maxima sont `null` de toute façon. La
  garde serait du code qu'aucun test ne peut rougir.

**Conséquences** :
- Un client voit enfin `readByAllAt` se remplir. La valeur est celle du serveur (opt-out retirés),
  plus exacte que le `readCount >= recipientCount` local sur lequel les résolveurs retombaient.
- `receivedByAllAt` disparaît des charges utiles. Retrait d'un champ d'API publique, mais qui ne
  pouvait valoir que `null` et que personne ne décodait — les données Mongo existantes ne sont pas
  touchées, Prisma cesse simplement de mapper la colonne.
- `deliveredCount` / `readCount` restent déclarés en base sans écrivain : ils ont, EUX, des lecteurs
  clients et sont déjà servis calculés. Leur retrait de Prisma est un lot distinct.
