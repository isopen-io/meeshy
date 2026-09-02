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
faut que la scène voyage avec lui. `PublishIntent` et `CreatePostBody` ne
portent **aucun** `storyEffects` (#4756) — le chemin document perd la scène
entière. #4756 n'est donc pas un confort : c'est le préalable de cette règle
pour les profils P et R.

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

## 1 ter. Ce que chaque nom devient SOUS le composer

Les quatre noms du § 1 sont le vocabulaire du composer. Deux d'entre eux n'ont
**aucun correspondant** sous lui — ni sur le fil, ni en base, ni comme type
Swift. Le tableau est mesuré le 2026-09-01, avec la commande qui le reproduit.

| nom du modèle | contrat partagé (`packages/shared/types/canvas-v3.ts`) | type Swift livré |
|---|---|---|
| **`MeeshyObject`** | `ObjectV3` — mais son `payload` est `Record<string, unknown>` : **aucun type d'objet n'est nommé au contrat** | `MeeshySceneObject` (somme à 5 cas) |
| **`MeeshyScene`** | `SceneV3` — `scenes: []`, 1 à 10, ≤ 60 objets | `StorySlide` |
| **`MeeshySlide`** (= scène + description) | **rien.** `SceneV3` ne porte **aucune description**, et le mot « slide » a **zéro occurrence** dans le contrat | **aucun type de ce nom** |
| **`MeeshyPublication`** | **rien.** Elle se projette en N `Post` (§ 1 bis) | **aucun type de ce nom** |

```bash
grep -ci slide packages/shared/types/canvas-v3.ts        # → 0
git grep -n "struct MeeshySlide\|struct MeeshyPublication" -- '*.swift'   # → rien
```

**Une divergence de NOM, et c'est celle que le § 1 met en garde d'éviter.**
Le contrat nomme l'objet de scène **`place`** (`ACTIVE_KINDS`,
`canvas-v3.ts:5`) ; la somme Swift le nomme **`location`**
(`MeeshySceneObject.swift:60`). Or `location` est, dans le même langage et
souvent dans le même fichier, le **lieu de la PUBLICATION** (`location:
SharedPlace?`, du brouillon jusqu'à `createPost`) — c'est-à-dire exactement la
paire que le tableau du § 1 sépare : *d'où l'on publie* contre *une pastille
posée sur une scène*.

> **Le seul mot que ce cas ne devait pas porter est celui qu'il porte.** La
> confusion n'est pas hypothétique : le modèle l'a nommée avant qu'elle
> existe dans le type, et un lecteur qui suit `place` depuis le contrat ne le
> trouve nulle part côté Swift.

Suivi : renommer le cas en `.place` — mécanique, mais sur l'API publique du SDK.

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

> Le champ posé par la Phase 2 (`sceneDescriptionField`) est aujourd'hui lié au
> `content` du document. **C'est juste en S/R et faux en P** : en P il doit être la
> légende de la slide courante, et le `content` du post doit avoir son propre logement.

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

| mesure | valeur |
|---|---|
| champs des cinq modèles d'objet | **123** |
| champs qu'exerce le blob v1 PARTAGÉ, seul juge de la parité Swift ⇄ passerelle | **65** (53 %) |
| champs jamais exercés — donc jamais comparés | **58** (47 %) |
| clés que le pont Swift émettait et que la passerelle ne recomposait pas | **14** — corrigées le 2026-09-02 par #4905 |
| pertes silencieuses corrigées en deux jours | **8** |

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
2. **compléter le blob v1 partagé** pour que le golden exerce les 123 champs —
   utile après (1), pour les clés dérivées que le `rest` ne couvre pas ;
3. **typer la charge par kind au contrat** — le seul remède qui rendrait la
   structure connue *par déclaration* plutôt que par convention. C'est une
   décision de contrat, pas un correctif : elle ferme la porte à l'extensibilité
   permissive qui permet aujourd'hui à un client plus récent d'ajouter une clé
   qu'un client plus ancien ignore sans casser.

Tant que (3) n'est pas tranchée, **la charge reste une convention, jamais un
contrat** — et tout lot qui y ajoute une clé doit la porter à la main sur chaque
couche qui recompose.

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
