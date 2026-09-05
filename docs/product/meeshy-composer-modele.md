# MeeshyComposer — le modèle : slides, scènes, objets

> **Statut** : normalisation arrêtée le 2026-08-27 (directive porteur). C'est le
> vocabulaire UNIQUE du composer — issues, code neuf, UI, documentation.
> La planche (`planche-meeshy-composer.html`) porte la VISION ; ce fichier porte
> la SÉMANTIQUE. En cas d'écart, ce fichier a raison sur les noms et les règles.

## 1. Les quatre noms, et rien d'autre

| Nom | Ce que c'est | Ce que ce n'est PAS |
|---|---|---|
| **`MeeshyObject`** | l'unité posée sur une scène : `kind` + `anchor` + `plane` + `z` + `transform` + `timing?` + `locale?` + `payload` | pas un fichier ; pas une pièce jointe |
| **`MeeshyScene`** | la surface qui restitue des objets, à un ratio donné, sur trois plans | pas un écran ; pas un éditeur |
| **`MeeshySlide`** | **UNE scène + UNE description** | pas un conteneur de plusieurs scènes |
| **`MeeshyPublication`** | un **profil** (S · R · P · M) + ses slides | pas un brouillon ; pas un post serveur |

```
MeeshyPublication  (profil S | R | P | M)
└── slides: [MeeshySlide]                     1..10
     └── MeeshySlide = MeeshyScene + description
          └── MeeshyScene (ratio)
               └── objects: [MeeshyObject]    plans: background · content · foreground
```

**Réponse à la question posée** : on manipule des `MeeshyObject` posés sur une
`MeeshyScene` ; une `MeeshySlide` **EST** une scène plus sa description — elle ne
la *contient* pas à côté d'autre chose. Une publication est un profil et ses slides.

### Les sept kinds d'objet
`text` · `media` · `sticker` · `audio` · `place` · `drawing` · `mention`
— exactement les `ACTIVE_KINDS` du contrat partagé (`packages/shared/types/canvas-v3.ts:5`).
Aucun kind neuf ne s'invente ici ; en ouvrir un est une décision de contrat.

**Mais sept kinds DÉCLARÉS ne font pas sept cas d'objet, et c'est voulu**
(mesuré le 2026-09-02) :

| kind | ce qu'il est réellement |
|---|---|
| `text` · `media` · `sticker` · `place` · `audio` | **des objets** — les cinq cas de `MeeshySceneObject` |
| `drawing` | **un CHAMP de la slide**, pas un objet : `StoryEffects.drawingStrokes: [StoryDrawingStroke]?`. Aucun site ne produit d'objet de ce kind |
| `mention` | **déclaré, sans aucun producteur** — vérifié sur les trois clients et la passerelle |

> **Ne pas « compléter » `MeeshySceneObject` à sept cas.** Deux d'entre eux
> n'ont pas de charge à porter : le dessin vit ailleurs par construction (une
> trace n'a ni ancre ni `zIndex` d'objet), la mention n'existe pas encore. Un
> `case drawing` ajouté pour aligner un compte donnerait une famille vide que
> chaque `switch` devrait traiter — et le compilateur, lui, ne dirait jamais
> qu'elle est morte.

La somme à cinq cas est donc **complète pour ce qui est objet**. Le chiffre à
citer dépend de la question : *sept* kinds au contrat, *cinq* familles d'objets,
*six* kinds ayant un producteur.

#### Ce que la directive « à gauche en Story » ne dit PAS (2026-09-02)

Le porteur a fait passer **lieu · hashtag · mention · corpus de texte** au rail
GAUCHE en profil **S**, « afin de fixer chaque position à chaque story » (#4893).
Le rail gauche étant celui de ce qu'on POSE sur la scène, la question suit toute
seule : ces quatre-là deviennent-ils des objets de scène ?

**Deux le sont déjà** (`text`, `place`). Pour les deux autres, le contrat a
répondu, et il a répondu DIFFÉREMMENT — c'est l'asymétrie qu'il faut connaître
avant d'ouvrir le sujet :

| | statut au contrat | ce que coûterait « objet posable » |
|---|---|---|
| `mention` | **ACTIF** (`ACTIVE_KINDS`) — le fil l'accepte déjà | cas Swift + producteur + lecteur + charge. **Contrat inchangé** |
| `hashtag` | **RÉSERVÉ** (`RESERVED_KINDS`, « nomenclature connue, REFUSÉS en v1 ») | idem **+ déplacer la clé de `RESERVED` vers `ACTIVE`** — une décision de contrat |

> **Une place dans un rail n'est pas une promesse de positionnement.** Livrer la
> place (le rail les montre, leur porte ouvre le sélecteur de la publication) est
> conforme au modèle tel qu'il est ; livrer la pastille posable demande d'abord
> de renverser une décision ÉCRITE — `CanvasV3Migration` dit d'une mention
> qu'elle est « une MÉTADONNÉE, pas un objet ». Tant que cette phrase est là,
> elle gagne.

Le filet existe déjà si la décision tombe un jour : un client dont le build
ignore un kind ne casse pas — `case .reserved(let raw)` le conserve à
l'aller-retour et l'inscrit dans `unpaintableKinds`, donc le lecteur SAIT qu'il
peint une scène amputée. C'est le producteur qui manquerait, jamais le filet.

### Le MOUVEMENT d'un objet est une propriété, jamais un kind

La règle ci-dessus a une jumelle qu'il faut énoncer, parce qu'elle décide de la
même chose dans l'autre sens. *Sept kinds déclarés ne font pas sept cas d'objet*
dit qu'on n'invente pas un cas pour aligner un compte ; celle-ci dit **qu'on
n'invente pas un kind pour porter une capacité nouvelle** (#3956).

Le cas vivant est le MOUVEMENT d'une décoration (`StorySticker.animation`,
#4821) : `pulse`, `heartbeat`, `wobble`, `bounce`, `float`, `spin`, `blink`,
`shake`, `swing`, et deux en un coup, `pop` et `tada`.

| ce qu'il EST | ce qu'il n'est PAS |
|---|---|
| une **propriété** d'un `sticker` — un champ de plus sur la charge | un huitième `ACTIVE_KIND` |
| **déclaré par le GABARIT** (`StickerTemplate.animation`), recopié à la pose | un réglage que l'auteur compose |
| une **fonction pure du temps** — `pose(at:) → Pose` | une `CAAnimation`, que `layer.render(in:)` ignorerait à l'export |

**Pourquoi une propriété et pas un kind, précisément.** Un client qui ne sait
pas rendre le mouvement — web et Android aujourd'hui — lit la décoration et la
peint FIXE : il perd le mouvement, jamais la décoration. Un kind neuf aurait
produit l'inverse : `case .reserved(let raw)` l'aurait conservé à
l'aller-retour et inscrit dans `unpaintableKinds`, donc la scène se serait
déclarée AMPUTÉE pour un mouvement absent. Le choix du contenant décide de ce
qu'on perd quand un lecteur ne suit pas.

**Une seule fonction, trois horloges.** `pose(at:)` est le site unique du
mouvement, et c'est ce qui fait que le lecteur (60 Hz), l'export (30 fps, où
Core Animation n'anime rien) et le composer rendent la même image — la loi 6
appliquée au mouvement. Seule l'HORLOGE diffère, et l'écart est assumé :

| surface | horloge |
|---|---|
| lecteur, export | le **playhead** de la slide, moins `startTime` |
| composition (#4999) | un **temps ÉCOULÉ depuis la pose** (`StoryStickerMotionClock`) — il n'y a pas de playhead en édition, et il ne doit pas y en avoir : le faire avancer ferait disparaître tout objet dont la fenêtre temporelle serait passée |

**Ce que l'auteur en voit, avant de poser.** La palette MONTRE le mouvement sur
la vignette et le marque d'un glyphe (#5000) : le fait, jamais le nom de la
courbe. `pose(at: 0)` étant l'identité par contrat, une vignette qui entre à
l'écran part de la pose exacte que la décoration prendra — et un `pop` ou un
`tada` joue à la POSE, pas une fois à l'ouverture.

Restitution, `reduceMotion`, et l'état cross-plateforme : § du modèle du
lecteur, et #4911 pour la décision web / Android.

### Ce qui appartient à la PUBLICATION et non à une scène

Trois choses se posent sur une `MeeshyPublication` et ne sont **jamais** des `MeeshyObject` : son
**lieu** (d'où l'on publie), son **audience**, sa **langue déclarée**. Elles gouvernent ce qui PART,
pas ce qui se voit sur une scène.

La confusion la plus facile est le lieu, parce que le mot est le même des deux côtés :

| | ce que c'est | où ça vit |
|---|---|---|
| le **lieu** de la publication | d'où l'on publie ; gouverne `location` et la découvrabilité | `MeeshyPublication` |
| un `MeeshyObject` de kind `place` | une pastille POSÉE sur une scène, qui décore une image | `MeeshyScene`, plan `foreground` |

Les deux peuvent coexister sur une même publication sans se contredire — l'un décrit l'origine,
l'autre est du contenu. Un composant qui gouverne le premier ne doit jamais être décrit comme
« posant un lieu » : il n'en pose aucun.

### Deux bandes encadrent la carte, et elles ne qualifient PAS la même chose

Depuis #5001 et #5002, la carte de scène est encadrée de deux bandes. Elles se
ressemblent — même gouttière, même bord gauche aligné sur le dessin, même geste
(toucher ⇒ la feuille correspondante). **Leur portée est pourtant opposée**, et
rien à l'écran ne le dit :

| | ce que la bande qualifie | où vit la donnée | change en changeant de slide |
|---|---|---|---|
| **au-dessus** — note · spectre · crédit · durée | le **son de fond de CETTE scène** (plan `background`, « UN visuel et UN son ») | `MeeshySlide` courante | **oui** |
| **en dessous** — hashtags · mentions référencées | des métadonnées de la **PUBLICATION** entière | dérivées de `documentText`, partagées par toutes les slides | **non** |

C'est le comportement JUSTE — le § ci-dessus et le contrat le disent tous les
deux : la porte d'un hashtag « ouvre le sélecteur de la publication », et
`CanvasV3Migration` tient qu'une mention est « une MÉTADONNÉE, pas un objet ».
Mais la symétrie visuelle affirme une symétrie de sens qui n'existe pas : en
faisant défiler ses scènes, l'utilisateur voit la bande haute changer et la
basse rester, sans qu'aucun signe n'ait annoncé pourquoi.

> **Deux surfaces qui se ressemblent affirment qu'elles parlent de la même
> chose.** Le vocabulaire, ici, n'est pas dans les mots — il est dans la
> RESSEMBLANCE. Une bande qui encadre la carte se lit comme parlant de la carte ;
> celle du bas parle de tout ce qui l'entoure.

Ce que le modèle tranche : les deux portées sont **justes** et ne bougent pas.
Ce qu'il ne tranche PAS : s'il faut les distinguer à l'œil, et comment. C'est une
décision de design, ouverte en `décision-produit` — pas un défaut à corriger
d'initiative, parce qu'un correctif inventé ici figerait un choix qui appartient
au porteur.

### Comment un FRÈRE apprend où est la carte — les deux clés de préférence

La carte de scène est **ajustée à son ratio puis CENTRÉE** dans un canvas de
hauteur infinie. Ses bords ne sont donc pas ceux de son parent, et l'écart varie
avec le ratio comme avec l'écran. Trois mécanismes coexistent pour le franchir,
et **ils ne s'emploient pas dans les mêmes cas** — c'est la distinction qui a
coûté deux diagnostics faux :

| ce qu'on veut poser | mécanisme | pourquoi |
|---|---|---|
| un contenu SUR le plateau, aligné au dessin (rails, trace du son) | `ComposerRailGeometry.sceneBottomInset` / `sceneLeadingInset`, appliqués en **overlay** | l'overlay connaît la géométrie du canvas qu'il recouvre ; il ne paie **aucun** espacement de pile |
| un FRÈRE de la pile (le pied des références) | `ComposerSceneCardLeadingKey` et `ComposerSceneCardBottomKey`, deux `PreferenceKey` publiées par le lecteur de géométrie du canvas et lues en `@State` par la surface | un frère ne voit pas la géométrie du canvas ; il faut la lui REMONTER |
| un contenu DANS la carte (la description) | rien à franchir | il est déjà dans le repère du dessin |

> **Une pile ne voit pas le VIDE de ses enfants, seulement leurs cadres.** Un
> frère posé sous un canvas `maxHeight: .infinity` se range sous le CADRE, donc
> sous le letterbox — 77 pt mesurés au 2026-09-03, la moitié basse exacte du
> centrage. Aucun réordonnancement n'y change rien : il n'y a pas de frère à
> déplacer, il y a du vide à franchir.

**Et une gouttière n'est pas un espacement de pile.** Un overlay ne paie que la
gouttière ; un frère paie la gouttière ET le `spacing` du `VStack`. Le haut et le
bas d'une même carte peuvent donc afficher le même écart par deux chemins
différents (mesuré : 14 pt des deux côtés, dont 6 + 8 en bas) — les confondre
double l'écart au premier réglage.

### Les trois plans
`background` (le fond : UN visuel, et UN son) · `content` (le porteur) · `foreground` (ce qui se pose dessus, ordonné par `z`).

## 1 bis. Ce qu'une publication DEVIENT — la projection

`MeeshyPublication` est une notion de **COMPOSITION**. Le tableau du § 1 le dit
en creux (« pas un post serveur ») sans dire ce qui arrive au moment de publier ;
c'est le trou que ce paragraphe ferme. **Aucune couche sous le composer ne porte
la publication comme un objet** — mesuré le 2026-09-01, avec ses sites :

| couche | ce qu'on y trouve |
|---|---|
| publication d'une story | `StoryComposerView+Publication.swift:305` `publishAllSlides()` — **un post par slide** |
| fil app → passerelle | `PublishIntent.swift:52` — douze champs, **pas une slide, pas un objet, pas un effet** |
| base | `model Post` (`packages/shared/prisma/schema.prisma`) — **ni `storyId`, ni `sceneId`, ni index de slide** ; la scène voyage en `storyEffects Json?`, opaque, **un par post** |

Une STORY de quatre scènes est donc **quatre lignes `Post` que rien ne relie** —
et c'est conforme à la règle arbitrée ci-dessous, une story étant une suite
d'unités autonomes. Ce qui n'a pas de référent passé le fil, c'est la
publication **en tant qu'objet** : rien ne dit que ces quatre lignes viennent
d'une même composition.

> **Une `MeeshyPublication` ne se sérialise pas : elle se PROJETTE.** Ce qui est
> composé est une publication ; ce qui est publié est un ensemble de posts. Tant
> que la projection reste implicite — une boucle `for` sur les slides — personne
> ne peut la contredire, et c'est ainsi qu'une slide vierge est partie en post
> à côté du vrai (#4730).

### La règle de projection — ARBITRÉE (porteur, 2026-09-02)

**La projection dépend du PROFIL, et d'aucune autre condition :**

| profil | M scènes composées | ce qui est publié |
|---|---|---|
| **P** (post) · **R** (réel) | M | **UN seul** post / réel, portant ses **M scènes / médias** |
| **S** (story) | N | **N stories** — une par scène |

Autrement dit : une story est une SUITE d'unités autonomes, un post est UNE
unité à plusieurs pages. Le profil ne décide pas seulement d'un type sur le
fil ; **il décide de la CARDINALITÉ de la projection.**

**N unités ne font pas N destins** (objection soulevée en revue, tranchée sur
mesure). « N stories » décrit ce qui est PUBLIÉ, pas ce qui est ENTREPRIS :
`StoryPublishQueue.shared.enqueue(item)`
(`StoryViewModel+Publication.swift:647`) enfile **UN seul item** pour toute la
composition, quel que soit N. La boucle par slide qui l'entoure (`:682`) ne sert
qu'à l'affichage OPTIMISTE — une bulle par unité, tout de suite.

Le geste de l'auteur est donc **atomique à la file** et **pluriel à l'écran**, et
c'est la bonne combinaison : on ne demande pas trois fois à quelqu'un qui a
appuyé une fois.

**Mais une exécution qui échoue à mi-parcours n'a aucun moyen de reprendre où
elle en était**, et le symptôme n'est pas celui qu'on attend. Mesuré :
`StoryPublishQueueItem` porte `slidesPayload` — le lot ENTIER — sans aucun
`publishedSlideIds` ni index ; aucune clé d'idempotence ne voyage vers le
serveur ; et `createPost` ne déduplique pas. Une reprise repart donc du lot
complet.

Elle ne produit pourtant **pas** deux copies identiques : `unclaimedMediaWhere()`
(`services/gateway/src/services/posts/mediaOwnership.ts:131`) exige `postId`
nul, et les médias des unités déjà passées ont été RÉCLAMÉS au premier passage.

> **La reprise crée une copie AMPUTÉE, pas un doublon.** L'unité republiée sort
> **sans ses médias** — texte seul, là où l'originale portait une image. Deux
> stories quasi identiques attireraient l'œil ; une story et son fantôme sans
> image ressemblent à un bug d'AFFICHAGE, et l'auteur ira chercher du côté du
> chargement. C'est la forme la plus coûteuse à diagnostiquer.

**Cardinalité et idempotence ne sont donc pas indépendantes** : passer P et R à
un seul envoi fait DISPARAÎTRE ce mode de panne pour ces deux profils — un
envoi, un verdict, une réclamation. **S reste exposé**, puisqu'il reste à N.

> **Une règle de cardinalité doit dire de quoi elle compte les unités.** « N
> stories » compte des PUBLICATIONS ; l'auteur, lui, compte des GESTES, et la
> file compte des TRAVAUX. Trois cardinalités pour une phrase — les confondre
> fait promettre trois échecs là où il n'y a qu'un bouton.

**Écart mesuré au 2026-09-02** : `publishAllSlides()`
(`StoryComposerView+Publication.swift:305`) boucle sur les slides **sans jamais
regarder le profil** — `publishedType(requested:atelier:)` (`:347`) choisit le
TYPE, jamais le NOMBRE. Un post ou un réel composé à l'atelier avec M scènes
part donc en **M posts**. C'est la règle ci-dessus qui a raison ; le code est en
dette.

**Et cette dette en a une autre sous elle** : pour qu'UN post porte M scènes, il
faut que la scène voyage avec lui.

> **SOLDÉ le 2026-09-05 par #4756** (commit `4ea147fc80`). Ce paragraphe disait
> que `PublishIntent` et `CreatePostBody` ne portent aucun `storyEffects` et que
> le chemin document perd la scène entière. Les cinq maillons la portent
> désormais — `ComposerDocumentDraft` → `PublishIntent` → `CreatePostPayload` →
> `OfflineQueue.enqueuePostMedia` → `CreatePostBody`. **Deux limites subsistent
> et il faut les lire ensemble** : le brouillon n'emporte que
> `viewModel.currentSlide.effects`, donc **UNE seule slide** (c'est exactement la
> dette de cardinalité de ce §, #4770) ; et les objets média du canvas ne sont
> pas reliés aux `PostMedia` créés à l'upload (#5184 — un fond simple s'affiche
> quand même, par la route du backdrop legacy ; voir § 6 bis-2 pour ce que cette
> route ne couvre pas).
>
> Reste vrai : **#4756 n'était pas un confort, c'était le préalable de cette
> règle pour les profils P et R.** Il est levé ; la cardinalité, non.

### Les trois obligations de la projection

Une projection explicite doit porter ce qu'une boucle ne pouvait pas porter :

1. **Le prédicat** — quelles unités méritent un post. Site unique existant :
   `StorySlidePublishMatter.deservesAPost(_:hasBackgroundImage:)`
   (`packages/MeeshySDK/Sources/MeeshySDK/Models/Story/`), pure, publique, douze
   témoins. À **absorber**, jamais réécrire.
2. **L'élection** — laquelle des N unités REPRÉSENTE la publication. Les posts
   sortent à ~451 ms d'intervalle et le fil montre le plus récent : sans
   élection, **la dernière unité composée devient la vitrine**, par effet de bord
   de l'horloge.
3. **Le troisième état** — entre « pas de scène » et « une scène », il y a **une
   scène NÉE ET VIDE** : la slide semée. Les deux couches en tirent des
   conclusions opposées et **ont raison toutes les deux** — le canvas la MONTRE
   (`ComposerStoryCanvas.showsCanvas`), la présence ne la COMPTE pas
   (`ComposerScenePresence` compte ce que la scène contient, jamais ce qui l'a
   fait naître). Une forme qui ne connaît que deux états ne peut pas décrire ça,
   et c'est par cet état que le socle a été atteint sans publieur (#4751).

### L'identité de ce qu'on reprend, et son faux jumeau

Une publication qu'on **rouvre** (édition, brouillon repris) doit dire laquelle
elle est. Cette identité vit **dans le brouillon**, pas à côté : c'est
`onPublishDocument(draft)` qui décide « créer ou éditer », et une décision qui
arrive par deux canaux diverge au premier site qui n'en câble qu'un. Un
optionnel suffit et porte tout — `nil` ⇒ création, posé ⇒ reprise ; **pas de
booléen d'accompagnement** (règle du dépôt sur les paires redondantes).

> ⚠️ **`repostOfId` est déjà là, de forme IDENTIQUE et de sens OPPOSÉ.** Deux
> `String?` voisins dont l'un dit « je DESCENDS de » (l'ancrage vers la source
> qu'on republie) et l'autre « je SUIS » (la publication qu'on rouvre). Leur
> doc-comment doit les opposer explicitement : confondus, le symptôme est une
> ÉDITION qui publie un repost de son propre post — un défaut qui se relit comme
> du code juste.

### Ce qu'il ne faut pas écrire

Ne nommer dans la forme **aucune clé de regroupement serveur** : il n'en existe
pas. Une enveloppe qui attendrait un `storyId` mentirait à la première
relecture, et la forme iOS attendrait un champ que le fil ne rend pas. **Le
regroupement serveur est une décision distincte, avec sa migration.**

### Ce qui reste à trancher

Qui exécute la projection — le meuble, ou la porte — est l'objet de **#4733**
(« le meuble publie la story par un second chemin »), non arbitré à ce jour. Ce
paragraphe décrit ce qui EST et ce que toute forme devra porter ; il ne tranche
pas #4733, et ne doit pas être lu comme le faisant.

## 1 bis-2. `storyEffects` est un NOM DE CHAMP, pas un format (mesure 2026-09-03)

Question posée par le porteur : *« storyEffects est encore d'actualité dans cette
nouvelle version ? On a plus migré vers les MeeshySceneObject avec tous les
détails d'effet, start, end, transition d'entrée et de sortie ? »*

La réponse tient en une phrase et vaut d'être écrite ici, parce que le nom du
champ suggère le contraire de ce qui s'y trouve : **la migration a eu lieu À
L'INTÉRIEUR du champ.** `storyEffects` est le nom de la colonne et de la clé du
fil ; son CONTENU est un document **canvas v3** — parce que les deux écrivains
l'ÉMETTENT ainsi, et non parce que la passerelle refuserait autre chose.

> **CORRECTION du 2026-09-05.** Cette phrase disait « et la passerelle refuse
> tout le reste », et le tableau citait la ligne du refus. La ligne existe ; elle
> est **inatteignable en l'état**. Deux lignes plus haut, `core.ts:98` —
> `if (process.env.CANVAS_V3_WRITE_STRICT !== '1') return false;` — et ce drapeau
> n'apparaît dans **aucun** fichier de configuration du dépôt (`infrastructure/`,
> `.github/`, `*.yml`, `.env*` : zéro résultat). Le seul schéma qui s'applique
> réellement est `StoryEffectsSchema` (`types.ts:178`), un `.passthrough()` borné
> à 256 Ko **qui accepte le v1**.
>
> La conclusion — *tout ce qui circule est du v3* — reste vraie **en effet**,
> mais par la PRODUCTION (`StoryModels.swift:1360` et `StoryComposer.tsx:289`
> émettent l'un et l'autre du v3 natif), jamais par un refus. La nuance n'est pas
> cosmétique : elle change qui garantit l'invariant. Aujourd'hui, ce sont les
> clients — donc personne, dès qu'un client se trompe.
>
> **Une citation `fichier:ligne` prouve qu'une ligne EXISTE, jamais qu'elle
> S'EXÉCUTE.** Ici la garde qui la désarme est à deux lignes au-dessus de celle
> qui a été citée. La même erreur de CAUSE se lit au § 6 quater de ce document et
> au § 4 ter du modèle du lecteur, corrigés au même titre.

| couche | ce qui porte la scène | mesure |
|---|---|---|
| le fil | clé `storyEffects`, contenu **canvas v3 par production** | `StoryEffectsSchema` (`routes/posts/types.ts:178`) est ce qui s'applique — `.passthrough()`, 7 clés déclarées, ≤ 256 Ko. `CanvasV3Schema.safeParse` (`core.ts:110`) n'est atteint que si `CANVAS_V3_WRITE_STRICT === '1'`, armé nulle part dans le dépôt |
| le contrat | `ObjectV3Schema` | `packages/shared/types/canvas-v3.ts` |
| iOS, en mémoire | `StoryEffects` (forme v1) | `StoryModels.swift:962` |
| iOS, à l'encodage | **toujours v3** | `StoryEffects.encode` → `CanvasV3(migrating: self)` (`StoryModels.swift:1360`, corrigé — la ligne citée était `:1290`) |
| iOS, le vocabulaire d'objet | `MeeshySceneObject`, **somme à cinq cas** — `text` · `media` · `sticker` · `place` · `audio` | `Models/MeeshySceneObject.swift:56` |
| **validation à la LECTURE** | **aucune, sur les quatre lecteurs** | `CanvasV3Schema` n'a qu'un appel de production dans tout le dépôt, et c'est celui de l'ÉCRITURE ci-dessus. Web ne l'importe que dans ses tests ; `story-transforms.ts:42` ne teste que `v >= 3` |

Le pont est **bidirectionnel et sans mémoire** : l'encodage part TOUJOURS du
runtime courant, jamais du `canvasV3` reçu — une composition neuve et une story
éditée émettent donc l'une comme l'autre l'état réel du canvas.

### Ce qu'un objet porte, exactement

Neuf champs, et il faut les citer pour clore la question des « détails d'effet » :

`id` · `kind` · `anchor` · `plane` (`bg`/`content`/`fg`) · `z` ·
`transform { scale, rotation, opacity }` · `timing? { start, end, keyframes }` ·
`locale?` · `payload`

Donc : **`start` et `end` EXISTENT**, portés par `timing`, et l'entrée d'un objet
dans la timeline n'est pas un ajout de contrat.

### Les transitions : elles EXISTENT, une couche plus haut, et sans vocabulaire partagé

> **Correction d'une mesure fausse écrite dans ce document le 2026-09-03.** J'y
> avais affirmé « aucune transition d'entrée ni de sortie n'est modélisée », sur
> la foi d'un `grep -n "transition"` rendant zéro dans `packages/shared/types/`.
> Le motif était SENSIBLE À LA CASSE et ratait `clipTransitions`. La phrase est
> restée committée moins d'une heure ; elle est fausse et voici l'état réel.

**Un OBJET n'a pas de transition** — c'est le seul point que l'affirmation
fausse avait juste. Ses neuf champs portent `timing { start, end, keyframes }` :
des bornes, pas une manière d'apparaître.

**Une SCÈNE en a trois**, et elles sont vivantes de bout en bout :

| champ | ce qu'il porte | qui le produit | qui le rend |
|---|---|---|---|
| `opening` | l'entrée de la scène | `viewModel.openingEffect` (composer iOS) | iOS (`StoryViewerView+Canvas`, `+Content`), Android (`CanvasV3Projection`), web (`story-transforms`) |
| `closing` | la sortie | `viewModel.closingEffect` | idem |
| `clipTransitions` | les fondus entre clips adjacents, **30 au plus** | `TimelineViewModel`, `VideoCompositor` | iOS, Android (`StoryClipTransitionResolver`), web (crossfade) |

Le vocabulaire côté client est `StoryTransitionEffect` — **quatre** cas :
`fade` · `zoom` · `slide` · `reveal`.

### Ce qui, en revanche, n'existe VRAIMENT pas : leur définition PARTAGÉE

Le contrat les transporte **opaques** :

```ts
opening: z.record(z.string(), z.unknown()).optional(),
closing: z.record(z.string(), z.unknown()).optional(),
clipTransitions: z.array(z.record(z.string(), z.unknown())).max(30).optional(),
```

`z.unknown()` — le contrat garantit qu'un objet passe, jamais ce qu'il contient.
Le vocabulaire des quatre effets est donc défini **trois fois côté client**
(Swift `StoryTransitionEffect`, Kotlin `StoryClipTransition`, TypeScript dans
`story-transforms`) et **nulle part** dans `packages/shared`.

> C'est la forme exacte que ce dépôt a déjà payée trois fois sur le Prisme : une
> règle réécrite par chaque client diverge sans qu'aucun témoin ne tombe, parce
> que rien ne les compare. Ici le risque est plus discret encore — le contrat
> ACCEPTE tout, donc un cinquième effet ajouté par un seul client voyage
> intact jusqu'aux deux autres, qui l'ignorent en silence.

Ce qui reste à décider n'est donc pas « faut-il des transitions » mais **« faut-il
que le contrat les CONNAISSE »** — un lot de contrat, distinct du rognage
temporel que `timing` couvre déjà.

## 1 ter. Ce que chaque nom devient SOUS le composer

Les quatre noms du § 1 sont le vocabulaire du composer. Deux d'entre eux n'ont
**aucun correspondant** sous lui — ni sur le fil, ni en base, ni comme type
Swift. Le tableau est mesuré le 2026-09-01, avec la commande qui le reproduit.

| nom du modèle | contrat partagé (`packages/shared/types/canvas-v3.ts`) | type Swift livré |
|---|---|---|
| **`MeeshyObject`** | `ObjectV3` — mais son `payload` est `Record<string, unknown>` : **aucun type d'objet n'est nommé au contrat** | `MeeshySceneObject` (somme à 5 cas) |
| **`MeeshyScene`** | `SceneV3` — `scenes: []`, 1 à 10, ≤ 60 objets | `StorySlide` |
| **`MeeshySlide`** (= scène + description) | **rien.** `SceneV3` ne porte **aucune description**, et le mot « slide » a **zéro occurrence** dans le contrat | **aucun type de ce nom** |
| **`MeeshyPublication`** | **rien.** Elle se PROJETTE, et la cardinalité dépend du PROFIL — N posts en S, UN seul en P/R (§ 1 bis) | **aucun type de ce nom** |

```bash
grep -ci slide packages/shared/types/canvas-v3.ts        # → 0
git grep -n "struct MeeshySlide\|struct MeeshyPublication" -- '*.swift'   # → rien
```

**La divergence de NOM qui vivait ici est SOLDÉE** (#4776, #4960 ; re-mesurée le
2026-09-03) :

```
MeeshySceneObject.swift:60:    case place(StoryLocationObject)
canvas-v3.ts:5: ACTIVE_KINDS = ['text','media','sticker','audio','place','drawing','mention']
```

Le contrat et la somme Swift disent le même mot. Ce paragraphe décrivait
jusqu'ici un cas nommé `location`, et prescrivait « Suivi : renommer le cas en
`.place` » — un défaut révolu et un suivi déjà fait.

> **Une dette payée dont l'énoncé survit coûte deux fois** : elle envoie le
> lecteur chercher un défaut absent, et elle discrédite les autres énoncés du
> même document — celui qui a vérifié une fois pour rien ne vérifiera pas la
> deuxième. C'est la raison pour laquelle un document d'AUTORITÉ se relit
> ligne à ligne au lieu de s'augmenter par le bas.

**Ce que l'épisode laisse, et qui vaut d'être gardé.** `location` était, dans le
même langage et souvent dans le même fichier, le **lieu de la PUBLICATION**
(`location: SharedPlace?`, du brouillon jusqu'à `createPost`) — c'est-à-dire
exactement la paire que le tableau du § 1 sépare : *d'où l'on publie* contre
*une pastille posée sur une scène*. Le mot qu'un cas ne doit pas porter est
celui qui désigne déjà autre chose à deux lignes de là, et le contrat partagé
est l'arbitre : quand il a un nom, c'est le sien.

Corollaire de méthode, payé au renommage : **seul le compilateur compte les
consommateurs d'un membre renommé.** Un `grep` sur `location` rendait 114
occurrences dont 3 réelles, et ratait `case .place` chez les appelants qui
n'écrivent jamais le nom du type.

**Ce que ça veut dire, et ce que ça ne veut pas dire.** Ce n'est pas une dette à
solder : le § 1 déclare un vocabulaire CIBLE, et il est normal qu'une cible
précède son implémentation. Ce qui doit être su, en revanche, c'est **où le
vocabulaire cesse de correspondre** — parce que c'est là qu'un lot qui « suit le
modèle » invente sa propre traduction, et que deux lots en inventent deux :

> **Le composer sépare en DEUX noms — `MeeshyScene` et `MeeshySlide` — ce que le
> contrat porte comme UN (`SceneV3`), et la description qui les distingue ne
> voyage sur aucun des deux.** Chercher « slide » dans le contrat ne rend rien.

Corollaire pour tout lot qui descend vers le fil : traduire `MeeshySlide` en
`SceneV3` est CORRECT, et perdre la description en route est le défaut à
surveiller — elle a son propre logement (le `content` du post en S/R, la
légende du média en P, § 3), jamais la scène.

## 2. La simplification : une slide est TOUJOURS une scène

Il n'existe **pas** deux formes de slide (« un média » d'un côté, « une scène » de
l'autre). Une slide qui ne porte qu'un média est une scène **dont le seul objet est
son fond**. Un utilisateur qui poste une photo ne « crée » jamais une scène : il pose
une photo, et s'il ajoute un texte ou un sticker par-dessus, la scène **était déjà là**.

**Pourquoi cette forme.** Elle tient déjà dans le contrat (« chaque slide est une Scene
du document », planche ligne 1193 ; « une scène projetée en familles v1 EST une slide »,
ligne 562) — donc elle ne coûte aucune migration de fil. Elle supprime une question que
l'utilisateur n'a aucune raison de se poser. Et elle rend vraie, sans cas particulier, la
demande de départ : *une scène doit pouvoir être un seul média présentable dans un réel
ou dans un post.* La complexité se paie dans le code, jamais chez l'utilisateur (**dimension 12** de la roadmap produit — la planche dit explicitement que ce n'est PAS une loi du composer, dont la loi 11 est « Personne ne lit du vide »).

## 3. Ce qu'une slide SIGNIFIE dépend du profil

C'est le point le plus important de cette normalisation, et le plus facile à rater :
**le même objet `MeeshySlide` ne veut pas dire la même chose selon le profil.**

| | **Story (S)** | **Réel (R)** | **Post (P)** | **Mood (M)** |
|---|---|---|---|---|
| Une slide EST | **une story entière** | **le réel entier** — le réel EST la scène | **UN média du post** | — |
| Nombre de slides | plusieurs | **1** | plusieurs | 0 |
| Le texte de la slide est | **le contenu** | **le contenu** | **la légende de ce média** | — |
| `content` de la publication | = le texte de sa slide | = le texte de sa slide | **propre au post**, distinct des légendes | le contenu, et lui seul |
| Sortir un média de la scène | **interdit** | autorisé | autorisé | — |

**Conséquence directe sur l'UI** : en profil **P**, la description sous la scène n'est
PAS le `content` du post — c'est la **légende de cette slide**. Le `content` du post est
un champ distinct, au niveau de la publication. En **S** et **R**, les deux se confondent :
il n'y a qu'un texte, celui de la slide.

> **SOLDÉ les 2026-09-04 et 09-05.** Ce paragraphe disait que le champ posé par
> la Phase 2 (`sceneDescriptionField`) était lié au `content` du document —
> « juste en S/R et faux en P » — et réclamait deux choses : un rôle explicite
> pour le texte de slide, et un logement propre au `content` du post.
>
> Les deux sont livrées. `ComposerSlideTextRole` (#4890) porte la somme
> `.content` / `.caption` et cite ce paragraphe comme le défaut qu'il ferme ;
> `ComposerRailDoor.content` (#5137/#5138, `3c9d966e17`) donne au CORPS du post sa
> porte propre, au niveau `.publication`, « qui n'existe QU'EN POST ».
>
> **Les deux textes sont désormais disjoints jusqu'au fil** : `content` porte le
> corps (`documentText`), et ce qui est POSÉ sur la toile vit dans
> `storyEffects.scenes[].objects[kind=text].payload.text`. Deux chemins, deux
> clés, aucun recouvrement.
>
> Ce que le lot laisse ouvert, et qui n'était pas dans ce paragraphe : la légende
> est par **MÉDIA** (`PostMedia.caption`), pas par slide. L'égalité actuelle est
> « une coïncidence de la forme, pas une identité » — c'est `ComposerSlideTextRole`
> qui l'écrit, et #5142 qui la porte (deux stores écrivent `PostMedia.caption`).

## 4. Poser un média : une seule règle

1. La scène n'a **pas** de fond ⇒ le média posé **devient le fond**.
2. La scène a déjà un fond ⇒ le média posé devient un objet de **premier plan**, au-dessus des précédents.
3. Un **audio** posé devient le **son de fond** s'il n'y en a pas ; sinon un objet audio de premier plan.

Aucune question n'est posée à l'utilisateur. Le placement se déduit de l'état de la scène.

## 5. Un objet de la scène se manipule par appui long

Appui long sur un `MeeshyObject` de la scène ⇒ ses actions, **et elles seules** (loi 4 —
un contrôle existe ssi l'objet l'accepte, le profil l'autorise, et l'action a un effet) :

| Action | Quand elle est servie |
|---|---|
| **Monter** / **Reculer** | objet de premier plan, et au moins un autre objet partage son plan |
| **Modifier** | l'objet a un éditeur (image, vidéo, son) |
| **Sortir de la scène** | profil **≠ Story** — le média quitte la scène et redevient un média du post |

**« Dans la scène » vs « hors de la scène » est la distinction structurante** : un média
dans la scène est un `MeeshyObject` (il a une position, un plan, un z, un temps) ; un
média hors de la scène est une slide à lui seul. Sortir un média de la scène, c'est le
promouvoir en slide ; l'y poser, c'est l'inverse.

## 6. Le chrome de base

```
┌──────────────────────────────────────────────────────────┐
│  ✕      [ Post ▾ ]      ▭ ▭ ▭ ＋              ⋯          │   barre haute
├──────────────────────────────────────────────────────────┤
│                                                          │
│                    la scène courante                     │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  description de la slide (P) / le contenu (S·R)          │
│  [ zone contextuelle — Amorce ou Inspecteur ]            │
│  [ rangée d'outils ]                                     │
│  🌐 Audience            👁            ⬆ Publier          │   socle
└──────────────────────────────────────────────────────────┘
```

La barre haute porte, dans cet ordre : **✕** (fermer) · le **type de publication**
(sélecteur) · le **rail des slides** (vignettes + ajouter) · **⋯** (le reste).
Le rail des slides monte dans la barre haute : c'est là qu'on navigue entre les slides,
pas au milieu du document.

## 6 bis. Où la structure d'une publication est VRAIMENT connue (mesure 2026-09-02)

La question « la structure d'une publication est-elle connue sur toutes les
couches ? » a une réponse mesurable, et elle se sépare en deux.

**L'ENVELOPPE est connue partout, et bien.** `id`, `kind`, `anchor`, `plane`,
`z`, `transform`, `timing`, `locale` sont déclarés au contrat
(`packages/shared/types/canvas-v3.ts`), typés, validés par Zod, et les cinq
couches les traitent génériquement — le convertisseur passerelle les remplit
dans un `baseObject` unique, quel que soit le kind.

**La CHARGE ne l'est nulle part, et c'est délibéré** :

```ts
payload: z.record(z.string(), z.unknown())
```

Le contrat déclare donc que la charge d'un objet est **opaque**. Chaque couche
en tient alors son propre inventaire privé, et ces inventaires divergent en
silence — rien ne peut les comparer, puisque le contrat ne dit rien.

### Ce que cette opacité coûte, en chiffres

> **Le premier nombre disait 123, et il n'était pas reproductible** (constat du
> 2026-09-03). Recompté par trois heuristiques — `grep` sur `public var|let`,
> bornage par la déclaration suivante, équilibrage d'accolades — il rendait
> **112**, **131** et **119**. L'écart ne venait pas des modèles : il venait de
> ce que « un champ » n'était pas défini. Propriétés calculées ? `internal` ?
> déclarées en extension ?
>
> **Un nombre que personne ne sait recompter n'est pas une mesure, c'est une
> décoration** — et il décore d'autant mieux qu'il est précis.
>
> **La règle est désormais `Mirror`**, sur une instance : la définition de Swift
> lui-même pour « propriété stockée ». Elle exclut d'office les calculées, les
> statiques et les méthodes sans qu'on ait à en décider, et n'importe qui la
> rejoue en trois lignes. C'est aussi celle qu'emploie déjà
> `CanvasV3ExhaustivityTests` sur les mêmes modèles — une seconde convention en
> aurait fait deux.
>
> Elle rend **121** depuis le 2026-09-04 (**120** au 2026-09-03), un QUATRIÈME nombre : aucune des trois heuristiques n'était
> juste, et chacune paraissait l'être.
>
> **`SceneObjectFieldCensusTests` (SDK) tient ce chiffre** et rougit dès qu'un
> champ est ajouté à l'un des cinq modèles. Son message ne dit pas « corrige le
> nombre » : il demande si le champ neuf est EXERCÉ par le blob v1 partagé — car
> s'il ne l'est pas, il vient d'agrandir les 47 % que rien ne compare, ce que ce
> paragraphe existe pour rendre visible.

| mesure | valeur | tenue par |
|---|---|---|
| champs des cinq modèles d'objet | **121** (`Mirror`, 2026-09-04) | `SceneObjectFieldCensusTests` |
| champs qu'exerce le blob v1 PARTAGÉ, seul juge de la parité Swift ⇄ passerelle | **≈ la moitié** † | — |
| champs jamais exercés — donc jamais comparés | **≈ la moitié** † | — |
| clés que le pont Swift émettait et que la passerelle ne recomposait pas | **14** — corrigées le 2026-09-02 par #4905 | commit |
| pertes silencieuses corrigées en deux jours | **8** | commits |

† **Ces deux-là étaient chiffrés 65 / 58, et leur somme faisait l'ancien 123.**
Les recopier tels quels sous le recensement recompté (121 depuis le 2026-09-04)
aurait produit une
arithmétique fausse — et une somme qui ne tombe pas juste est le premier endroit
où un lecteur cesse de croire un tableau. Ils sont donc rendus à ce qu'ils
mesurent VRAIMENT : une proportion, qui porte l'argument entière.

**La répartition n'est PAS gardée, et ce n'est plus elle qu'il faut garder**
(#4986, second volet, 2026-09-03). En cherchant à l'inventorier, la prémisse a
bougé : depuis #4905 les cinq branches d'objet RÉPANDENT, donc un champ ajouté à
un modèle voyage désormais **sans que le golden ait à l'exercer**. La couverture
du golden ne porte plus le risque qu'elle portait quand ce paragraphe a été
écrit.

Ce qui immunise n'est pas le COMPTE, c'est la FORME — et c'est elle qui est
gardée : `storyEffectsV3.spread.test.ts` exige que chacune des cinq branches
d'objet contienne `...rest`. Une branche qu'on ramènerait à un inventaire clé par
clé rougit désormais.

> La garde EXEMPTE la branche `blob.stickers` (legacy), qui écrit
> `o.payload = { emoji }` sans répandre — et c'est correct : sa source est un
> tableau de CHAÎNES, pas d'objets. Il n'y a rien à répandre. Une garde qui
> l'exigerait quand même demanderait de réparer ce qui n'est pas cassé.

> Les deux dernières lignes sont d'une autre nature, et c'est pourquoi elles
> gardent leur chiffre exact : ce sont des **événements datés**, traçables à
> leurs commits, pas des populations à recompter.

**Le 121ᵉ champ est entré dans les aveugles en connaissance de cause, et il en est
SORTI le même jour (2026-09-04).** `StoryMediaObject.crop` — le recadrage de la
vue `2d` (#5085) — voyage dans le blob v1 et dans le round-trip v3, et il est
APPLIQUÉ au rendu iOS (`contentsRect`, un sous-rectangle normalisé : aucun
ré-encodage, conformément à la planche `4c`).

Ce paragraphe a d'abord dit : « ni le web ni Android ne le lisent encore ; un
média recadré s'affiche donc ENTIER chez eux ». **Ce n'est plus vrai**, mesuré le
2026-09-04 en fin de journée :

| couche | état |
|---|---|
| `packages/shared/types/canvas-v3.ts` | **déclare** `crop` — une clause `superRefine` : les quatre clés ensemble ou aucune, bornées à [0,1], et seulement sur un `media` |
| `packages/shared/utils/media-crop.ts` | la règle partagée — `readMediaCrop`, `clampMediaCrop`, `effectiveMediaRatio`, `mediaCropStyle` |
| web (`CanvasV3Scene.tsx`) | **lit et applique** |
| Android (`core/model`) | **lit et applique** — modèle, deux formes de fil, projection au rendu |

> **Un document qui dit CASSÉ ce qui marche nuit autant qu'un document qui dit
> l'inverse.** Il invite à réparer ce qui l'est déjà, et il apprend au lecteur à
> se méfier du reste. Un constat de divergence est daté par nature : il énonce
> l'état d'un jour, et le jour passe. Celui-ci a vécu neuf heures.

Ce que la fermeture a laissé, et qui reste vrai : le portage a révélé que le
plancher de `clamped` **se défaisait lui-même** — l'origine bornée à `1`, puis la
dimension à `1 - origine`, donc `0` à la limite : exactement le média invisible
que le plancher existe pour empêcher. Les témoins Swift ne pouvaient pas
l'attraper : ils éprouvaient des origines INTERNES, où les deux écritures
s'accordent. *Réécrire une loi dans un second langage est un test qu'aucune suite
ne remplace.*

Et une frontière demeure, plus large que le recadrage : en v3, un média de plan
`bg` ne devient jamais un objet chez le lecteur Android — l'aiguillage le réduit
à une chaîne. **Ce qu'il porterait n'a pas où atterrir** (#5110).

**Les huit pertes sont toutes tombées dans les 47 % aveugles.** Ce n'est pas une
coïncidence : c'est le mécanisme. Un champ que le golden n'exerce pas n'est
comparé par rien.

### La forme qui immunise, et elle existe déjà dans le dépôt

Sur les cinq branches du convertisseur passerelle, **une seule RÉPANDAIT**
(`textObjects` : `o.payload = rest` après destructuration de l'enveloppe) ; les
quatre autres RECOMPOSAIENT clé par clé. Les huit morsures sont toutes tombées
sur une branche qui recompose. La branche qui répand porte les 36 champs de
`StoryTextObject` — dont cinq ajoutés cette semaine — sans que personne n'ait eu
à y penser.

**Les quatre autres répandent depuis #4905** (2026-09-02). Ne sortent du `rest`
que les champs d'ENVELOPPE (déjà logés par `baseObject` — les laisser passer les
mettrait en double) et les champs à RÈGLE, dont la valeur ne se recopie pas
telle quelle : `muted` se déduit, quatre clés se forcent à `null` quand elles
manquent, `anchor` ne voyage que s'il est un pivot, `slots` que s'il est une
carte de chaînes. Ils sont réécrits APRÈS le `rest`, donc ils gagnent.

> **Un inventaire humain se maintient à la main ; un `rest` se maintient tout
> seul.** Devant une charge opaque par contrat, la seule discipline qui tient à
> l'échelle est de ne pas énumérer.

Trois façons de fermer le trou, non exclusives, par coût croissant :
1. **répandre** au lieu de recomposer — **fait** (#4905) : quatre inventaires
   supprimés ;
2. **compléter le blob v1 partagé** pour que le golden exerce les 121 champs —
   utile après (1), pour les clés dérivées que le `rest` ne couvre pas ;
3. **typer la charge par kind au contrat** — le seul remède qui rendrait la
   structure connue *par déclaration* plutôt que par convention. C'est une
   décision de contrat, pas un correctif : elle ferme la porte à l'extensibilité
   permissive qui permet aujourd'hui à un client plus récent d'ajouter une clé
   qu'un client plus ancien ignore sans casser.

Tant que (3) n'est pas tranchée, **la charge reste une convention, jamais un
contrat** — et tout lot qui y ajoute une clé doit la porter à la main sur chaque
couche qui recompose.

## 6 bis-2. Le CHEMIN d'une publication — les quatre voies et les six maillons (mesure 2026-09-05)

Le § 6 bis mesure **où** la structure d'une publication est connue. Celui-ci
répond à la question qu'il laissait ouverte, et qu'aucun document ne traitait :
**par où passe-t-elle, et qui la recopie en chemin ?**

### Il y a QUATRE voies de publication, pas trois

| voie | ce qui la déclenche | corps HTTP | champs | porte `storyEffects` |
|---|---|---|---|---|
| **SCÈNE** | l'atelier de story (`StoryViewModel+PublicationUpload`) | `CreateStoryRequest` | 12 | **oui** |
| **DOCUMENT en ligne** | `PostService.create` | `CreatePostRequest` | 18 | **oui** |
| **DOCUMENT durable** — celle que prend TOUT post du meuble, en ligne comme hors ligne | `FeedViewModel.publish` → `OutboxDispatcher` | **`CreatePostBody`** | 15 | **oui depuis #4756** (`4ea147fc80`) |
| **ANCRAGE / repost cité** | `StoryRepublishComposer.ancrer` | `RepostIntent` → `POST /posts/:id/repost` | — | **NON** (#5201) |

> **Le troisième corps n'était compté nulle part** — ni ici, ni dans
> `docs/product/api-simplification/social.md`, qui parle de « deux types de corps
> distincts ». Et le quatrième chemin ne nomme `storyEffects` en aucun endroit,
> ce qui est exactement pourquoi chercher « qui porte la scène ? » le rate :
> **une énumération de sites porte deux affirmations — « ces sites appliquent la
> règle » (vérifiable) et « ce sont les sites où elle s'applique » (presque
> jamais vérifiée).**

Côté serveur, **il n'y a qu'UN schéma** : `CreatePostSchema`
(`routes/posts/types.ts:233`, 19 champs). `CreateStorySchema` n'existe pas — une
story est une BRANCHE (`type: 'STORY'` + le blob). Les « deux corps » du § 6 ter
sont deux types SWIFT reçus par un seul contrat.

Repo entier, en production : **12 sites** construisent un corps de `POST /posts`,
dont **cinq à la main sans aucun type** (web ×3, web-v3 ×1, outbox iOS ×1).

### La voie durable traverse SIX inventaires recopiés à la main

| # | maillon | champs | ce qui rougirait si un champ manquait |
|---|---|---|---|
| 1 | `ComposerDocumentDraft` (`ComposerDocumentRules.swift`) | 15 | **rien** |
| 2 | `PublishIntent` (`Services/PublishIntent.swift`) | 13 | une garde de SOURCE interdit les défauts dans la liste de paramètres — elle **ne vérifie la présence d'aucun champ** |
| 3 | `OfflineQueue.enqueuePostMedia` | 13 paramètres → 14 des 18 champs du payload | **rien** |
| 4 | `CreatePostPayload` (format ON-DISK) | 18, dont **10 avec défaut** | 6 témoins champ par champ, aucun recensement |
| 5 | `CreatePostBody` (le fil) | 15 | 11 témoins champ par champ, aucun recensement |
| 6 | `CreatePostSchema` (passerelle) | 19 | — |

**Sept champs ont déjà été perdus à ces maillons.** SIX sont réparés et portent
chacun le commentaire disant pourquoi ils manquaient : `location`,
`discoverabilityPrecision`, `repostOfId`, `mobileTranscription`, `storyEffects`,
et `mediaCaption` depuis le 2026-09-05 — **vérifié à l'écran, trois photos et
trois légendes distinctes affichées en plein écran** (`Média 2 sur 3` →
`LEGENDE-DEUX`), qui était le critère de fin de #4890.

**`mediaAlt` et `allowSoundExtraction` restent absents des maillons 4 et 5 — mais
ils ne se PERDENT pas : sur cette voie, rien ne peut les écrire.** La mesure du
2026-09-05 :

| | qui l'écrit | où ce panneau est monté |
|---|---|---|
| `mediaAlt` | `MediaAccessibilityPanel` (SDK) | `ComposerToolPanelHost` → `ComposerBottomBand` → `ComposerControlsLayer` → `StoryComposerView` — **l'ATELIER seul** |
| `allowSoundExtraction` | `SoundExtractionToggle` (SDK) | idem |

Or un post du meuble monte `ComposerSceneSurface` ou `ComposerDocumentSurface`,
jamais l'atelier (`ComposerMountedView.mounted` : seul `surface == .scene` y
mène, c'est-à-dire les ouvertures `.videoCameraReady`, `.resume`,
`.mediaSeeded`). Et l'atelier publie EN DIRECT — `publishStoryInBackground` →
`createCanvasPost`, sans passer par la file — donc ce qu'il collecte n'est
jamais perdu.

> **La distinction n'est pas une nuance de vocabulaire, elle change le
> correctif.** « Le champ se perd » demande de le transporter ; « rien ne peut
> l'écrire » demande d'ouvrir une PORTE, puis de transporter. Porter le champ
> seul fabriquerait un champ INERTE — celui qu'aucun geste n'alimente et que le
> prochain lecteur croira tenu.

Le précédent pour cette porte existe et n'est pas à inventer :
`MediaAccessibilityPanel` apparie déjà l'alt et la légende dans UN panneau,
« parce qu'elle a le même porteur et le même cycle de vie ». Sur la voie du
meuble, la légende se saisit dans le volet de description ; l'alt lui revient à
côté. Reste à trancher où exactement — décision produit, #5196.

`CreatePostBody` porte son propre diagnostic, et il est juste :

> *« Ce type est un INVENTAIRE recopié à la main : rien n'y signale un champ
> absent — ni le compilateur, ni le schéma, ni le serveur, qui publie sans lui. »*

**Le remède a la même forme que celui du § 6 bis, un étage plus haut.** Là, la
réponse à « la charge d'un objet perd des clés » n'a pas été un douzième témoin
mais un `...rest` — *un inventaire humain se maintient à la main ; un `rest` se
maintient tout seul*. Ici, la chaîne ne peut pas répandre (les maillons ne
partagent pas de forme), donc le remède est son jumeau : **un RECENSEMENT par
réflexion**, sur le modèle de `SceneObjectFieldCensusTests` (`Mirror`, qui rougit
quand un champ s'ajoute). Son message ne doit pas dire « corrige le nombre »,
mais : *ce champ neuf traverse-t-il les six maillons ?*

### Ce que chaque profil peut réellement publier

Mesuré le 2026-09-05, `storyEffects` comme sonde — création · **projection de
lecture** · rendu par lecteur.

| profil | accepté à la création | persisté | rendu par la projection | rendu chez le lecteur |
|---|---|---|---|---|
| **POST** | oui — `CreatePostSchema` n'a **aucune garde de type** | oui | oui (`postInclude` est un `include`, pas un `select`) | **carte de fil iOS seulement** — le DÉTAIL ne sait pas rendre une scène (#5192) ; web, web-v3, Android : non |
| **REEL** | oui, même branche | oui | oui | **carte de fil iOS seulement** — `ReelsPlayerView` ne lit `storyEffects` que pour la piste audio (#5192) |
| **STORY** | oui, quatre écrivains | oui | oui en corps complet · **NON sous `?projection=tray`** (`trayStorySelect` l'omet par conception) | iOS ✅ · web ✅ · Android ✅ · **web-v3 non** (#5195) |
| **STATUS** | oui **au schéma**, aucun producteur mesuré | oui | oui | aucun |

Trois choses se lisent dans ce tableau, et ce sont les trois questions à poser à
tout champ de publication :

1. **Un champ accepté et persisté mais absent de la projection de LECTURE est
   perdu aussi sûrement que s'il n'était jamais parti.** `?projection=tray` est
   exactement ce cas, et c'est le chemin que web-v3 emprunte pour lister ses
   stories.
2. **Un champ rendu sur UNE surface et pas sur sa destination naturelle inverse
   le sens du geste** : la carte d'un post composé montre la scène, le tap
   l'efface (#5192).
3. **La validation du contrat n'est appliquée nulle part à la LECTURE**, et à
   l'écriture seulement derrière `CANVAS_V3_WRITE_STRICT`, armé dans aucun
   fichier de configuration du dépôt (voir l'encadré du § 1 bis-2). Ce qui
   garantit aujourd'hui que le fil porte du canvas v3, ce sont **les écrivains**
   — donc personne, dès qu'un écrivain se trompe.

### Les limites que la voie durable porte encore

- **UNE seule slide.** Le brouillon emporte `viewModel.currentSlide.effects` — un
  document à M scènes n'en publie qu'une (#4770, la dette de cardinalité du § 1 bis).
- **Les objets média du canvas ne reçoivent pas leur `postMediaId`** (#5184).
  `sanitizedForServerPublish()` annule les `mediaURL` en `file://` et le
  journalise ; le lien vers les `PostMedia` créés à l'upload n'est jamais posé.

  > **CORRECTION du 2026-09-05.** Ce paragraphe disait « le canvas part sans ses
  > images locales » et « un fond local part sans son image ». **C'est faux,
  > mesuré à l'écran** : un post à photo de fond affiche bien sa photo, sur la
  > carte comme en plein écran. Le diagnostic avait suivi le champ jusqu'à son
  > écriture, pas jusqu'au PIXEL.
  >
  > La photo arrive par une route que le lien manquant ne bloque pas : le média
  > téléversé voyage par `mediaIds`, et `toRenderableSlide` élit comme backdrop
  > **l'entrée `media` qu'AUCUN objet ne référence**
  > (`legacyMediaURL = self.media.first(where: { !referencedIds.contains($0.id) })`).
  > Un objet dont le `postMediaId` est vide ne référence rien — la photo est donc
  > adoptée comme fond, précisément PARCE QUE le lien manque.
  >
  > **Ce qui n'en est pas réparé pour autant** : la route du backdrop n'élit
  > qu'UNE entrée. Un canvas à plusieurs médias, ou un média de PREMIER PLAN qui
  > n'est pas le fond, n'a pas de route de secours. Le lien reste à poser.

  **Le second régime, lui, n'est pas infirmé.** Un objet fraîchement posé naît
  avec `postMediaId: ""`, que `str()` écarte côté passerelle : le cas nominal
  passe. Mais un canvas portant un `postMediaId` NON VIDE absent de
  `body.mediaIds` — reprise de brouillon après upload, édition, repost, média
  semé depuis une conversation — sera **REFUSÉ** (400 `MEDIA_NOT_CLAIMED`) dès
  que `CANVAS_V3_WRITE_STRICT` s'armera. Ce sont exactement les chemins qu'on
  teste le moins.

  > **Un diagnostic qui s'arrête à l'écriture d'un champ décrit une cause, pas un
  > symptôme.** Entre les deux, il y a toutes les routes de secours que le code
  > porte déjà — et l'une d'elles rendait ici le résultat JUSTE pour une raison
  > fausse.

## 6 ter. La frontière SDK ↔ app : un vocabulaire de VERBES (mesure 2026-09-03)

Le § 6 bis mesure où la structure d'une publication est connue. Celui-ci mesure
**comment on la modifie** — question distincte, et dont la réponse n'était écrite
nulle part alors que le compilateur la fait respecter.

### La règle, telle qu'elle est réellement appliquée

> **CORRECTION du 2026-09-05.** Ce paragraphe affirmait « l'app ne peut pas
> écrire dans les effets » et concluait : « `public internal(set)` la fait
> respecter à la compilation — la meilleure sorte de règle, celle qu'on ne peut
> pas enfreindre par distraction ». **C'est faux, et la règle est enfreinte par
> distraction dans le fichier voisin, par le mécanisme le plus emprunté du
> composer.** Ce qui suit est l'état mesuré ; l'ancienne rédaction décrivait une
> INTENTION.

| | ce qui est exposé | portée | mesure |
|---|---|---|---|
| `StoryComposerViewModel.currentEffects` | la LECTURE seule | `public internal(set)` | `+Elements.swift:54` ✅ |
| **`StoryComposerViewModel.currentSlide`** | **la LECTURE ET L'ÉCRITURE** | `public var` avec `set` **public** | **`+Slides.swift:13,25`** ❌ |
| `StoryComposerViewModel.openingEffect` | lecture et écriture | `@Published public var` | `StoryComposerViewModel.swift:309` ❌ |
| `StoryComposerViewModel.declaredContentLanguage` | lecture et écriture | `public var` | `StoryComposerViewModel.swift:588` ❌ |
| le protocole `StoryComposerProviding` | rien, hors du SDK | `internal` | ✅ |
| les OPÉRATIONS | **47** verbes (voir le recompte ci-dessous) | `public func` | — |

**`currentEffects` est bien en lecture seule, et cela ne protège rien** :
`StorySlide.effects` est un `public var` sur une `struct` publique
(`StoryModels.swift:730`), et `currentSlide` a un setter public. Depuis l'app,
sans un seul verbe :

```swift
var s = vm.currentSlide      // get public
s.effects = …                // var public sur une struct de valeur
vm.currentSlide = s          // set public → écrit currentEffects EN BLOC
```

Ce n'est pas une faille théorique, **c'est le chemin d'écriture NOMINAL du
canvas** : `EmbeddedSceneCanvas` expose `@Binding public var slide`
(`EmbeddedSceneCanvas.swift:33`) et remonte par lui toute mutation directe de
l'auteur — déplacer un objet, éditer un texte en place. Le `Binding` est fabriqué
**dans l'app**, à trois sites : `MeeshyComposerHost+Surfaces.swift:420`,
`ComposerObjectEditorView.swift:333`, `MeeshyComposerHost+DocumentSurface.swift:51`.

> **`public internal(set)` sur une propriété ne dit rien de la propriété d'à
> côté.** L'annotation a déplacé le trou d'un cran, sur un membre qui n'a pas la
> même portée — et c'est ce membre-là que le composer emprunte. La leçon
> générale : *une garde de portée protège le NOM qu'elle décore, jamais le
> chemin*. Pour savoir si un état est en lecture seule, il faut énumérer TOUS
> les chemins qui y mènent, pas lire l'annotation du plus visible.

**Ce qui reste vrai, et qui compte** : les verbes existent, ils tiennent des
invariants réels (un seul fond par slide, le nettoyage des champs legacy, la
cohérence du `zIndex`, le retrait de la `ComposerReference` d'un badge supprimé),
et l'app les appelle massivement. La frontière est une DISCIPLINE bien suivie,
pas une contrainte de compilation. La distinction n'est pas de l'ergotage : une
discipline se relâche en silence, et l'exemple est déjà dans le dépôt — trois
opérations ont un jumeau côté canvas qui applique une règle DIFFÉRENTE (§ 6 ter
bis).

**Recompte des verbes (2026-09-05).** Le « ~42 » venait du glob
`StoryComposerViewModel+*.swift` — les seuls fichiers d'EXTENSION. Le fichier de
CLASSE en porte cinq de plus (`adoptDraft`, `detachFromAdoptedDraft`,
`applyBackground`, `clearBackground`, `applyContentText`). La commande juste, et
son résultat :

```bash
grep -h "public func" packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel*.swift | wc -l
# → 47   (42 avec le glob `+`, qui omet le fichier de classe)
```

> Le chiffre n'était pas faux par dérive : il était faux par la FORME du glob.
> C'est exactement le piège que le § 6 bis énonce à propos des recensements —
> « un nombre que personne ne sait recompter est une décoration » — et il s'y est
> pris lui-même, deux sections plus loin, faute d'avoir publié sa commande.

> Cette frontière est la forme concrète, pour le composer, de la règle de partage
> du § « SDK Purity » : des briques aux paramètres opaques dans le SDK, la
> décision produit chez l'app. Un verbe dit *comment* ; l'app décide *quand* et
> *où*.
>
> **Nuance mesurée le 2026-09-05, et elle est importante :** le VERBE respecte
> cette règle, son HÔTE non. `StoryComposerViewModel` est un ViewModel de
> **4 483 lignes sur 18 fichiers, déposé côté SDK** — ce que le tableau de
> placement de `packages/MeeshySDK/CLAUDE.md` range explicitement du côté APP. Il
> lit quatre singletons nommés Meeshy (`CacheCoordinator.shared` en deux sites,
> `WaveformCache.shared`, `StoryMediaLoader.shared`) et encode au moins quatre
> décisions produit (`canAddMedia { < 10 }`, `canAddSlide { < 10 }`, le bornage
> [0,1] du placement, la doctrine de ratio). C'est le plus gros manquement du
> dépôt à la règle qu'il cite. `moveElement` porte un doc-comment invoquant cette
> même règle : le verbe est juste, le fichier où il vit ne l'est pas.

### Les DEUX corps de `POST /posts` divergent par CONCEPTION (mesure 2026-09-03)

> **CORRECTION du 2026-09-05 — il n'y a pas deux CORPS, il y a deux types SWIFT
> et UN schéma.** `services/gateway/src/routes/posts/types.ts` ne déclare ni
> `CreateStorySchema` ni `StorySchema` : une story est une BRANCHE de
> `CreatePostSchema` (`type: 'STORY'` + le blob `storyEffects`). Le titre de
> cette section suggère deux contrats serveur qui n'existent pas.
>
> Corollaire, et il pèse : **la story est le seul profil dont le serveur ne
> valide pas la forme.** `StoryEffectsSchema` (`types.ts:186`) est
> `.passthrough()` et ne déclare que sept clés (`background`, `thumbHash`,
> `mediaObjects`, `textObjects`, `stickerObjects`, `audioPlayerObjects`,
> `slideDuration`) ; les `CodingKeys` Swift en portent une trentaine de plus, qui
> traversent sans qu'aucun schéma les voie. Le seul garde-fou réel est la taille
> sérialisée, ≤ 256 Ko.
>
> Et **il y a un TROISIÈME type de corps côté iOS**, que ni ce document ni
> `social.md` ne comptent : `CreatePostBody` (`OutboxDispatcher.swift:965`, 15
> champs, `encode(to:)` écrit à la main) — le corps de la voie DURABLE, celle que
> prend tout post du meuble. Repo entier, en production : **12 sites** construisent
> ce corps, dont cinq à la main sans aucun type (web ×3, web-v3 ×1, outbox iOS ×1).
>
> Enfin, la table de justification ci-dessous a **cinq lignes pour six champs** :
> `discoverabilityPrecision` n'y est pas expliqué, et il n'a aucun logement dans
> `storyEffects` — ce n'est pas un objet de scène, c'est un consentement de
> publication, comme le § 1 le dit lui-même. Voir #5193.

`docs/product/api-simplification/social.md` compte **cinq sites** qui construisent
le corps de `POST /posts`, « pour deux types de corps distincts
(`CreatePostRequest`, `CreateStoryRequest`) », et prescrit de « réunir ces
symboles » avant toute bascule de route. Le document ne dit pas CE QUI diverge ;
mesuré ici, parce que le chiffre brut induit en erreur.

| | champs |
|---|---|
| `CreatePostRequest` | **18** |
| `CreateStoryRequest` | **12** |
| en propre à la story | **aucun** — c'est un sous-ensemble STRICT |
| en propre au post | `moodEmoji` · `location` · `audioUrl` · `audioDuration` · `mobileTranscription` · `discoverabilityPrecision` |

Six champs manquants a l'air d'une perte. **Ce n'en est pas une** : pour une
story, ces informations vivent DANS `storyEffects`, pas à côté.

| champ absent du corps story | où il vit pour une story |
|---|---|
| `location` | un `StoryLocationObject` posé sur la scène (`addLocation` remplit `currentEffects.locationObjects`) — le § « Ce qui appartient à la PUBLICATION » dit exactement pourquoi les deux ne sont pas le même lieu |
| `mobileTranscription` | `StoryEffects.voiceTranscriptions: [StoryVoiceTranscription]?` |
| `audioUrl` · `audioDuration` | un `audioPlayerObject` de la scène, avec son plan et sa durée |
| `moodEmoji` | une humeur n'est pas une scène — le champ n'a pas d'emploi ici |

> **Une différence de cardinalité n'est pas une divergence.** Le corps d'une story
> est plus court parce que la scène porte ce que le post met à plat, et unifier
> les deux ajouterait au chemin story six champs structurellement redondants — un
> second endroit où écrire le lieu, avec la question « lequel gagne ? » en prime.

Ce que la réunion des cinq symboles doit viser est donc **un corps unique dont les
champs de mise à plat sont optionnels**, pas la fusion des deux formes à
l'identique. La distinction se perd facilement : elle ne se voit qu'en demandant,
pour chaque champ absent, *où va cette information quand elle existe* — et pas en
comparant deux listes.

### Le piège : une capacité absente derrière un vocabulaire qui la suggère

Le lot #5018 a buté sur une absence que rien ne signalait : **aucun verbe ne
disait « pose cet objet là ».** L'absence était masquée par un trio qui en a
l'air — `beginDrag` / `updateDrag` / `endDrag`. Ces trois-là ne portent qu'un
état ÉPHÉMÈRE (`activeDrag`), et `endDrag()` se contente de le remettre à `nil` :
**il ne commite aucune position.** Un appelant qui cherche « comment déplacer »
trouve trois fonctions de glissement et conclut que le sujet est couvert.

> **Une capacité absente derrière un vocabulaire qui la suggère coûte plus cher
> qu'une capacité absente tout court : on ne la cherche pas deux fois.** Le
> premier jet du correctif a donc essayé d'écrire directement dans
> `currentEffects` — refusé par le compilateur, et à juste titre.

`moveElement(id:to:)` comble le trou
(`StoryComposerViewModel+Placement.swift`). Il borne la position à [0, 1] : un
objet posé hors cadre serait injoignable, ce qui est pire que mal placé.

### Ce que cette mesure ne dit pas

Elle ne dit pas si les ~42 verbes sont les BONS, ni s'il en manque d'autres. Elle
dit qu'il en manquait au moins un, et que son absence était invisible depuis
l'app. La question « quel geste de l'app n'a pas son verbe ? » se pose surface
par surface, et n'a été posée qu'une fois.

## 6 quater. Qui REND ce que le composer produit (méthode et résultats, 2026-09-03)

Le § 6 bis mesure où la structure d'une publication est connue ; le § 6 ter, comment
on la modifie. Celui-ci répond à la troisième question, et c'est celle qui a rendu
le plus : **un champ que le composer PRODUIT est-il rendu par les trois lecteurs ?**

### La méthode

Pour chaque champ du contrat, trois questions dans cet ordre — et l'ordre compte,
parce que chacune peut clore l'enquête :

1. **le contrat le porte-t-il ?** (`canvas-v3.ts`)
2. **un client le PRODUIT-il ?** — sans producteur, l'absence de rendu ne gêne personne
3. **chaque client le REND-il ?** — c'est la seule question qui décrit ce que l'utilisateur voit

> Le crible par comptage de fichiers (`grep -ril <champ> | wc -l`) **repère les
> zéros, jamais les présences.** Un `opening` compte douze fichiers côté web
> alors que le web ne peint aucune transition de scène : `webComposerOpening`,
> « opening tag » et le reste polluent le compte. **Un zéro mérite une enquête ;
> un non-zéro ne prouve rien.**

### Ce que la méthode a trouvé

**Les transitions de scène (#5043).** `opening` / `closing` sont produites par le
composer iOS et transportées par le contrat. iOS les REND ; Android les PROJETTE
puis les jette (aucune vue ne les consomme) ; le web ne les rend pas et déclare
le report avec une condition — « tant qu'aucun lecteur ne le rendra » — **qui est
fausse depuis qu'iOS les rend**. Un auteur qui pose une ouverture « reveal » la
voit sur un client sur trois.

**Le `thumbHash` (#5047).** Le contrat le décrit comme « le placeholder que quatre
surfaces affichent avant l'arrivée du média ». iOS et Android le peignent ; le web
ne le connaît pas — et n'a **aucun** état de chargement dans `CanvasV3Scene`, dont
le rendu se garde par `if (media.url && …)`. Média absent, rien n'est peint. Et
c'est le chemin de TOUTES les stories du web, parce que **les deux écrivains
émettent du v3 natif** — non parce que la passerelle refuserait le reste
(correction de cause du 2026-09-05, voir l'encadré du § 1 bis-2 : le refus est
derrière `CANVAS_V3_WRITE_STRICT`, armé nulle part).

### Ce que ces deux cas ont en commun

Aucun des deux n'est une panne : rien ne casse, rien ne remonte, aucun témoin ne
tombe. **Le contrat accepte, le client ignore, l'auteur ne sait pas.** C'est la
forme que le Prisme a déjà payée trois fois — et elle se répète ici parce que la
même cause est en place : **une valeur transportée sans que personne ne réponde de
son rendu.**

Un vocabulaire partagé (§ #5043) ne suffirait pas à lui seul : il ferait que les
clients parlent de la même chose, pas qu'ils la peignent. Ce qui manque en propre
est une matrice **champ × client × rendu**, tenue, et dont une case vide soit une
DÉCISION écrite plutôt qu'un oubli.

## 6 quinquies. iOS et web : DEUX structures, UNE loi (mesure 2026-09-04)

Le composer existe des deux côtés, et leurs fichiers ne se ressemblent pas — 73
sources iOS contre 9 web. **Le compte ne dit rien** : ce qu'il faut mesurer est
si la même LOI produit le même comportement, pas si les mêmes fichiers existent.

### Ce qui DIVERGE, et qui n'est qu'un nom

| surface | iOS | web |
|---|---|---|
| document | `ComposerDocumentSurface.swift` | `ComposerDocumentSurface.tsx` |
| humeur | `ComposerMoodSurface.swift` | `ComposerMoodSurface.tsx` |
| **scène** | `ComposerSceneSurface.swift` | **`v2/StoryComposer.tsx`** — autre nom, autre lignée |
| repost | *aucune* — passe par le MEUBLE (`e7052cc6e3`) | `ComposerRepostSurface.tsx` — surface dédiée |

Le mot « scène » est **absent** du composer web. Il faut le savoir avant de
conclure, comme j'ai failli le faire, que le web ne compose pas de scènes : il en
compose, et #4913 le dit (« alors que le composer web en produit »). C'est une
divergence de VOCABULAIRE, pas de capacité — et elle vit dans une lignée `v2/`
que le milestone de parité (#56) suit déjà.

### Ce qui CONVERGE, et c'est le point important

La loi 5 du repost — *« le repost miroite ; changer de format est l'ANCRAGE »* —
est tenue des DEUX côtés, par deux structures opposées :

- **web** : une surface dédiée qui remplace `RepostModal`, laquelle n'offrait
  aucun choix de format ;
- **iOS** : le meuble, avec la loi écrite dans `ComposerIntent` (« Le format d'un
  repost MIROITE celui de sa source ») et ses témoins nommés
  (`test_leRepostDUnMood_offreLAncrage_ET_unEcranLePeint`).

> **Une loi partagée sous deux structures est saine ; deux structures sans loi
> partagée ne le sont pas.** La question à poser d'un composer à l'autre n'est
> donc pas « ont-ils les mêmes fichiers ? » mais « la même règle produit-elle le
> même comportement ? ». Le premier critère aurait signalé une divergence là où
> il n'y en a pas, et l'aurait ratée là où elle compte.

## 6 sexies. Android ÉCRIT aussi — et son port a dérivé (mesure 2026-09-04)

Les mesures précédentes regardaient Android en LECTURE. Il écrit également :
`PostApi.createStory(@Body CreateStoryRequest)`, appelé par `PostRepository` et
par le videur d'outbox hors ligne.

Son type se déclare **« port of `CreateStoryRequest` (ServiceModels.swift) »** —
et il lui manque **cinq** champs : `mentions` · `visibilityUserIds` ·
`mediaAlt` · `mediaCaption` · `allowSoundExtraction`. (Il en porte trois que
Swift range ailleurs — `effectFlags`, `moodEmoji`, `parentId` — ce qui est une
autre découpe, pas un manque.)

**Le coût actuel est nul** : Android n'a ni sélecteur d'audience nommée pour une
publication, ni mentions de publication (les siennes ne servent que les
commentaires). Rien ne se perd aujourd'hui.

> **Ce qui rend la dérive coûteuse est sa DÉCLARATION, pas son effet.** Qui
> ajoutera un jour une audience nommée à Android lira « port », supposera la
> parité, et ne rencontrera **aucune erreur de compilation** — le champ n'existe
> pas pour être passé. La valeur disparaîtra entre le composer et le fil, sans un
> mot. Une seule des cinq est rattrapée en aval (`visibilityUserIds`, refusé par
> la passerelle sans liste) ; les quatre autres partiraient en silence, dont le
> texte alternatif.

Détail et critères : #5078.

## 7. Correspondance avec ce qui existe

Le vocabulaire est neuf ; les représentations ne le sont pas. Rien à migrer au fil.

| Vocabulaire | Au fil (partagé) | En mémoire iOS (v1, derrière le pont) |
|---|---|---|
| `MeeshyObject` | `ObjectV3` (`packages/shared/types/canvas-v3.ts:37`) | `StoryTextObject` · `StoryMediaObject` · `StoryStickerObject` · `StoryAudioPlayerObject` · `StoryLocationObject` |
| `MeeshyScene` | `CanvasV3.scenes[i]` | `StorySlide.effects` (`StoryEffects`) |
| `MeeshySlide` | une scène + son texte | `StorySlide` |
| `MeeshyPublication` | le document `CanvasV3` + le profil | `StoryComposerViewModel.slides` + le profil |

Le pont existe déjà dans les deux sens : `CanvasV3Migration.swift`
(`CanvasV3.init(migrating:)` / `StoryEffects.init(rendering:sceneIndex:)`), avec un
golden PARTAGÉ comme oracle.

**Le CHROME a son propre inventaire, et il vit dans la planche.** Les quatre noms ci-dessus décrivent
le contenu ; la barre haute, l'éventail, le rail, la rangée d'outils, l'inspecteur, les amorces et le
socle décrivent ce qui l'entoure. Leur table — avec, pour chacun, le niveau du modèle sur lequel il
agit — est dans `planche-meeshy-composer.md` § « Ce que les quatre noms NE couvrent pas ». Ce
fichier-ci reste l'autorité sur les noms du CONTENU ; la planche l'est sur ceux du CHROME.

**Règle de nommage** : tout code NEUF, toute issue, toute chaîne d'UI parlent
`MeeshyObject` / `MeeshyScene` / `MeeshySlide` / `MeeshyPublication`. Les types `Story*`
restent en place comme représentation v1 derrière le pont — les renommer est un chantier
à part, jamais un effet de bord d'un lot de feature.

**Le quatrième profil s'appelle `status` dans le CODE et « mood » dans la
PROSE, et les deux sont justes** (relevé du 2026-09-02 : 372 « mood » contre
181 « status » dans le seul répertoire du composer, parfois dans le même
doc-comment).

| où | le mot | pourquoi il ne bouge pas |
|---|---|---|
| type, fil, base | **`status`** | `ComposerFormat.status`, `PostType.STATUS` (`schema.prisma`) — le changer est une migration, pas un renommage |
| produit, UI, prose | **« mood »** | c'est le mot que l'auteur lit et que la planche emploie (profil **M**) |

Ce n'est donc **pas** une divergence à réduire, mais une frontière à tenir : un
identifiant qui traverse le fil garde `status` ; une chaîne d'interface et un
texte explicatif disent « mood ». Ce qu'il ne faut pas faire, et qui se voit
déjà, c'est **mélanger les deux dans une même phrase** — un doc-comment qui
nomme `removedFromStatus` « ce que le profil MOOD retire » oblige son lecteur à
traduire, et la traduction n'est écrite nulle part.

**« décoration » et « gabarit » sont les mots du PRODUIT ; `sticker` et
`template` ceux du CODE** — même forme que la frontière ci-dessus, et pas
davantage une divergence à réduire.

| où | le mot | pourquoi il ne bouge pas |
|---|---|---|
| kind, fil, type | **`sticker`** · **`template`** | `sticker` est l'un des sept `ACTIVE_KINDS` (`canvas-v3.ts:5`) ; `StickerTemplateCatalog` et `templateId` traversent le fil — les changer est une migration |
| produit, UI, prose, issues | **« décoration »** · **« gabarit »** | c'est ce que l'auteur POSE et ce que la planche dessine |

Ce qu'il ne faut pas faire est encore une fois de mélanger les deux dans une
même phrase : « le sticker à gabarit » oblige son lecteur à traduire dans les
deux sens à la fois.

**Ce qu'une décoration EST, et la ligne qui décide où elle se pose.** Un gabarit
est un cadre plus des FENTES (`slots`) — un dessin en code, pas un glyphe.
Cette ligne de partage vit aujourd'hui dans un doc-comment
(`StickerTemplate.swift`) ; elle est une RÈGLE, donc sa place est ici :

> **Une FAMILLE d'objet de scène existe quand la plateforme LIT la donnée ;
> sinon c'est un sticker avec un gabarit.**

- un **lieu** porte des coordonnées et un id de POI que la plateforme lit
  (`/posts/nearby`) ⇒ il reste un objet `place`, simplement DÉCORÉ ;
- une heure figée, un cœur ⇒ un objet `sticker` de nature gabarit.

Tout mettre en sticker ferait de la pastille de lieu décorée la JUMELLE de
l'objet `place`, dont une seule des deux porterait la donnée géographique. Et
une famille par thème (`time`, `love`, `weather`…) rouvrirait les cascades que
la somme à cinq cas a fermées (#4591).

**Un catalogue, DEUX portes — et c'est délibéré.** Le même
`StickerTemplateCatalog` est adressé par deux champs qui ne disent pas la même
chose :

| champ | porteur | la relation |
|---|---|---|
| `templateId` | objet `sticker` | l'objet **EST** ce gabarit |
| `styleId` | objet `place` | l'objet **est DÉCORÉ PAR** ce gabarit |

Les unifier par un renommage effacerait précisément la distinction qui justifie
que le lieu garde sa famille. Sur un sticker, le RANG décide : `templateId` gagne
sur `postMediaId`, qui gagne sur l'emoji.

**Le repli voyage TOUJOURS avec la chose dont il est le repli.** Le catalogue est
une constante du binaire : un id inconnu — publié par une version plus récente,
ou lu par un client qui ne dessine aucun gabarit — retombe sur un repli
(l'emoji pour un sticker, la pastille de base pour un lieu) plutôt que sur un
trou. Web et Android ne dessinent aucun gabarit et servent ce repli : c'est la
règle COMPAT 1, déclarée par #4819 et #4821, pas un oubli.

> Mais **un repli conservé SANS la chose dont il est le repli n'est plus un
> repli : c'est le contenu.** Trois fois en deux jours, un champ de gabarit a
> été perdu par un convertisseur pendant que son repli, lui, voyageait
> soigneusement (#4741, #4832). Et la perte est d'autant plus invisible que le
> repli est bon : un `styleId` absent rend `location.pill`, donc le seul gabarit
> qui survivait à l'aller-retour était celui qui SERT de repli.

**« Meeshes » est un terme de communication COMMERCIALE, jamais un nom du modèle**
(arbitrage porteur, 2026-09-01, #4757). Il désigne les publications de type story,
réel et post — **sans les moods** —, et c'est précisément pourquoi il ne peut pas
être un nom du modèle : les quatre couches qui existent traitent les quatre profils
ensemble (`PostType = POST | REEL | STORY | STATUS`, `ComposerFormat = story, post,
reel, status`, la planche « S · R · P · M »). Le mot ne change ni l'état, ni la
vision, ni le contrat.

Il n'entre donc **ni dans le code, ni dans le schéma, ni dans une issue, ni dans une
chaîne d'UI** — la règle de nommage ci-dessus reste entière. L'écrire ailleurs que
dans un support de communication fabriquerait une cinquième terminologie, désignant
un sous-ensemble qu'aucune couche ne modélise.
