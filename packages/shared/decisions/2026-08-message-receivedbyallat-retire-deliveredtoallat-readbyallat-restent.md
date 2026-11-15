## 2026-08: Message.receivedByAllAt — retire; deliveredToAllAt/readByAllAt restent, mais CALCULES
**Statut**: Accepte
**Contexte**: Le modele `Message` porte cinq champs de statut denormalises (`deliveredToAllAt`,
`receivedByAllAt`, `readByAllAt`, `deliveredCount`, `readCount`). Le passage au suivi par curseurs a
vide leur unique ecrivain: `MessageReadStatusService.updateMessageComputedStatus` est depuis un
no-op documente («Computed fields are no longer stored on Message to improve write performance»).
Sur toute la collection, les trois dates valent donc `null` et les deux compteurs zero. Les
compteurs ont ete rebranches sur la source de verite aux deux cycles precedents; les DATES ne
l'avaient pas ete.
**Decision**: `receivedByAllAt` SORT — modele Prisma, `MessageEntity` (`types/message-types.ts`),
`ConversationMessage` (`types/conversation.ts`), `messageSchema` (`types/api-schemas.ts`) et les deux
`select` du gateway. Il n'a ni ecrivain NI lecteur: aucun client des quatre plateformes ne le decode
(verifie par grep sur `apps/web`, `apps/ios`, `apps/android`, `packages/MeeshySDK`). Ses deux
voisines RESTENT declarees et servies, mais CALCULEES par
`MessageReadStatusService.getConversationReadStatuses` — l'instant du dernier destinataire servi,
`null` tant qu'il en manque un.
**Alternatives rejetees**: Retirer les trois d'un meme geste — `deliveredToAllAt` et `readByAllAt`
ont de VRAIS lecteurs (`DeliveryStatusResolver` iOS et Android, `MessageRecord+ToMessage`,
`MessagePersistenceActor`), qui traitent `!= null` comme la preuve que tous ont lu; les retirer
casserait trois decodeurs pour un defaut qui se repare. Reactiver l'ecriture des colonnes —
c'est la decision d'archi que le passage aux curseurs a prise a l'envers; deriver a la lecture ne
coute aucune requete de plus.
**Cons**: Retrait d'un champ d'API publiee. Sans consequence connue: il ne pouvait valoir que `null`
et n'avait aucun decodeur. Aucune migration MongoDB — Prisma cesse de mapper la cle, les documents
existants la gardent inerte. `deliveredCount` / `readCount` restent declares sans ecrivain: ils ont,
eux, des lecteurs clients et sont deja servis calcules; leur retrait est un lot distinct.
