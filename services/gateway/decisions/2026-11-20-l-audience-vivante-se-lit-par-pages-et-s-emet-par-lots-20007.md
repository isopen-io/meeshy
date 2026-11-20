# L'audience vivante d'une conversation se lit par PAGES et s'émet par LOTS (2026-11-20, #20007)

## La décision

Les cinq familles de mutation qui ne portent que des **ids** — `message:deleted`,
`message:expired`, `message:pinned`, `message:unpinned`, et les deux faits de vue
unique (`message:consumed`, `message:view-once-purged`) — s'adressent à la room
de conversation **et** aux rooms personnelles des participants vivants
(#18556, #19943). Cette audience se lit désormais **page par page au curseur**
et s'émet **par lots**, une page lue valant une émission faite.

- `LIVE_AUDIENCE_PAGE` = 2 000 : la taille d'une page de lecture ET d'un lot
  d'émission. C'était le PLAFOND de #18556, au-delà duquel l'audience était
  **jetée** (`return []`) et l'appelant repliait sur `conversation:<id>` seule.
  Le nombre survit, sa conséquence non.
- `LIVE_AUDIENCE_MAX_PAGES` = 25 : la borne DURE, à 50 000 participants vivants.
  Elle existe pour qu'une boucle de pagination sur une table vivante ne tourne
  pas sans fin — **pas** pour borner un coût : l'enfilage hors ligne de la même
  mutation relit ces mêmes lignes sans plafond ni pagination, quelques lignes
  plus bas dans le même appel (#20020). Quand elle tronque, elle le
  **journalise** : la perte d'avant ce lot était muette.
- La lecture rend `{ batches, complete }`. `complete: false` dit « la lecture
  n'a pas nommé toute l'audience » (panne de page, ou troncature) ; un `batches`
  vide sous `complete: true` dit « il n'y a aucun participant vivant ». Les deux
  sortaient par la même valeur (`[]`), et tant qu'elles se ressemblent cette
  liste ne peut pas être remise à la file hors ligne, dont la garantie est
  DURABLE — `[]` y vaut « personne » et n'enfile pour personne (cycle 116).
- Une panne à la page *n* **garde** les *n-1* pages prouvées : fail-OPEN sur la
  livraison, ces charges ne portant que des ids. Une lecture qui ne prouve rien
  replie sur la room de conversation seule, comme avant #18556 — jamais sur
  rien.

## Ce que la décision ASSUME

Socket.IO ne dédoublonne que par ÉMISSION. À plusieurs lots, les lots sont des
portées de dédoublonnage DISJOINTES : un socket présent dans la room de
conversation (premier lot) **et** dans sa room personnelle d'un lot ultérieur
reçoit l'événement **deux fois**.

C'est accepté, et borné par trois faits :

1. cela n'arrive qu'au-delà de 2 000 participants **vivants** ;
2. les cinq familles ne portent que des ids, dont l'application est IDEMPOTENTE
   chez les trois clients — le web l'écrit sur son propre site
   (`realtime-message-pin.ts` : « Rejouée, l'écriture ne change rien ») ;
3. ces émissions ne sont pas estampillées par `emitWithSeq`, donc un doublon ne
   ressemble jamais à un TROU de séquence pour le SyncEngine.

L'alternative EXACTE — `.except(ROOMS.conversation(id))` sur les lots suivants —
exige d'élargir la porte d'émission (`ServerEmitIO`) chez ses trois porteurs et
tous leurs doubles. Elle n'est pas écartée : elle est à son prix, et c'est
**#20021**.

## Ce que la décision ne change pas

- **L'ÉDITION garde son audience propre**, gardée par `readership`
  (`editedAudience.ts`) : son texte n'est pas un id.
- **La révélation d'EXISTENCE** d'un message hors du plancher d'historique est
  inchangée — élargir l'audience des familles d'ids élargit d'autant la
  population qui apprend qu'un id existe, ce qui était déjà vrai de #18556 et de
  #19943. Suivie par **#17029** (la décision produit) et **#18681** (le rejeu).
- **La participation BANNIE n'est pas nommée** : la loi reste
  `PARTICIPATION_VIVANTE` (`isActive: true` et `bannedAt` nul ou absent), et elle
  a désormais son témoin — retirer la clause `bannedAt` fait rougir quatre
  témoins d'audience, contre aucun avant ce lot.

## Sites

`socketio/conversationAudienceRooms.ts` (`loadLiveAudience`,
`conversationAudienceRoomBatches`, `filterLiveAudience`), consommé par
`broadcastMessageMutation`, `broadcastViewOnceFact` et
`MessageHandler.handleMessageDelete`. Double de test paginé :
`__tests__/helpers/live-audience-double.ts`.
