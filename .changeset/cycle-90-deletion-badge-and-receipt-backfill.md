---
"@meeshy/gateway": patch
"@meeshy/web": patch
---

Deux compteurs qui mentaient sans jamais se corriger : la pastille après une suppression REST, et les accusés après une coupure socket

## 1. Gateway — les deux transports REST de suppression ne repoussaient pas la pastille de non-lus

Le cycle 89 a câblé le recalcul du badge sur le transport WebSocket
(`MessageHandler.handleMessageDelete`). Les deux transports REST — `DELETE /messages/:id`
(celui d'Android) et `DELETE /conversations/:id/messages/:messageId` (celui du SDK iOS) —
ne le faisaient pas : le lecteur voyait le message disparaître pendant que sa pastille
continuait de le compter. La liste de conversations du web tourne en `staleTime: Infinity`,
donc sans poussée la valeur ne vieillit pas — **elle ment, indéfiniment**.

Le décompte lui-même était déjà juste (`getUnreadCountsForParticipants` filtre
`deletedAt: null`) : il ne manquait que de le **redemander**.

La poussée vit dans `broadcastMessageMutation`, l'unique broadcaster des cinq routes de
mutation REST — donc écrite **une seule fois** pour les deux suppressions. Les trois autres
appelants sont des éditions, et une édition ne change aucun compte : le badge n'y est pas
touché, ce qui aurait coûté deux requêtes par frappe validée pour zéro delta.

**L'exclusion porte sur l'AUTEUR (`authorId`), jamais sur l'acteur** : un modérateur qui
retire le message d'un autre est lui-même un destinataire dont la pastille doit bouger.
C'est le contraire de la file hors ligne, dix lignes plus bas, qui exclut bien l'acteur.

**C'est le TYPE qui tient la règle**, pas la vigilance : `MessageMutationParams` est une
union discriminée où `authorId` est **requis** sur `eventType: 'deleted'` et **absent** de
`'edited'`. Un sixième transport de suppression ne compile pas sans nommer l'auteur — les
deux callsites REST ont d'ailleurs été trouvés par `tsc`, pas par lecture.

La table du § « La pastille de non-lus » de `socketio/README.md` annonçait TROIS transports
REST de suppression, et les disait dépourvus d'aperçu de liste. Vérification faite : il y en
a **deux**, et ils émettent bien `emitConversationPreviewUpdate` depuis qu'ils passent par
`broadcastMessageMutation`. Le document est corrigé.

## 2. Web — les accusés de lecture n'étaient jamais re-synchronisés après une coupure socket

Le lot REST `messagesService.getReadStatuses` est gardé par une clé
`${conversationId}:${dernier message à soi}` : il ne se relance donc que lorsqu'on **ENVOIE**
un nouveau message. Et `conversation:join` ne re-émet aucun `read-status:updated`.

Depuis que le cycle 85 a rendu ces compteurs **monotones** (`isStaleReceipt` rejette tout
résumé qui recule à `totalMembers` inchangé), un `read-status:updated` manqué pendant une
coupure n'est plus une valeur en retard qu'un événement suivant corrigerait : c'est un **gel
permanent**. L'expéditeur regarde une coche « remis » sur un message que tout le monde a lu,
jusqu'à ce qu'il en envoie un autre.

Le hook rattrapait déjà les MESSAGES manqués sur le front montant de la reconnexion
(« Trigger 1 » → `syncNewerMessages`). Ce front est désormais compté **une seule fois**
(`reconnectEpoch`, en tête du hook) et sert les deux dettes du même instant : les messages
manqués et les accusés manqués. La détection de front, qui était dupliquée pour le premier
et absente pour le second, n'existe plus qu'en un endroit.

## Vérification

- **RED prouvé avant chaque correctif** : la pastille au niveau de l'unité partagée ET des
  deux routes (le type impose de passer *une* identité ; seuls les tests de route disent
  LAQUELLE) ; le rattrapage des accusés par un cycle connecté → coupé → reconnecté sans
  envoi de message.
- **Suite gateway complète verte** : 680/680 suites, 16 847/16 847 tests.
  `tsc --noEmit` gateway : 0 diagnostic.
- **Suite web complète verte** : 564/564 suites, 12 122 tests passés, 21 ignorés.
- **Réserve honnête sur le typecheck web** : `tsc --noEmit -p tsconfig.json` rend **1 224
  diagnostics, tous situés dans `__tests__/**`, et strictement PRÉ-EXISTANTS** — le même
  compte exactement, mesuré sur l'arbre stashé. Ce travail n'en ajoute aucun, et aucun ne
  porte sur un fichier qu'il touche. Le décompte n'a pas été assaini (hors périmètre) mais
  il est consigné ici pour que le prochain cycle ne le découvre pas comme une nouveauté.
- Le test de rattrapage a d'abord été écrit avec `waitFor` et s'est révélé **flaky sous la
  suite complète** (564 suites en parallèle, délai par défaut d'une seconde dépassé). Il
  asserte désormais directement après `rerender` — le front monté relance le lot de façon
  synchrone, il n'y avait rien à attendre. RED/GREEN re-prouvé sous cette forme.
