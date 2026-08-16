# Cycle 45 — la question ouverte depuis le cycle 43 avait sa réponse écrite dans le dépôt

## 0. D'où vient ce cycle

Le cycle 43 a repéré l'écart sans le livrer, et a posé la condition à remplir
avant d'y toucher :

> côté socket la préférence coupe le `markMessagesAsReceived` (l'ÉTAT), là où les
> trois portes REST enregistrent et ne taisent que la diffusion — l'intention
> n'est donc atteinte par personne, l'état dépend du transport.
> […] établir si `showReadReceipts` gouverne les `received` **avant** de
> retourner le gate d'écriture des deux émetteurs socket.

Le cycle 44 a redit la même chose sans trancher. Ce cycle tranche — et la
réponse n'a demandé aucune décision produit : elle est **écrite deux fois dans
le dépôt**, aux deux endroits qui portent le contrat.

## 1. La règle, telle que le dépôt l'énonce déjà

`socketio/broadcastReadStatus.ts`, l'unité partagée des portes REST, en tête de
sa doc, propriété n° 1 sur trois :

> **La préférence décide de la DIFFUSION, jamais de la LECTURE.** Le curseur est
> avancé par l'appelant avant d'arriver ici ; taire l'accusé ne doit jamais
> faire perdre à l'acteur la trace de ce qu'il a lu.

`routes/message-read-status.ts`, doc de `POST …/messages/:id/delivery-receipt` :

> Behaviour mirrors `mark-as-received`: the delivery cursor is **always**
> advanced (keeps unread counts accurate), but the `read-status:updated`
> broadcast is suppressed when the recipient disabled `showReadReceipts`.

Les cinq portes REST appliquent ça — toutes par la même unité. Les deux
émetteurs socket, qui ne l'empruntent pas, le rompaient.

## 2. Les deux sites, et ce qu'ils faisaient

| Site | Transport | Écrit l'état ? | Diffuse ? |
|---|---|---|---|
| `POST /conversations/:id/mark-as-read` | REST | **oui**, toujours | gaté |
| `POST /conversations/:id/mark-as-received` | REST | **oui**, toujours | gaté |
| `POST …/messages/:id/delivery-receipt` (NSE iOS) | REST | **oui**, toujours | gaté |
| `POST /conversations/:id/mark-read` | REST | **oui**, toujours | gaté |
| `POST /messages/:id/status` (héritée) | REST | **oui**, toujours | gaté (depuis cycle 42) |
| `MessageHandler.autoDeliverToOnlineRecipients` | socket | **non** si opt-out | gaté |
| `MeeshySocketIOManager._emitDeliveryForDrainedMessages` | socket | **non** si opt-out | gaté |

Les cinq portes REST passent par `broadcastReadStatus` ; les deux émetteurs
socket, non — c'est cette absence de dénominateur commun qui a laissé l'écart
vivre.

Le premier des deux sites socket est le chemin **nominal** : c'est lui qui
accuse la livraison de tout message envoyé à quelqu'un d'en ligne. Le second est
le drain de reconnexion. Autrement dit, pour un destinataire opt-out, l'état de
livraison n'était écrit que par les chemins de rattrapage REST.

## 3. Pourquoi le gate d'écriture ne protégeait rien

La confidentialité est tenue **à la lecture**. `_loadReadReceiptOptOuts`
(`MessageReadStatusService`) retire les participants opt-out sur les CINQ sites
qui servent un statut — résumé de coches, détail nominatif, agrégats — quoi
qu'il y ait en base. Aucun lecteur non gaté ne subsiste : `statusEntries` et
`status` ont été retirés des routes de liens aux cycles 43 et 44, et les seuls
autres accès Prisma à `MessageStatusEntry`/`ConversationReadCursor` hors du
service sont `recordViewOnceConsumption`, le `mark-unread` de
`conversations/messages.ts` et `broadcastReadStatus` — aucun ne publie
l'identité d'un tiers.

Ne pas écrire n'ajoutait donc **aucun** cran de discrétion. Ça détruisait une
donnée que personne ne pouvait voir de toute façon.

## 4. Ce que la destruction coûtait

`showReadReceipts` est un réglage **réversible**, exposé dans les préférences de
confidentialité web (`privacy-settings.tsx`) — donc basculable dans les deux
sens, à volonté.

Séquence :

1. R coupe ses accusés. Le gate de lecture le retire des cinq lecteurs :
   personne ne voit rien de R. Correct.
2. Pendant ce temps, chaque message qui arrive à R **en ligne** passe par
   `autoDeliverToOnlineRecipients` : rien n'est écrit. Aucun curseur
   `lastDeliveredAt`, aucun `MessageStatusEntry` figé.
3. R réactive ses accusés. Le gate de lecture cesse de le retirer — R
   **recompte** comme destinataire dans `recipientCount`.
4. Mais R n'a aucune trace de livraison sur l'arriéré. `deliveredCount` ne le
   compte pas. Les messages qui LUI ONT ÉTÉ LIVRÉS ressortent « jamais
   livrés » : les coches de l'expéditeur régressent de ✓✓ à ✓ sur tout
   l'historique reçu pendant l'opt-out.

La part figée (`MessageStatusEntry`, write-once) ne se rattrape jamais ; la part
curseur se rattrape à la réouverture de la conversation par R
(`getMessageStatusDetails` retombe sur `lastDeliveredAt >= message.createdAt`).

**Et rien de tout ça n'arrive à la moitié REST du même trafic.** Le même
destinataire, le même message : livré par le NSE iOS ou par `mark-as-received`,
l'état est là et la réactivation restitue les coches ; livré par la socket,
l'état n'a jamais existé.

## 5. Le piège du correctif naïf, et son témoin

Déplacer le filtre de l'écriture vers la diffusion ne suffit pas côté
`autoDeliverToOnlineRecipients` : le payload NOMME un acteur
(`participantId`, `userId` de `firstAcker`), pris jusqu'ici dans la liste
**déjà filtrée**. Marquer tout le monde puis garder `results[0]` aurait donné
son nom à la diffusion **au premier destinataire de la liste**, opt-out compris
— publiant précisément ce que ce dernier a demandé de taire.

`firstAckerIndex` cherche donc, d'un seul passage, le premier résultat qui soit
à la fois `fulfilled` ET dont le destinataire partage ses accusés. Le témoin
« names an acker who SHARES receipts when an opt-out sits first in the list »
place délibérément l'opt-out en tête.

## 6. Gates

- [x] 3 témoins discriminants vus ROUGES avant correctif
      (2 sur `autoDeliverToOnlineRecipients`, 1 sur
      `_emitDeliveryForDrainedMessages`)
- [x] 3 gardes de non-régression vertes — elles portent la raison : aucun
      `read-status:updated` n'est émis quand tous les destinataires en ligne
      ont coupé, ni au drain d'un lecteur opt-out
- [x] Un TROISIÈME témoin de l'ancien contrat trouvé par la suite complète —
      `src/__tests__/unit/handlers/MessageHandler.autoDeliver.test.ts`, un
      second fichier de tests du même chemin, hors du répertoire `__tests__`
      voisin de la source. Scindé en ses deux moitiés : ce qui reste vrai
      (aucune diffusion) et ce qui était faux (aucune écriture)
- [x] `bunx tsc --noEmit` gateway : 0
- [x] Suite gateway complète : **729 suites, 17 799 tests**, tout vert
      (cycle 44 : 728 / 17 787 — +1 suite, +12 tests)
- [x] CHANGELOG + ce journal + leçon 282

## 7. Écarté délibérément

**Faire passer les deux sites socket par `broadcastReadStatus`.** Ce serait
l'unification élégante, et c'est ce que la doc de cette unité appelle. Mais elle
re-interroge `participant.findMany` pour construire son éventail, alors que les
deux sites socket ont déjà cette liste en main — `autoDeliverToOnlineRecipients`
l'a chargée pour calculer les destinataires en ligne, le drain l'a chargée en un
seul lot pour toutes les conversations concernées. La brancher ajouterait une
requête par message sur le chemin d'envoi le plus chaud du système. Le contrat
est ici tenu par alignement, pas par appel — et les deux commentaires posés
nomment l'unité qui le porte.

**Retirer complètement `showReadReceipts` du chemin `received`.** WhatsApp
sépare les deux : couper les accusés de lecture n'y coupe pas les accusés de
livraison. Le dépôt, lui, a choisi de faire suivre les deux à la même
préférence, explicitement (« Les « received » (accusés de livraison) suivent
aussi la préférence `showReadReceipts` », `mark-as-received`). Changer ça est
une décision produit, pas une correction de cohérence : ce cycle aligne les deux
émetteurs socket sur la règle que le dépôt s'est donnée, sans la redéfinir.

## Piste pour le cycle 46 — repérée, NON livrée

`_loadReadReceiptOptOuts` ne considère QUE les participants qui ont un `userId`
(`if (!participant.userId) continue`) : un invité de lien partagé n'est jamais
retiré à la lecture. Côté écriture, `getPreferencesForUsers` sert les anonymes
par les défauts, donc `showReadReceipts: true` — les deux bouts s'accordent
aujourd'hui. Mais la conclusion « un invité ne peut pas couper ses accusés »
n'est vraie que tant que la valeur par défaut l'est : à établir avant d'écrire,
`PATCH /me/preferences/privacy` est-il atteignable par une session
anonyme ? Si oui, la préférence serait enregistrée quelque part et le gate de
lecture ne la verrait pas — l'exact miroir du défaut fermé ici, sur l'autre
population.
