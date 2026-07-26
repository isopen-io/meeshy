# Plan — iOS UI/UX Iteration 220i

**Date** : 2026-07-26
**Surface** : `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift`
**Axes** : Intégration native / HIG (conteneur de navigation) · Accessibilité
VoiceOver (CTA principal)
**Base** : `main` HEAD `ffef133` (PR #2325 mergée)

## Sélection de la cible

Le pointeur 219i laissait cinq pistes. Trois sont **débloquées** par les merges
qui viennent d'atterrir dans `main` :

| Piste 219i | Bloqueur | Statut |
|---|---|---|
| 4. `StatusComposerView` → `NavigationStack` | PR #2275 | **mergée** (`131f793`) → libre |
| 2. `TrackingLinkDetailView` (dette partage) | PR #2325 | **mergée** (`ffef133`) → dette déjà retombée |
| 5. `MeeshyShareExtension` i18n | PR #2319 | **mergée** (`26b8ef1`) → libre |
| 1. `StoryViewerView+Content.shareStory()` | surface story chaude | encore chaude |
| 3. Balayage Dark Mode généralisé | — | audit large, itération dédiée |

La piste **4** est retenue : c'est la seule dont le test de suivi
(`NavigationContainerMigrationTests`) **épingle explicitement** le fichier comme
« dernier récalcitrant » et se met au rouge tant qu'on ne le solde pas. C'est
donc la dette la plus mûre, et sa clôture ramène à **zéro** l'ensemble des
`NavigationView` de l'app.

## Défaut A — Dernier `NavigationView` de l'app (HIG / iPad)

`StatusComposerView.swift:37` ouvre son corps sur `NavigationView { … }`.

`NavigationView` est déprécié depuis iOS 16 et — c'est le point qui casse —
adopte par défaut le style **double colonne**. En environnement de largeur
*regular* (iPad, et la feuille de partage iPad), un `NavigationView` à enfant
unique se rend donc en **split view dont la colonne de détail est vide**.

Les trois points de présentation sont des feuilles :

- `RootViewComponents.swift:743` — `.sheet(isPresented:)` + `.presentationDetents([.medium])`
- `ConversationListView.swift:756` — `.sheet(item:)` (republication)
- `ConversationListView.swift:767` — `.sheet(isPresented:)`

Sur iPad, une `.sheet` se présente en *form sheet*, largeur **regular** → le
composer d'humeur se replie dans la colonne latérale et l'utilisateur fait face à
un panneau de détail vide, **ses deux seules affordances de barre (« Fermer » et
« Publier ») mal placées**.

Le plancher de déploiement est iOS 16.0 (`project.yml`) → `NavigationStack` est
disponible **sans garde de disponibilité**.

## Défaut B — Le CTA principal perd son nom pendant la publication (VoiceOver)

`publishToolbarButton` (l. 202-238) :

```swift
} label: {
    if isPublishing {
        ProgressView().tint(…).scaleEffect(0.8)   // ← aucun texte
    } else {
        Text(String(localized: "status.composer.publish", …))
    }
}
.disabled(selectedEmoji == nil || isPublishing)
```

Aucun modificateur d'accessibilité sur le bouton. Deux conséquences réelles :

1. **Pendant la publication**, le label du bouton est un `ProgressView` nu →
   VoiceOver n'a plus rien à annoncer pour le **seul** CTA de l'écran. Le nom
   accessible disparaît au moment précis où l'utilisateur veut savoir ce qui se
   passe.
2. **À l'état désactivé** (aucune humeur choisie — l'état d'ouverture par
   défaut), la seule différence perceptible est **la couleur** du texte
   (`MeeshyColors.brandGradient` → `theme.textMuted`). C'est un
   état-par-la-couleur-seule (WCAG 1.4.1) : ni le texte visible ni VoiceOver ne
   disent *pourquoi* c'est indisponible.

**Sibling prouvé** : `FeedView.swift:1240-1273` — le bouton « Publier » du
composer de fil, de **forme strictement identique** (`ProgressView` si
`isUploading`, `Text` sinon, `.disabled(!hasContent || isUploading)`), porte
déjà `.accessibilityLabel` + `.accessibilityHint` + `.accessibilityValue`
conditionnelle. 220i aligne le composer d'humeur sur ce patron.

## Correctifs

### A
`NavigationView {` → `NavigationStack {` (1 ligne). Titre, `displayMode`,
`toolbar`, `onAppear`, gradient de fond, détentes : inchangés.

### B
Sur le `Button` (après `.disabled`), miroir de `FeedView` :

- `.accessibilityLabel` → **`status.composer.publish`**, c'est-à-dire **la clé
  du texte visible**. Le nom accessible contient donc le libellé affiché
  (WCAG 2.5.3 *Label in Name*), et il **survit** au passage en `ProgressView`.
  **0 clé neuve** pour le label.
- `.accessibilityHint` → `status.composer.a11y.publish.hint`.
- `.accessibilityValue` → `…publishing` si `isPublishing`, sinon
  `…disabled` si `selectedEmoji == nil`, sinon `""` (valeur `String` runtime →
  surcharge `StringProtocol`, aucune localisation parasite — doctrine 195i).

**3 clés neuves**, namespace `status.composer.a11y.publish.*` (celui du
fichier), déclarées **inline** avec `defaultValue` *et* ajoutées à
`Localizable.xcstrings` **traduites dans les 7 locales du catalogue**
(ar, de, en, es, fr, it, pt-BR) — shape identique aux clés 195i
(`extractionState: "manual"`). Insertion **additive** après le bloc
`status.online`, **0 réordonnancement**.

> Écarté : réutiliser `a11y.feed.compose.publish*` (déjà traduites). La clé
> `.uploading` vaut « Envoi en cours » / « Uploading » — un envoi, pas une
> publication d'humeur ; et `a11y.feed.compose.publish` vaut « Post » en
> anglais alors que le bouton **affiche** le texte de `status.composer.publish`
> → VoiceOver dirait un mot absent de l'écran (violation 2.5.3). La justesse du
> libellé prime sur l'économie de clés.

## Hors périmètre

- **`status.composer.*` non traduites** : les 6 clés existantes du fichier sont
  inline sans entrée catalogue. Ce n'est **pas** un défaut de cette surface :
  **1724 des 2586** clés `String(localized:)` de l'app sont dans ce cas — c'est
  le patron accepté du dépôt (extraction au build, doctrine 208i/209i). Un
  rattrapage de traduction est une campagne à part, pas un effet de bord de
  220i.
- **`StoryViewerView+Content.shareStory()`**, **balayage Dark Mode**,
  **`MeeshyShareExtension` i18n** : reportés au pointeur 221i+.

## Tests

### `NavigationContainerMigrationTests.swift` (existant — mis à jour)
1. Nouveau `test_statusComposer_usesNavigationStack()` via l'helper
   `assertMigrated` déjà en place.
2. `test_noUnexpectedNavigationViewRemains` : l'ensemble attendu passe de
   `["StatusComposerView.swift"]` à **`[]`**, et le commentaire décrivant la
   dette est remplacé par la doctrine « plus aucun `NavigationView` ne doit
   apparaître ». C'est le déclenchement prévu par l'auteur de 214i.

### `StatusComposerPublishAccessibilityTests.swift` (neuf)
Idiome source-introspection du dépôt. Vérifie, **ancré** sur la fenêtre de
source qui suit `publishToolbarButton` (et non par `contains` global, qui
passerait au vert grâce aux a11y déjà présentes ailleurs dans le fichier) :

1. le bouton porte un `.accessibilityLabel` **et** c'est la clé du texte visible ;
2. les deux branches de valeur (`publishing`, `disabled`) sont présentes et
   pilotées par `isPublishing` / `selectedEmoji == nil` ;
3. le `.accessibilityHint` est présent ;
4. les 3 clés neuves existent dans `Localizable.xcstrings` **dans les 7 locales**,
   toutes `state == "translated"` (parité de couverture avec les clés voisines) ;
5. non-régression : `ProgressView` reste la branche in-flight (le correctif est
   a11y-only, il ne change pas le visuel).

**RED attendu contre `main` `ffef133`** : (1) `StatusComposerView.swift`
contient `NavigationView {` et pas `NavigationStack {` ; (2) l'ensemble
`filesUsingDeprecatedContainer()` vaut `["StatusComposerView.swift"]` ≠ `[]` ;
(3) aucune des 3 clés n'existe au catalogue ; (4) aucun modificateur
d'accessibilité derrière `publishToolbarButton`.

## Vérification

- Pas de toolchain Swift (Linux) → assertions vérifiées par correspondance de
  chaînes déterministe ; équilibre accolades/parenthèses/crochets des fichiers
  touchés contrôlé au tokenizer ; validité JSON du `.xcstrings` revalidée après
  insertion, plus contrôle qu'**aucune** clé préexistante n'a bougé (comparaison
  clé à clé avant/après).
- Fichier de test neuf → enregistré par `xcodegen generate`, **0 édition de
  `project.pbxproj`**. Nom de classe contenant « Status » **et** « Compose » →
  phase 2 de `meeshy.sh test` (`FINAL_PHASE_CLASS_PATTERN`).
- Gate réel = CI `iOS Tests`.

## Bilan attendu

1 conteneur de navigation déprécié éliminé — **le dernier de l'app** — et le
test de suivi ramené à l'ensemble vide ; 1 CTA principal qui garde son nom
VoiceOver pendant son état d'attente et explique enfin son indisponibilité
autrement que par la couleur. 0 logique métier, 0 réseau, 0 layout, 0 couleur.
