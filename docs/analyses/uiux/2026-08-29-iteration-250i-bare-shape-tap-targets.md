# Iteration-250i — quand la cible tactile EST le dessin

**Date** : 2026-08-29 · **Piste** : iOS (suffixe `i`)
**Surfaces** : barre d'étapes de l'inscription, bande de couleurs du composeur
(scène et document)
**Base** : `main` HEAD `ce9ebfc6` · **Branche** : `claude/intelligent-noether-6zxsbz`
**Précédent direct** : 249i (`LanguageFlagChip`, huit copies d'une puce → une)

---

## 1. La question posée

249i a fermé une famille en demandant « quel CONTRÔLE le dépôt recopie-t-il ? ».
Elle a laissé une observation en suivi : `InteractiveProgressBar` était *« la
seule cible sub-44 connue qui ne soit pas une décision documentée »*. Cette
itération part de là, mais **ne s'arrête pas au site connu** — elle cherche
d'abord ce qui, dans le dépôt, produit ce défaut.

La réponse est une FORME, pas un écran :

> **Quand le label d'un `Button` commence par une forme nue — `Circle`,
> `RoundedRectangle`, `Capsule` — la zone sensible du bouton est exactement le
> cadre de cette forme.** Rien ne l'élargit : pas de texte qui pousse, pas de
> `Label` qui impose sa hauteur de ligne, pas de `padding` qu'un glyphe
> hériterait. **Le dessin devient la cible** — et un dessin décoratif est
> presque toujours plus petit que les 44 pt de la HIG.

Un balayage sur cette forme exacte rend **trois** sites, et les trois se
ressemblaient si peu qu'aucune revue ne les avait rapprochés.

---

## 2. La mesure

| site | dessin | cible réelle | surface |
|---|---|---|---|
| `InteractiveProgressBar` ×8 (inscription) | trait de 5 à 8 pt | ~41 × 5 pt | **205 pt²** |
| `ComposerSceneBand.palette` ×17 | disque de 28 pt | 28 × 28 pt | 784 pt² |
| `ComposerDocumentSurface.backgroundStrip` ×17 | disque de 28 pt | 28 × 28 pt | 784 pt² |

Le minimum HIG est **1936 pt²**. La barre d'étapes en servait **un dixième**, et
c'est le seul chemin qui permette de revenir directement à une étape déjà
remplie — l'alternative est « Retour », une étape à la fois.

### 2.1 Un espace qui AÈRE n'est pas un espace qui RÉPOND

Les deux palettes portaient bien 8 pt de marge verticale. **Mais posée sur le
`HStack` PARENT, donc hors du bouton.** La bande mesurait déjà 44 pt de haut —
8 + 28 + 8 — et n'en écoutait que 28. Les seize points de marge étaient de
l'espace perdu au sens propre : posés là pour aérer, ils ne servaient rien
d'autre.

C'est le trait commun de la famille, et il explique pourquoi elle a survécu aux
revues : **la rangée avait la bonne hauteur.** Une capture d'écran, un
Accessibility Inspector posé sur le conteneur, une mesure au doigt sur le
simulateur — tous les trois montrent 44 pt. Seul le bouton, lu ligne à ligne,
dit qu'il n'en écoute que 28.

> C'est la forme, côté géométrie, du défaut de 249i : là, un modificateur
> DÉCLARAIT une cible sans la faire respecter ; ici, une MARGE la suggère sans
> la donner. **La question à poser à une cible tactile n'est pas « la rangée
> est-elle assez haute ? » mais « qui, dans cette rangée, RÉPOND ? »**

### 2.2 Dix-sept boutons qui portaient tous le même nom

Chaque pastille s'annonçait « Arrière-plan » — le nom du GROUPE, répété
dix-sept fois, sans rien qui distingue une couleur de la suivante. Le conteneur
portait déjà ce nom (`accessibilityElement(children: .contain)` +
`accessibilityLabel`), donc VoiceOver disait « Arrière-plan » puis
« Arrière-plan, bouton », dix-sept fois.

### 2.3 Un doc-comment qui déclarait un partage au-dessus d'un copier-coller

`ComposerSceneBand.palette` était surmontée de ceci :

> *« Le libellé VoiceOver est celui de la bande du document
> (`ComposerDocumentCopy.background`), et pas une clé neuve : **c'est le même
> contrôle, servi à deux endroits.** »*

La phrase est juste, et le partage qu'elle décrit est réel — **au niveau de la
CLÉ**. La VUE, elle, était recopiée à l'identique dans `ComposerDocumentSurface`,
avec sa pastille de 28 pt, sa marge posée sur le parent et son libellé répété.

> **Un commentaire ne fait pas d'une copie une source unique** (leçon 248i,
> troisième occurrence en trois lots). Et la variante rencontrée ici est la plus
> trompeuse : le commentaire ne se trompe pas — il partage *quelque chose*. Il
> nomme le partage à un niveau (la clé) et laisse croire au niveau au-dessus
> (la vue).

---

## 3. Le correctif

### 3.1 `InteractiveProgressBar` — le modèle `UIPageControl`

La rangée fait 44 pt ; le trait garde ses 5 à 8 pt, centré. C'est exactement ce
qu'est un `UIPageControl` : des points de ~7 pt dans un contrôle haut de 44.
**La cible n'est pas le dessin.**

Le cadre et le `contentShape` vivent DANS le label — leçon 249i : un
agrandissement posé après le contrôle n'agrandit rien.

**Coût en hauteur : 12 pt, pas 36.** Les 8 + 16 pt de marge qui entouraient la
barre chez son hôte (`OnboardingFlowView`) sont retirés : ils sont désormais
DANS la cible, où ils servent à quelque chose. L'entête d'étape reste à ~18 pt
sous le trait, contre 16 avant.

**Ce qu'on ne fait pas** : élargir par un `padding` négatif. La barre est collée
au bouton « Retour » (8 pt au-dessus) ; une zone sensible débordante lui volerait
ses appuis — le pendant vertical du chevauchement que 249i a refusé
horizontalement.

### 3.2 `BackgroundColorPalette` — une bande, deux surfaces

Source unique app-side (`Features/Main/Components/`), servie par
`ComposerSceneBand` et `ComposerDocumentSurface`.

- **Cible 44 × 44**, dessin inchangé à 28 pt, `.padding(.vertical, 8)` du parent
  retiré : **la bande fait exactement la même hauteur qu'avant** (les seize
  points de marge sont devenus les seize points de cible).
- `contentShape(Rectangle())` et non `Circle` : la HIG mesure une AIRE de
  44 × 44, et l'espacement de 10 pt garantit qu'aucune cellule n'en chevauche
  une autre.
- **Nom POSITIONNEL** — « Couleur 3 sur 17 » — pour la raison exacte qui a fait
  choisir la position sur la barre d'étapes (242i) : une couleur n'a pas de nom
  court dans le dépôt, et la position est l'information que le lecteur cherche
  pour se repérer dans une bande. Le nom du groupe reste sur le conteneur.
- Les deux nombres passent par `LocalizedNumber.exact` avant injection (241i) :
  une interface arabe mêlerait sinon chiffres arabo-indiens et chiffres latins
  dans la même phrase.
- `ForEach(colors.indices)` plutôt que `id: \.self` sur la couleur : le nom
  accessible EST le rang, et deux teintes identiques rendraient une identité
  dupliquée.

Catalogue : **une clé neuve**, `a11y.color.position`, traduite dans les **sept**
locales (3406 → 3407 entrées).

### 3.3 La garde

`MeeshyTests/Unit/Guards/BareShapeTapTargetGuardTests.swift` ferme la FORME, pas
l'inventaire : **le label d'un bouton qui commence par une forme nue doit
déclarer sa zone sensible** — un cadre d'au moins 44 pt, un `maxWidth: .infinity`
qui remplit sa cellule, ou `meeshyTapTarget`.

Elle ne juge pas la VALEUR : deux assertions unitaires la fixent
(`InteractiveProgressBar.rowHeight == 44`, `BackgroundColorPalette.hitSide == 44`,
`swatchDiameter == 28` — « le dessin ne change pas, c'est la cible qui
grandit »). Ce partage est délibéré : une garde de forme qui lirait aussi les
valeurs se déclencherait sur le disque de 52 pt du bouton « lire » d'un aperçu
vidéo, qui est une cible parfaitement valide.

Plus une borne : le scanner reconnaît la forme qu'il interdit ET reconnaît le
correctif comme conforme — sans quoi il serait vert faute de voir.

---

## 4. Preuve

Aucune toolchain Swift ici. La garde neuve a été **répliquée fidèlement** et
exécutée sur `origin/main` et sur la branche ; les deux cliquets i18n ont été
rejoués, ainsi que les trois règles de 249i (qui doivent rester à zéro).

| mesure | `origin/main` | branche |
|---|---|---|
| boutons dont le dessin nu FAIT la cible | **3** | **0** |
| copies du soulignement de puce (249i) | 0 | **0** |
| clés de langue hors source unique (249i) | 0 | **0** |
| cibles posées après leur geste (249i) | 0 | **0** |
| clés de catalogue orphelines | 0 | **0** |
| backlog non traduit (plafond 1545) | 121 | **121** |
| entrées du catalogue | 3406 | **3407** |

Les trois assertions de `ComposerSceneActivationTests` qui lisent la source de
`ComposerDocumentSurface.swift` ont été vérifiées à la main avant commit :
`StoryBackgroundPalette.colors`, `onPickBackground?(` et `private var
backgroundStrip` survivent tous les trois à l'extraction — **c'est le premier
endroit où une extraction de vue casse une garde qui lit du texte**, et il fallait
le contrôler plutôt que l'espérer.

Équilibre des accolades vérifié sur les sept fichiers touchés.

**Gate réel = CI `iOS Tests`**, job `Build app + tests unitaires` (`run tests`
dans le sujet du commit — sans lui, le job s'appelle `Build app (…)` et ne prouve
que la compile).

### 4.1 Deux doutes assumés, à SOLDER au retour de CI

1. **`ForEach(colors.indices, id: \.self) { index in let hex = colors[index] … }`**
   — un `let` en tête d'un `ViewBuilder` ; la forme est courante mais elle
   n'existait pas dans les deux copies remplacées.
2. **`@MainActor` sur une SEULE méthode de `BareShapeTapTargetGuardTests`** (les
   deux statiques lues appartiennent à des `View`) pendant que la classe reste
   non isolée.

---

## 5. Ce qui change à l'écran

| surface | avant | après |
|---|---|---|
| barre d'étapes (inscription) | 8 pt de haut, cible 41 × 5 | rangée de 44 pt, cible 41 × 44 ; trait inchangé |
| entête d'étape | 16 pt sous le trait | ~18 pt sous le trait |
| hauteur totale de l'entête d'inscription | — | **+12 pt** |
| bande de couleurs (×2) | 44 pt de haut, cible 28 × 28 | 44 pt de haut, cible 44 × 44 — **hauteur identique** |
| VoiceOver, une pastille | « Arrière-plan » (×17) | « Couleur 3 sur 17 » |

---

## 6. Dimensions

| dimension | état |
|---|---|
| 5 · Accessibilité | mûre — trois sites portés au minimum HIG ; dix-sept boutons homonymes reçoivent un nom qui les distingue |
| 7 · Facilité d'usage | mûre — la surface tactile d'une étape passe de 205 à 1804 pt², celle d'une pastille de 784 à 1936 |
| 11 · Maintenabilité | mûre — 2 bandes → 1 composant, garde de forme posée |
| 9 · Compatibilité | mûre — clé neuve traduite dans les sept locales, nombres rendus dans le système de chiffres du lecteur |
| 13 · Complétude | **partielle** — la garde ne couvre que le label qui COMMENCE par une forme ; un label `ZStack { Circle(); Image() }` lui échappe (§ 7.1) |

---

## 7. Suites (251i+)

1. **La garde s'arrête au premier enfant du label.** Un bouton dont le label est
   un `ZStack { Circle().frame(28); Image(…) }` porte le même défaut et ne
   déclenche pas la règle : le premier enfant rendu est un `ZStack`, pas une
   forme. L'élargir demande de décider ce qu'est « un label dont la géométrie
   est décorative », ce qui n'est plus une question de forme — c'est une
   itération à part entière, pas une ligne à ajouter.
2. **Mesurer la rangée méta du fil en Dynamic Type XXL** (suivi 249i, inchangé).
3. **`FeedPostCard:1364`** — la paire de drapeaux de l'aperçu d'un commentaire,
   non interactive et non nommée (suivi 249i).
4. Carry-over 246i/247i/248i : (a) les deux tables d'étiquettes du SDK et
   `MessageAttachment.durationFormatted` (hors périmètre de piste) ; (b) classer
   le bucket « appelée seulement par un test » ; (c) recâbler `FeedView` sur
   `likePost`/`bookmarkPost` ; (d) `isProgrammaticScroll` ; (e) les 3 copies
   d'`isLoadingReactions` ; (f) `buildNativeMessageMenu`, découvrabilité du fil
   de réponses.
