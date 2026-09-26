## 2026-08-13 : Un accusé de lecture se compte à UN endroit — le rattrapage REST cesse d'en tenir sa propre copie

**Contexte.** Le résumé « reçu par / lu par » d'un message avait CINQ producteurs. Quatre vivaient
dans `MessageReadStatusService` (`getMessageReadStatus`, `getConversationReadStatuses`,
`getMessageStatusDetails`, `getLatestMessageSummary`), tous porteurs du même commentaire explicite :
l'opt-out `showReadReceipts` est retiré EN AMONT, donc absent du numérateur COMME du dénominateur.
Le cinquième était une copie inline dans `GET /conversations/:id/messages` — le chemin de
rattrapage, lu à chaque démarrage à froid et à chaque remontée de fil. Cette copie reproduisait
fidèlement l'union curseur/reçu figé, la borne `createdAt`, l'exclusion de l'expéditeur… et rien
d'autre. Elle n'avait jamais consulté la préférence.

**La conséquence, pas théorique.** Le gate d'opt-out est POSÉ à l'émission (`message-read-status.ts`
suspend le broadcast quand le destinataire a désactivé ses accusés) et TENU par le canal socket. Le
rattrapage REST le contournait : l'expéditeur ne voyait rien passer en direct, puis relançait
l'application et lisait sa coche bleue. Le dénominateur divergeait du même coup — `recipientCount`
comptait un destinataire que le socket en retirait, si bien que « lu par tous » basculait ou non
selon le chemin par lequel la vérité était arrivée.

**Décision.** La route délègue à `getConversationReadStatuses`. Le comptage n'a plus qu'un domicile.
`computeRecipientCount` — le dénominateur, jusqu'ici exporté par le module de route et appelé par
lui seul — descend dans `utils/read-exactness.ts`, aux côtés de `resolveReadAt`, et devient l'unique
formule employée par le service.

**Alternatives rejetées** :
- **Ajouter le filtre d'opt-out à la copie inline.** Corrige la fuite du jour et laisse en place la
  cause : deux implémentations d'une même règle, dont une seule est relue quand la règle bouge. La
  divergence corrigée ici s'était installée exactement ainsi.
- **ÉCRIRE les colonnes dénormalisées `Message.deliveredCount`/`readCount`.** Elles n'ont aucun
  écrivain et valent zéro sur toute la collection. Les alimenter coûterait une écriture par
  destinataire et par accusé sur le chemin chaud, pour une valeur que les entrées
  `MessageStatusEntry` portent déjà exactement — avec, en prime, une seconde vérité à réconcilier.
- **Passer la page de messages déjà chargée au service** pour lui épargner son `message.findMany`.
  Écarté : la signature du service resterait à deux formes, pour une requête indexée sur
  `_id ∈ page`. Les quatre lectures indépendantes du service passent en revanche en `Promise.all`
  (elles étaient séquentielles) — la délégation coûte donc DEUX allers-retours là où la copie inline
  en coûtait un, et non cinq.

**Conséquences** :
- Le repli `?? message.deliveredCount` disparaît du mapping de réponse. Un champ sans écrivain ne
  doit pas se présenter comme une valeur de secours : il ne pourrait que faire régresser un
  compteur juste vers zéro.
- Un participant qui coupe ses accusés disparaît du dénominateur : pour un tête-à-tête, l'expéditeur
  voit `recipientCount: 0` et ses clients retombent sur leur compte de membres local. C'est le
  comportement DÉJÀ servi par le socket ; ce changement le rend cohérent, il ne l'introduit pas.
- Restent servis en dur, hors périmètre : `GET /conversations/:id/status` et `GET /messages/:id`
  renvoient toujours le résumé DEPUIS les colonnes mortes, donc `{0, 0, null, null}` — la première
  contredisant, dans la même charge utile, les `entries` per-participant qu'elle expose par ailleurs
  sans filtre d'opt-out. Aucun client connu ne les appelle.
