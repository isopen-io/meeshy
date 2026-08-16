# Cycle 51 — l'écran refusait le nom greffé, le cache l'écrivait quand même

## 1. D'où vient la piste

Le cycle 49 puis le cycle 50 la lèguent tous les deux, en tête de leurs
« pistes non livrées », et le cycle 50 note même qu'elle **prend du poids** :

> `ConversationListViewModel` porte une deuxième implémentation de `merging`.
> Ce cycle est le TROISIÈME consécutif à devoir corriger le même événement à
> deux endroits qui ont divergé. […] Cette fois c'est l'écran qui avait raison
> et le store qui ignorait le champ. Les divergences vont donc dans les deux
> sens, ce qui écarte l'explication commode d'un site « en retard » sur l'autre.

Les deux cycles concluaient « à instruire avant d'écrire ». C'est ce que fait
celui-ci — et l'instruction a trouvé, avant toute réécriture, **un défaut réel
et atteignable** dans l'écart lui-même.

## 2. Le constat

Les deux implémentations divergent sur `title`, et elles divergent dans le sens
qui compte :

| | `ConversationListViewModel` (app) | `ConversationStore.merging` (SDK) |
|---|---|---|
| `title` | `if let title = event.title, self.conversations[index].type != .direct` | `if let v = event.title` — **aucune garde** |

La garde de l'écran n'est pas décorative. Son commentaire porte la date et le
symptôme :

> Un DM n'est jamais renommable : son `title` client est le nom du participant,
> dérivé à la conversion REST (`toConversation` écarte le titre DB). Le payload
> socket porte le titre BRUT — le greffer sur un DM écrase le nom affiché
> (« sandra raveloson » → « Sany » au premier pin/mute, vu 2026-07-04).

Elle est vraie, et `APIConversation.toConversation` la confirme à la source :
pour `convType == .direct`, `displayName` vient du participant d'en face
(`participant.user?.name ?? participant.name`), et le `title` de la base n'est
consulté qu'en tout dernier repli, quand il n'y a NI participant NI expéditeur
de dernier message.

## 3. Pourquoi la garde de l'écran ne suffisait pas

Parce qu'elle ne garde qu'un des deux chemins, et pas celui qui gagne.

```
conversation:updated
   ├── MessageSocketManager.conversationUpdated
   │     ├── ConversationListViewModel.sink        → GARDÉ (type != .direct)
   │     └── ConversationStoreSocketBridge         → ConversationStore.merging      ── NON GARDÉ
   └── ConversationSyncEngine.handleConversationUpdated
         → applyingConversationUpdate → ConversationStore.merging                   ── NON GARDÉ
         → cache.conversations.update(for: "list")          ← ÉCRITURE DISQUE
         → _conversationsDidChange.send()
               → ConversationListViewModel.reloadFromCache
                     → setConversations(data)                ← LE TITRE GREFFÉ REVIENT
```

`ConversationSyncEngine` appelle **la même fonction pure** que le store RAM —
c'est tout l'objet de sa remontée hors de l'acteur, et le commentaire de
`applyingConversationUpdate` le revendique :

> Delegates the per-row rule to `ConversationStore.merging` so the persisted
> list and the RAM store can never disagree.

Ils ne pouvaient effectivement pas se contredire l'un l'autre. Mais tous les
deux contredisaient l'écran, et le cache a le dernier mot deux fois :

1. **Immédiatement** — l'écriture du cache émet `conversationsDidChange`, que le
   ViewModel consomme par `reloadFromCache()` → `setConversations(data)`. Le
   titre que le sink venait de refuser rentre par la porte de derrière, dans la
   seconde.
2. **Durablement** — la ligne persistée porte désormais le titre brut. Il
   survit au redémarrage, jusqu'au prochain `GET /conversations` qui re-dérive
   le nom depuis le participant.

La garde de 2026-07-04 protégeait donc le seul chemin qui ne persistait rien.

## 4. Atteignabilité — vérifiée côté serveur, pas supposée

`PUT /conversations/:id` (`services/gateway/src/routes/conversations/core.ts`)
n'a **aucune garde de type**. Son seul contrôle d'accès est une appartenance :

```ts
role: { in: ['creator', 'admin', 'moderator'] }, isActive: true
```

Et l'auteur d'un DM reçoit précisément `role: 'creator'` à la création (même
fichier, création des participants : `creator` pour l'appelant, `member` pour
les autres). Un `title` posé sur une conversation `direct` part donc en
`conversation:updated` vers la room personnelle de **chaque** participant, par
`emitToConversationParticipants` — c'est-à-dire vers exactement la population
posée sur l'écran de liste, celle que le correctif du cycle 50 venait de
rendre joignable.

## 5. Le correctif

Une clause de plus, sur une ligne :

```swift
if let v = event.title, conv.type != .direct { conv.title = v; changed = true }
```

Trois choses le rendent étroit plutôt qu'astucieux :

- **Il ne rend pas le DM sourd.** `avatar`, `description`, `banner`,
  `slowModeSeconds`, `defaultWriteRole`, `isAnnouncementChannel`,
  `autoTranslateEnabled` continuent de s'appliquer. Seul le champ dont le client
  a sa PROPRE source est écarté. Un témoin dédié l'épingle — sans lui, un futur
  élargissement en « ignorer les métadonnées d'un DM » passerait au vert.
- **Il aligne deux règles du même fichier.** `merging(_:withUserUpdate:)`,
  vingt lignes plus bas, dérive DÉJÀ le titre d'un DM du contact d'en face
  (`conv.title = event.resolvedDisplayName`). Les deux fusions de
  `ConversationStore` disaient deux choses différentes du même champ ; elles
  n'en disent plus qu'une.
- **Il rend `nil` quand le payload ne porte que ça.** Un renommage de DM ne
  change plus rien, donc `merging` ne republie pas la ligne, donc le cache
  n'est pas réécrit et `conversationsDidChange` ne part pas. Le no-op est
  complet, pas seulement visuel.

## 6. Les témoins

**4 neufs**, dont un sur le chemin qui portait la conséquence durable :

| Témoin | Ce qu'il fige |
|---|---|
| `test_merging_directConversation_neverTakesTheRawTitle` | un DM ne prend pas le titre, et n'est même pas republié |
| `test_merging_directConversation_stillTakesEveryOtherMetadataField` | contre-épreuve : avatar / slowMode s'appliquent toujours |
| `test_merging_groupConversation_takesTheIncomingTitle` | l'autre moitié — sans elle, inverser la condition passerait au vert |
| `test_applyingConversationUpdate_directConversation_doesNotPersistTheRawTitle` | **le cache disque** — la délégation est épinglée, pas supposée |

**5 existants repartent d'un fixture `.group`.** Ce n'est pas un assouplissement :
leur sujet a toujours été « une métadonnée s'applique », jamais « un DM accepte
un titre brut ». Leurs propres chaînes le disent — `"Renamed Group"`,
`"New Group Name"`, `"Équipe"` — et le `.direct` venait du **défaut du fixture**
(`makeConv`, `TestFactories.makeConversation`), hérité et sans rapport avec ce
qu'ils mesurent. Un jumeau nommé `makeGroupConv` documente désormais le choix,
avec la raison écrite, des deux côtés (store et pont).

*Même leçon que le cycle 50 sur ses deux témoins réécrits : un fixture n'est pas
un contrat. Ici il l'était devenu par accident — cinq témoins affirmaient qu'un
DM prend un titre brut, sans qu'aucun n'ait voulu le dire.*

**Le détail qui achève le diagnostic** : côté app, les DEUX moitiés de la règle
étaient déjà épinglées depuis le 2026-07-04 —
`test_conversationUpdatedEvent_titleOnDirect_doesNotClobberParticipantName` ET
`test_conversationUpdatedEvent_titleOnGroup_appliesRename`, voisines dans
`ConversationListViewModelTests`. Le SDK n'avait ni l'une ni l'autre. Le trou de
couverture épousait exactement le trou de code : la règle a été écrite, testée
et datée sur un seul des deux sites qui l'appliquent, et rien dans le dépôt ne
disait qu'il y en avait deux. C'est la forme générique du problème que les
cycles 46 bis à 51 paient à répétition — *une règle vérifiée sur un site n'est
pas une règle vérifiée* — et c'est pourquoi la piste n°1 du cycle 52 vise le
mapping d'événements plutôt que la fusion elle-même.

## 6 bis. Les autres surfaces — vérifiées, indemnes, et pas pour la même raison

**Web : indemne, parce qu'il n'a jamais eu la divergence à fermer.**
`normalizeConversationPatch` recopie `title` tel quel, et
`TransformersService` le recopie AUSSI tel quel depuis le REST
(`title: conv.title as string`) — sans jamais le dériver du participant d'en
face. Les vues rendent `conversation.title` directement. Le titre d'un DM y est
donc celui de la base **sur les deux transports**, ce qui est cohérent : il n'y
a pas de règle client à contredire. Le défaut iOS naît précisément de ce que le
REST y écarte délibérément le titre, et que le socket ne le savait qu'à moitié.
*(Que le web AFFICHE un titre de DM plutôt que le nom du contact est une
question de produit, pas de synchronisation — hors périmètre de ce cycle, et
noté ici pour qu'un futur alignement des surfaces ne le prenne pas pour une
régression.)*

**Android : indemne pour la raison déjà établie au cycle 49.** Son
`conversation:updated` déclenche un `refreshSilently()` REST — il ne peut pas
mal lire un payload qu'il ne lit pas, au prix d'un aller-retour par événement.

**Gateway : rien à corriger.** Le serveur dit la vérité — le titre EST celui du
document. C'est le client iOS qui a sa propre règle d'affichage, et c'est à lui
de l'appliquer partout où il fusionne. Refermer la route est une piste distincte
(§8, n°3).

## 7. Écarté délibérément

**Faire appeler `ConversationStore.merging` par l'écran** — la piste telle que
les cycles 49 et 50 la formulaient. Instruite ici, et **pas mûre** : l'écran
fait deux choses de plus que le store, et les deux sont irréductibles à la règle
pure.

1. `bumpToTop(conversationId:facet:)` — réordonne la liste ET résout le nom de
   l'expéditeur d'un DM depuis les champs déjà en mémoire sur la ligne
   (`participantUsername`), ce que le store ne peut pas faire : il ne connaît
   pas le lecteur courant.
2. `schedulePersist()` — le ViewModel écrit son propre cache, en plus de celui
   du `ConversationSyncEngine`.

Et une troisième différence, découverte en instruisant : l'écran lit
`ConversationUpdatedEvent`, le store lit `ConversationUpdatedStoreEvent`, deux
types distincts reliés par `ConversationStoreSocketBridge.mapConversationUpdated`
— tout champ oublié dans ce mapping (`location` l'a été jusqu'au cycle 50)
disparaît pour le store sans disparaître pour l'écran. **Unifier les deux
`merging` sans unifier d'abord les deux ÉVÉNEMENTS déplacerait la divergence
d'un cran, sans la fermer.**

**Rendre le titre d'un DM immuable côté serveur** (refuser `title` sur une
conversation `direct` dans `PUT /conversations/:id`). Tentant, et probablement
juste — mais c'est un changement de contrat d'API, avec une population de
documents déjà porteurs d'un `title` sur des DM dont personne n'a mesuré la
taille. Le client sait déjà quoi afficher ; il n'avait qu'à le faire partout.
Piste pour un cycle gateway dédié, cf. §8.

**Étendre la garde à `avatar`.** Un DM affiche `participantAvatarURL`, pas
`avatar` — donc greffer `avatar` sur un DM est inerte plutôt que nuisible, et
`merging(_:withUserUpdate:)` écrit déjà `participantAvatarURL` sur le bon champ.
Ajouter une garde là où rien ne casse aurait élargi le geste sans rien fermer.

## 8. Pistes pour le cycle 52 — repérées, NON livrées

1. **Les deux ÉVÉNEMENTS avant les deux FUSIONS.** `ConversationUpdatedEvent`
   (app) et `ConversationUpdatedStoreEvent` (SDK) portent des champs
   différents, reliés par un mapping manuel de quinze lignes. C'est ce mapping,
   pas la duplication de `merging`, qui a laissé passer `location` (cycle 50) et
   qui laissera passer le prochain. Le fermer est le préalable à la piste n°1
   des cycles 49/50 — et un témoin qui compare les deux jeux de champs coûterait
   beaucoup moins qu'une fusion.

2. **La piste n°2 du cycle 50 reste entière, et c'est la plus grosse.** Six
   champs du groupe d'aperçu (`lastMessageAttachments`,
   `lastMessageAttachmentCount`, `lastMessageSenderName`, `lastMessageIsBlurred`,
   `lastMessageIsViewOnce`, `lastMessageExpiresAt`) ne voyagent sur AUCUN
   `conversation:updated` : hydratés par `GET /conversations`, jamais rafraîchis
   en temps réel. Non prise ici parce que la PR #3096 (cycle 50) était encore
   ouverte sur exactement ces fichiers — la reprendre demande un `main` frais.

3. **`PUT /conversations/:id` accepte de renommer un DM.** Le client sait
   maintenant l'ignorer sur ses deux chemins, mais le document en base porte un
   titre que plus personne n'affichera — donnée morte, écrite par une route qui
   n'aurait pas dû l'accepter. Un cycle gateway peut refermer la route ET
   mesurer la population concernée ; ce cycle-ci ne fait que cesser d'y obéir.
