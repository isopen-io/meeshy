# iOS UI/UX — Iteration 221i

**Date** : 2026-07-26
**Surfaces** :
- `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift`
- `apps/ios/Meeshy/Features/Main/Views/RootViewComponents.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift`

**Axes** : Dynamic Type / accessibilité · Cohérence de présentation · HIG (feuilles à détentes)
**Base** : `main` HEAD `033ce7d`

## Note de renumérotation — collision d'essaim assumée

Cette itération a d'abord été ouverte sous le numéro **220i** sur la base
`ffef133`, à un moment où `list_pull_requests` (open) retournait **0 PR** et où
219i était le plus haut mergé. Pendant que la CI iOS attendait un runner macOS
(~48 min de file), un autre agent de l'essaim a livré `fdc6b42`
*« le dernier NavigationView passe à NavigationStack (220i) »*, qui traite **le
même fichier et le même défaut A** que cette itération, ainsi que `478e298`
(`ReportMessageSheet`, également numéroté 220i).

Constat honnête : **le défaut A de cette itération est désormais livré par
`main`, indépendamment.** Le numéro 220i est pris (deux fois). Cette itération
est donc renumérotée **221i** et son périmètre réduit à ce que `main` n'a
**pas** corrigé — vérifié fichier par fichier :

| Défaut | État dans `main` (`033ce7d`) | Statut ici |
|---|---|---|
| **A** — `NavigationView` → `NavigationStack` | ✅ livré par `fdc6b42` | **abandonné** (le merge prend la version de `main`) |
| **B** — pas de conteneur défilant, `Spacer()` mort, clavier couvrant | ❌ `Spacer()` toujours l.76, aucun `ScrollView` vertical | **livré ici** |
| **C** — détentes `[.medium]` seul, indicateur absent sur 2 sites /3 | ❌ les 3 sites toujours `[.medium]`, 2 sans indicateur | **livré ici** |

Le test `NavigationContainerMigrationTests` a également été livré des deux
côtés. Le conflit de merge a été résolu **en faveur de `main`**
(`test_statusComposerView_usesNavigationStack`), pour ne pas laisser deux tests
jumeaux ; l'attendu à l'ensemble vide y est identique.

## Défaut B — À grande taille de texte, le champ est hors d'atteinte

Le contenu du composeur était un `VStack` **nu** dans un `ZStack`. Aucun
conteneur de défilement. Or les deux moitiés de cet écran ne réagissent pas de
la même façon à Dynamic Type :

- la grille d'emojis est figée — `GridItem` × 5, cellules `.frame(width: 56, height: 56)` ;
- **tout le reste** passe par `MeeshyFont.relative(…)`, qui mappe vers un
  `Font.TextStyle` et scale donc jusqu'aux tailles d'accessibilité incluses.

Hauteur du contenu (iPhone 16 Pro, détente `.medium` ≈ 437 pt, barre de
navigation ≈ 44 pt → ~393 pt utiles) :

| Bloc | Taille par défaut | Tailles AX |
|---|---|---|
| Question « Comment tu te sens ? » (`.callout`) | ~21 pt | ~50 pt |
| Grille 2 × 56 + espacement (figée) | 128 pt | 128 pt |
| Capsules d'audience (`.caption`) | ~30 pt | ~48 pt |
| Champ texte (`.subheadline` + 2 × 12 pt) | ~44 pt | ~71 pt |
| Espacements `xxl` × 3 + padding `xl` × 2 | 112 pt | 112 pt |
| **Total (hors barre)** | **~335 pt** | **~409 pt** |

Le `VStack` se terminait par un `Spacer()`, qui absorbait les ~58 pt de mou au
départ. Une fois ce mou consommé, **il n'y a plus rien pour absorber** : le
`VStack` déborde de la feuille, et comme le jeu de détentes était `[.medium]`
**seul**, la feuille ne pouvait pas grandir non plus. Le champ de saisie et le
compteur de caractères passaient sous le pli, **sans geste permettant de les
atteindre** : ni scroll (pas de conteneur), ni redimensionnement (pas de
`.large`).

**Correctif, en deux moitiés indissociables** :

1. **Côté composeur** — le `VStack` entre dans un `ScrollView`. Le `Spacer()`
   final est retiré : sous une proposition de hauteur illimitée il résout à
   zéro, et un `ScrollView` vertical aligne déjà en haut un contenu plus court
   que la feuille. **Le rendu aux tailles par défaut est donc inchangé.**
2. **Côté présentation** — les trois sites passent à `[.medium, .large]`. C'est
   la convention dominante du dépôt (24 occurrences contre 6 pour `[.medium]`
   seul) et c'est ce qui donne au geste de scroll quelque part où aller : sur
   une feuille à détentes, un glissement vers le bas depuis le haut d'un
   `ScrollView` agrandit la feuille — comportement natif que `[.medium]` seul
   rendait impossible.

S'y ajoute `.scrollDismissesKeyboard(.interactively)` : le champ de saisie est
le **dernier** élément d'une feuille `.medium`, donc le clavier en recouvre
l'essentiel. Le motif est déjà celui du dépôt (`OnboardingStepViews` × 5,
`GlobalSearchView`, `ConversationListView`).

### Note de vérification — la grille reste paresseuse mais complète

Passer un `LazyVGrid` dans un `ScrollView` le rend réellement paresseux (hors
conteneur défilant, il instancie tout avidement). `StatusViewModel.moodOptions`
compte **10** entrées sur 5 colonnes = 2 rangées, toutes visibles : aucun
changement de comportement. De même, le `VStack` reste non-paresseux, donc le
`.onAppear` de `visibilityPicker` (qui restaure `lastVisibility`) continue de
se déclencher immédiatement — un `LazyVStack` l'aurait différé.

## Défaut C — Trois entrées, trois présentations différentes

Le même composeur était présenté de trois façons :

| Site | Détentes | Indicateur de glissement |
|---|---|---|
| `RootViewComponents` | `[.medium]` | ✅ |
| `ConversationListView` (republication) | `[.medium]` | ❌ |
| `ConversationListView` (composer nu) | `[.medium]` | ❌ |

Deux utilisateurs sur trois n'avaient **aucune affordance visible** indiquant
que la feuille est redimensionnable. Les trois sites convergent désormais sur
`[.medium, .large]` + `.presentationDragIndicator(.visible)` — contrat unique,
quel que soit le point d'entrée.

## Tests

### `StatusComposerSheetPresentationTests` (neuve, 6 tests)

Les propriétés B et C ne sont pas exprimables depuis le composeur seul — les
détentes vivent chez l'appelant. La suite balaie les sources :

| Test | Vérifie |
|---|---|
| `test_composer_hostsContentInAScrollView` | le conteneur de défilement existe |
| `test_composer_dismissesKeyboardOnScroll` | `.scrollDismissesKeyboard(.interactively)` |
| `test_composer_containsNoDeadSpacer` | aucun `Spacer()` (résoudrait à zéro) |
| `test_allThreeEntryPointsAreDiscovered` | le balayage voit bien **3** sites (garde le look-ahead lui-même) |
| `test_everyPresentationOffersTheLargeDetent` | chaque site offre `.medium` **et** `.large` |
| `test_everyPresentationShowsTheDragIndicator` | chaque site affiche l'indicateur |

Un helper `code(_:)` retire les commentaires `//` avant toute assertion — sans
lui, `test_composer_containsNoDeadSpacer` aurait été **mis en échec par le
commentaire de production qui nomme `Spacer()`**. Le piège s'est effectivement
déclenché à la première simulation et a été corrigé ; les assertions portent
désormais sur du code, jamais sur de la prose.

## Deux réparations de branche de base (hors périmètre, mais bloquantes)

`main` était rouge des deux côtés de cette itération. Les deux échecs tuaient
**toute** PR iOS, celle-ci comprise ; ils sont réparés ici faute de pouvoir
avancer autrement, et signalés comme tels dans le fil de la PR.

### 1. `StoryRepostFlowTests` ne compilait plus

`d94500a` (« l'audience choisie au repost décide enfin de qui verra le post ») a
fait traverser `visibility` aux quatre couches du repost et mis à jour la
production (`StoryViewerView:771`), le protocole, le service concret et le mock
du SDK — **mais pas le bundle de tests de l'app**. Trois erreurs de compilation,
et comme elles tuent la compilation de `MeeshyTests` en entier, **aucun test iOS
ne pouvait s'exécuter**.

Les trois sites reproduisent désormais la production à l'identique plutôt que de
passer `nil` pour faire taire le compilateur :

| Site | Production | Test |
|---|---|---|
| Kebab « Republier en post » | `repostAsPostDirect()` ne passe pas `visibility` → défaut `nil` | `visibility: nil` |
| Composer « Éditer et republier » | `onPublishRepost: { …, visibility in … visibility: visibility }` | capture les 3 args, forwarde |

`MockPostService` gagne `lastRepostVisibility` : il **acceptait** le paramètre
depuis `d94500a` mais le jetait sans le stocker, alors que ses quatre autres
arguments sont tous tracés — le mock ne pouvait donc pas observer le champ que
ce correctif avait précisément pour but d'acheminer.

### 2. `StoryVideoExportServiceTests` mesurait l'ancienne carte de fin

`16f8197` (« carte de fin d'auteur en 2 temps ») a transformé le clip de
fermeture en `logoPhase` (1,5 s, muet, qui termine la vidéo) + `identityPhase`
(2 s, qui porte le jingle) quand une identité est résolue. Il a mis à jour
`StoryExportOutroTests` (SDK) mais pas `StoryVideoExportServiceTests` (app).

`test_prepareExport_withIntro_carriesBothInterludeAndOutro` passe `intro:` non
nil — donc la variante **auteur** — mais additionnait `outroTail`, la queue de
la carte **logo-seule**. Arithmétique :

| Cas | Clip | Chevauchement | Queue nette |
|---|---|---|---|
| logo seul (`content == nil`) | `duration` = 2,0 s | 1,5 s | **0,5 s** (`outroTail`) |
| auteur (`content != nil`) | `logoPhase + identityPhase` = 3,5 s | 1,5 s | **2,0 s** |

Écart 2,0 − 0,5 = **1,5 s** = exactement `logoPhase`, et exactement l'écart
mesuré par la CI (5,2 s observés contre 3,7 s attendus). Le test gagne une
constante distincte, locale parce que `logoPhase` et `authorClipDuration` sont
**internes** à `MeeshyUI` : seuls `StoryExportOutro.duration` et
`StoryExportIntro.duration` sont publics — c'est déjà la raison d'être de
`outroTail`.

> **Superseded — 2ᵉ collision d'essaim.** `576817a` *(« expect the author
> end-card's two-phase tail in the export duration »)* a été mergé dans `main`
> pendant l'exécution de la CI iOS de cette PR, avec **la même valeur (2,0 s)**
> sous un autre nom (`outroAuthorTail`). Le conflit est résolu **en faveur de
> `main`** : leur dérivation est même plus directe que la mienne — `overlap`
> vaut *exactement* `logoPhase`, donc la phase logo se superpose entièrement au
> crossfade et **seule `identityPhase` (2 s) rallonge la vidéo**. Ma réparation
> n° 2 ne subsiste donc pas dans le diff final ; elle est conservée dans ce
> document parce que le raisonnement a servi à valider le nombre de façon
> indépendante, et parce que la CI a bien tourné dessus (verte).

## Vérification

- Pas de toolchain Swift (Linux) → les assertions de la suite neuve rejouées à
  l'identique hors Xcode (strip de commentaires, balayage d'arbre, look-ahead
  borné) : **conformes**, les 3 sites trouvés exposent tous `[.medium, .large])`
  + l'indicateur.
- Le premier passage avait **échoué** sur `containsNoDeadSpacer` (faux positif
  via commentaire) — mesure conservée parce qu'elle prouve que la simulation
  discrimine.
- Équilibre accolades / parenthèses / crochets au tokenizer : **0 / 0 / 0**.
- Arithmétique de la carte de fin recalculée depuis les constantes source et
  recoupée avec les deux nombres de la CI (5,2 / 3,7) : cohérente aux deux bouts.
- Conflit de merge sur `NavigationContainerMigrationTests` résolu en faveur de
  `main` — 0 test jumeau.
- La CI a **confirmé** la 1ʳᵉ réparation : le bundle compile désormais et
  **4550 tests passent**, 2 skippés, 1 seul échec — celui de la carte de fin,
  traité ci-dessus.

Gate réel = CI `iOS Tests`.

## Bilan

**3 fichiers de production : +18 / −4 lignes.** Le composeur devient défilable,
donc son champ de saisie reste atteignable à toute taille de Dynamic Type ; ses
trois points d'entrée partagent enfin un contrat de présentation unique.
**0 clé i18n neuve, 0 logique métier, 0 réseau, 0 changement visuel aux tailles
par défaut.** 1 suite neuve (6 tests).

Sur les 2 réparations de branche de base embarquées, **seule la n° 1
(`StoryRepostFlowTests`) subsiste dans le diff final** — la n° 2 a été livrée en
parallèle par `576817a` et le conflit a été résolu en faveur de `main`. Les deux
ont néanmoins débloqué la CI iOS le temps de leur existence : sans la n° 1, le
bundle `MeeshyTests` ne compilait pas du tout.

## Piste 222i+

1. **Détentes mono-`.medium` restantes** (`LinksHubView`, `AffiliateView`,
   `EffectsPickerView`) : appliquer le même examen qu'ici — offrir `.large`
   **uniquement** si le contenu peut effectivement déborder à grande taille de
   texte (ne pas généraliser mécaniquement).
2. **`UnifiedPostComposer` (`MeeshyUI/Story/`) utilise encore `NavigationView`.**
   `NavigationContainerMigrationTests` ne balaie que les cibles de l'app
   (`Meeshy`, `MeeshyShareExtension`, `MeeshyNotificationExtension`), donc le SDK
   échappe au cliquet — et ce composeur est présenté en feuille, exactement le
   cas iPad que la migration visait. Étendre le balayage au SDK, ou migrer.
3. **Balayage Dark Mode généralisé** (hérité de 219i) : couleur de marque claire
   posée sans lecture du `colorScheme`. Pièges : beaucoup de
   `MeeshyColors.indigoNNN` sont posés sur des fonds déjà thématisés et sont
   corrects ; toute surface descendant de `StoryViewerView` doit se brancher sur
   `colorScheme`, **jamais** sur `ThemeManager.mode`.
4. **`StoryViewerView+Content.shareStory()`** — code mort (0 caller), hérité 219i.
