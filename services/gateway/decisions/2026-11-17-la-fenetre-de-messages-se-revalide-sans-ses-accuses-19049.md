## 2026-11-17 : La fenêtre de messages se revalide sans ses accusés pour le client qui les tient par la socket — capacité `live-receipts`, ETag faible, et la mesure dans le journal

**Issue** : #19049 (revue des caches du 2026-11-17, #18909 ; constat F10 de l'audit
adversarial de la PR #18952).

### Contexte

L'ETag de `GET /conversations/:id/messages` est le SHA-256 du corps
(`sendWithETag`). La fenêtre porte, par message, `readCount`,
`deliveredCount`, `recipientCount`, `deliveredToAllAt` et `readByAllAt` : tout
accusé de lecture le change. Dans un groupe actif, chaque revalidation de la
fenêtre récente (Android : 20 messages, au moins toutes les deux minutes, plus
les reconnexions ; iOS : 30) renvoyait donc la fenêtre entière, traductions
comprises, au lieu d'un 304 — alors que ces compteurs voyagent déjà par la
socket (`read-status:updated`, son `summary` par message).

### Décision

**1. Le régime se CHOISIT côté client, il ne se devine pas.** Un client qui
annonce `live-receipts` dans `X-Meeshy-Capabilities` (`LIVE_RECEIPTS_CAPABILITY`,
`@meeshy/shared/types/live-receipts`) déclare tenir les champs de
`LIVE_RECEIPT_FIELDS` par la socket. Pour lui seul, le validateur ignore ces
cinq champs : un ETag FAIBLE (`W/"…"`, RFC 9110 : deux représentations
équivalentes pour l'usage), qu'un contenu changé change et qu'un accusé seul ne
change pas. Le corps d'un 200 porte toujours les compteurs à jour.

**2. Sans la capacité, rien ne change** : l'ETag FORT d'avant, sur le corps
entier. Un ancien client garde un validateur valide. Le régime n'est pas
appliqué à tous parce qu'un client dont le cache HTTP RESSERT le corps d'un 200
sur un 304 (`URLCache` d'iOS, le cache du navigateur) y reprendrait des
compteurs périmés et les écrirait par-dessus ceux de la socket : un 304 qui
ignore les accusés n'est sûr que pour un client qui gère lui-même son
`If-None-Match` et garde son état sur un 304 (Android, `MessageCacheSource`).

**3. Les deux validateurs sont DISJOINTS** : l'empreinte faible est salée par le
nom du régime. Un validateur obtenu sous un régime ne vaut jamais 304 sous
l'autre, ce qui dispense d'un `Vary` — avec `no-cache`, aucune copie n'est
resservie sans revalidation, et la revalidation tranche dans le bon régime.

**4. La mesure d'abord, et elle reste.** L'issue demandait la part de 200 et de
304 avant de choisir ; aucune mesure de staging n'était lisible depuis le
dépôt. La ligne de journal de la route (`⏱️ GET /conversations/:id/messages`)
porte désormais `conditional` (`unconditional` | `modified` | `not-modified`)
et `validator` (`strict` | `live-receipts`) : la part se lit sur le staging dès
le déploiement, par régime, et dira si le régime tient sa promesse.

**5. Un accusé MANQUÉ se répare sans la capacité.** Un client qui a pu perdre
des événements (reconnexion, retour de veille) relit la fenêtre une fois sans
la capacité, ou sans `If-None-Match` : un 304 sous `live-receipts` ne répare pas
un accusé perdu.

### Conséquences

- `sendWithValidator` (`utils/etag.ts`) pose un validateur déjà calculé et dit ce
  qu'il a rendu ; `sendWithETag` en est devenu la projection booléenne.
- La présence des expéditeurs (`sender.isOnline`, `sender.lastActiveAt`) entre
  encore dans le validateur : pour un lecteur qui voit la présence détaillée
  d'un auteur de la fenêtre, elle change au plus toutes les minutes. Elle voyage
  aussi par la socket (`user:status`) ; l'ignorer serait un autre régime, à
  décider sur la mesure, pas glissé dans celui-ci.
- Android déclare la capacité dans le lot client de #19049 (autre agent) ; iOS
  et le web ne la déclarent pas tant que leur cache HTTP ressert le corps d'un
  200 sur un 304.
- **Deux des cinq champs ignorés n'ont pas de canal temps réel complet, et un
  304 les garde périmés.** `deliveredToAllAt` n'est pas dans `ReadStatusSummary`
  (`packages/shared/types/socketio-events/message.ts`, qui ne porte que
  `totalMembers`, `deliveredCount`, `readCount`, `readByAllAt`) : aucun client ne
  le reçoit par la socket — Android, le seul à déclarer la capacité, ne le pose
  que depuis un corps REST (`ReceiptMergePolicy`). `recipientCount` change à
  l'arrivée ou au départ d'un membre, ce qui n'émet aucun `read-status:updated`
  vers les membres déjà là : la socket ne porte l'effectif (`totalMembers`) que
  dans le résumé du DERNIER message, quand un accusé arrive ou quand l'appareil
  rejoint la room de la conversation. Tant que les revalidations rendent 304,
  ces deux champs restent ceux du dernier 200 pour les messages de la fenêtre —
  un « distribué à tous » sans son instant, une coche « lu par tous » jugée sur
  l'ancien effectif. C'est de l'AFFICHAGE seulement : aucun contenu,
  aucun droit, aucune écriture n'en dépend. Ils se réparent comme un accusé
  manqué (§ 5) : une relecture sans la capacité, ou le premier 200 qu'un contenu
  changé provoque.
