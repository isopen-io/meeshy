# Cycle 50 — l'épingle de position dépendait du transport, et la ligne de liste partait vide

## 1. D'où vient la piste

Le cycle 49 en lègue deux (§7). La seconde disait :

> Les trois émetteurs de `conversation:updated` composent leur payload à la
> main. `core.ts` n'emporte aucune clé `lastMessage*` — correct, et uniquement
> parce que quelqu'un y a pensé et l'a écrit en commentaire. Rien n'empêche un
> quatrième émetteur d'y ajouter un `lastMessageId: null` par inadvertance […]
> Un constructeur de payload partagé — ou un témoin qui énumère les émetteurs —
> refermerait la classe.

En allant vérifier ce risque, le compte lui-même s'est révélé faux : **il y a
QUATRE émetteurs**, pas trois (`MessageHandler`, `MeeshySocketIOManager`,
`emitConversationPreviewUpdate`, `routes/conversations/core.ts`). Et le défaut
que le cycle 49 imaginait pour un émetteur futur existait déjà, sur le champ
d'à côté, chez un émetteur bien réel.

## 2. Le constat

`resolveLastMessagePreviewPrism` existe précisément pour que la moitié
message-dépendante du payload soit INDIVISIBLE — son doc-comment le revendique :

> Le rendre ici est ce qui rend la paire indissociable — un appelant ne peut
> plus émettre la moitié plafonnée sans l'autre.

`location` n'y était pas. Chaque émetteur la composait donc à la main, et le
tableau parle de lui-même :

| Émetteur | Chemin | `location` |
|---|---|---|
| `MessageHandler` | WS `message:send` | hoist inline (`place ? {location} : {}`) |
| `MeeshySocketIOManager._broadcastNewMessage` | **REST / ZMQ / agents** | **absente, toujours** |
| `emitConversationPreviewUpdate` | édition, suppression, traduction, masquage | hoist inline, conditionnel |
| `routes/conversations/core.ts` | métadonnées (renommage, avatar…) | absente — **et c'est correct** |

Le deuxième est le défaut. `sharedPlaceFromMetadata(message.metadata)` y est
bien appelé, vingt lignes plus haut — mais pour `messagePayload` (l'événement
`message:new`), et le `updatePayload` voisin ne le voyait jamais.

### Ce que ça donne à l'écran

Un message position-seule a un `content` **vide** par construction : le libellé
de la ligne est composé côté client depuis `location`. Alice partage sa position
par REST ; Bob est sur l'écran de liste, donc il a quitté `conversation:<id>` et
n'apprend la nouvelle que par `conversation:updated`.

Bob reçoit un aperçu vide et aucune position. Pire : le client applique
`location` **avec** `lastMessageId` (`ConversationListViewModel`, commentaire à
l'appui — « `nil` efface la pastille du message précédent »), donc la clé
absente y écrit `nil`. **La ligne de Bob remonte en tête de liste et devient
entièrement vide** — ni texte, ni épingle — jusqu'à un rechargement complet.

Et le symétrique, sur tous les transports : un message ordinaire qui succède à
un partage de position devait éteindre l'épingle. Là où la clé était omise, elle
ne l'éteignait que par accident — parce que le client écrasait avec `nil` de
toute façon.

## 3. Le correctif

### 3.1 La position rejoint le résolveur

`resolveLastMessagePreviewPrism` rend désormais `location: SharedPlace | null`,
**toujours présente**. Les quatre émetteurs héritent du même geste ; les deux
copies inline disparaissent.

Pourquoi TOUJOURS, plutôt qu'un spread conditionnel partagé : parce que
l'absence disait déjà deux choses différentes selon l'émetteur — « ce message
n'a pas de lieu » chez `MessageHandler`, « cet événement ne parle pas du dernier
message » chez `core.ts`. Une clé présente et nulle sépare les deux, exactement
comme `lastMessageTranslations` au cycle 46 bis et `lastMessageId` au cycle 49.
C'est le troisième champ du même groupe à suivre le même chemin, pour la
troisième fois la même raison.

`core.ts` ne traverse pas ce résolveur et continue de se TAIRE. Son silence
garde donc exactement le sens qu'il avait — c'est la contre-épreuve du cycle, et
le défaut symétrique serait bien plus visible : un simple renommage effacerait
l'épingle de toutes les lignes de liste.

### 3.2 Deux témoins existants disaient le contraire, et il a fallu trancher

- `MessageHandler.test.ts` : « sans position, le payload ne porte AUCUNE clé
  location ».
- `emitConversationPreviewUpdate.emptyPreview.test.ts` : `expect(payload.location).toBeUndefined()`.

Aucun des deux n'avait de raison énoncée, et `git log -S` ne remonte qu'à un
commit d'import massif — donc aucune trace d'un contrat client derrière. Les
deux **mesuraient la forme du code** (un spread conditionnel), pas un fait voulu.

Le second se contredisait même lui-même : son propre en-tête, trois lignes plus
haut, pose que « la PRÉSENCE de la clé est le fait mesuré », et son commentaire
sur `location` dit « aucune épingle ne survit au message qui la portait » — ce
qu'une clé présente et nulle sert strictement mieux qu'une clé absente.

Les deux ont donc été RÉÉCRITS (et non supprimés) pour épingler le nouveau
contrat, avec la raison écrite cette fois.

### 3.3 Le client — le store SDK ignorait `location` de bout en bout

`ConversationUpdatedEvent` la décodait déjà (cycle antérieur). Mais
`ConversationUpdatedStoreEvent` **ne portait pas le champ du tout**, donc :

- `ConversationStoreSocketBridge.mapConversationUpdated` ne pouvait pas la
  recopier ;
- `ConversationStore.merging` ne touchait jamais `lastMessageLocation`.

C'est le maillon exact que le cycle 49 avait nommé (« un champ oublié n'y
produit aucune erreur — juste un correctif qui ne s'exécute jamais »).

Conséquence propre au store : `merging` est aussi ce qu'appelle
`ConversationSyncEngine` pour écrire le **cache disque**. L'épingle périmée y
était donc persistée, et survivait au redémarrage.

Le champ est un simple `SharedPlace?`, sans tri-état — et c'est justifié : il
n'est appliqué que dans la branche `.replaced(.some(id))`, donc c'est
l'IDENTITÉ du message qui porte déjà la distinction « cet événement parle-t-il
du dernier message ? ». Un renommage laisse `lastMessage == .unchanged` et
n'atteint jamais l'affectation.

`SharedPlace` passe de `Equatable` à `Hashable` : `ConversationUpdatedStoreEvent`
est `Hashable`, et la synthèse ne franchit pas un champ qui ne l'est pas.
Additif, sans sémantique nouvelle (`Hashable` raffine `Equatable`, et les cinq
propriétés stockées le sont déjà).

### 3.4 Web — la clé est écartée, pas recopiée

`normalizeConversationPatch` recopiait toute clé inconnue verbatim. La ligne web
rend `conversation.lastMessage` (un OBJET) et ne lit `location` nulle part sur
la conversation — le type `Conversation` ne la déclare pas. La recopier
n'ajouterait qu'un champ fantôme par ligne et **par message**, maintenant que la
clé est toujours là.

Même règle, même endroit et même raison que `lastMessageId` au cycle 49.

*(Vérifié au passage : le `location?: string` de `packages/shared/types/conversation.ts`
appartient à `MessageWithTranslations`, pas à `Conversation` — aucune collision
de type.)*

## 4. Gates

- [x] **2 témoins RED prouvés** sur le chemin REST/ZMQ (`MeeshySocketIOManager`) :
      la position servie, et la clé nulle explicite. Fix retiré → rouges ; fix
      remis → verts.
- [x] **1 témoin RED prouvé** côté web (`if (key === 'location')` neutralisé → 1
      rouge, restauré → 11 verts).
- [x] **1 témoin** sur le chemin de recalcul : l'épingle s'éteint quand un
      message ordinaire remplace un partage de position.
- [x] **Contre-épreuve du renommage sur les deux surfaces qui l'appliquent** :
      `conversation-update-fanout.test.ts` (gateway — la route métadonnées ne
      porte NI `lastMessage*` NI `location`) et `ConversationStoreTests`
      (iOS — un renommage laisse l'épingle en place).
- [x] **2 témoins existants réécrits**, raison énoncée, plutôt que supprimés.
- [x] Suites gateway touchées : **88 suites / 2 247 tests** verts.
- [x] Suite gateway **complète** : voir §5.
- [x] Web `hooks/queries` : **25 suites / 600 tests** verts.
- [x] `tsc --noEmit` gateway : **0**.
- [x] **Swift : aucune toolchain dans ce conteneur** (même contrainte qu'aux
      cycles 40, 46 bis et 49) — vérification par CI, et la distinction du
      cycle 49 vaut toujours :
      - `sdk-tests.yml` **exécute** `MeeshySDKTests` : les 4 témoins Swift de ce
        cycle (3 sur `merging`, 1 sur le pont) y sont réellement joués.
      - `ios.yml` ne **compile** que la moitié app (« Build app (app + cibles de
        test) ») — un vert n'y dit pas que les tests passent, il dit que le code
        compile.
      - Ce cycle ne touche AUCUN fichier de `apps/ios/Meeshy` : l'écran tenait
        déjà la règle. Tout le Swift modifié vit dans le SDK, donc sous le job
        qui exécute vraiment.
      - Une erreur de compilation a été attrapée à la relecture plutôt que par
        le compilateur (`SharedPlace` non `Hashable`, cf. §3.3) ; l'ordre des
        arguments du constructeur de test a été vérifié à la main contre la
        déclaration pour la même raison.

## 5. Écarté délibérément

**Un « constructeur de payload partagé » pour les quatre émetteurs**, comme le
suggérait le cycle 49. Deux d'entre eux (`MessageHandler`,
`MeeshySocketIOManager`) portent un message qu'ils viennent d'écrire ; le
troisième porte un message RECALCULÉ depuis la base, avec la borne de masquage
personnel et le drapeau `previewRecalculated` ; le quatrième ne parle pas du
dernier message du tout. Les forcer dans un constructeur unique aurait demandé
un paramètre par différence — c'est-à-dire le même code, avec un niveau
d'indirection en plus.

Ce que le cycle fait à la place est plus étroit et suffit : la moitié
message-dépendante du payload est déjà servie par UN résolveur ; il manquait un
champ dedans. Refermer la classe, c'est faire passer par lui tout ce qui décrit
le dernier message — pas fusionner des émetteurs qui décrivent des faits
différents.

**Faire de `location` un tri-état** (`.unchanged` / `.replaced(nil)`). Aucun
gain : `lastMessage` porte déjà la distinction, et le champ n'est lu que dans sa
branche. Un second discriminant pour le même fait, c'est un second endroit où se
tromper.

## 6. Pistes pour le cycle 51 — repérées, NON livrées

1. **La piste n°1 du cycle 49 reste ouverte, et prend du poids.**
   `ConversationListViewModel` porte une deuxième implémentation de `merging`.
   Ce cycle en est une NOUVELLE illustration, dans le sens inverse des
   précédentes : cette fois c'est l'ÉCRAN qui avait raison (il appliquait
   `location`) et le STORE qui l'ignorait. Les divergences vont donc dans les
   deux sens, ce qui écarte l'explication commode d'un des deux sites « en
   retard » sur l'autre. À instruire avant d'écrire — l'écran fait deux choses
   de plus que le store (`bumpToTop` avec résolution du nom d'expéditeur,
   `schedulePersist`).

2. **Le groupe d'aperçu compte onze champs côté client
   (`clearLastMessage`) et cinq sur le fil.** `lastMessageAttachments`,
   `lastMessageAttachmentCount`, `lastMessageSenderName`, `lastMessageIsBlurred`,
   `lastMessageIsViewOnce`, `lastMessageExpiresAt` ne voyagent sur AUCUN
   `conversation:updated`. Ils sont donc hydratés par `GET /conversations` puis
   jamais rafraîchis en temps réel : la pastille de pièce jointe du message
   précédent survit exactement comme l'épingle le faisait. C'est la même classe
   de défaut que ce cycle ferme, sur six champs de plus — et le tableau du
   cycle 49 §4.2 les nommait déjà tous sans que personne remarque qu'ils ne sont
   jamais émis. **À vérifier en premier au cycle 51**, avec la même méthode :
   un témoin de forme côté gateway avant toute écriture client.

3. **Le compte des émetteurs est à tenir explicitement.** Le cycle 49 en
   annonçait trois, il y en a quatre. Un témoin qui les ÉNUMÈRE (plutôt qu'un
   constructeur partagé, cf. §5) rendrait le prochain ajout visible.
