# iOS UI/UX — Iteration 220i

**Date** : 2026-07-26
**Surfaces** :
- `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift`
- `apps/ios/MeeshyTests/Unit/Views/NavigationContainerMigrationTests.swift`

**Axe** : Intégration plateforme native / HIG — clôture de la dette
`NavigationView` sur les cibles app iOS
**Base** : `main` HEAD `ffef133`

## Contexte

L'itération **214i** avait migré **3 des 4** `NavigationView` des cibles app
(`EmojiPickerSheet`, `VoiceProfileManageView.addSamplesSheet`,
`MeeshyShareExtension/ShareViewController`) et **délibérément laissé de côté**
`StatusComposerView.swift`, alors détenu par la PR ouverte **#2275** (213i) —
migrer un fichier en vol aurait créé une collision d'essaim.

214i avait posé un **piège volontaire** : le test de balayage
`test_noUnexpectedNavigationViewRemains` figeait l'ensemble des fichiers fautifs
à exactement `{StatusComposerView.swift}`, de sorte qu'il **échouerait** dès la
migration du dernier site — forçant la clôture explicite de la dette plutôt que
son oubli.

**#2275 est mergée** (`131f7939e` dans `main`), et `list_pull_requests` (open)
retourne **0 PR** : le fichier est libre. C'est exactement l'itération que 214i,
215i, 218i et 219i désignaient toutes comme la suite.

## Défaut

`NavigationView` est **déprécié depuis iOS 16**. Son style par défaut est
`DoubleColumnNavigationViewStyle` : à largeur *regular* (iPad), un
`NavigationView` à enfant unique se rend comme une **vue divisée dont la colonne
de détail est vide**. Le contenu réel part dans la colonne maître et les
`ToolbarItem(placement: .navigationBarTrailing)` atterrissent dans la barre de
la mauvaise colonne.

`StatusComposerView` est **le pire hôte possible** de ce défaut parmi les quatre
sites, pour une raison structurelle : c'est une feuille à détente **`.medium`**
(demi-hauteur), sur ses **trois** points de présentation.

| Point de présentation | Détentes |
|---|---|
| `RootViewComponents.swift:743` (`showStatusComposer`, racine du feed) | `[.medium]` |
| `ConversationListView.swift:756` (`republishStatusEntry`, republication) | `[.medium]` |
| `ConversationListView.swift:767` (`showStatusComposer`) | `[.medium]` |

Un conteneur bi-colonne dans une feuille demi-hauteur écrase la grille d'emojis
(`LazyVGrid` 5 colonnes × 56 pt), les capsules de visibilité et le `TextField`
dans une colonne maître étroite — et **« Publier »**, en
`.navigationBarTrailing`, est l'**unique action primaire** de l'écran : c'est le
seul chemin de publication d'une humeur. Le bouton « Fermer » en
`.navigationBarLeading` est de même l'unique affordance de sortie explicite.

Le plancher de déploiement est **iOS 16.0** (`apps/ios/project.yml`) :
`NavigationStack` est disponible **inconditionnellement**, sans garde
`@available` ni couche de compatibilité.

## Correctif (220i)

Substitution du conteneur : `NavigationView {` → `NavigationStack {`.
**Un mot-clé, une ligne** — accolades, corps de vue, barre d'outils, `onAppear`
et logique de publication strictement inchangés.

Migration mécanique et sûre, qualifiée fichier par fichier : `StatusComposerView`
ne contient **aucun** `NavigationLink`, `navigationDestination`,
`navigationViewStyle`, `navigationBarItems`, `navigationBarHidden` ni
`NavigationSplitView` — c'est un conteneur mono-colonne pur. Sur iPhone (largeur
compacte) le rendu est **identique au pixel** ; le gain porte sur iPad et sur la
sortie de dépréciation.

**Les cibles app iOS sont désormais à zéro `NavigationView`** (32 fichiers en
`NavigationStack`, 0 en `NavigationView`).

## Test

`apps/ios/MeeshyTests/Unit/Views/NavigationContainerMigrationTests.swift`
(existant, étendu — idiome d'introspection de source établi par
`ConversationInfoSheetAccessibilityTests` / `CallViewAccessibilityTests`).

Trois évolutions, dans l'ordre voulu par 214i :

1. **`test_statusComposer_usesNavigationStack`** (neuf) — quatrième appel de
   `assertMigrated`, donc double assertion : absence de `NavigationView {` **et**
   présence de `NavigationStack {`. Son doc-comment consigne *pourquoi* cette
   surface était la plus exposée (feuille `.medium`, action primaire unique en
   `navigationBarTrailing`), pour que l'information survive au diff.
2. **`test_noUnexpectedNavigationViewRemains` → `test_noNavigationViewRemains`** —
   l'attendu figé `{StatusComposerView.swift}` devient `Set<String>()`. Le
   piège de 214i est désarmé **en le résolvant**, pas en l'assouplissant.
   Renommage : il ne reste plus de dette « attendue », donc plus de notion
   d'« inattendu » — le test dit maintenant ce qu'il vérifie.
   Le message d'échec passe de « mets à jour l'attendu » à « une régression a été
   introduite, utilise `NavigationStack` », avec le motif iPad en clair.
3. **Doc-comment de classe** — mention explicite que l'ensemble est vide depuis
   220i et que le balayage est désormais un **garde-fou de régression pur**.

`Set<String>()` est écrit explicitement plutôt que `[]` : l'inférence via
double `@autoclosure` de `XCTAssertEqual` fonctionnerait, mais un échec de
compile coûterait un cycle CI complet pour un gain de trois caractères.

## Portée

- **1 fichier de prod, 1 ligne** (1 mot-clé). **1 fichier de test**, +25/−12.
- 0 logique / 0 réseau / 0 clé i18n / 0 couleur / 0 constante visuelle / 0 layout
  / 0 changement visuel sur iPhone / 0 édition de `project.pbxproj` (aucun
  fichier neuf).

## Vérification

Toolchain Swift indisponible dans l'environnement d'exécution (Linux, `xcodebuild`
et `swift` absents) → les assertions sont vérifiées **déterministiquement** par
correspondance de chaînes hors Xcode, contre l'arbre courant **et** contre
`origin/main`. Portail réel : CI `iOS Tests` (compile Xcode 26.1.1 / Swift 6.2,
exécution simulateur iOS 18.2).

- Prédicat du balayage rejoué à l'identique (`NavigationView {` sur les 3 cibles
  `Meeshy` / `MeeshyShareExtension` / `MeeshyNotificationExtension`) → **0
  fichier fautif** ✔ ; sur `origin/main` → `{StatusComposerView.swift}`, donc les
  deux tests touchés sont bien **ROUGES avant / VERTS après** ✔
- Les **4** chemins passés à `assertMigrated` existent sur disque, et chacun
  vérifie les deux assertions : `NavigationView {` = 0, `NavigationStack {` = 1 ✔
- Aucune variante d'espacement (`NavigationView{`) dans l'arbre ✔
- `StatusComposerView` : 0 `NavigationLink` / `navigationDestination` /
  `navigationViewStyle` / `navigationBarItems` / `navigationBarHidden` /
  `NavigationSplitView` → substitution sans effet de bord ✔
- Les 3 détentes de présentation relues aux 3 call-sites (`[.medium]` partout) —
  fonde la qualification « pire hôte » ✔
- Équilibre accolades / parenthèses / crochets des 2 fichiers au tokenizer
  (chaînes retirées **avant** les commentaires) : **0 / 0 / 0** ✔
- Le fichier de test contient lui-même le littéral `"NavigationView {"` : il vit
  sous `apps/ios/MeeshyTests/`, **hors** des 3 racines énumérées par le walker
  (`apps/ios/Meeshy`, sœur et non parente) → **aucun auto-match** ✔
- Plancher iOS 16.0 confirmé → `NavigationStack` sans garde `@available` ✔
- Collision essaim : `list_pull_requests` (open) → **0 PR**, iOS ou autre ✔

## Bilan

La poche de dette `NavigationView` ouverte par 214i est **soldée** sur les cibles
app iOS : 4 sites sur 4 migrés, dernier conteneur déprécié éliminé sur la surface
la plus exposée (feuille demi-hauteur portant une action primaire unique). Le
test de balayage cesse d'être un pense-bête à tenir à jour et devient un
garde-fou de régression à attendu vide. **0 clé i18n, 0 logique, 0 réseau, 0
changement visuel sur iPhone.**

## Piste 221i+

1. **SDK — 5 `NavigationView` restants** dans
   `packages/MeeshySDK/Sources/MeeshyUI/` (`UnifiedPostComposer:189`,
   `VoiceProfileWizardView:17`, `VoiceProfileManageView:15`, `CodeViewerView:247`,
   `DocumentViewerView:199`). **Hors périmètre de cette routine** (iOS app
   uniquement, cf. § SCOPE) — à traiter par la piste SDK. Le balayage app ne les
   voit pas (le walker n'énumère que les 3 cibles app), c'est volontaire.
2. **`navigationBarHidden(true)` — 47 occurrences dans 11 fichiers**, également
   déprécié, remplaçable par `.toolbar(.hidden, for: .navigationBar)` disponible
   dès iOS 16. **Ne pas traiter en bloc** : 10 des 47 sont dans `RootView`
   (racine de l'app, navigation imbriquée) et l'équivalence n'est pas stricte
   dans tous les cas d'imbrication → itération dédiée, fichier par fichier,
   en commençant par une feuille isolée (`LinksHubView:64`), jamais par `RootView`.
3. **`ToolbarItemPlacement.navigationBarLeading` / `.navigationBarTrailing`** —
   renommés `.topBarLeading` / `.topBarTrailing` en iOS 17. Migration
   **impossible sans garde** au plancher iOS 16 → nécessiterait un helper de
   compatibilité ; à évaluer comme chantier design-system, pas au coup par coup.
4. **`VoiceProfileManageView.addSamplesSheet`** (héritée de 214i, toujours
   ouverte) — rend son titre comme un `Text` dans le corps alors qu'il vit dans
   un `NavigationStack` sans `navigationTitle` : candidat à `.navigationTitle` +
   `.navigationBarTitleDisplayMode(.inline)` (change le visuel → itération
   dédiée).
5. **`MeeshyShareExtension` i18n** (héritée de 214i/218i/219i) — la cible n'a
   aucun `Localizable.xcstrings` propre ; 3 chaînes crues. #2319 est résolue,
   la piste est donc libre.
6. **Convergence des résolutions de key window restantes** sur
   `DeviceLayout.windowSize` (héritée de 218i) : `StoryViewerView` ×2,
   `ConversationView`, `RootView` ×2, `ComposerModels`, `IslandEmergingBanner`
   (218i annonçait « 5 » mais en énumérait 7 — recompter au moment de traiter).
