# Cycle 217 — une liste nommée par une SOUS-CATÉGORIE n'a pas de place pour la famille suivante (#20336)

*Routine « amélioration continue du temps réel », sur `dev` à `de55d0d9a`.*

## Le fait

`createRealtimeConnection` (`apps/web/src/lib/api/socket.ts`) a deux rattrapages
dans `onAuthenticated` : la PREMIÈRE authentification (démarrage à froid) et les
SUIVANTES (reconnexion). La fenêtre qu'ils couvrent est la même — #10573 la
nomme : « le socket se branche APRÈS la première peinture ; ce qui est parti
entre la lecture REST et l'entrée dans les rooms était perdu ».

Quatre familles ne vivaient que dans la branche de reconnexion :

| famille | reconnexion | première connexion | posée par |
|---|---|---|---|
| `FEED_QUERY_KEY` (exact) | ✅ | ❌ | #18641 |
| `STORY_TRAY_QUERY_KEY` | ✅ | ❌ | #18641 |
| `STATUS_MOODS_QUERY_KEY` (exact) | ✅ | ❌ | #18914 |
| `CONVERSATION_CATEGORIES_QUERY_KEY` | ✅ | ❌ | #18641 |

Au démarrage à froid, une publication, une story, une humeur ou une catégorie
qui bouge dans cette fenêtre n'atteignait jamais l'écran — jusqu'au prochain
montage ou à l'expiration de la fraîcheur. Ce sont exactement les surfaces
qu'on peut REGARDER pendant cette fenêtre : les `post:*`, `story:*` et
`status:*` n'atteignent un socket qu'une fois `publicationRooms.rejoin()` passé,
et les `category:*` qu'une fois la room personnelle rejointe.

## Pourquoi ce n'est pas le défaut de #18573, mais sa RÉCIDIVE

#18573 avait mesuré exactement cette divergence, l'avait corrigée, et avait
écrit la leçon sur place :

> « elles étaient épelées dans la seule branche de reconnexion, et trois lots de
> suite y ont ajouté la leur sans voir l'autre branche : c'est cette absence de
> liste, et non un arbitrage, qui a laissé la cloche mentir après chaque
> démarrage à froid »

Son correctif structurel — une liste déclarée UNE fois — **n'a pas tenu deux
lots**. La cause n'est pas l'absence de liste : c'est son NOM.
`CATCH_UP_PERSONAL_FAMILIES` annonce une sous-catégorie ; un lot qui ajoute une
famille de PUBLICATION n'y trouve pas sa place et écrit un `invalidateQueries`
en ligne juste en dessous, à trois lignes de la boucle.

> **Une liste nommée par une SOUS-CATÉGORIE est une liste qu'un lot finira par
> contourner sans se sentir en faute.** Le nom d'un site unique n'est pas une
> étiquette : c'est le prédicat d'appartenance, et c'est lui qu'on consulte pour
> savoir si l'on a le droit d'écrire ailleurs. Nommer par la PROPRIÉTÉ — ce que
> la fenêtre a emporté — plutôt que par la famille qui s'y trouvait d'abord.

C'est la leçon 261 vue d'un autre côté (« un lot ferme une classe dans SA
langue »), appliquée non pas à une énumération mais au NOM de la liste qui la
porte.

## Les DEUX témoins qui gelaient la lacune

Aucun des deux ne pouvait tomber, et les deux affirmaient le contraire de ce que
le produit veut :

| fichier | témoin |
|---|---|
| `socket-missed-catch-up.test.ts:337` | « les trois familles se périment à la RECONNEXION, **jamais à la première authentification** » |
| `socket-status-moods-realtime.test.ts:116` | « une RECONNEXION relit les humeurs — **jamais la première authentification** » |

Le second n'avait pas été vu au relevé initial : il vit dans un fichier de
famille, pas dans le fichier du rattrapage. **Il s'est présenté en faisant
tomber la suite complète** — la mesure a trouvé ce que la lecture avait manqué.

Dans les deux cas, le `jamais` n'a **aucune raison écrite**. Les doc-comments
instruisent pourquoi ces familles doivent le rejeu de COUPURE, jamais pourquoi
elles ne devraient pas celui du DÉMARRAGE : le témoin décrit ce que le lot a
FAIT, pas ce que le produit veut. C'est mot pour mot ce que le bloc #10573
reproche, soixante lignes plus haut, à l'assertion de la cloche d'avant #18573 :

> « L'assertion gelait une lacune sous les apparences d'une décision. »

**Écrire une règle ne l'applique pas au fichier qui l'écrit**, même quand elle
est à soixante lignes.

## Ce que le lot écrit

- **`CATCH_UP_FAMILIES`**, nommée par la propriété, porte les NEUF familles. Les
  deux branches l'itèrent ; **seul le PRÉDICAT les sépare** (`servedAndAtRest`
  au démarrage à froid), ce que `catchUpFirstAuthentication` affirmait déjà et
  qui était faux depuis deux lots.
- **La portée voyage AVEC la clé**, et elle est **REQUISE** : `exact: boolean`,
  jamais optionnel. Un défaut implicite se lit comme un arbitrage qui n'a pas eu
  lieu, et deux de ces neuf clés ont un voisin sous leur racine
  (`['feed','new-count']`, le rail des stories). Même règle que « le silence
  n'est jamais la réponse » des schémas de réponse. `exactOptionalPropertyTypes`
  l'a d'ailleurs exigé.
- **Les CONVERSATIONS restent écrites à la main** : c'est la seule famille dont
  la portée diffère légitimement entre les deux branches (#7420), et le dire est
  moins cher que de l'encoder.
- **Un cliquet de SOURCE**, parce qu'un témoin de comportement atteste les
  familles qu'il NOMME, et que la dixième n'y est nommée nulle part — c'est
  ainsi que la suite est restée verte pendant deux lots. Il compte les
  `invalidateQueries` du corps d'`onAuthenticated` : il doit y en avoir DEUX,
  la racine des conversations et la boucle. Quand il tombe, la réparation est
  d'entrer la famille dans la liste, jamais d'élargir le compte.

## Ce que l'élargissement coûte, exactement

`servedAndAtRest` + `refetchType: 'active'` : seules repartent les familles déjà
servies, au repos, et OBSERVÉES — c'est-à-dire exactement celles qui ont une
fenêtre. Trois témoins par famille le mesurent.

**La première rédaction de ce paragraphe disait « GRATUIT », et c'était faux.**
Le cache de requêtes du web est PERSISTÉ (`dehydrate`/`hydrate`,
`query-client.ts` ; seules les clés souveraines, `admin` et hors-disque en
sortent), donc au démarrage à froid une famille RESTAURÉE est servie et au
repos : elle repart. Le coût réel est d'UNE relecture par famille restaurée et
observée — sur l'écran de la liste, les catégories ; sur le fil social, le fil,
le rail et les humeurs.

C'est le prix de la justesse, et c'est le MÊME que les cinq familles
personnelles paient depuis #18573. Mais le nommer « gratuit » l'effaçait
précisément là où ce lot agit le plus : **sur un cache restauré, qui est le cas
où la fenêtre a vraiment emporté quelque chose.** Une affirmation de coût est
une affirmation comme une autre — elle se mesure contre le mécanisme qui la
dément, ici la persistance, et pas contre le prédicat seul.

## Preuve du ROUGE

| mutation | ce qui tombe |
|---|---|
| production d'avant le lot | les 4 témoins « relue dès la PREMIÈRE authentification », et rien d'autre |
| production d'avant + témoins d'origine (suite complète) | les 2 témoins qui gelaient la lacune, et eux seuls |
| un `invalidateQueries` de plus dans la branche de reconnexion | **le cliquet de source, SEUL** (47 pass / 1 fail) |

## Gates

| gate | résultat |
|---|---|
| `bun test src/lib/api/socket-missed-catch-up.test.ts` | **48 verts** (30 avant le lot) |
| `bun test src/lib/api/` | **4679 verts / 0 rouge**, trois exécutions |
| `tsc --noEmit` (web) | **0** |

## Suivi

- **Les trois autres plateformes ne sont pas mesurées.** #18641 cite la parité
  iOS (`FeedViewModel+Socket`, `StoryViewModel`, `categoryStore.hydrate()`) pour
  la RECONNEXION ; personne n'a demandé ce que leur PREMIÈRE connexion rattrape.
  La question qui vaut ici vaut là : *ces deux chemins prennent-ils la même
  liste, et qu'est-ce qui le tient ?* Issue à ouvrir si la mesure rend un écart.
