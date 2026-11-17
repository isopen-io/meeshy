## Les accusés de lecture suivent le CERCLE, et le résolveur cesse d'être aveugle au viewer (#19385)

*2026-11-17. Cycle 176. MSG-04 de #14107 (ouvert), dont MSG-05 — le jumeau
`dm.typing` — était livré depuis le même lot.*

### Décision

`dm.readReceipts` (plancher `ACQUAINTANCE`) est APPLIQUÉE. Un lecteur sous
Connaissance avec l'acteur ne reçoit plus d'accusé NOMINATIF, ni par le socket
ni par le REST. Portée : **en tête-à-tête comme en groupe — un groupe ne
débloque rien (RG-22)**, exactement comme la frappe.

| canal | site | sens de la loi |
|---|---|---|
| socket `read-status:updated` | `broadcastReadStatus` | `readReceiptDeniedAmong` — l'acteur est VU (`subjectIs: 'target'`) |
| REST, 3 portes nominatives | `MessageReadStatusService._receiptsHiddenFrom` | `readReceiptHiddenFromViewer` — le demandeur VOIT (`subjectIs: 'viewer'`) |

Les trois portes REST sont `filterReadReceiptVisible`, `getMessageStatusDetails`
et `getMessageReadStatus` (ses trois listes `receivedBy` / `readBy` /
`notSeenBy`).

### Pourquoi la loi n'avait nulle part où vivre : le résolveur était AVEUGLE AU VIEWER

C'est la cause, et elle n'est pas un oubli. Les deux résolveurs d'accusés ne
recevaient pas le lecteur :

- socket : `shouldShowReadReceipts(acteur, isAnonymous)` — le réglage GLOBAL de
  l'acteur ;
- REST : `filterReadReceiptVisible(identities)` — **pas même un paramètre**.

C'est `resolvePrefsOnly`, que la loi de PRÉSENCE a **SUPPRIMÉE** (directive
2026-08-25, garde de source `presence-visibility-viewer-aware-guard.test.ts`).

> **Une résolution aveugle au viewer ne PEUT PAS porter une loi par paire.** Le
> canal des accusés avait gardé la forme que le canal de présence a retirée, et
> la loi écrite pour lui est restée inerte faute d'un endroit où s'appliquer.
> Une loi déclarée sans site d'application n'est pas une demi-garde : c'est zéro
> garde avec l'apparence d'une.

Le fan-out le disait déjà : UN `peerPayload` unique remis à
`emitToConversationParticipants`, dont le doc-comment oppose « one payload
shared by the whole fan-out » à `participantUserRoomTargets` « for the emitters
that build a payload PER RECIPIENT ».

### Ce que la fuite valait

Mallory à `PUBLIC` avec Alice (demande de message — état NOMINAL que
`decideOpenings` autorise) recevait `read-status:updated` portant l'identité
d'Alice et `updatedAt` en horloge murale, et `…/receipts?detail=people` lui
servait ses `deliveredAt` / `receivedAt` / `readAt`. Le même Mallory demandant
son profil reçoit `isOnline: null, lastActiveAt: null` — `presence.online` exige
`FRIEND`.

> **Le canal des accusés livrait un horodatage d'activité PLUS FIN que celui que
> le canal de présence refuse, au lecteur précis que la loi restreint.**

MSG-01 (« un message de demande n'affiche pas de confirmation de lecture ») est
satisfait par le même gate, sans clause dédiée : l'expéditeur d'une demande non
acceptée est à `PUBLIC` donc refusé, et accepter le fait passer au moins à
`ACQUAINTANCE` (MSG-02) donc admis.

### La forme : le COMPILATEUR tient la règle

Le viewer est un paramètre **REQUIS** des trois portes — `getMessageStatusDetails`
a perdu son `options = {}` pour cela. Un appelant qui l'omet ne compile pas
(`TS2554`, `TS2345`), et les cinq sites ont été nommés par `tsc`, pas par un
`grep`.

> C'est la forme forte de #19303 : **un module partagé DÉPLACE la discipline — il
> faut penser à l'appeler ; un paramètre requis la SUPPRIME.** Un paramètre dont
> l'absence désactive une garde est un demi-correctif.

### Les deux replis sont OPPOSÉS, par décision

| garde | ce qu'elle décide | repli |
|---|---|---|
| `showReadReceipts` (préférence du sujet) | est-ce que J'ÉMETS des accusés ? | **OUVERT** — défaut `true` (#4530) |
| `dm.readReceipts` (loi de cercle) | à QUI cet accusé a-t-il le droit d'arriver ? | **FERMÉ** |

L'écart n'est pas une incohérence, et ce lot n'« unifie » pas les deux postures
que le témoin de #4530 annonçait voir tomber un jour. Une préférence ABSENTE a
un défaut écrit, et la lire en échec revient à servir ce défaut. Un NIVEAU
illisible n'a pas de défaut : servir y serait deviner un droit. C'est la posture
du canal jumeau — `dm.typing` ferme aussi quand sa loi lève.

Sur le socket, le fail-closed tait l'éventail des PAIRS et laisse partir la
variante de l'acteur et son badge : ni l'une ni l'autre ne décrit l'activité de
quelqu'un d'AUTRE.

### `null` est PERMISSIF ici, et c'est l'inverse de la présence

Un viewer `null` est un invité de lien : il participe LÉGITIMEMENT et n'a pas de
cercle. La loi ne s'applique pas à lui, elle ne le refuse pas — le masquer
retirerait les accusés de tous les fils à lien partagé, que rien dans MSG-04 ne
demande. Même arbitrage que `dm.typing` (« un viewer anonyme n'est jamais dans
cette liste »). Le réglage `showReadReceipts` du sujet continue de s'appliquer.

### Ce que la décision NE tranche PAS

- **Les AGRÉGATS restent intacts** — `getLatestMessageSummary` et
  `getConversationReadStatuses` (le `summary` que le socket transporte, « 3 lus
  sur 5 »). Le dépôt écrit qu'« un AGRÉGAT sans identité n'est pas visé », et les
  rendre par cercle exigerait un résumé PAR DESTINATAIRE — une autre forme de
  fan-out et une autre décision produit. **#19402.**
- **La jumelle des PIÈCES JOINTES** (`getAttachmentStatusDetails`,
  `attachment-status:updated`) n'est pas touchée. Son canal a un repli
  RESTRICTIF là où celui-ci est ouvert : transposer par analogie serait la faute
  du cycle 107 (une symétrie LEXICALE prise pour une symétrie de fond). **#19403.**
- **La RÉCIPROCITÉ de MSG-04** (« et réciproques ») n'est implémentée nulle part
  et relève du produit. **#19386.**

### Mesure de production, faite avant d'écrire la première ligne

Le gate ne peut pas retirer les accusés d'une paire qui s'écrit en direct : une
demande d'ami ACCEPTÉE rattrape la ligne à `FRIEND`
(`friendshipBackfillProjection` écrit `grantedByLow/High: 'FRIEND'`), au-dessus
du plancher — et `dm.direct`, au MÊME plancher, est déjà appliquée, donc toute
paire qui peut se parler en direct est déjà ≥ `ACQUAINTANCE`. Ce qui perd ses
accusés est ce que MSG-03/RG-22 désigne : un groupe d'inconnus et une demande de
message non acceptée, soit là où la frappe est déjà masquée depuis #14107.
