# Meeshy Reader — le modèle de la LECTURE

> **Autorité déclarée sur le vocabulaire et les règles de la RESTITUTION**, comme
> `meeshy-composer-modele.md` l'est sur celui de la COMPOSITION. Les deux se
> lisent ensemble : le composer dit ce qu'on écrit, celui-ci dit ce qui le rend.
> Écrit le 2026-09-02 (issue #4769) ; tout ce qu'il affirme est mesuré dans le
> dépôt à cette date, et chaque affirmation cite son site.

## 0. Pourquoi ce document existe

La **loi 6** de la planche pose la doctrine :

> « Le lecteur EST l'aperçu : composer et viewers partagent un seul registre de
> rendu (`MeeshyScenePlayer`). L'aperçu du socle, la carte de feed, le viewer
> plein écran : trois chromes, un moteur. WYSIWYG par construction. »

Le composer a son document de sémantique ; la lecture n'en avait aucun, et
`grep -rni "meeshy reader"` sur le dépôt rendait **zéro**. La moitié qui RESTITUE
n'avait donc pas de mots à elle — alors que c'est elle que l'utilisateur voit.

## 1. Le mot « lecteur », et ce qu'il ne doit plus désigner

**Le code est cohérent ; c'est la prose qui surcharge le mot.** Trois
énumérations emploient `reader`, et les trois disent la MÊME chose :

| site | `reader` y signifie |
|---|---|
| `ScenePlayerMode.reader` | la surface de lecture **plein écran** |
| `AudioForegroundChip.Mode.reader` (`.composer` / `.reader`) | **en lecture**, par opposition à en composition |
| la famille `StoryReader*` (`…Context`, `…Prefetcher`, `…TimerController`, `…LoadingOverlay`, `…Representable`) | l'hôte de la lecture plein écran d'une story |

> **`reader` = « en lecture, pas en composition ».** C'est un état, jamais une
> pièce. Les trois sites sont d'accord, et il n'y a rien à renommer.

Ce qui est faux, c'est la phrase de la loi 6 : **le moteur partagé n'est pas
« le lecteur »**, c'est **le PLAYER de scène** (`MeeshyScenePlayer`). Appeler
« lecteur » à la fois le moteur et l'un de ses trois modes oblige tout lecteur du
code à deviner lequel des deux on désigne — et la devinette n'est écrite nulle
part.

| ce qu'on désigne | le mot, en prose | le nom, en code |
|---|---|---|
| le moteur unique de rendu | **le player** (de scène) | `MeeshyScenePlayer` |
| le mode plein écran | **le lecteur**, ou la lecture plein écran | `ScenePlayerMode.reader` |
| l'état « pas en composition » | **en lecture** | `.reader` (chips, hôtes) |

**Corollaire, et c'est le seul changement que ce document demande** : la loi 6
se relit « **Le PLAYER est l'aperçu** : composer et viewers partagent un seul
registre de rendu ». Aucun renommage de code — 41 sites emploient
`ScenePlayerMode` correctement.

## 2. Ce que le player REÇOIT — une SCÈNE, jamais une publication

```swift
MeeshyScenePlayer(document: CanvasV3, mode: ScenePlayerMode, carrier: StoryItem?, …)
```

C'est la ligne de partage la plus importante du modèle de lecture, et elle est
**asymétrique** avec le composer :

| | le composer écrit | le player rend |
|---|---|---|
| unité | une `MeeshyPublication` → N `MeeshySlide` | **UNE** `MeeshyScene` |
| qui regroupe | le publieur, **selon le PROFIL** (§ 1 bis du modèle du composer) | **l'HÔTE**, jamais le player |

Le player ne sait rien d'une publication, d'une suite de slides, ni d'une
progression. Il peint **un document, une fois**. La pagination d'un viewer
story, la file d'un feed, l'ordre des slides : tout cela appartient à l'hôte qui
le monte.

**Le PORTEUR (`carrier`) est la seconde moitié de ce qu'il reçoit, et il n'est
pas optionnel en pratique.** Le document dit ce qu'il faut PEINDRE ; il ne dit
pas où vivent les pixels. L'adresse des médias vit dans le `StoryItem` porteur,
et `toRenderableSlide` hydrate **au READ** ce que le composer n'a pas stampé :
`aspectRatio` (le composer pose toujours la sentinelle `1.0`), `duration`,
l'adresse d'un clip audio, le backdrop legacy. Sans porteur, le player sert une
coquille — licite pour une scène purement textuelle, jamais pour un viewer.

> **Une scène v3 n'est pas auto-suffisante pour être PEINTE.** Elle l'est pour
> être transportée. Tout site qui croit pouvoir rendre un `CanvasV3` seul rendra
> une scène sans médias, sans durée et au mauvais ratio.

### Ce qui BOUGE dans une scène, et qui le fait bouger

Une scène n'est pas figée entre deux ticks : trois choses y vivent dans le
temps, et une seule est propre au player.

| ce qui vit | qui le fait vivre |
|---|---|
| les médias (vidéo de fond, clips de premier plan, son) | leurs `AVPlayer` et le mixer, calés sur le playhead |
| les images-clés (opacité, échelle, position authorées) | `StoryRenderer`, à chaque tick |
| **le MOUVEMENT d'une décoration** (`StorySticker.animation`) | `StoryRenderer`, par une post-passe qui repose la pose sur la couche |

Le mouvement d'une décoration est une **propriété de la charge, jamais un kind**
(le modèle du composer en donne la règle et la raison). Trois conséquences pour
la lecture, et ce sont celles qui décident de ce qu'un viewer doit faire :

- **c'est une fonction PURE du temps.** `pose(at:)` est reposée à chaque tick, en
  ABSOLU, jamais multipliée en place — une couche recyclée par le cache ne
  cumule donc pas les poses. C'est aussi ce qui rend l'export identique au
  lecteur : `layer.render(in:)` ignore le moteur d'animation de Core Animation,
  et une `CAAnimation` aurait bougé à l'écran pour rester figée dans le MP4 ;
- **`pose(at: 0)` est l'IDENTITÉ**, par contrat. Une vignette, une image de
  couverture ou un composite — tous rendus à `t = 0` — montrent la décoration
  telle que l'auteur l'a posée, sans avoir à connaître le mouvement ;
- **`reduceMotion` retire le mouvement, jamais la décoration.** Le lecteur perd
  la pose ; l'export le reçoit toujours à `false` — un fichier ne dépend pas du
  réglage d'accessibilité de l'appareil qui l'a fabriqué.

Un client qui ne sait pas rendre le mouvement peint la décoration FIXE et ne se
déclare pas amputé : c'est web et Android aujourd'hui (#4911), et c'est la
conséquence directe du choix « propriété, pas kind ».

## 3. Les trois chromes, et l'état MESURÉ de chacun

`ScenePlayerConfig(mode:)` est « la seule chose que le player décide de
lui-même ». Les trois modes ne diffèrent que par quatre témoins :

| mode | `isMuted` | `locksMute` | `loops` | `showsChrome` | monté par |
|---|---|---|---|---|---|
| `.reader` | non | non | non | **oui** | `StoryViewerView+Canvas` (2 sites) |
| `.card` | **oui** | **oui** | **oui** | non | `FeedSceneAutoplay` — `PostSceneCard` |
| `.preview` | non | non | non | non | **aucun site — retiré le 2026-08-24** |

`startsPaused` ne dépend PAS du mode : **les trois naissent en pause**, y compris
le plein écran, dont la lecture démarre par la commande du viewer.

> **La colonne « monté par » a changé le 2026-09-05 sans qu'aucune règle bouge.**
> Elle disait `FeedPostCard` ; l'extraction de `FeedSceneAutoplay.swift`
> (`0110db94f4`, #5227) y a déplacé le montage, `FeedPostCard` n'en gardant que
> l'hôte (`PostSceneSurface`). C'est le mode de péremption propre à ce document :
> **un numéro de ligne meurt à la première extraction, un nom de symbole
> survit.** Les ancrages en `fichier:ligne` ont donc été retirés des deux
> tableaux de ce paragraphe au profit de commandes rejouables — même parade que
> pour les sept sites de `StoryReaderRepresentable` ci-dessous.

`isMuted` et `locksMute` se lisent ENSEMBLE : le premier dit ce que le mode
PROPOSE quand l'hôte ne demande rien, le second si l'hôte a seulement le droit de
demander. Seule la carte de fil verrouille — un viewer porte son propre muet
persistant, piloté au rail.

### Le player n'est PAS le seul chemin de rendu — et « trois chromes » ne les compte pas tous

Le tableau ci-dessus énumère les hôtes de **`MeeshyScenePlayer`**. Il en existe
un **quatrième chemin**, qui ne passe par aucun `ScenePlayerConfig` :
`StoryReaderRepresentable`, monté à **sept** fichiers (recompté le 2026-09-05) :

```bash
git grep -l "StoryReaderRepresentable(" -- '*.swift'
```

`FeedPostCard` · `PostDetailView+Canvas` · `PostDetailView+RepostEmbed` ·
`StoryRepostEmbedCell` · `StoryViewerView+Canvas` · `MeeshyScenePlayer` ·
`UnifiedPostComposer`.

Le viewer story monte donc **les deux** : le player et le représentable.

> **« Trois chromes, un moteur » décrit les hôtes du PLAYER, pas les surfaces qui
> rendent une scène.** La loi 6 reste vraie de ce qu'elle nomme ; elle ne couvre
> pas tout ce qui peint. Ne pas lire son énumération comme un inventaire.

> **Et ce paragraphe s'était lui-même pris au piège qu'il énonce** : il disait
> « quatre sites », trois lignes au-dessus d'un avertissement contre les
> énumérations lues comme des inventaires. Trois manquaient. La parade n'est pas
> d'énumérer mieux — c'est de publier la COMMANDE, ce que fait la version
> ci-dessus : une liste se périme en silence, une commande se rejoue.

### La scène 0 est figée PARTOUT, et c'est une décision que personne n'a écrite

`MeeshyScenePlayer` prend un `sceneIndex: Binding<Int>` — il SAIT paginer. Or
**cinq** sites élisent la scène 0, et aucun `@State` ni `$sceneIndex` n'existe
dans le dépôt : **aucun hôte ne pilote l'index.**

| site | forme |
|---|---|
| `StoryViewerView+Canvas` (2 sites) | `sceneIndex: .constant(0)` |
| `FeedSceneAutoplay` — `PostSceneCard` | `sceneIndex: .constant(0)` |
| **`StoryModels`** — `StoryEffects.init(from decoder:)` | littéral `0`, **en dur** |
| `StoryDraftStore` | littéral `0`, en dur |

```bash
git grep -n "sceneIndex: .constant(0)" -- 'apps/ios/Meeshy/**/*.swift'
git grep -n "sceneIndex: 0" -- 'packages/MeeshySDK/Sources/**/*.swift'
```

Les deux derniers ne passent par aucun `Binding` : un balayage qui cherche
`.constant(0)` les rate, et l'un d'eux est sur le chemin d'ÉCRITURE (le store de
brouillons), pas de lecture.

**Nuance qui évite d'en faire une perte** : le décodeur retient le document
ENTIER — `canvasV3 = document`, la ligne suivante. Ce qui est réduit à la scène 0
est la **projection runtime** en `StoryEffects`, jamais la donnée. Une scène 1
survivrait donc au décodage et à la sauvegarde d'un brouillon ; elle ne serait
simplement peinte par personne.

La lecture n'est donc prête pour M scènes qu'au niveau du TYPE. Chaque hôte a
déjà tranché « scène 0 », trois fois, en silence — pour la vignette de fil c'est
probablement juste, pour le viewer ce n'est écrit nulle part.

**Et ce n'est pas un défaut**, la distinction important pour savoir qui doit
agir : mesuré sur staging, `posts/feed?limit=25` rend **zéro** post portant un
`canvasV3`, donc zéro à plusieurs scènes. Le pont d'écriture étant mono-scène
(`scenes: [scene]`, #4770), le cas n'existe pas encore.

> **Une capacité qu'aucune donnée n'exerce n'est pas cassée — elle est NON
> ÉPROUVÉE.** Un défaut appelle un correctif ; une capacité non éprouvée appelle
> un témoin le jour où le producteur fabrique le cas. Écrire la décision
> « scène 0 » AVANT ce jour évite qu'on la « corrige » sans savoir qu'elle en
> était une.

### `.preview` est une absence DÉCLARÉE, pas un trou

L'œil du socle a été retiré au lot 4.9, et la raison est écrite au site
(`MeeshyComposerHost+Socle.swift`) :

> Il montait `MeeshyScenePlayer(mode: .preview)` sur
> `CanvasV3(migrating: viewModel.currentEffects)`, et **rien ne remplit
> `currentEffects`** sous les deux surfaces où le socle est peint : le mood n'a
> pas de canvas, le document n'a aucun outil d'ingestion servi. L'œil ouvrait
> donc une scène VIDE — de l'UI morte au sens de la loi 4.

Elle porte sa **condition de retour** (« que la surface qui le peint ait quelque
chose à lire ») et un témoin qui la garde —
`test_lOeilEtSonLecteur_vivent_etMeurent_ensemble` exige que le lecteur revienne
dans le MÊME commit que l'œil.

> **La loi 6 promet trois chromes ; deux sont montés et le troisième est retiré
> AVEC sa raison, sa condition de retour et son témoin.** C'est la forme juste
> d'une absence : elle se lit, elle se défend, et elle rougirait si quelqu'un la
> rebranchait à moitié. Ne pas la lire comme un oubli à réparer.

## 3 bis. Qui JOUE, quand le fil en montre plusieurs (2026-09-05)

Le § 3 dit ce qu'un chrome PROPOSE ; il ne dit pas **qui joue quand plusieurs
scènes sont à l'écran en même temps**. C'est une loi distincte, et elle manquait
à ce document — au point que le fil a porté **trois politiques pour le même
objet**, un canvas 9:16, jusqu'au 2026-09-05.

> « Repartage ou non, les scènes sont comme les vidéos : lorsqu'on est face à
> elles dans le viewport, il faut maintenir une cohérence générale. Normalement
> les Posts, Reels et Story ne manipulent que des scènes. »
> — directive porteur, 2026-09-05

| surface | ce qu'elle faisait AVANT |
|---|---|
| réel natif / repost de réel | autoplay muet, élu par le viewport, coupé pendant un appel |
| scène COMPOSÉE d'un post | **figée** (`isPlaying: .constant(false)`), sous une étiquette « scène · muette, en pause » |
| story REPARTAGÉE | **jouait en permanence** (`isPaused` laissé à son défaut), sans élection ni call-awareness |

Le même canvas bougeait ou non selon la façon dont il était **arrivé** dans le
fil, et seul le figé portait un mot d'excuse. La loi, livrée par `0110db94f4`
(#5227), tient en quatre points :

1. **Une seule surface décode dans tout le fil** — celle qui est la plus proche
   du centre du viewport, réels et scènes CONFONDUS. Il n'y a pas une élection
   des vidéos et une élection des scènes : c'est le même coordinateur.
2. **Un appel les tait toutes.**
3. **L'identité d'élection est celle du POST CONTENANT**, jamais de la story ou
   du réel cité — sans quoi un même contenu affiché deux fois dans le fil
   binderait deux surfaces au moteur partagé.
4. **L'élection se reçoit en VALEUR** : la feuille est `Equatable` et ne
   l'observe pas ; seul un container observe. Une élection ne doit pas
   ré-évaluer le `ForEach` entier du fil (Zero Unnecessary Re-render).

Le mécanisme n'est pas neuf : c'est celui des réels
(`ReelFeedAutoplayCoordinator` + `reportReelFrame(id:kind:)`), auquel les deux
surfaces de scène se raccordent. **En écrire un second aurait fabriqué la
quatrième politique.**

> **Un gel n'est pas une économie s'il ne gèle qu'une surface sur trois.** Le
> figé venait d'une décision documentée et JUSTE (revue Fable n°25, « zéro
> AVPlayer/décodage actif ici ») — mais qui ne tenait que sur la surface qu'elle
> gelait, pendant que la story repartagée d'à côté décodait autant de fois
> qu'il y avait de cellules visibles. L'élection unique tient l'objectif de
> cette revue MIEUX que le gel qu'elle avait posé : au plus **un** décodage
> actif dans tout le fil. Une optimisation locale se mesure sur la SOMME des
> surfaces, jamais sur celle qu'elle corrige.

**Ce qu'aucun fichier ne pouvait dire.** Chacune des trois politiques était
défendable prise seule ; c'est leur somme qui était fausse, et **une somme n'a
aucun site où rougir**. D'où des témoins qui interrogent les surfaces ENSEMBLE —
`FeedSceneCoherenceGuardTests` — plutôt qu'une de plus par surface.

### Le corpus de la garde se BALAIE (SOLDÉ le 2026-09-05)

`FeedSceneCoherenceGuardTests` a d'abord énuméré deux chemins à la main pour une
doctrine **universelle** — « toute surface qui monte une scène 9:16 dans le fil
rapporte sa frame ». Quantifiée en prose, vérifiée existentiellement sur deux
fichiers : une troisième surface née dans un fichier NEUF n'aurait été lue par
personne, et aurait pu réinventer la quatrième politique que le § 3 bis vient de
supprimer. C'était le piège du § 3 (« la parade n'est pas d'énumérer mieux —
c'est de publier la COMMANDE ») reproduit dans le témoin qui garde la cohérence.

`b579357011` (#5230) l'a soldé : le corpus est **balayé**, commentaires
dépouillés, et la seule frontière qu'un balayage ne sait pas trancher —
« **est-ce une LISTE ?** » — se déclare par une table d'exclusions NOMMÉES
portant chacune sa raison. Ajouter un fichier au territoire oblige à passer là.

La commande qui rend les candidats :

```bash
git grep -l "MeeshyScenePlayer(\|StoryReaderRepresentable(" \
    -- 'apps/ios/Meeshy/**/*.swift' | xargs grep -L "reportReelFrame"
```

Mesurée le 2026-09-05, elle rend cinq fichiers et **aucun n'est un défaut** :
`FeedPostCard` et `MeeshyComposerHost+Socle` sont des faux positifs (le nom n'y
apparaît qu'en **commentaire** — pour le second, un doc-comment qui raconte qu'il
montait un player *jadis*) ; `PostDetailView+Canvas`,
`PostDetailView+RepostEmbed` et `StoryViewerView+Canvas` ne sont pas des LISTES,
et une surface seule à l'écran n'a personne à qui disputer l'élection.

> **La version de cette commande publiée le matin même était bornée à
> `Views/*.swift` et rendait quatre fichiers.** Le cinquième vivait sous
> `Composer/`. Une commande publiée à la place d'une liste ne vaut que par son
> TERRITOIRE : la borne, elle, reste une énumération — plus courte, plus discrète,
> et exactement aussi périssable. Borner au plus large, puis classer.

Deux leçons que la correction a mesurées, et qui valent au-delà d'elle :

- **La table d'exclusions a d'abord reproduit le faux positif que le balayage
  existe pour retirer.** Elle avait été composée depuis un `git grep` NU — donc
  sans dépouiller les commentaires — et inscrivait `MeeshyComposerHost+Socle`
  comme « monteur de scène exclu ». Une table qui déclare la FRONTIÈRE d'un
  balayage doit être construite par le balayage LUI-MÊME ; composée à la main à
  côté, elle hérite précisément des défauts qu'il corrige. C'est le témoin
  `test_everyExclusionStillDescribesARealSceneMounter` qui l'a rendu, dès sa
  première exécution.
- **Et ce témoin-là est né INVISIBLE** : écrit
  `func test_…(file: StaticString = #filePath) throws`, il n'était pas découvert
  par XCTest — **un paramètre, même à valeur par défaut, suffit**. Aucun échec,
  aucun avertissement, aucune ligne rouge : six cas rapportés au lieu de sept,
  et seul le COMPTE le disait. La signature d'un `func test_` reste NUE ; le
  paramètre `#filePath` va sur le helper.

### Le mécanisme a débordé son nom

`ReelFeedAutoplayCoordinator`, `reportReelFrame`, `mostCenteredReel`,
`activeReelId`, `ReelMediaKind` gouvernent désormais **toute surface qui décode
dans le fil** — les trois Meeshes, pas les seuls réels. Or « réel » est un TYPE
de publication (§ 1 du modèle du composer), pas un mécanisme : le vocabulaire dit
maintenant moins que ce que le code fait. `ReelMediaKind.scene` est le symptôme
lisible — un « genre de média de RÉEL » dont un cas s'appelle `scene`.

Réutiliser le mécanisme était juste ; le renommer est une dette à part, à solder
quand les deux sessions qui travaillent ces fichiers auront convergé. Suivi :
#5231.

**Ce que ce renommage coûtera, et qui ne rougira pas.** Le compilateur suit un
membre renommé jusqu'à tous ses consommateurs — mais **pas les gardes de source**,
qui cherchent des chaînes LITTÉRALES. Une garde négative qui a perdu son terrain
ne trouve rien *par métier* : elle ne signale jamais qu'elle ne garde plus rien.
Les suites concernées doivent donc bouger dans le MÊME commit, et elles se
listent par commande plutôt qu'à la main :

```bash
git grep -l 'reportReelFrame\|ReelFrame(\|activeReelId\|mostCenteredReel\|ReelMediaKind\|ReelFeedAutoplayCoordinator' \
    -- 'apps/ios/MeeshyTests/**/*.swift'
```

Quatre suites au 2026-09-05 : `FeedPostCardScenePlayerGuardTests`,
`FeedSceneCoherenceGuardTests`, `ReelFeedAutoplayCoordinatorTests`,
`ReelFeedLayoutTests`.

> **Les deux sessions qui ont vu cette dette en ont dressé la liste à la main, et
> les deux se sont trompées** — une entrée en trop (`ReelFeedSoundButtonWiring‑
> GuardTests`, qui ne cite aucun de ces six symboles : il garde le BOUTON, que ce
> renommage ne touche pas) et une manquante (`ReelFeedLayoutTests`). Sur une
> dette dont le sujet EST « une énumération ne survit pas à ce qu'elle décrit »,
> c'est la démonstration la moins coûteuse qu'on pouvait en obtenir.
>
> Et la faute s'est présentée **trois fois dans le même échange** : la borne
> `Views/*.swift` de la commande publiée plus haut, la table d'exclusions du
> correctif bâtie depuis un `git grep` NU, et ces deux listes de gardes écrites
> de mémoire. D'où la forme générale, qui vaut bien au-delà de ce paragraphe :
> **le geste qui remplace une énumération en contient toujours une plus petite —
> le territoire, l'extension, la table d'exclusions —, et c'est celle-là qu'on ne
> relit pas.** Après avoir publié une commande, poser une question de plus :
> *quelle énumération reste-t-il dedans ?*, l'élargir d'un cran, et re-mesurer.

## 4. Ce que le lecteur reçoit de la PROJECTION

Le § 1 bis du modèle du composer arbitre l'écriture, et **la cardinalité dépend
du PROFIL** — c'est le point qu'il ne faut surtout pas généraliser :

| profil | M scènes composées | ce qui est publié |
|---|---|---|
| **S** (story) | N | **N stories**, une par scène |
| **P** (post) · **R** (réel) | M | **UN seul** post / réel, portant ses **M scènes** |

La question symétrique — *le lecteur regroupe-t-il ?* — a donc **deux** réponses :

- **pour une story, non**, et personne ne le lui demande : ce qui est parti en N
  objets se lit en N objets. Mesuré : aucun site ne recompose N posts à la
  lecture, et **aucune clé de groupe n'existe sur le fil** (`publicationId`,
  `groupId`, `batchId` : zéro occurrence). Le regroupement n'est pas seulement
  absent — il est impossible ;
- **pour un post ou un réel, la question ne se pose pas** : l'unité publiée porte
  déjà ses M scènes, il n'y a rien à regrouper. Ce que le lecteur doit savoir
  faire est l'inverse — **paginer À L'INTÉRIEUR d'une unité.**

> **Le lecteur ne regroupe jamais. Mais selon le profil, il doit soit LISTER des
> unités, soit PAGINER dans une seule.** Les deux se ressemblent à l'écran et
> n'ont rien de commun en amont : l'une est une file d'objets du fil, l'autre une
> navigation dans un document.

**Ce que le code porte déjà pour la seconde** : `MeeshyScenePlayer` prend un
`sceneIndex: Binding<Int>`, et `StoryEffects(rendering:sceneIndex:)` sait lire
une scène par index. Le côté LECTURE est prêt pour M scènes — c'est l'ÉCRITURE
qui ne sait pas encore les produire, le pont rendant `scenes: [scene]`, un seul
élément, toujours (#4770, troisième préalable). **Ne pas lire ce non-exercice
comme une absence de besoin** : c'est l'arbitrage porteur qui le demande, et le
binding existe pour lui.

> Si un jour le lecteur doit RE-grouper ce que la projection a séparé, il lui
> faudra une clé de groupe sur le fil — et cette clé est une décision de contrat,
> pas une affaire de vue. Tant qu'elle n'existe pas, tout regroupement à la
> lecture serait une heuristique, donc un endroit où deux clients divergeront.

## 4 bis. Les TROIS lecteurs, mesurés (2026-09-02)

> **Addendum du 2026-09-04 — la méthode de ce comptage a une faille que le
> recadrage vient de révéler, et les chiffres ci-dessous ne sont PAS corrigés.**
>
> Ils restent ceux du 2026-09-02, à leur date, parce qu'ils ont été obtenus en
> comptant les clés *effectivement lues* par chaque projection. Les recompter
> aujourd'hui avec une méthode plus grossière — toute chaîne entre guillemets —
> rendrait 57 pour Android et 11 pour le web : **remplacer une mesure soignée
> par une mesure large est une régression, pas une mise à jour.**
>
> Ce que la mesure du jour révèle est ailleurs, et c'est méthodologique. Le
> recadrage (#5085) est désormais lu par les deux lecteurs, mais **pas de la
> même façon** :
>
> | lecteur | où vivent les noms de clés `cropX/Y/W/H` |
> |---|---|
> | Android | dans `CanvasV3Projection.kt` — la projection les NOMME |
> | web | dans `packages/shared/utils/media-crop.ts` — `readMediaCrop(payload)`, la règle partagée les nomme à sa place |
>
> **Un audit « quelles clés chaque lecteur lit-il ? » conduit sur les fichiers du
> LECTEUR manquerait donc entièrement le recadrage côté web** — non parce qu'il
> ne le lit pas, mais parce qu'il le lit par délégation. Toute reprise de ce
> comptage doit suivre les modules partagés, sinon elle sous-compte le lecteur
> le mieux factorisé et récompense celui qui recopie.
>
> C'est la forme lecteur du défaut de #4833 : un inventaire qui interroge un
> site rate ce qui a été délégué à un autre.


Le § 5 disait, à la première écriture de ce document, que les lecteurs web et
Android n'étaient pas mesurés et qu'il ne fallait pas lire ce silence comme une
conformité. Mesure faite le jour même — et le silence ne l'était pas.

**La charge est ouverte partout**, donc rien ne se perd au décodage : contrat
`z.record(z.string(), z.unknown())`, Swift `[String: CanvasJSONValue]`, Android
`JsonObject`, web objet nu. Aucun lecteur ne REFUSE une clé qu'il ne connaît pas.

**Mais ce que chacun LIT diverge, et davantage qu'on ne l'imaginerait :**

| lecteur | clés de charge lues |
|---|---|
| Android (`CanvasV3Projection.kt`) | **38** |
| web (`story-canvas-v3.ts` + `CanvasV3Scene.tsx`) | **24** |
| **en commun** | **18** |

Vingt clés qu'Android rend et que le web ignore — dont les **fondus**
(`fadeIn`/`fadeOut`), le **filtre de scène** (`filter`, `filterIntensity`), le
cadre d'un texte (`borderColor`, `borderWidth`, `backgroundStyle`), la police
(`fontFamily`) et les pivots (`anchor`, `anchorPoint`). Et l'objet **`place`**,
que le web peint (`CanvasV3Scene.tsx:806`) et dont **Android n'a aucun modèle**
(#4912) — son propre code le dit : « `StoryLocationObject` (no Android model
yet) ».

> **Trois lecteurs, un moteur — mais un seul moteur PAR PLATEFORME.** La loi 6
> unit le composer et les viewers *d'une même plateforme* ; elle ne dit rien de
> ce que deux plateformes rendent du même document. C'est une lecture qu'il faut
> se refuser : « trois chromes, un moteur » parle des trois SURFACES d'iOS, pas
> des trois clients.

Ce que ces écarts ne sont PAS : un défaut de transport. Le fil porte tout, et
chaque écart est un rendu non écrit — donc réparable côté lecteur seul, sans
toucher au contrat. Ce qu'ils sont : une promesse de fidélité qui n'a jamais été
formulée, donc jamais tenue ni démentie. Les deux dettes nommées à ce jour sont
#4911 (les gabarits ne se peignent que sur iOS — repli DÉCLARÉ) et #4912 (le
lieu ne se peint pas du tout sur Android — absence MUETTE), et elles ne sont pas
de même nature : un repli dit la même chose en moins bien, une absence ne dit
rien.

## 4 bis-2. Ils sont QUATRE, pas trois (mesure 2026-09-03)

Le § 4 bis parle des « TROIS lecteurs ». **`apps/web-v3` en est un quatrième**,
et il sert déjà `/stories/:id`, `/reels/:id`, `/moods/:id` — le rôle de lecture
PUBLIQUE, celui d'un lien partagé. Milestone #74, 47 issues ouvertes ; 284
fichiers ; aucune mention dans la documentation produit jusqu'à cette ligne.

Ce qu'il rend d'une story, mesuré : **son média de fond, et rien d'autre.** Son
modèle `Story` porte `medias: MediaDeStory[]` (`url` · `genre` · `alt` ·
`largeur` · `hauteur`) ; il ne lit **pas** `storyEffects` — zéro occurrence dans
tout le paquet. Ni objets, ni plans, ni `timing`, ni transitions, ni `thumbHash`.

Et **rien ne le dit** : c'est une absence muette au sens du § 4 bis, la nature
que ce document nomme comme la plus coûteuse.

**Et la cible, elle, est ÉCRITE** — `docs/product/MeeshyWebV3Design/conception-web-v3.md`
§ 1 : « le visiteur doit pouvoir **lire intégralement** (story, reel, post, mood,
conversation partagée) ». Une story rendue comme son seul fond ne tient pas cette
promesse : ses textes, ses stickers, son lieu et ses puces audio font partie de ce
qu'il y a à lire. **Ce n'est donc pas un choix à déclarer, c'est un écart à
combler** (#5049).

La contrainte qui le rend intéressant est réelle : la v3 est zéro-JS et sous
budget de REQUÊTES — `/stories/:id` est un gestionnaire de route et non une page
précisément parce qu'une page émet six requêtes avant le premier pixel là où le
budget en autorise trois. Mais les objets portent `anchor`, `plane`, `z`,
`transform` : un `position:absolute` par objet coûte des OCTETS de document, que
le budget mesure, et zéro requête supplémentaire.

### Ce que la gouvernance de la v3 tranche déjà, et qu'il ne faut pas rouvrir

Trois décisions porteur, non négociables (même document, préambule) :

1. **`apps/web` reste vif et sert le trafic** — les deux applications coexistent ;
   ce n'est pas une transition à échéance.
2. **La bascule se fait une route à la fois**, par un `PathPrefix` Traefik ; le
   retour arrière est le retrait du préfixe, et rien n'est supprimé au passage.
3. **Le décommissionnement d'`apps/web` est un milestone SÉPARÉ**, ouvert
   seulement quand le routeur legacy ne sert plus aucune route.

Corollaire : les lacunes de rendu d'`apps/web` (#5043, #5047) ne sont pas du
travail jeté — cette application sert le trafic et continuera. Ce qui reste vrai
est que la v3 ne doit pas en hériter : c'est un « et », pas un « ou ».

**Corollaire immédiat pour les deux dettes de la section suivante** : #5043 et
#5047 décrivent des lacunes d'`apps/web`. Si la v3 reprend le rôle de lecture
publique, elles doivent être décidées POUR la v3 — sinon on les corrige dans un
client qu'on remplace, ou on les hérite en silence dans celui qui le remplace.

## 4 ter. La même divergence existe un cran PLUS HAUT — au niveau de la SCÈNE (2026-09-03)

Le § 4 bis compte les clés de **charge**, donc le niveau de l'OBJET, et sur deux
lecteurs. Deux mesures faites le lendemain montrent que la divergence se rejoue
au niveau de la **scène**, et que la colonne manquante — iOS — n'est pas toujours
celle qui rend le plus.

| champ de scène | iOS | Android | web |
|---|---|---|---|
| `clipTransitions` (fondus entre clips) | rend | rend | rend |
| `opening` / `closing` (entrée, sortie) | **rend** | **projette puis jette** | ne rend pas |
| `thumbHash` (le placeholder d'attente) | rend | rend | **ne connaît pas** |

### Une TROISIÈME nature d'écart, que la taxonomie du § 4 bis n'avait pas

Ce document distingue justement le **repli déclaré** (#4911 — « dit la même chose
en moins bien ») de l'**absence muette** (#4912 — « ne dit rien »). Le cas
d'Android sur `opening`/`closing` n'est ni l'un ni l'autre :

`CanvasV3Projection.kt:286-287` **traduit** les deux champs — `opening =
transitionOf(scene.opening)` — et **aucune vue ne les consomme**. Le modèle
existe, le vocabulaire existe (`StoryTransitionEffect` : FADE · ZOOM · SLIDE ·
REVEAL, identique à iOS), le rendu n'existe pas.

> **Projeté puis jeté.** C'est la pire des trois natures pour qui relit le code,
> parce que c'est la seule qui a l'AIR complète : on trouve le champ, on trouve
> son type, on trouve sa conversion — et rien ne dit que la chaîne s'arrête là.
> Un repli se voit, une absence se cherche ; une projection orpheline se lit
> comme une implémentation.

### Et un report dont la condition a expiré

Le web déclare `opening`/`closing` hors périmètre, avec sa raison
(`CanvasV3Scene.tsx:836`) : « **tant qu'aucun lecteur ne le rendra** […] leur
donner un rendu serait du neuf, pas de la parité ». Le raisonnement était juste à
l'écriture. **iOS les rend.** La condition est fausse, et « du neuf » est devenu
« de la parité » — sans que personne ne relise la phrase, parce que ce qui l'a
périmée s'est passé sur une AUTRE plateforme.

Détail et critères : #5043 (les transitions), #5047 (le `thumbHash`, dont
l'absence laisse une story web s'ouvrir sur du vide — `CanvasV3Scene` n'a aucun
état de chargement, et c'est le chemin de TOUTES ses stories parce que les deux
écrivains émettent du v3 natif ; **correction de cause du 2026-09-05** : la
passerelle ne refuse PAS le non-v3, son refus est derrière
`CANVAS_V3_WRITE_STRICT`, armé dans aucun fichier de configuration du dépôt —
détail à l'encadré du § 1 bis-2 de `meeshy-composer-modele.md`).

## 5. Ce que ce document ne couvre pas

- **Le rendu lui-même** (`StoryCanvasUIView`, les couches, les dessinateurs) —
  c'est de l'implémentation, elle a ses doc-comments.
- **Le Prisme Linguistique à la lecture** — sa loi vit au `CLAUDE.md` racine, qui
  énumère ses quatre familles de résolveurs et reste l'autorité.
- **Le RENDU détaillé du web et d'Android.** Ce qu'ils LISENT est mesuré au
  § 4 bis (2026-09-02) ; comment ils le peignent ne l'est pas. Un lecteur peut
  lire une clé et la rendre mal — la mesure des clés borne le possible, elle ne
  prouve aucune fidélité.
- **Les surfaces de lecture web et Android** — ce document nomme les trois
  chromes d'iOS (§ 3). Les deux autres plateformes ont les leurs, et personne
  n'a vérifié qu'elles se correspondent. **Ne pas lire ce silence comme une
  conformité** — c'est la phrase qui figurait ici pour les clés de charge, et la
  mesure du § 4 bis lui a donné raison : 38 clés contre 24, dont 18 communes.
