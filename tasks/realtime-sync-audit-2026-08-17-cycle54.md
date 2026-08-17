# Cycle 54 — l'épingle, perdue deux fois sur le même trajet

## 1. D'où vient la piste

Le cycle 53 la lègue en n°3, et il la lègue avec sa preuve déjà faite :

> **Les deux ÉVÉNEMENTS avant les deux FUSIONS** — piste intacte des cycles 51
> et 52 : `ConversationUpdatedEvent` (app iOS) et `ConversationUpdatedStoreEvent`
> (SDK) portent des champs différents, reliés par un mapping manuel de quinze
> lignes. **C'est ce mapping qui a laissé tomber `location` au cycle 50.**

Une piste qui nomme un mapping ET le champ qu'il a déjà perdu une fois n'est pas
une piste, c'est une adresse. La question de ce cycle n'a donc pas été « où
chercher » mais **« ce mapping a-t-il été réparé, ou seulement contourné ? »**.

Réponse : contourné. Le cycle 50 a corrigé le chemin de l'APP
(`ConversationListViewModel`), pas le mapping. Le SDK n'a jamais reçu l'épingle.

## 2. Le constat

### 2.1 Ce que porte l'événement, ce que le pont en transmet

`ConversationUpdatedEvent` déclare 19 champs. `mapConversationUpdated` en
recopie 15. Les quatre qui restent au bord :

| Champ | Sort |
|---|---|
| `updatedBy` | le store ne s'en sert pas — légitime |
| `updatedAt` | idem |
| `senderId` | voir §7, écarté et pourquoi |
| **`location`** | **décodé, jamais transmis** |

`ConversationUpdatedStoreEvent` ne déclarait même pas le champ. Un champ décodé
et non mappé est **aussi inerte qu'un champ absent du fil** — et c'est
exactement le défaut que le témoin du drapeau `previewRecalculated`, posé deux
lignes plus haut dans la même suite, existe pour interdire :

> `mapConversationUpdated` ne recopie qu'un SOUS-ENSEMBLE des champs décodés, et
> un drapeau décodé mais jamais transmis serait exactement aussi inerte qu'un
> drapeau absent. C'est la moitié du chemin qu'un test de `merging` seul ne peut
> pas voir.

Le témoin était là, la phrase était écrite, et le champ d'à côté tombait quand
même. Un témoin ne protège que le champ qu'il nomme.

### 2.2 Pourquoi la perte est ACTIVE et non passive

`merging` ne se contente pas d'ignorer l'épingle : il l'**efface**.

```swift
if case .replaced(.some(let id)) = event.lastMessage { conv.adoptLastMessage(id: id); … }
```

`adoptLastMessage` remet à neutre tout ce qui DÉCRIT le message — dont
`lastMessageLocation = nil`. C'est son contrat, et il est bon : nommer un autre
message, c'est cesser de décrire le précédent. Mais sa documentation énonce la
contrepartie, mot pour mot :

> Ce geste remet donc à neutre TOUT ce qui décrit le message, **à charge pour
> l'appelant de reposer aussitôt ce que le payload porte vraiment.**

Le payload portait la position. L'appelant ne la reposait pas. Le neutralisant
tournait donc à vide sur le seul champ pour lequel il avait une valeur de
rechange.

### 2.3 Ce que la ligne rendait

Un message géolocalisé sans légende a un `content` VIDE — les trois émetteurs le
disent, et aucun ne fabrique de texte de repli côté serveur :

> Un message position-seule a un `content` vide : hisser `metadata.location`
> pour que la ligne d'aperçu du client compose son libellé — aucun texte de
> repli côté serveur.

Donc `lastMessagePreview` est vide par construction, et `location` est la
**seule** chose dont la ligne dispose. `ThemedConversationRow` s'y rabat
précisément quand l'aperçu est vide, et sa branche VoiceOver fait de même :

```swift
} else if let place = conversation.lastMessageLocation {
    parts.append(place.name ?? "Position")
}
```

Sans l'épingle : aperçu vide, épingle nulle, **la ligne n'affiche plus rien**.
VoiceOver n'annonce que l'horodatage. Ce n'est pas une ligne dégradée, c'est une
ligne blanche.

### 2.4 Ce qui rend le défaut DURABLE

`merging` est `nonisolated static` pour une raison écrite au-dessus d'elle :

> Lifted out of the actor so the disk-cache writer (`ConversationSyncEngine`)
> applies the SAME rule instead of re-deriving it — the RAM store and the
> persisted list must never disagree.

La ligne blanche est donc **écrite sur le disque**. Elle survit au redémarrage :
au prochain départ à froid, la liste servie depuis le cache (principe
Cache-First) montre une ligne vide jusqu'à ce qu'un `GET /conversations`
la répare — car le REST, lui, porte l'épingle (`APIConversation.toConversation`
pose `lastMessageLocation: lastMessage?.location`).

## 3. La deuxième perte, en amont — le gateway

En traçant les émetteurs pour établir *quand* le payload porte l'épingle, un
troisième site est tombé : **le gateway ne la hisse que sur deux de ses trois
chemins.**

| Émetteur | Hisse `location` ? |
|---|---|
| `MessageHandler.ts` (WS `message:send`) | ✔ avec son commentaire |
| `emitConversationPreviewUpdate.ts` (édition / suppression / traduction) | ✔ avec son commentaire |
| `MeeshySocketIOManager._broadcastNewMessage` (REST / ZMQ) | ✘ |

Le chemin manquant est **celui par lequel passe justement l'envoi d'un lieu** :
le picker poste le message par REST. Et le fichier portait déjà l'avertissement,
sur la fonction voisine, qui nomme `location` comme le bug de référence :

> …doit être répliqué à la main dans `_buildMessagePayload` — bug de parité
> (cf. `location` ci-dessous).

L'avertissement gardait le payload `message:new`. Le payload
`conversation:updated`, quarante lignes plus bas dans la même méthode, n'était
gardé par rien.

Les deux défauts sont donc les deux moitiés du même trajet : le serveur ne pose
pas l'épingle sur le fil (chemin REST), et le client la jette quand elle y est
(tous chemins).

## 4. Le correctif

### 4.1 Gateway — hisser, avec la clé ABSENTE et non nulle

Même expression que les deux jumeaux, au même endroit du payload :

```ts
...((): Record<string, unknown> => {
  const place = sharedPlaceFromMetadata((message as { metadata?: unknown }).metadata);
  return place ? { location: place } : {};
})(),
```

`{}` et non `{ location: null }`, et c'est la borne de tout le correctif : les
clients écrivent l'épingle **avec l'identité du message**, donc une clé nulle
posée sur le chemin le plus fréquenté du service effacerait une épingle correcte
à chaque message texte. La contre-épreuve la fige.

### 4.2 SDK — transmettre, puis reposer avec l'identité

Trois gestes, un par étage :

1. `ConversationUpdatedStoreEvent` déclare `location: SharedPlace?` — membre du
   groupe d'aperçu au même titre que le texte et le Prisme.
2. `mapConversationUpdated` la transmet.
3. `merging` la repose **dans la branche d'identité**, immédiatement après
   `adoptLastMessage` :

```swift
if case .replaced(.some(let id)) = event.lastMessage {
    conv.adoptLastMessage(id: id)
    conv.lastMessageLocation = event.location
    changed = true
}
```

Ce n'est pas un champ de plus appliqué au hasard : c'est **le geste que
`adoptLastMessage` demande explicitement à son appelant**, enfin fait pour le
seul champ dont le payload dispose.

### 4.3 Pourquoi DANS la branche d'identité, et pas à côté

Hors de cette branche, l'écriture atteindrait le chemin des métadonnées
(renommage, avatar, mode lent), qui ne porte jamais `location` — et retirerait
donc son épingle au dernier message **à chaque renommage**. Ce serait la même
classe de défaut que celle qu'on ferme, par la porte opposée. Un témoin dédié
l'interdit.

Dans la branche, l'écriture couvre les deux formes de la clé pleine :

| Forme | Effet | Juste parce que |
|---|---|---|
| identité neuve + `location` | l'épingle du nouveau message | le payload la hisse depuis SON `metadata` |
| identité neuve, pas de `location` | épingle effacée | le remplaçant n'a pas de position |
| identité ÉGALE (édition, traduction) | épingle réécrite à l'identique | l'émetteur la recalcule depuis le MÊME message |
| clé `lastMessageId` absente | rien touché | l'événement ne parle pas du dernier message |

La troisième ligne est la seule qui demandait une vérification et pas un
raisonnement : `emitConversationPreviewUpdate` recompose `place` depuis le
message qu'il nomme à chaque émission, y compris à l'édition. L'écriture y est
donc idempotente, jamais destructrice.

### 4.4 `SharedPlace` gagne `Hashable`

`ConversationUpdatedStoreEvent` est `Hashable` ; `SharedPlace` n'était
qu'`Equatable`, ce qui rendait la synthèse impossible dès que le type valeur
porte l'épingle. Conformance ajoutée par synthèse — ses cinq champs stockés sont
tous `Hashable`.

À ne pas confondre avec le hash **manuel** de `MeeshyConversation`, qui ne
combine que `lastMessageLocation != nil` et `.name` : celui-là est un hash de
DIFFING SwiftUI, délibérément partiel. Il n'était pas la preuve que `SharedPlace`
ne pouvait pas être `Hashable` — seulement qu'à cet endroit-là on ne le voulait
pas complet.

## 5. Les témoins

**6 neufs.**

| Témoin | Ce qu'il fige | Où |
|---|---|---|
| `hisse metadata.location dans CONVERSATION_UPDATED` | **le défaut serveur** | gateway |
| `sans position, ne porte AUCUNE clé location` | la clé absente ≠ clé nulle — la borne | gateway |
| `replacementIsAPositionMessage_carriesItsPin` | **le défaut client** | SDK / fusion |
| `renameDoesNotTouchThePin` | la borne : hors branche d'identité, on n'écrit pas | SDK / fusion |
| `positionMessage_pinCrossesTheBridge` | la moitié du chemin qu'un test de `merging` ne voit pas | SDK / pont |
| `positionMessage_persistsItsPin` | la durabilité — le cache disque | SDK / sync |

Le témoin existant
`test_applyConversationUpdated_replacingTheLastMessage_stopsDescribingThePreviousOne`
devient la contre-épreuve gratuite du nouvel écrit : il sème une épingle, envoie
un remplaçant TEXTE sans `location`, et exige `XCTAssertNil`. Il passait avant ;
il passe après, et il exerce désormais vraiment la ligne neuve.

## 6. Les gates

- **Gateway : suite COMPLÈTE — 740 suites, 17 928 témoins verts, 0 échec.**
  Dont les 2 neufs et les 358 de `MeeshySocketIOManager.test.ts`.
- **`tsc --noEmit`** : aucune erreur sur le fichier gateway touché. (Le dépôt en
  porte une préexistante et sans rapport — `src/utils/sanitize.ts` sur
  `@meeshy/shared` — levée après reconstruction de `packages/shared`.)
- **Prérequis de parité locale** appliqués avant campagne :
  `prisma generate --generator client` + `bun run build` dans `packages/shared`.
- **Swift : NON COMPILÉ ici.** Aucun toolchain Swift dans ce conteneur Linux
  (`swift: command not found`), et le dépôt ne porte pas de workflow CI visible
  pour le SDK. Les quatre témoins SDK et les quatre fichiers Swift touchés sont
  donc livrés **non exécutés**, à la charge de la CI iOS / `meeshy.sh test`.
  Ce qui a été fait à la place, faute de compilateur :
  - le risque de compilation le PLUS probable a été cherché et trouvé avant
    d'écrire (`Hashable` synthétisé impossible sur `SharedPlace` seulement
    `Equatable`) — c'est ce qui a motivé §4.4 ;
  - ordre des paramètres re-vérifié à chaque site d'appel (Swift autorise
    l'omission d'un paramètre défauté, pas le désordre) ;
  - mutabilité re-vérifiée (`MeeshyConversation.type` est un `let` — le premier
    jet du témoin de renommage ne compilait pas, il passe par `makeGroupConv`) ;
  - aucune conformance `SharedPlace` préexistante en extension (double
    conformance = erreur de compilation).

## 7. Écarté délibérément — et tracé, pas supposé

**`senderId`, quatrième champ non mappé.** Il n'est PAS le même cas, et la
frontière est nette : `adoptLastMessage` demande à l'appelant de reposer *ce que
le payload porte vraiment*. Le payload porte `location` — un lieu, prêt à poser.
Il ne porte pas `lastMessageSenderName` : il porte `senderId`, et en faire un
nom demande une RÉSOLUTION (l'app la fait, pour les DM seulement, en lisant
`participantUsername` déjà en RAM sur la ligne). Le nom absent tombe donc dans
le compromis assumé de `adoptLastMessage` — incomplet et corrigible, plutôt que
faux et durable. Porter cette résolution dans le SDK serait un ajout de
comportement, pas la réparation d'une fuite. Piste n°1 du §8.

**`updatedBy` / `updatedAt`.** Le store ne les lit pas. Vérifié, pas supposé.

**Composer un libellé de repli côté serveur.** Les trois émetteurs s'y refusent
explicitement et à l'unisson (« aucun texte de repli côté serveur ; le client
décide comment rendre `""` + location »). Le correctif respecte ce partage.

**Le web.** Vérifié plutôt qu'hérité du cycle 53 : sa ligne ne rend aucune
épingle, et `PREVIEW_GROUP_KEYS` consomme déjà `location` — le champ neuf sur le
chemin REST n'y crée donc aucun champ fantôme.

**Android.** Vérifié dans le code, non hérité : `conversation:updated` y
déclenche `refreshSilently()` → `repository.refresh()`, un GET REST complet. Il
ne peut pas perdre un champ qu'il n'applique pas.

## 8. Pistes pour le cycle 55 — repérées, NON livrées

1. **`senderId` reste non mappé côté SDK** (§7). L'app résout le nom pour les DM
   depuis la RAM ; le SDK ne le fait pas, donc la ligne persistée perd son auteur
   à chaque changement d'identité et ne le retrouve qu'au prochain
   `GET /conversations`. Ajout de comportement assumé — à instruire pour
   lui-même, avec la question « pourquoi le SDK n'a-t-il pas la règle DM que
   l'app a ? ».
2. **Le mapping manuel est toujours manuel.** Ce cycle a réparé le champ, pas la
   classe : rien n'empêche le prochain champ ajouté à `ConversationUpdatedEvent`
   de tomber au même endroit. Deux sorties possibles — un témoin d'exhaustivité
   sur le mapping (qui échoue quand l'événement gagne un champ que le store
   pourrait vouloir), ou la fusion des deux types. La deuxième est la piste n°3
   du cycle 53, toujours ouverte.
3. **`handleMessageDeleted` (web) renonce encore quand le cache messages est
   vide** — piste n°1 du cycle 53, intacte.
4. **Le web n'a aucune garde monotone sur le groupe d'aperçu** — piste n°2 du
   cycle 53, intacte. Le contrat parle « des clients » au pluriel pour une règle
   qu'un seul tient.
5. **`PUT /conversations/:id` accepte toujours de renommer un DM** — cycle 51,
   piste n°3, intacte.

## 9. Ce que ce cycle apprend

La leçon 213 disait : une classification « correct par construction » héritée
d'une vague antérieure est une hypothèse, pas un fait. Ce cycle en montre le
symétrique, et il est plus vicieux — **une piste léguée avec sa preuve déjà
faite peut être laissée intacte parce qu'elle a l'air résolue.** Le cycle 50
avait « corrigé `location` ». Il avait corrigé UN des deux consommateurs, et le
cycle 53 le savait puisqu'il écrit noir sur blanc que c'est ce mapping qui l'a
laissé tomber. Trois cycles ont lu cette phrase sans aller voir si le mapping
avait changé. Détail : voir leçon 214.
