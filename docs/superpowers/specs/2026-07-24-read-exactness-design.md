# Exactitude de la lecture — design

Date : 2026-07-24
Lot 1 de 2. Prérequis de `2026-07-24-media-views-enrichment-design.md`.

## Problème

Un message est marqué lu sans que personne ne l'ait affiché.

`markMessagesAsRead` (`MessageReadStatusService.ts:577`) délègue à
`freezeMessageStatus` (:759), qui sélectionne les messages par **fenêtre
temporelle** — `createdAt ∈ (readAt précédent, maintenant]` — et leur écrit à tous
le même `readAt`. Le paramètre `latestMessageId` sert au curseur et à la
déduplication, mais **n'entre jamais** dans la sélection du gel (:670-676).

Ouvrir une conversation à 200 non-lus dont 10 tiennent à l'écran marque les 200
comme lus, et l'expéditeur voit 200 coches bleues.

Aucun client ne fournit la donnée qui permettrait de faire mieux :

- **iOS** — la liste est un `UICollectionView` (`MessageListViewController`).
  `indexPathsForVisibleItems` existe mais n'est jamais remonté ; ni `willDisplay`
  ni `didEndDisplaying` ne sont implémentés. `upToMessageId` vaut
  `messages.last?.id`, soit le dernier message **chargé** et non **vu**
  (`ConversationViewModel.swift:3525`), puis il est jeté :
  `OutboxDispatcher.dispatchMarkAsRead` (:265) poste `body: nil`.
- **Web** — aucun `IntersectionObserver` sur les bulles.
  `markAsRead(conversationId)` part à l'ouverture, au scroll près du bas et après
  envoi, **sans aucun identifiant** (`messages.service.ts:136`).

### Ce que ce n'est pas

Ce comportement n'est pas une régression : il est décrit comme intentionnel dans
`docs/plans/2026-03-09-message-delivery-read-status-design.md` (L.129-152), qui
assume le modèle curseur `cursor.lastReadAt >= message.createdAt → lu`. Le présent
document **change cette décision**.

`tasks/proof-read-state-exactness.md` en dépend : son lemme L1 postule que le
système « ne peut jamais sur-compter ». C'est faux, et le document doit être
corrigé dans ce lot.

## Principe directeur

> **Livré = récupéré. Lu = affiché.**

`deliveredAt` reste géré par fenêtre temporelle, et c'est correct : tout message
récupéré par le client a bien été livré. Seul le chemin `readAt` change. Cette
distinction borne le lot — `markMessagesAsReceived` n'est pas touché.

## 1. Contrat client → serveur

`POST /conversations/:id/mark-read` reçoit un body optionnel :

```ts
export const MarkReadBodySchema = z.object({
  messageIds: z.array(CommonSchemas.mongoId).max(200).optional(),
}).strict();
```

**Le body reste optionnel, et son absence conserve le comportement par fenêtre.**
Ce n'est pas une concession de confort : les binaires iOS déjà distribués
continueront de poster `body: nil` pendant des semaines. Supprimer le repli
casserait la lecture pour ces versions.

`markMessagesAsRead` gagne un paramètre `options?: { messageIds?: string[] }`.

## 2. Gel borné

`freezeMessageStatus` accepte `messageIds?: string[]` :

- fourni → sélection `where: { id: { in: messageIds }, … }` ;
- absent → fenêtre `(since, at]` actuelle.

Le reste est inchangé : garde write-once (`readAt: null` dans le `where` du
`updateMany`), `createMany` pour les entrées manquantes, aucune exception propagée.

## 3. Curseur exact — préfixe contigu

`_advanceCursor` (:389) écrit aujourd'hui `lastReadMessageId = messageId`,
`lastReadAt = now`, `unreadCount = 0` : ouvrir une conversation vide le badge.

Le curseur avance désormais jusqu'au **plus long préfixe contigu de messages lus**
à partir de sa position courante. Concrètement, après le gel :

1. Charger les ids des messages postérieurs au curseur, triés croissant, bornés à
   500.
2. Charger les `MessageStatusEntry` de ces ids ayant `readAt != null`.
3. Avancer tant qu'il n'y a pas de trou ; s'arrêter au premier manquant.

L'étape 3 est une fonction pure :

```
computeContiguousReadPrefix(orderedMessageIds, readIdSet) -> string | null
```

Propriétés : lecture contiguë depuis le dernier point → le curseur suit
exactement ; saut vers le bas → le curseur ne franchit pas le trou et le badge
reste haut. C'est le comportement voulu : les messages sautés ne sont pas lus.

`unreadCount` reste calculé comme aujourd'hui — `count(createdAt > lastReadAt)`
(`getUnreadCount` :115-183) — donc **aucune requête coûteuse n'est introduite**.
La borne de 500 protège d'un scan non maîtrisé sur une conversation très en
retard ; le curseur rattrapera au passage suivant.

## 4. Retrait du repli curseur, avec bascule

Tous les chemins de lecture appliquent `frozen?.readAt ?? cursorRead` où
`cursorRead` vaut `lastReadAt >= message.createdAt`. **Corriger le gel sans
toucher ce repli ne changerait rien** : le curseur continuerait à déclarer lu tout
message plus ancien que `lastReadAt`.

Le repli ne peut pas être supprimé sèchement : les messages historiques n'ont pas
d'entrée `readAt`, et le retrait les ferait tous basculer en « jamais vu ».

D'où une **date de bascule**, `EXACT_READ_TRACKING_SINCE` (variable
d'environnement, valeur par défaut = date de déploiement) :

```
resolveReadAt({ frozenReadAt, cursorLastReadAt, messageCreatedAt, cutover })
```

- `messageCreatedAt < cutover` → repli curseur autorisé (héritage) ;
- `messageCreatedAt >= cutover` → `frozenReadAt` seul fait foi.

Fonction pure, appliquée aux six lecteurs recensés : `getMessageReadStatus`
(:912-978), `getLatestMessageSummary` (:1118-1184), liste filtrée read/unread
(:1248-1333), agrégat readCount (:1805-1841),
`routes/conversations/messages.ts:1030-1072`,
`routes/conversations/messages-advanced.ts:1371-1401`.

## 5. Réciprocité `showReadReceipts`

Appliquée dans ce lot, sur les mêmes chemins de lecture que la bascule — les
toucher deux fois serait du gaspillage.

- Demandeur avec `showReadReceipts: false` → aucun détail de lecture d'autrui.
- Participants avec `showReadReceipts: false` → retirés des réponses.
- Sa propre ligne reste toujours visible.
- Les écritures continuent : seule l'exposition est filtrée, donc réversible.

Helper unique `filterByReadReceiptPreference({ viewerUserId, entries })`.
Préférences chargées en **une requête groupée** puis mises en cache
(`CacheStore`) : une liste de N participants ne doit pas produire N requêtes.

Côté web, `showReadReceipts` est aujourd'hui **totalement ignorée** — déclarée dans
le store et l'écran de réglages, lue par aucun composant de chat. Le gate serveur
la rend effective sans changement d'UI.

## 6. Clients — détection de visibilité

Règle commune : un message est **vu** s'il reste continûment affiché au moins
`dwellMs` (défaut 300 ms). Le seuil élimine les faux positifs du défilement rapide.

Accumulateur partagé, même comportement des deux côtés :

- entrée : événements `apparu(id, t)` / `disparu(id, t)` ;
- sortie : lot d'ids vus, vidé sur seuil de taille (50), inactivité (1 s), fin de
  défilement, passage en arrière-plan, fermeture de la conversation.

Implémentations miroir, mêmes cas de test — précédent établi par
`resolveUserLanguage()` :

- Swift : `SeenMessageAccumulator` (SDK)
- TS : `seen-message-accumulator.ts` (web)

### iOS

`MessageListViewController` implémente `willDisplay` / `didEndDisplaying` et
alimente l'accumulateur. Les lots remontent au `ConversationViewModel`, puis dans
l'Outbox.

`OutboxDispatcher.dispatchMarkAsRead` (:265) poste enfin un body — ce qui corrige
au passage l'abandon d'`upToMessageId`, dont le payload est produit, coalescé
(`OfflineQueue.swift:1155`) et couvert par trois fichiers de tests SDK avant
d'être jeté au dernier saut HTTP.

`ReadReceiptGate.shouldEmitAutoRead` (SDK) reste en amont : inchangé.

### Web

`IntersectionObserver` sur les bulles (seuil 0.5), branché dans le composant de
liste, alimentant le même accumulateur. `markAsRead` transporte les ids.

Les trois déclencheurs actuels de `ConversationLayout.tsx` (:465, :484, :668)
subsistent comme déclencheurs de **vidange**, plus comme sources de vérité.
La garde morte `hasMarkedAsReadOnOpenRef` (assignée, jamais lue) est supprimée.

## 7. Tests

**Fonctions pures** (TS + Swift, mêmes cas)
- `computeContiguousReadPrefix` — préfixe complet, trou au milieu, ensemble vide,
  premier message manquant, entrée déjà entièrement lue.
- `resolveReadAt` — avant/après bascule, gel présent/absent, curseur nul.
- accumulateur — dwell non atteint, atteint, apparition/disparition/réapparition,
  vidange sur seuil, sur inactivité, sur arrière-plan.

**Gateway**
- `freezeMessageStatus` borné : **seuls** les ids nommés reçoivent `readAt`.
- Repli sans body : comportement fenêtre préservé (versions iOS déployées).
- Curseur : avance sur préfixe contigu, s'arrête au trou, borne de 500 respectée.
- Confidentialité : demandeur opt-out, participant opt-out, ligne propre visible,
  chargement groupé.
- `deliveredAt` : **non-régression** — la fenêtre reste en place.

**Test verrou à réécrire**
`MessageReadStatusService.test.ts:602`
(`'should freeze a write-once readAt per message newly crossed'`) affirme
aujourd'hui que **deux** messages reçoivent `readAt` alors que l'appel n'en nommait
qu'un. Il encode le bug ; il devient l'assertion inverse. Les tests voisins
(:632, :651, :668, :690) et les assertions négatives (:395, :453, :550) sont à
revérifier un par un.

**iOS** — `willDisplay`/`didEndDisplaying` alimentent l'accumulateur, le lot part
dans l'Outbox, le body n'est plus nul.

**Web** — l'observer produit les ids attendus, la vidange transporte le payload.

## 8. Ordre de livraison

Chaque lot commité vert, séparément.

1. Fonctions pures TS + tests (`computeContiguousReadPrefix`, `resolveReadAt`,
   accumulateur).
2. Gel borné + `MarkReadBodySchema` + réécriture du test verrou.
3. Curseur à préfixe contigu.
4. Bascule `EXACT_READ_TRACKING_SINCE` sur les six lecteurs.
5. Réciprocité `showReadReceipts` + chargement groupé des préférences.
6. Miroir Swift des fonctions pures + tests.
7. iOS : visibilité, accumulateur, body de l'Outbox.
8. Web : `IntersectionObserver`, accumulateur, payload.
9. Correction de `tasks/proof-read-state-exactness.md` (lemme L1) et de
   `docs/plans/2026-03-09-message-delivery-read-status-design.md` (note de
   supersession).

## Risques

- **Chute visible des accusés de lecture.** Après bascule, les coches bleues
  refléteront l'affichage réel : elles seront moins nombreuses. C'est l'objectif,
  mais cela peut être signalé comme une régression. La date de bascule permet de
  dater précisément le changement.
- **Badge de non-lus qui ne se vide plus à l'ouverture.** Changement de
  comportement validé, mais il modifie une habitude quotidienne. Aucune action
  « tout marquer comme lu » n'est prévue dans ce lot ; si le besoin se confirme,
  elle fera l'objet d'un lot dédié.
- **Versions clientes déployées.** Elles restent sur le chemin par fenêtre jusqu'à
  mise à jour. Les deux régimes coexistent, distingués par la présence du body.

## Hors périmètre

- `deliveredAt` — la fenêtre y est correcte.
- Action « tout marquer comme lu ».
- Stories, posts, réels.
- Vues enrichies des attachements — lot 2.
