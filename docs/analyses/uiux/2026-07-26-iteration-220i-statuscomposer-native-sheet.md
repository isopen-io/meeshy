# iOS UI/UX — Iteration 220i

**Date** : 2026-07-26
**Surfaces** :
- `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift`
- `apps/ios/Meeshy/Features/Main/Views/RootViewComponents.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift`

**Axes** : Intégration native / HIG · Dynamic Type · Cohérence de présentation
**Base** : `main` HEAD `ffef133`

## Sélection de la cible

La piste n° 4 laissée par 219i était : « `StatusComposerView` (`NavigationView` →
`NavigationStack`) dès #2275 résolue, puis réduire l'attendu de
`NavigationContainerMigrationTests` à l'ensemble vide ».

État de l'essaim au moment du choix : `list_pull_requests` (open) = **0 PR**.
#2275 est mergée (`131f793` dans `main`), comme #2319 (214i) et #2325 (216i).
La piste est donc débloquée et **sans collision possible**. Numéro **220i**
choisi strictement > 219i (`9e2e4c1`, plus haut mergé ; aucune PR iOS en vol).

`StatusComposerView` était le **dernier** fichier de production de tout l'arbre
iOS à déclarer un `NavigationView` — les trois autres (`EmojiPickerSheet`,
`VoiceProfileManageView`, `ShareViewController`) ont été migrés en 214i, et le
commentaire de `NavigationContainerMigrationTests:81` disait explicitement
pourquoi celui-ci avait été laissé : « held by an in-flight pull request ».

## Défaut A — Sur iPad, on ne peut pas publier son humeur

Le composeur d'humeur est présenté en `.sheet` depuis **trois** points d'entrée
(`RootViewComponents:742`, `ConversationListView:755` et `:771`), et son `body`
s'ouvrait sur `NavigationView { … }`.

`NavigationView` est déprécié depuis iOS 16, mais le vrai problème n'est pas la
dépréciation : **son style par défaut est `.columns` en classe de taille
regular**. Une feuille est présentée en *form sheet* sur iPad, c'est-à-dire dans
un environnement regular. Un `NavigationView` à enfant unique s'y rend donc en
split view dont la colonne de détail est vide.

Conséquences concrètes, sur le chemin nominal :

| Élément | iPhone (compact) | iPad (regular), avant |
|---|---|---|
| Grille d'emojis, sélecteur d'audience, champ texte | visibles | relégués dans la colonne sidebar |
| Colonne de détail | — | **vide** |
| `ToolbarItem(.navigationBarTrailing)` → **« Publier »** | visible | placé dans la barre de la colonne vide |
| `ToolbarItem(.navigationBarLeading)` → « Fermer » | visible | idem |

« Publier » est **la seule action primaire de l'écran**, et « Fermer » **le seul
chemin de sortie explicite**. Les deux atterrissaient dans une barre de
navigation appartenant à une colonne sans contenu. C'est exactement le mode de
défaillance que le commentaire d'en-tête de `NavigationContainerMigrationTests`
documente depuis 214i — il n'avait simplement jamais été appliqué ici.

**Correctif** : `NavigationView {` → `NavigationStack {`. Le plancher de
déploiement du projet est iOS 16.0 (`project.yml`), donc `NavigationStack` est
disponible **inconditionnellement** — pas de `@available`, pas de shim. Le
conteneur n'a qu'un enfant et n'empile rien : la substitution est sémantiquement
neutre en compact et répare le rendu en regular.

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
`VStack` déborde de la feuille, et comme le jeu de détentes était
`[.medium]` **seul**, la feuille ne pouvait pas grandir non plus. Le champ de
saisie et le compteur de caractères passaient sous le pli, **sans geste
permettant de les atteindre** : ni scroll (pas de conteneur), ni redimensionnement
(pas de `.large`).

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
| `RootViewComponents:742` | `[.medium]` | ✅ |
| `ConversationListView:755` (republication) | `[.medium]` | ❌ |
| `ConversationListView:771` | `[.medium]` | ❌ |

Deux utilisateurs sur trois n'avaient **aucune affordance visible** indiquant
que la feuille est redimensionnable. Les trois sites convergent désormais sur
`[.medium, .large]` + `.presentationDragIndicator(.visible)` — contrat unique,
quel que soit le point d'entrée.

## Tests

### `NavigationContainerMigrationTests` — le cliquet se referme

La suite existante épinglait l'ensemble des fichiers fautifs
(`["StatusComposerView.swift"]`) et son commentaire prescrivait la suite : « When
that lands, this expectation drops to the empty set ». C'est fait :

- ajout de `test_statusComposer_usesNavigationStack` (section « Migrated in 220i »),
  qui vérifie les deux sens — plus de `NavigationView {`, présence de `NavigationStack {` ;
- `test_noUnexpectedNavigationViewRemains` → `test_noNavigationViewRemains`,
  attendu réduit à `[]`. La suite cesse d'être un registre de dette pour devenir
  un **cliquet** : tout `NavigationView` réintroduit échoue immédiatement.

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

## Vérification

- Pas de toolchain Swift (Linux) → **15 assertions rejouées à l'identique** hors
  Xcode (réimplémentation indépendante du strip de commentaires, du balayage de
  l'arbre et du look-ahead borné) : **15/15 conformes**. Les 3 sites de
  présentation sont trouvés aux lignes attendues (`RootViewComponents:743`,
  `ConversationListView:756`, `:772`) et exposent tous `[.medium, .large])` +
  l'indicateur.
- Le premier passage a **échoué** sur `containsNoDeadSpacer` (faux positif via
  commentaire) — mesure conservée ici parce qu'elle prouve que la simulation
  discrimine réellement.
- Équilibre accolades / parenthèses / crochets des 5 fichiers au tokenizer
  (littéraux de chaîne et commentaires retirés, interpolation `\(via)` neutralisée) :
  **0 / 0 / 0**.
- Balayage de tout l'arbre iOS (`Meeshy`, `MeeshyShareExtension`,
  `MeeshyNotificationExtension`) : **plus aucun `NavigationView {`**.
- Ombrage Swift évité : `let code = try code(…)` (variable locale masquant la
  méthode dans son propre initialiseur) renommé en `let swift = try code(…)`.
- Fichier de test **neuf** → enregistré par `xcodegen generate` (globbing
  récursif sur `MeeshyTests`), **0 édition de `project.pbxproj`**. Nom de classe
  contenant « Status » et « Compose » → phase 2 de `meeshy.sh test`, conformément
  à `FINAL_PHASE_CLASS_PATTERN`.
- Collision essaim : `list_pull_requests` (open) = **0 PR**. Aucune.

Gate réel = CI `iOS Tests`.

## Bilan

**3 fichiers de production : +21 / −5 lignes.** Le dernier `NavigationView` de
l'app disparaît — la feuille cesse de se replier en split view vide sur iPad, ce
qui rendait « Publier » et « Fermer » inatteignables. Le composeur devient
défilable, donc son champ de saisie reste atteignable à toute taille de Dynamic
Type. Ses trois points d'entrée partagent enfin un contrat de présentation
unique. **0 clé i18n neuve, 0 logique métier, 0 réseau, 0 changement visuel aux
tailles par défaut.** 1 suite neuve (6 tests) + 1 suite existante resserrée à
l'ensemble vide.

## Piste 221i+

1. **`MeeshyShareExtension`** : câbler un `Localizable.xcstrings` à la cible
   (3 chaînes crues) — #2319 est mergée, la piste est débloquée.
2. **`StoryViewerView+Content.shareStory()`** — suppression de code mort (0
   caller), héritée de 219i ; la surface story a refroidi (0 PR ouverte).
3. **`TrackingLinkDetailView`** — #2325 est mergée : vérifier que la dette
   `UIActivityViewController` est bien retombée et resserrer l'ensemble du test.
4. **Balayage Dark Mode généralisé** (hérité de 219i) : couleur de marque claire
   posée sans lecture du `colorScheme`. Deux pièges déjà identifiés : (a)
   beaucoup de `MeeshyColors.indigoNNN` sont posés sur des fonds thématisés et
   sont corrects ; (b) toute surface descendant de `StoryViewerView` doit se
   brancher sur `colorScheme`, **jamais** sur `ThemeManager.mode`.
5. **Détentes mono-`.medium` restantes** (`LinksHubView:75`, `AffiliateView:29`,
   `EffectsPickerView:98`) : appliquer le même examen qu'ici — offrir `.large`
   **uniquement** si le contenu peut effectivement déborder à grande taille de
   texte (ne pas généraliser mécaniquement).
