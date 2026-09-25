## Leçon 260 — « jumelles » est un COMPTE, et un compte se vérifie

**Cycle 118.** `/CLAUDE.md` §« Règles critiques du Prisme » #3 se terminait par
« Sources de vérité **jumelles** : `resolveLastMessagePreview()` … et
`MeeshyConversation.resolvedLastMessagePreview` … — toute évolution touche les
deux ». Le dépôt a TROIS clients. Le troisième — Android — ne portait pas la
règle du tout : son `ApiConversation` ne déclarait ni `lastMessageTranslations`
ni `lastMessageOriginalLanguage`, donc le décodeur (`ignoreUnknownKeys = true`)
les jetait en silence et la ligne de liste rendait `lastMessage.content`, la
langue de l'EXPÉDITEUR, pour tout lecteur, à chaque démarrage.

Le mot « jumelles » n'était pas une erreur d'écriture : il DÉCRIVAIT l'état du
dépôt au moment où il a été écrit, et il a cessé d'être vrai quand un troisième
client est né. Personne ne l'a recompté, parce qu'une phrase qui nomme
exhaustivement ses sites se relit comme une définition, pas comme une mesure.

> Même famille que « un tri est une AFFIRMATION » (86 bis), « un compte est une
> AFFIRMATION » (93) et « un commentaire qui ÉNONCE une contrainte est une
> AFFIRMATION » (94), avec ceci de particulier : **le nombre était juste le jour
> où il a été écrit.** Il n'a pas été faux, il l'est DEVENU — comme le
> commentaire d'impossibilité du cycle 108. Devant toute énumération de sites
> dans un document (« les deux émetteurs », « les trois clients », « les cinq
> surfaces »), la question n'est pas « est-ce exact ? » mais **« combien y en
> a-t-il AUJOURD'HUI ? »**, et elle se répond en comptant dans le dépôt.

### Corollaire — un champ non DÉCLARÉ est perdu DEUX FOIS quand le cache stocke la charge

`ConversationCacheSource` ne persiste pas des colonnes, il persiste
`encodeToString(conversation)` et relit `decodeFromString`. Un champ absent du
modèle disparaît donc au décodage de la réponse **puis** à la ré-écriture dans
Room. Aucune correction d'aval — un résolveur, une vue — n'aurait eu quoi que ce
soit à lire : c'est la déclaration, et elle seule, qui ouvre le canal.

C'est le miroir client exact de « un schéma de réponse sans `properties`
EFFACE » : les deux plateformes ont un point où une déclaration manquante ne
produit pas une erreur mais un SILENCE, et le silence a la forme d'un produit
qui marche.

### Corollaire — un ACQUIS ne se propage pas d'un composant à son voisin immédiat

Le plus cher de ce cycle. `ConversationListScreen` porte `state.currentUser` et
le passe — DEUX CENTS LIGNES PLUS BAS, DANS LE MÊME FICHIER — à la carte
d'aperçu au appui long, qui applique le Prisme message par message. La rangée
juste derrière composait `messageSummaryLine(message = conversation.lastMessage)`,
brut. La donnée était là, la règle était connue, la surface secondaire était
conforme, et la surface que tout le monde voit à chaque lancement ne l'était pas.

> Quand une règle produit est implémentée sur une surface SECONDAIRE (une carte
> d'aperçu, une feuille de détail, un survol), la question suivante est :
> **« quelle est la surface PRIMAIRE du même contenu, et la porte-t-elle ? »**.
> La secondaire est souvent la plus récente, donc la plus soignée — et c'est
> exactement ce qui rend l'écart invisible.

### Corollaire de choix — entre deux jumeaux qui divergent, suivre celui qui PRODUIT ce qu'on compare

Le résolveur canonicalise trois sources de codes de langue. Les deux jumeaux
existants ne le font pas pareil : iOS écrit `normalizeLanguageCode(x) ??
x.lowercased()`, TS écrit `normalizeLanguageCode(x) ?? sous-tag primaire ??
x.toLowerCase()`. Le discriminant n'est ni l'ancienneté ni la majorité, c'est
**qui produit les clés comparées** : la passerelle bâtit les clés de la carte
avec `normalizeLanguageForDedup` (TS), donc s'aligner sur le TS garantit qu'une
langue du lecteur canonicalise sur la clé RÉELLEMENT présente sur le fil.

### Corollaire de témoin — un prisme à UNE langue ne peut pas prouver qu'on lit la langue d'origine

Le témoin « le lecteur anglophone reçoit l'original » écrit avec un prisme
`["en"]` passe même si `lastMessageOriginalLanguage` est jeté : aucune clé `en`
dans la carte ⇒ repli sur l'original, la bonne réponse pour la mauvaise raison.
Il faut `["en", "fr"]` avec une traduction française disponible : sans le champ,
le résolveur descend au rang 2 et sert le français. **La donnée qu'un témoin
prétend garder doit être la SEULE chose qui décide de son issue.**

---
