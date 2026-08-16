# Cycle 53 — le geste savait retirer l'épingle, pas la reposer

## 1. D'où vient la piste

Du cycle 52, §8 n°2, qui nomme le champ :

> **Les deux ÉVÉNEMENTS avant les deux FUSIONS** — la piste n°1 du cycle 51,
> intacte. `ConversationUpdatedEvent` (app) et `ConversationUpdatedStoreEvent`
> (SDK) portent des champs différents, reliés par un mapping manuel de quinze
> lignes. **C'est ce mapping qui a laissé passer `location`** (cycle 50).

Ce cycle ne referme pas le mapping en général — il ferme le champ nommé, parce
que le correctif du cycle 52 vient d'en faire une perte SYSTÉMATIQUE là où ce
n'était qu'une lacune.

## 2. Ce que le cycle 52 a changé pour `location`

`adoptLastMessage(id:)` remet à neutre les onze champs qui DÉCRIVENT le message
dès que l'identité change — `lastMessageLocation` comprise, à juste titre : une
épingle survivante décrirait la position d'un message qui n'est plus là.

Sauf que `location` n'est pas comme les dix autres. **Elle voyage.** Les deux
émetteurs la hissent quand le nouveau dernier message est géolocalisé :

```ts
// emitConversationPreviewUpdate.ts — messagePayloadFor
...(place ? { location: place } : {})
// MessageHandler.ts:1366 — même forme
return place ? { location: place } : {};
```

`ConversationUpdatedEvent` la décode. `ConversationListViewModel` la lit et la
repose. Mais `ConversationUpdatedStoreEvent` **ne la porte pas**, et
`mapConversationUpdated` ne la recopie donc pas : le store n'a jamais eu accès
au champ. Avant le cycle 52 il n'y touchait pas non plus — une épingle périmée
survivait, ce qui était faux mais visible. Depuis, le store la **retire** sans
pouvoir jamais la **reposer** :

```
message géolocalisé reçu, écran de liste ouvert
   ├── ConversationListViewModel.sink → l'épingle s'affiche                    ✔
   └── ConversationSyncEngine.handleConversationUpdated
         → ConversationStore.merging → adoptLastMessage retire l'épingle
                                     → rien ne la repose (champ absent du type)  ✘
         → cache.conversations.update(for: "list")        ← ÉCRITURE DISQUE
         → _conversationsDidChange.send()
               → ConversationListViewModel.reloadFromCache
                     → setConversations(data)             ← L'ÉPINGLE DISPARAÎT
```

`reconciling(rows:with:removing:)` le dit noir sur blanc : « les champs
`lastMessage*` sont la propriété du cache disque ». L'épingle que l'écran vient
de poser est donc écrasée dans la seconde, et elle ne revient qu'au prochain
`GET /conversations`.

*Le cycle 52 a raison sur le fond — retirer est le bon défaut quand on ne sait
pas. Ici on sait : le serveur le dit, l'événement le porte, et seul le type
intermédiaire l'ignorait.*

## 3. Le correctif

Trois lignes de plomberie, sur le chemin exact que la piste nommait :

| Fichier | Changement |
|---|---|
| `ConversationStore.swift` | `ConversationUpdatedStoreEvent.location: SharedPlace?` (+ init) |
| `ConversationStoreSocketBridge.swift` | `location: event.location` dans `mapConversationUpdated` |
| `ConversationStore.merging` | repose `conv.lastMessageLocation = event.location` AVEC l'identité |
| `SharedPlace.swift` | `Equatable` → `Hashable` (conformance synthétisée) — le type entre dans une valeur `Hashable` par contrat de son store |

La repose est écrite **avec l'identité et jamais seule**, comme sur l'écran :
`nil` y est la bonne valeur (le remplaçant n'a pas de position), pas une absence
à ignorer. Un `if let` y remettrait le défaut d'origine — l'épingle de l'ancien
message survivant à un texte.

## 4. Les témoins

**5 neufs**, un par maillon du chemin :

| Témoin | Ce qu'il fige |
|---|---|
| `ConversationStoreTests.test_applyConversationUpdated_newLastMessageWithLocation_carriesThePin` | l'épingle du nouveau message arrive |
| `…_newLastMessageWithoutLocation_clearsThePin` | **contre-épreuve** : un texte qui remplace un lieu efface la pastille |
| `…_editOfALocationMessage_keepsThePin` | une édition ne dépouille pas le message de son épingle |
| `ConversationStoreSocketBridgeTests.test_conversationUpdated_location_forwardedThroughTheBridge` | **le MAPPING** — un champ décodé mais non recopié est inerte |
| `ConversationSyncEngineRealtimePersistenceTests.test_applyingConversationUpdate_locationOfTheNewLastMessage_isPersisted` | **le cache disque**, chemin de la conséquence |

Les deux derniers portent l'essentiel : un témoin de `merging` seul ne voit ni
le mapping qui l'alimente ni le cache qu'il écrit, et c'est par ces deux
maillons que le champ se perdait.

## 5. Écarté délibérément

**Fermer le mapping en général** — un témoin qui COMPARE les jeux de champs de
`ConversationUpdatedEvent` et `ConversationUpdatedStoreEvent`, comme le cycle 51
puis le cycle 52 le proposent. Toujours la bonne idée, et toujours pas prise
ici : ce cycle ferme le champ dont la perte était devenue systématique. Le
témoin structurel reste la piste n°1 ci-dessous, et il vaut mieux l'écrire une
fois pour toutes que de le déduire d'un troisième champ perdu.

**Étendre `LastMessageFacet` pour que `location` sorte de la remise à neutre.**
Tentant — elle voyage, contrairement aux dix autres — et faux : elle ne voyage
que QUAND elle existe. Le silence du payload est alors porteur (« ce message n'a
pas de position »), et l'exclure de la remise à neutre ferait survivre l'épingle
de l'ancien message. La reposer depuis l'événement dit exactement la bonne
chose dans les deux cas.

## 6. Sur la collision de ce cycle avec le 52

Ce cycle a d'abord été instruit et écrit **en entier** comme un cycle 52
indépendant, sur une session parallèle de la même routine, avant de découvrir
au `git fetch` final que la PR #3105 venait de livrer le même diagnostic et le
même correctif — jusqu'au nom du geste (`adoptLastMessage(id:)` contre
`adoptLastMessageIdentity(_:)`). Le travail dupliqué a été jeté ; ce journal ne
garde que la part qui manquait à #3105, et la leçon 212 en tire la règle.

Ce n'est pas une perte sèche : la convergence de deux instructions
indépendantes sur le même diagnostic, les mêmes trois sites et la même borne
d'identité est une confirmation qu'aucun témoin ne donne.

## 7. Pistes pour le cycle 54 — repérées, NON livrées

1. **Le témoin structurel du mapping.** Deux champs perdus en trois cycles
   (`location` au 50, puis à nouveau ici par l'autre bout) suffisent à payer un
   témoin qui compare les deux jeux de champs. Tant qu'il n'existe pas, chaque
   champ ajouté à `ConversationUpdatedEvent` est un pari.

2. **Le web** — piste n°1 du cycle 52, intacte et toujours la plus grosse : sa
   ligne rend l'OBJET `conversation.lastMessage`, que le patch de
   `conversation:updated` ne touche pas. Décision de RENDU à instruire, pas
   règle de fusion.

3. **`PUT /conversations/:id` accepte toujours de renommer un DM** (cycle 51,
   piste n°3) — inchangée.

## 8. Gates

- **Swift** : pas de toolchain sur cet hôte. Le RED n'a pas été EXÉCUTÉ ; il est
  raisonné, et chaque témoin énonce le champ précis qu'il verrouille.
  `sdk-tests.yml` exécute les 5 témoins (tous SDK — aucun témoin app dans ce
  cycle, le chemin app était déjà correct). `ios.yml` compile app + cibles de
  test.
- **Aucun fichier TypeScript ou Python touché** : les suites gateway / web /
  translator ne sont pas concernées.
