## 2026-08-13 — Un delta qui ne sait annoncer que des arrivées n'est pas un delta

**Contexte** : `GET /conversations?updatedSince=` est le canal de rattrapage des deux clients
(`ConversationSyncEngine.deltaSyncCore` sur iOS, `useConversationsDeltaSync` sur le web). Il
réutilise le `whereClause` de la liste : conversation `isActive: true`, participant actif sans
`deletedForMe`. Cette clause est exactement ce qu'il faut pour SERVIR une ligne — et exactement ce
qui rend une DISPARITION impossible à exprimer. Une conversation fermée, quittée, dont
l'utilisateur a été banni, ou supprimée-pour-moi depuis un autre appareil ne revient dans aucune
réponse ; les deux clients fusionnant en upsert, rien ne la retire de leur cache avant la
réconciliation complète — 24 h de part et d'autre.

**Décision** : trois lectures ids-only, parallèles, cappées, servies dans
`meta.deletedConversationIds` + `meta.deletedConversationIdsTruncated`
(`routes/conversations/utils/delta-tombstones.ts`). Forme reprise telle quelle de
`meta.deletedStoryIds` sur le tray stories — même geste client, même question.

Trois propriétés non négociables, chacune payée par un défaut réel :
- **Le leave et le ban n'écrivent QUE la ligne `Participant`.** `Conversation.updatedAt` ne bouge
  pas : un stream qui interroge la conversation ne les verrait jamais. C'est pourquoi deux des trois
  lectures portent sur `Participant` et non sur `Conversation`.
- **Le stream « fermées » ne filtre pas sur un participant ACTIF.** Un banni porte
  `isActive: false`, et c'est précisément lui qui doit voir la ligne partir.
- **La troncature se prouve par une sonde `cap + 1`.** Une égalité sur le cap ne prouve rien : une
  fenêtre de très exactement `cap` tombstones est complète, et l'annoncer tronquée déclencherait une
  relecture entière pour rien.

**Alternatives rejetées** :
- **Attendre la collection `conversations` de `/sync`** (gwcontract-10). Le canal existe mais n'a
  aucun client, et son select de messages est encore squelettique : bloquer une purge livrable
  aujourd'hui sur un chantier de contrat, c'est garder les fantômes six mois de plus.
- **Faire échouer la liste quand le calcul des tombstones échoue.** Posture inverse d'un contrôle
  d'autorisation, et délibérée : afficher les conversations est le produit, en retirer une est une
  courtoisie. Le repli est `truncated: true` sur liste vide — le client escalade vers la
  réconciliation complète, qui est exactement son recours.
- **Les deux index composites `Participant` prescrits par la fiche** (`[userId, deletedForMe]`,
  `[userId, leftAt]`). L'index `[userId]` existant borne déjà chaque stream aux quelques centaines
  de lignes de participant de l'utilisateur ; deux index de plus taxeraient chaque écriture de
  participant pour un gain nul. Le seul index ajouté est `Conversation @@index([closedAt])` — le
  seul des trois streams qui ne parte pas d'un `userId` indexé, donc le seul qui balayait la
  collection entière.

**Conséquences** :
- `meta` est déclaré dans `conversationListResponseSchema`. Non déclaré, `fast-json-stringify`
  l'aurait retiré du fil en silence, et aucun témoin de route ne l'aurait vu (ils lisent l'objet
  AVANT sérialisation) — même piège que le `cursorPagination` documenté dans ce schéma.
- Le bloc entre dans le corps hashé par `sendWithETag` : un 304 ne peut pas masquer une sortie de
  vue qui vient d'apparaître.
- Aucune requête supplémentaire hors mode delta : l'écran de liste ne paie rien.
- Le client iOS reste à câbler (`ConversationSyncEngine.deltaSyncCore`) — le champ est additif, un
  client qui l'ignore se comporte exactement comme avant.
