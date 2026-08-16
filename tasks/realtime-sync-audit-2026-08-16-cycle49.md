# Cycle 49 — le serveur disait « il n'y a plus rien », et quatre clients entendaient « je ne parle pas de ça »

## 1. D'où vient la piste

Le cycle 46 bis la lègue textuellement, en la laissant ouverte sur une question :

> `emitConversationPreviewUpdate` sait dire « ce lecteur n'a plus AUCUN message
> visible ici » : `messagePayloadFor(null)` sort alors `lastMessageAt: null`,
> `lastMessageId: null`, et le prisme vide. Côté SDK, `merging` n'applique QUE
> des valeurs non-nil (`if let v = event.lastMessageId`) : un payload
> entièrement nul laisse donc la ligne afficher l'aperçu d'avant, drapeau ou
> pas. […] À établir avant d'écrire : `resolvedLastMessagePreview` et la ligne
> de liste savent-ils rendre une conversation sans dernier message, ou faut-il
> d'abord leur en donner la forme ?

**Réponse : ils savent déjà.** `resolvedLastMessagePreview` rend `nil` quand
`lastMessagePreview` est `nil`, et `ThemedConversationRow` traite ce `nil` sans
rien inventer (`if let preview, !preview.trimmingCharacters(…).isEmpty`), y
compris pour VoiceOver. Aucune forme nouvelle à introduire : la ligne vide était
rendable depuis toujours, personne ne la lui demandait jamais.

La seule chose qui manquait, c'est la façon de la lui demander.

## 2. Le constat

Le geste : un lecteur supprime pour lui (`delete-for-me`) ou purge son
historique (`clear-history`) le dernier message qui lui restait dans une
conversation. `resolvePersonalPreviewOverrides` ne trouve aucun remplaçant et
pose `null` pour lui ; l'émetteur sert `messagePayloadFor(null)` + le prisme du
message `null`. Le payload qui part :

```json
{
  "conversationId": "…", "updatedBy": {"id": "…"}, "updatedAt": "…",
  "previewRecalculated": true,
  "lastMessageAt": null, "lastMessageId": null, "senderId": null,
  "lastMessagePreview": null, "lastMessageTranslations": null,
  "lastMessageOriginalLanguage": null
}
```

**Le serveur dit exactement la vérité.** Un témoin de forme le fixe désormais
(`emitConversationPreviewUpdate.emptyPreview.test.ts`), et il est passé VERT
d'emblée : rien à corriger côté gateway. Tout le défaut est dans la lecture.

`ConversationStore.merging` traversait ce payload ainsi :

| Champ | Lecture | Effet |
|---|---|---|
| `lastMessageAt` | `if let incoming` | jeté → **horodatage périmé conservé** |
| `lastMessageId` | `if let v` | jeté → **id périmé conservé** |
| `lastMessagePreview` | `if let v` | jeté → **texte périmé conservé** |
| `lastMessageTranslations` | `if case .replaced` (tri-état) | **appliqué** → carte vidée |

Le seul champ déjà tri-étaté depuis le cycle 46 bis était donc le seul à
s'appliquer — et c'est ce qui rend le symptôme pire que « rien ne bouge » :

> Le lecteur masque un message anglais qu'il lisait traduit en français. La
> carte du Prisme s'efface, l'aperçu brut reste. La ligne passe de
> **« Bonjour »** à **« Hello »**.

Le geste de masquage **expose l'original** du message masqué, dans la seconde,
et l'y laisse indéfiniment : plus aucun message ne viendra dans cette
conversation remplacer une ligne que le lecteur a précisément vidée.

## 3. Pourquoi `Optional` ne pouvait pas suffire

Trois des quatre champs du groupe arrivent nuls aussi dans un payload
parfaitement anodin — un renommage, un changement d'avatar (`core.ts`) n'emporte
AUCUNE clé `lastMessage*`, ce que son propre commentaire revendique déjà :

> Le payload ne porte AUCUNE clé `lastMessage*`, et c'est délibéré : le
> tri-état client distingue « clé absente » de « clé nulle ».

Donc « `lastMessageAt == nil` ⇒ vider » effacerait l'aperçu de **toutes** les
lignes à chaque changement de titre. Le défaut symétrique, et bien plus visible
que celui qu'on ferme.

Il fallait un champ dont l'ABSENCE et la NULLITÉ se distinguent sur le fil.
`lastMessageId` est le seul candidat, et c'est aussi le bon sémantiquement :
il NOMME le message dont la ligne parle. `nil` y veut dire « aucun », pas
« inconnu ».

**La solution existait déjà dans le fichier d'à côté**, introduite au cycle 46
bis pour la carte du Prisme et pour la même raison exactement :
`LastMessagePreviewTranslations.unchanged` / `.replaced([:])`. Ce cycle ne fait
que l'appliquer une seconde fois, au champ voisin.

## 4. Le correctif

### 4.1 Le tri-état

```swift
public enum LastMessageIdentity: Sendable, Hashable {
    case unchanged          // clé absente : cet événement ne parle pas du dernier message
    case replaced(String?)  // clé présente ; nil = plus AUCUN message visible
}
```

Décodé par `container.contains(.lastMessageId)`, comme son jumeau. `String?`
disparaît de `ConversationUpdatedEvent` et de `ConversationUpdatedStoreEvent` —
le remplacer plutôt que l'accompagner d'un booléen est ce qui rend le cas
impossible à oublier : chaque lecteur doit désormais choisir une branche.

Un seul appelant garde le droit d'ignorer la distinction, et il le déclare :
`lastMessageIdValue` sert le chemin du bump, atteint uniquement quand
`lastMessageAt` a AVANCÉ — ce qu'un vidage ne fait jamais.

### 4.2 Le vidage, central

`MeeshyConversation.clearLastMessage()` remet à zéro **onze** champs :
`lastMessageId`, `lastMessagePreview`, `lastMessageTranslations`,
`lastMessageOriginalLanguage`, `lastMessageAttachments`,
`lastMessageAttachmentCount`, `lastMessageSenderName`, `lastMessageIsBlurred`,
`lastMessageIsViewOnce`, `lastMessageExpiresAt`, `lastMessageLocation`.

Pourquoi central et non recopié chez chaque consommateur : **la ligne dit bien
plus que son texte.** Trois des onze champs (`isBlurred`, `isViewOnce`,
`expiresAt`) alimentent `lastMessageSummaryKind`, qui compose « Message
expiré » / « Message masqué » / « Vue unique ». Effacer le seul texte laisserait
donc la ligne annoncer l'expiration d'un message que le lecteur ne voit plus —
un vidage partiel se lit comme un bug, là où l'absence de vidage se lisait au
moins comme un retard.

Rend `false` quand il n'y avait déjà rien à vider : un doublon d'événement ne
traverse pas le store, le cache disque et le rendu pour n'y rien changer.

### 4.3 `lastMessageAt` ne bouge pas, et c'est un choix

Le serveur envoie `lastMessageAt: null`. Le client le laisse tel quel.

Ce n'est pas une omission : `lastMessageAt` porte le **rang** de la ligne dans
la liste, et ce rang est une donnée GLOBALE — `Conversation.lastMessageAt` est
`@default(now())`, non nullable, et un masquage PERSONNEL ne la change pour
personne. Un `GET /conversations` juste après le vidage rendrait exactement la
valeur conservée ici. La reculer ferait plonger la ligne au fond de la liste
jusqu'à la synchro suivante, **qui la remonterait** — un mouvement visible, faux,
et transitoire.

La règle générale : *le rang d'une ligne et son contenu ne sont pas la même
donnée ; un événement qui vide l'un ne dit rien de l'autre.*

### 4.4 Les quatre surfaces

Aucune ne suffit seule, et trois d'entre elles portent la même règle en double
pour des raisons historiques :

| Surface | Rôle | Sans elle |
|---|---|---|
| `MessageSocketManager` (SDK) | décodage | `.unchanged` partout, correctif inerte |
| `ConversationStore.merging` (SDK) | fusion RAM **et** cache disque (`ConversationSyncEngine` appelle la même fonction) | la ligne du store garde l'aperçu |
| `ConversationStoreSocketBridge` | pont événement → store | tri-état aplati, correctif inerte **sans aucun autre témoin rouge** |
| `ConversationListViewModel` (app) | implémentation parallèle du même événement | l'écran garde l'aperçu même si le store l'a vidé |

Le pont mérite sa mention : c'est le maillon qui manquait pour `updatedAt`, puis
qu'il a fallu penser pour `previewRecalculated` au cycle 46 bis. Il recopie un
SOUS-ENSEMBLE des champs décodés, et un champ oublié n'y produit aucune erreur —
juste un correctif qui ne s'exécute jamais. D'où son témoin de bout en bout.

### 4.5 Web — la même phrase, perdue ailleurs

`normalizeConversationPatch` recopiait déjà `lastMessagePreview: null` et
`lastMessageTranslations: null`. Mais la ligne web ne rend ni l'un ni l'autre :
elle rend `conversation.lastMessage` — un OBJET — et cache la ligne entière
quand il est absent (`{conversation.lastMessage && …}`). Rien ne le touchait.

Le patch vide donc l'objet que la ligne lit réellement, sur le même signal
(`lastMessageId` présent et nul). Au passage, `lastMessageId` cesse d'être
recopié dans le cache : le type `Conversation` (web) ne le déclare pas et aucun
lecteur ne l'interroge — c'était un champ fantôme ajouté à chaque ligne.

### 4.6 Android est indemne, et c'est instructif

`ConversationListViewModel.kt` réagit à `conversation:updated` par
`refreshSilently()` — un aller-retour REST complet. Il ne peut pas mal lire un
payload qu'il ne lit pas. Sa `ConversationUpdatedSocketEvent` ne déclare que
`{conversationId, title, description, avatar, updatedAt}`.

C'est le choix inverse de celui d'iOS et du web : immunité totale aux défauts de
lecture, payée d'une requête par événement. Rien à corriger ici, mais la
comparaison mérite d'être notée — la classe de défaut fermée par ce cycle
n'existe que chez les clients qui appliquent le delta.

### 4.7 La dernière copie du geste, découverte en le centralisant

`ConversationSyncEngine.recomputeLastMessagePreviewAfterDeletion` connaissait
déjà l'état « plus aucun message » — mais découvert LOCALEMENT (le message
supprimé était le seul du cache), et il le posait à la main :

```swift
updated[idx].lastMessagePreview = ""
updated[idx].lastMessageId = nil
```

Deux champs sur onze. La pastille de pièce jointe, l'épingle de position, le nom
d'expéditeur et les trois drapeaux éphémères continuaient de décrire le message
supprimé — exactement le vidage partiel que §4.2 nomme comme pire que pas de
vidage. Ce site appelle désormais `clearLastMessage()` : *le même fait, qu'il
soit reçu du serveur ou déduit du cache, s'écrit avec le même geste.*

Son témoin passe de `lastMessagePreview == ""` à `== nil` et gagne deux
assertions (position, pièces jointes). Les deux valeurs rendent identiquement —
`resolvedLastMessagePreview` sert `nil` dans un cas, `""` dans l'autre, et la vue
teste déjà `!isEmpty` — mais une seule dit ce que le modèle veut dire.

## 5. Gates

- [x] **3 témoins gateway** (`emitConversationPreviewUpdate.emptyPreview.test.ts`),
      verts d'emblée : ce sont des PINS de contrat, pas des RED. Ils fixent la
      **PRÉSENCE** des clés autant que leur nullité — omettre des clés toutes
      nulles est l'optimisation la plus naturelle du monde, et rendrait le signal
      indistinguable d'un renommage. Double prisma COMPLET (l'émetteur avale ses
      pannes — leçon du cycle 40). Contre-épreuve incluse : le participant qui
      n'a rien masqué reçoit le vrai message, clés pleines.
- [x] **3 témoins de décodage** (clé absente → `.unchanged`, clé nulle →
      `.replaced(nil)`, clé pleine → `.replaced(id)`).
- [x] **4 témoins de fusion** : le vidage COMPLET (les onze champs + le
      résolveur du Prisme qui ne rend plus rien dans aucune langue) ; le rang
      conservé ; le renommage qui ne vide RIEN ; l'idempotence sur doublon.
- [x] **1 témoin de bout en bout à travers le pont.**
- [x] **2 témoins app** (`ConversationListViewModelTests`) : le vidage, et la
      contre-épreuve du renommage.
- [x] **4 témoins web**, dont un RED **prouvé** (fix retiré → 1 rouge, remis →
      9 verts) : l'objet que la ligne rend, le rang conservé, l'id plein qui ne
      vide pas, le renommage qui ne vide pas.
- [x] Contre-épreuve du renommage présente sur **chacune des quatre surfaces** —
      c'est le défaut symétrique, et il serait bien plus visible.
- [x] `bunx tsc --noEmit` gateway : **0**.
- [x] Web : **aucune erreur `tsc` nouvelle** (comparaison ensembliste
      avant/après sur le projet, qui en porte 1233 préexistantes).
- [x] Suite gateway COMPLÈTE : **733 suites / 17 850 tests** verts (399 s).
      Le diff gateway est un unique fichier de tests : +1 suite, +3 témoins.
- [x] Swift vérifié par CI (`sdk-tests.yml` pour le SDK, `ios.yml` pour l'app) —
      aucune toolchain Swift dans ce conteneur, même contrainte qu'aux cycles 40
      et 46 bis.

## 6. Écarté délibérément

**Rendre `lastMessageAt` optionnel sur `MeeshyConversation`.** Ce serait la
lecture littérale du payload. Rayon d'action : le tri de la liste, le
`renderFingerprint`, le décodage REST, le schéma GRDB, et chaque site qui compare
deux horodatages — pour représenter un état que le serveur ne met JAMAIS en
cause (`Conversation.lastMessageAt` est non nullable en base). Le `null` du
payload dit « ce message n'a pas d'horodatage », pas « cette conversation n'a
pas de rang ».

**Conditionner le vidage à `previewRecalculated`.** Tentant comme ceinture de
sécurité. Mais le tri-état EST déjà le discriminant : seul l'émetteur qui
recalcule produit un `lastMessageId` présent et nul (audit exhaustif des trois
émetteurs de `conversation:updated`). Un second verrou n'aurait ajouté aucune
garantie, et aurait fait ignorer un payload qui dit explicitement « plus rien ».
Le lien entre les deux est tenu par un témoin gateway plutôt que par une
condition client.

**Vider aussi `recentMessages` et `bridge`.** Deux facettes voisines, servies par
d'autres chemins (la Lentille a son propre cycle de vie). Les emporter ici
aurait élargi le geste au-delà de ce que le payload déclare.

## 7. Pistes pour le cycle 50 — repérées, NON livrées

1. **`ConversationListViewModel` porte une deuxième implémentation de
   `merging`.** Ce cycle est le TROISIÈME consécutif (46 bis, 47 par ricochet,
   48) à devoir corriger le même événement à deux endroits qui ont divergé — le
   store jette le groupe entier là où l'écran en applique les trois quarts, et
   inversement. Les deux sont désormais d'accord sur le vidage, mais rien ne le
   garde. La règle pure existe déjà (`ConversationStore.merging`, `nonisolated
   static`, appelée par le cache disque pour cette raison précise) : l'écran
   pourrait l'appeler aussi. À instruire avant d'écrire — l'écran fait DEUX
   choses de plus que le store (`bumpToTop` avec résolution du nom d'expéditeur,
   `schedulePersist`), et les fusionner naïvement les perdrait.

2. **Les trois émetteurs de `conversation:updated` composent leur payload à la
   main.** `core.ts` n'emporte aucune clé `lastMessage*` — correct, et
   uniquement parce que quelqu'un y a pensé et l'a écrit en commentaire. Rien
   n'empêche un quatrième émetteur d'y ajouter un `lastMessageId: null` par
   inadvertance (un spread de champs changés, par exemple), ce qui viderait
   silencieusement les lignes. Un constructeur de payload partagé — ou un témoin
   qui énumère les émetteurs — refermerait la classe.

*(La troisième piste repérée — le vidage à la main de
`ConversationSyncEngine.recomputeLastMessagePreviewAfterDeletion` — était petite,
mécanique et sûre : elle a été **livrée dans ce cycle**, cf. §4.7, plutôt que
reportée.)*
