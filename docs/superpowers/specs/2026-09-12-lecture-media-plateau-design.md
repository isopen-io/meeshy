# Le plateau de lecture — un média se lit dans un cadre, et le plein écran s'ouvre au geste

> Conception arrêtée le 2026-09-12 sur directive porteur, après maquette de validation
> (trois révisions). La maquette montre la géographie et les gestes ; ce document dit ce
> qu'ils engagent dans le code.

## 1. Le problème, mesuré

Meeshy a **sept surfaces de lecture plein écran**, et aucune ne partage sa loi de cadrage
avec une autre :

| surface | fichier | lignes | état d'immersion |
|---|---|---|---|
| Galerie média (la canonique) | `apps/ios/.../ConversationMediaGalleryView.swift` | 980 | `showControls` — fondu seul |
| Pages de la galerie | `apps/ios/.../ConversationMediaGalleryView+Pages.swift` | 630 | — |
| Lecteur de stories | `apps/ios/.../StoryViewerView+Canvas.swift` | 2 334 | `chromeVisible` + `isFullscreenStorySession` — **le seul qui cadre** |
| Lecteur de réels | `apps/ios/.../ReelsPlayerView.swift` | 1 628 | `chromeHidden` — fondu seul |
| Scène plein écran | `apps/ios/.../SocialSceneFullscreenView.swift` | 460 | **aucun** |
| Audio plein écran | `apps/ios/.../AudioFullscreenView.swift` | 1 260 | **aucun** |
| Lecteur vidéo SDK | `packages/MeeshySDK/.../MeeshyVideoPlayer+Renderers.swift` | 1 081 | `showControls` + auto-hide 4 s |
| Lightbox legacy | `packages/MeeshySDK/.../ImageViewerView.swift` | 406 | doublon de la galerie, deux défauts |

Trois constats, et le troisième est celui qui décide de l'architecture :

1. **Cinq états d'immersion divergents**, nommés différemment, animés différemment
   (`.easeInOut(0.2)`, `.easeInOut(0.25)`, deux ressorts, un auto-hide).
2. **La scène et l'audio n'ont aucune immersion** — leur chrome est toujours là.
3. **Un seul état pilote le CADRAGE** : celui de la story, par la fonction pure
   `StoryCanvasFraming.readerPresentation(isFullscreenSession:chromeVisible:)` →
   `.free` / `.carded`. Partout ailleurs, « immersif » n'est qu'un fondu d'opacité :
   **le média ne bouge pas.**

Le travail n'est donc pas d'inventer une loi. Il est de **promouvoir celle qui existe**,
de la rendre indépendante de la story, et d'y faire monter les autres surfaces.

Côté web, il n'y a rien à défaire : `apps/web-v2` n'a **aucune** visionneuse, et son
`attachment-blocks.tsx` le déclare (« HORS TRANCHE … la vidéo, la visionneuse plein
écran »). Elle naîtra conforme.

## 2. La loi

### 2.1 Le cadrage — les couloirs d'abord, le cadre ensuite

Le média se pose dans un **cadre arrondi centré**. Autour de lui, le **plateau** :
deux couloirs qui portent tout ce qui n'est pas le média.

```
safe area                         59 pt
couloir haut   ✕ · ⋯              56 pt
LE CADRE       média + overlay    ce qui reste
couloir bas    rail des médias    84 pt
safe area                         34 pt
```

**Les couloirs sont réservés d'abord ; le cadre prend ce qui reste.** L'équilibre ne
dépend donc pas du ratio : une vidéo 16:9 et une scène 9:16 gardent exactement les mêmes
couloirs, seul le cadre change de taille entre eux. Le cadre est ensuite **ajusté à son
ratio puis centré** dans la zone libre — jamais rogné, jamais étiré.

**Le cadre ne descend jamais sous 330 pt.** Le chiffre se DÉRIVE, il ne se choisit pas :
l'overlay (transport + légende + auteur + actions) mesure ~110 pt, et la règle est qu'il
ne couvre jamais plus du **tiers** du cadre — d'où 3 × 110. Si l'overlay change de
hauteur, le plancher suit ; il n'y a pas deux constantes à tenir d'accord.

**Le hors-champ est habillé, jamais noir**, et la règle est décidable : le **ThumbHash**
du média quand il en porte un, **le noir** sinon (première image non encore décodée, ou
média sans hash). Jamais de couleur inventée, jamais un fond par défaut — c'est la loi 11
(« personne ne lit du vide ») appliquée à une bande. Le mécanisme existe :
`StoryLetterboxFill` (§ 3.3).

> **Le plein écran fabrique son propre hors-champ.** Une image 4:5 remplit son cadre à
> 366 pt de large et flotte dans 356 pt de vide une fois l'écran pris. Conditionner le
> fond au letterbox du seul état cadré, c'est garantir du noir dans l'autre — défaut
> trouvé en regardant la maquette, pas en la raisonnant.

### 2.2 Ce qui se pose sur le cadre, ce qui reste au plateau

| sur le CADRE (part avec lui) | dans les COULOIRS (reste au plateau) |
|---|---|
| la légende | ✕ (fermer), couloir haut à gauche |
| l'auteur + la date d'envoi | ⋯ (menu vertical), couloir haut à droite |
| réagir · répondre · composer | le rail des autres médias, couloir bas |
| le transport vidéo | |

**Le compteur « n / N » disparaît du centre haut** (directive porteur) : le rail du
couloir bas dit déjà où l'on est dans la série, et il le dit mieux — il le montre.

### 2.3 Les gestes

| geste | effet |
|---|---|
| **tap** | entre en plein cadre ; **tap** à nouveau, en sort |
| **appui long** | entre en plein cadre **et met en pause** |
| **glissement vers le haut** | entre en plein cadre **sans interrompre** la lecture |

Une seule exception, portée par la SURFACE et non par le geste : dans le **lecteur de
stories**, le tap navigue déjà d'une story à l'autre — il n'y entre donc pas. On y entre
par l'appui long ou le glissement, et le tap en sort (il n'a plus rien à naviguer une
fois le chrome parti).

> L'exception se paie une fois et se justifie à voix haute : toucher les tiers gauche et
> droit d'une story est le geste le plus fréquent du produit. Le lui reprendre coûterait
> plus cher que de nommer une surface à part.

**Deux portes d'entrée qui ne disent pas la même chose** — c'est le vrai gain : on
s'arrête sur ce qu'on veut regarder (appui long), on se laisse porter par ce qu'on veut
continuer d'écouter (glissement). Le tap reste le geste sans intention.

### 2.4 Contenu contre chrome

En plein cadre, **le chrome s'efface**. Mais la transcription d'un vocal et son
sélecteur de langue **restent** : ce sont du CONTENU, pas du chrome. Le plein cadre ne
les révèle pas — il les **agrandit**.

> Sans cette distinction, la règle générale produirait un non-sens : effacer la
> transcription rendrait le plein écran d'un vocal **plus pauvre** que son cadre. La
> lisibilité du texte est une exigence des deux états, pas seulement du grand.

### 2.5 La marque — elle suit l'œuvre, jamais le média transmis

Seules la **story enregistrée ou exportée** et les **scènes de post et de réel** portent
la marque Meeshy. L'image, la vidéo et le vocal d'une conversation s'enregistrent **nus**.

Conséquence heureuse : il n'y a **pas** d'entrée « Enregistrer sans la marque » à offrir.
Le menu ⋯ garde deux verbes — *Enregistrer*, *Partager hors de Meeshy* — et dit sous eux
ce que l'enregistrement fera. Un contrôle de moins à expliquer, et la loi 4 respectée
(un contrôle sans effet là où rien n'est marqué serait un contrôle inerte).

**Ce que ça engage.** `MeeshyMediaSaveBranding.stamps(_ kind:)` décide aujourd'hui par le
**type du fichier** (`image · video · audio`) et son doc-comment porte la règle inverse
de la nouvelle (« LA règle : un média qui quitte Meeshy porte sa marque »). Il devra
décider par l'**ORIGINE** — composé ou transmis. **Le prédicat change de nature**, pas de
paramètre : c'est là que le travail se trouve, et le doc-comment doit dire quelle
directive supplante laquelle, à quelle date.

## 3. L'architecture

### 3.1 Un solveur de cadrage, pur, partagé

`StoryCanvasFraming` (`packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasFraming.swift`,
173 l.) est **le seul solveur de cadrage pur du dépôt** : `nonisolated`, sans SwiftUI,
testable hors main-actor, et il porte déjà l'essentiel — `Presentation { free, carded,
immersive }`, un `Input` avec `viewport / headerInset / bottomInset / sideInset /
canvasRatio`, et un `resolve` qui ajuste-puis-centre sans jamais agrandir.

Il lui manque **une seule chose** pour servir la loi : le cadre et le média y sont le
même objet. La hauteur plancher (§ 2.1) les sépare — un cadre de 330 pt peut porter un
média de 206 pt. Le solveur doit donc rendre **deux cotes, pas une**.

Création : **`MediaStageFraming`** dans `MeeshySDK` (core, pas `MeeshyUI` — voir § 3.4),
qui rend pour chaque état :

```
frame  : la taille du cadre arrondi (rayon compris)
media  : la taille du média dans ce cadre
bands  : ce que le média laisse voir du cadre — délégué à StoryLetterboxFill.Bands
```

`StoryCanvasFraming.resolve` en devient une **projection** dans le même lot. Il n'y a pas
deux lois : il y en a une, et l'ancienne API reste pour ne pas toucher aux appelants de
la story. Les tests existants de la story sont le témoin que la projection ne change rien.

> **Si la projection change le rendu de la story, elle devient sa propre issue** et le
> lot s'arrête là. On ne fait pas passer un changement de comportement du lecteur de
> stories sous couvert d'une refactorisation.

### 3.2 Un état d'immersion, un seul

Les cinq booléens divergents (§ 1) se remplacent par un type partagé portant **la raison
de l'entrée**, puisque les deux portes ne disent pas la même chose :

```
enum StagePresentation { case carded, full(pausedOnEntry: Bool) }
```

`pausedOnEntry` n'est pas décoratif : c'est ce qui distingue l'appui long du glissement,
et ce que la pastille « en pause » rend visible à l'utilisateur.

### 3.3 Le hors-champ — rien à inventer

`StoryLetterboxFill` (`packages/MeeshySDK/Sources/MeeshySDK/Story/StoryLetterboxFill.swift`,
154 l.) fait déjà exactement ce que la loi demande : il mesure les bandes qu'un média
ajusté laisse, et les remplit avec le **ThumbHash** du média — « quelques dizaines
d'octets, décodé en moins d'une milliseconde, il voyage déjà avec le média sur les trois
plateformes ».

Une seule extension est nécessaire : sa source actuelle,
`StoryLetterboxFill.candidateHashes(effects:)`, prend des `StoryEffects`. Une pièce
jointe de conversation n'en a pas. Il lui faut un chemin `source(thumbHash:)` — **une
surcharge, pas une réécriture**, et surtout pas une seconde table de règles.

### 3.4 Placement (règle de pureté du SDK)

`MediaStageFraming` est un **moteur de règles sans état** : paramètres opaques, aucune
lecture de singleton Meeshy, aucune décision « quand faire X ». Le tableau de placement
du `packages/MeeshySDK/CLAUDE.md` le range donc au **SDK core**.

Et dans `MeeshySDK`, pas `MeeshyUI`, pour la raison que `StoryLetterboxFill` documente
déjà : `MeeshyUI` compile sous `defaultIsolation: MainActor`, donc la conformance
`Equatable` d'un type qui y naît est isolée au `MainActor` et une suite non isolée ne
peut plus comparer ses valeurs.

L'**orchestration** — quelle surface entre en plein cadre, quand, avec quelle pause —
reste **app-side**.

## 4. Le découpage

Le porteur a arbitré : **la loi d'abord, prouvée sur la galerie**, puis une issue par
surface.

| lot | contenu | pourquoi cet ordre |
|---|---|---|
| **1** | `MediaStageFraming` + `StagePresentation` + la galerie média (**image et vidéo**) | la galerie est le point d'entrée de quatre surfaces (conversation, post, commentaire, réel) et n'est pas hors budget |
| 2 | Vocal plein écran — transcription et langues dans les deux états | `AudioFullscreenView` est à 1 260 l., **hors budget** : découpage préalable (déjà suivi par #4963) |
| 3 | Scène de post et de réel (`SocialSceneFullscreenView`, 460 l.) | la seule surface sans aucun état d'immersion, et la plus petite — bon banc d'essai |
| 4 | Lecteur vidéo SDK — l'auto-hide 4 s et le pinch fit↔fill à trancher ou à assumer | |
| 5 | Retrait du doublon legacy `ImageFullscreen` au profit de la galerie | deux défauts connus : tap inopérant sur l'image, pinch non cumulatif |
| 6 | Lecteur de stories — convergence de `StoryCanvasFraming` | **2 334 l., hors budget** ; c'est aussi la surface la plus risquée |
| 7 | `apps/web-v2` — création de la visionneuse | rien à défaire ; sert aussi Android par la coque Capacitor |

**Correction d'une imprécision de la question posée au porteur** : l'option retenue
annonçait « image, vidéo, **scène** du fil et du feed » pour le lot 1. C'est faux — la
galerie ne pagine que des images et des vidéos ; les scènes vivent dans
`SocialSceneFullscreenView`. Le lot 1 est donc **image et vidéo**, et la scène est le
lot 3. L'erreur est de moi, elle est corrigée ici plutôt que reportée dans le code.

### Ce que le lot 1 ne fait PAS

- Il ne touche pas au lecteur de stories, ni au lecteur de réels, ni à l'audio.
- Il ne découpe aucun fichier hors budget (aucun n'est dans son périmètre).
- Il ne change pas la règle de la marque — c'est un lot distinct, parce que son prédicat
  est un sujet de sécurité produit et non de géographie (§ 5).

## 5. Les issues

Cinq pour le lot 1, plus une qui n'y appartient pas et qu'il ne faut pas y glisser.

| # | lot | titre sémantique | critère de fin |
|---|---|---|---|
| a | 1 | Un média de conversation se lit dans un cadre arrondi, et le plateau porte ses contrôles | la galerie rend le cadre, les deux couloirs, le rail en bas ; témoin de cotes sur les trois ratios |
| b | 1 | Le plein écran s'ouvre au tap, à l'appui long et au glissement — et la pause se voit | les trois portes testées ; `pausedOnEntry` distingué ; la pastille rendue |
| c | 1 | Le hors-champ d'un média est habillé par son ThumbHash, dans les deux états | `StoryLetterboxFill.source(thumbHash:)` ; témoin sur l'état PLEIN, pas seulement cadré |
| d | 1 | Le compteur « n / N » quitte le haut de la galerie, le rail le remplace | le rail dit la position ; aucun compteur au centre |
| e | 1 | Le menu ⋯ remplace le bouton d'enregistrement direct | deux verbes, et ce qu'ils font dit sous eux |
| f | **hors lot 1** | La marque suit l'œuvre composée, jamais le média transmis | `stamps` décide par l'ORIGINE ; doc-comment daté disant quelle directive supplante laquelle |

**Pourquoi (f) est dehors.** Elle change ce qui sort de l'appareil de l'utilisateur, sur
les trois familles de médias, et son prédicat traverse `MediaSaveBranding`,
`MeeshyImageWatermark`, `MeeshyVideoWatermarkBaker` et `MeeshyAudioSignature` — quatre
sites, dont trois portent des gardes. La mêler à une refonte de géographie ferait qu'un
rouge de cadrage et un rouge de filigrane arriveraient dans le même lot, et qu'on ne
saurait plus lequel a bougé. Elle est livrée dans le même milestone, par son propre
commit.

## 6. Les témoins (TDD)

Chaque ligne s'écrit ROUGE d'abord.

**Ce qui est décidable hors écran** (fonctions pures, suite `MeeshySDKTests`) :

- les quatre cotes du solveur, sur les trois ratios (4:5, 16:9, 9:16) et sur les deux
  états — **et le témoin du plancher s'écrit sur le 16:9**, seul ratio où il mord ;
- **le témoin du hors-champ s'écrit sur l'état PLEIN**, pas sur le cadré : c'est là que
  le défaut vivait, et un témoin écrit sur l'état cadré serait vert des deux côtés ;
- `StagePresentation` : `pausedOnEntry` vrai à l'appui long, faux au glissement.

**Ce qui demande l'écran** (`MeeshyTests`, simulateur `iPhone 16 Pro` / iOS 18.2) :

- le tap bascule dans les deux sens ; l'appui long met en pause ; le glissement non ;
- aucun contrôle du couloir n'est atteignable en plein cadre (`allowsHitTesting`) ;
- le rail reste visible et pilotable en état cadré.

> **Un témoin de geste s'écrit sur l'effet, jamais sur l'état interne.** La question
> n'est pas « `showControls` est-il faux ? » mais « le bouton répond-il encore ? ».
> C'est la loi 4 de la planche appliquée à un test.

## 7. Maturité visée (les treize dimensions)

**Visées par le lot 1** : fluidité (4) — la croissance du cadre est continue, aucune
bascule de `position` pendant l'animation ; cohérence de positionnement (6) — même geste,
même effet, sur toutes les surfaces du lot ; UX (8) — le hors-champ est habillé, la pause
est visible ; maintenabilité (11) — un solveur au lieu de cinq états ; simplicité (12) —
la complexité du cadrage est payée dans le code, l'utilisateur ne règle rien.

**Non visées, donc à ouvrir en issues à la clôture** : accessibilité (5) — VoiceOver sur
un geste à trois portes demande son propre travail ; performance (2) — aucune mesure p95
n'est prévue ici ; compatibilité (9) — iPad et RTL ne sont pas au périmètre.

## 8. Pilotage

Milestone **#93** — « Un média se lit dans un cadre, et le plein écran s'ouvre au geste »,
échéance 2026-09-19.

| issue | lot | sujet |
|---|---|---|
| **#6141** | 1 | le cadre arrondi et le plateau |
| **#6142** | 1 | les trois portes du plein écran, et la pause visible |
| **#6143** | 1 | le hors-champ habillé par le ThumbHash |
| **#6144** | 1 | le compteur « n / N » cède la place au rail |
| **#6145** | 1 | le menu ⋯ remplace le bouton d'enregistrement |
| **#6146** | hors lot 1 | la marque suit l'œuvre composée |

Les lots 2 à 7 (§ 4) n'ont pas encore d'issue : ils s'ouvriront à la clôture du lot 1,
pour que leur périmètre soit écrit sur ce que le lot 1 aura réellement produit plutôt que
sur ce qu'il prévoyait.

## 9. Références

- Maquette de validation, interactive, trois révisions :
  **`docs/product/planche-meeshy-lecture.html`**. C'est le FICHIER qui fait foi — un
  rendu publié en artifact est éphémère et aucune référence de gouvernance n'en dépend.
- Sémantique de la lecture : `docs/product/meeshy-reader-modele.md` — le moteur partagé
  est **le player**, « lecteur » désigne l'état « en lecture, pas en composition ».
- Les douze lois : `docs/product/planche-meeshy-composer.html`. Contraignent ici la
  **4** (un contrôle existe si l'action a un effet), la **6** (le player EST l'aperçu) et
  la **8** (un seul temps — l'entrée en plein cadre REPREND, ne rembobine jamais).
- Issues voisines à relier, pas à absorber : **#5024** (le plein écran du fil coûte deux
  navigations, et la galerie n'ouvre pas la même surimpression — sans milestone),
  **#4927** (un réel à plusieurs médias, la quatrième surface que la galerie n'atteint
  pas), **#4963** (l'audio plein écran repasse sous le plafond).
