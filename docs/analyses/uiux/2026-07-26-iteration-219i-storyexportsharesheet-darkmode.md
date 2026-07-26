# iOS UI/UX — Iteration 219i

**Date** : 2026-07-26
**Surfaces** :
- `apps/ios/Meeshy/Features/Main/Views/StoryExportShareSheet.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift`
- `apps/ios/Meeshy/Features/Main/Components/MediaSaveFlowHost.swift`

**Axes** : Dark Mode / contraste WCAG · Design system (dé-duplication) · i18n
**Base** : `main` HEAD `e90afd6`

## Sélection de la cible

Le pointeur 218i laissait trois pistes, **toutes bloquées par l'essaim** :

| Piste héritée | Statut |
|---|---|
| Couple `MessageListView.MessageMenuPreviewContainer` ↔ `MessageOverlayMenu` | Les deux fichiers sont détenus par la PR ouverte **#2330** (218i). |
| `StatusComposerView` → `NavigationStack` | Détenu par la PR ouverte **#2275** (213i). |
| `MeeshyShareExtension` i18n | `ShareViewController.swift` détenu par la PR ouverte **#2319** (214i). |

Conformément à la clause « si toutes les analyses connues sont soldées, faire une
revue produit des opportunités introduites par le développement récent », le
balayage a porté sur les **surfaces les plus récemment livrées**. Le classement
par churn sur 7 jours (`git log --since`) donne la famille **stories** en tête :
`MyStoriesView` (9 commits), `StoryViewerView+Sidebar` (6), `StoryViewerView+Canvas`
(6), `StoryExportShareSheet` (2).

`MyStoriesView` a été audité ligne à ligne : rien à reprendre (VoiceOver composé,
`.isSelected`, actions rotor toujours attachées, `swipeActions`, rôles
destructifs, i18n complète — 3 chaînes crues dans **toute** l'app iOS, aucune
ici). `StoryExportShareSheet`, en revanche, porte trois défauts réels.

## Défaut A — Contraste illisible en mode sombre (WCAG AA)

Le sélecteur de langue d'export était peint avec des valeurs de **mode clair
inconditionnelles** :

```swift
.fill(MeeshyColors.indigo50.opacity(0.6))     // #EEF2FF — lavande quasi blanche
.stroke(MeeshyColors.indigo200, lineWidth: 1)
```

Le fichier ne lisait **ni** `colorScheme` **ni** `ThemeManager`. Le texte de la
langue sélectionnée est `.foregroundColor(.primary)` et le chevron
`.foregroundColor(.secondary)` — deux couleurs système qui, elles, basculent au
blanc en mode sombre. Résultat : **blanc sur lavande claire**.

### Ce n'est pas un cas limite : c'est le chemin principal

La feuille a **deux points d'entrée** :

1. `MyStoriesView:217` — suit le thème de l'app (défaut visible dès que
   l'utilisateur est en sombre) ;
2. `StoryViewerView:725` — et c'est là que ça se durcit. Le `body` de
   `StoryViewerView` est `viewerContent` (l. 688), et `viewerContent` porte
   `.preferredColorScheme(.dark)` (l. 453). Une `.sheet` présentée depuis cette
   hiérarchie **hérite** de la préférence. Depuis le rail d'actions du reader —
   l'entrée nominale de l'export — la feuille se rend donc **toujours en
   sombre**, pour **tout** utilisateur, quel que soit le thème choisi dans
   l'app. Le sélecteur y était en permanence dans son état fautif.

### Mesures (WCAG 2.1, après composition alpha)

Fond système d'une feuille sombre `#1C1C1E`, voile de fond 4 % appliqué.

| Élément | Avant | Après | Seuil AA |
|---|---|---|---|
| Texte `.primary` sur le fond du sélecteur | **2,73:1** ❌ | **14,14:1** ✅ | 4,5:1 |
| Chevron `.secondary` sur le même fond | **~1,9:1** ❌ | **6,08:1** ✅ | 4,5:1 |
| Mode clair, texte sur le sélecteur | 19,04:1 ✅ | **19,04:1** (inchangé) | 4,5:1 |

### Défaut A′ — le voile de fond était un no-op en sombre

```swift
.background(MeeshyColors.indigo950.opacity(0.04).ignoresSafeArea())
```

`indigo950` = `#1E1B4B`, du presque-noir. À 4 % sur un fond déjà noir, il ne
produit rien : la feuille perdait en sombre l'accent de marque qu'elle porte en
clair. La valeur est désormais inversée (`indigo50` à 4 % en sombre), ce qui
rétablit la symétrie du geste.

## Correctif A

Les trois jetons deviennent des fonctions pures d'un `enum` colocalisé —
idiome déjà établi dans le voisinage immédiat (`StoryVisibilityMenuResolver`,
`MyStoriesCommentsResolver`, `MyStoryRowAccessibility` dans `MyStoriesView.swift`) :

```swift
enum StoryExportSheetPalette {
    static func wash(isDark: Bool) -> Color {
        isDark ? MeeshyColors.indigo50.opacity(0.04) : MeeshyColors.indigo950.opacity(0.04)
    }
    static func pickerFill(isDark: Bool) -> Color {
        isDark ? MeeshyColors.indigo900.opacity(0.35) : MeeshyColors.indigo50.opacity(0.6)
    }
    static func pickerStroke(isDark: Bool) -> Color {
        isDark ? MeeshyColors.indigo700.opacity(0.5) : MeeshyColors.indigo200
    }
}
```

Deux décisions structurantes :

**`@Environment(\.colorScheme)`, pas `ThemeManager.mode`.** C'est le point clé,
et il est spécifique à cette feuille. `ThemeManager` porte le thème *choisi dans
l'app* ; `colorScheme` porte le mode *réellement rendu*. Sous le
`.preferredColorScheme(.dark)` du reader, un utilisateur en thème clair a
`ThemeManager.mode == .light` et `colorScheme == .dark`. Se brancher sur
`ThemeManager` (ou sur ses jetons `theme.inputBackground` / `theme.inputBorder`,
pourtant sémantiquement idéaux) aurait **reproduit exactement le défaut** sur ce
chemin. Les jetons `theme.*` restent le bon outil pour les surfaces qui suivent
le thème de l'app ; celle-ci n'en fait pas partie.

**Les valeurs de mode clair sont reprises à l'identique.** `indigo50@0.6`,
`indigo200`, `indigo950@0.04` : mêmes expressions. L'itération répare le mode
sombre, elle ne re-règle pas le mode clair — un test le verrouille canal par
canal, à un pas de quantification 8 bits près. Le mode sombre garde la teinte de
marque (indigo profond) plutôt qu'un gris système neutre : brand identity
préservée, contraste réparé.

## Défaut B — Trois ponts pour un seul comportement

L'app portait **trois** `UIViewControllerRepresentable` distincts enveloppant
`UIActivityViewController` :

| Wrapper | Fichier | Sites d'appel | Différence réelle |
|---|---|---|---|
| `ShareSheet(activityItems:)` | `ConversationMediaViews.swift:9` | **11** | — (le canonique) |
| `MediaShareSheet(url:)` | `MediaSaveFlowHost.swift:177` (`private`) | 1 | **aucune** : `[url]` au lieu de `[Any]` |
| `ActivityView(url:onCompletion:)` | `StoryExportShareSheet.swift:188` (`private`) | 1 | un `completionWithItemsHandler` |

`MediaShareSheet` est une copie stricte. `ActivityView` ajoute une seule chose
réelle — la notification de fin de partage, dont `StoryExportShareViewModel` a
besoin pour nettoyer le MP4 temporaire.

### Correctif B

`ShareSheet` gagne `var onCompletion: ((Bool) -> Void)? = nil`, et n'installe le
handler **que s'il est fourni** :

```swift
if let onCompletion {
    controller.completionWithItemsHandler = { _, completed, _, _ in onCompletion(completed) }
}
```

Les **11 sites d'appel existants sont strictement inchangés** — même signature
d'appel (paramètre défailli), et surtout **même comportement runtime** : aucun
handler n'est installé là où aucun n'était installé. Les deux copies sont
supprimées. `ShareSheet` devient le pont unique et documenté, aboutissement
naturel de l'arc 215i/216i (*prefer first-party SwiftUI — no manual
`UIActivityViewController` / window-hierarchy traversal*).

**Effet de bord bénéfique** : `StoryExportShareSheet` n'a plus aucun symbole
UIKit → son `import UIKit` disparaît.

## Défaut C — Une chaîne non localisée

```swift
Button("OK", role: .cancel) { … }
```

Seule chaîne du fichier hors `String(localized:)`. La clé `common.ok` existe
déjà dans `Localizable.xcstrings` et est utilisée ailleurs. **0 clé neuve.**

## Hors périmètre

- **`TrackingLinkDetailView`** — porte encore un `UIActivityViewController` +
  parcours de fenêtres. Détenu par la PR ouverte **#2325**, qui le converge
  précisément. Ne pas y toucher.
- **`StoryViewerView+Content.shareStory()`** — dernier parcours de fenêtres,
  mais **0 site d'appel** (établi en 217i) : c'est du code mort, sa suppression
  est un nettoyage à traiter comme tel, et la surface story est brûlante.
- **`theme.inputBackground` / `theme.inputBorder`** — les jetons sémantiques
  existent et conviendraient à toute autre feuille ; ils sont inutilisables
  **ici** pour la raison exposée au correctif A.

## Test

`apps/ios/MeeshyTests/Unit/Views/StoryExportShareSheetPaletteTests.swift` (neuf).
**9 tests / 24 assertions exécutées** (13 sites d'assertion, dont 4 en boucle).

L'essentiel n'est pas de l'introspection de source : les tests **mesurent le
contraste réel**. `UIColor(color).getRed(…)` extrait les composantes, une
composition « source over » reproduit ce que fait le compositeur, et la formule
officielle WCAG 2.1 (linéarisation sRGB + luminance relative) donne le ratio.
C'est la grandeur que le défaut viole, et la seule qui ne puisse pas passer au
vert par accident.

1. **Référence du défaut** : l'ancien fond clair, composé sur du sombre, donne
   **2,73:1** pour un texte blanc → `XCTAssertLessThan(ratio, 4.5)`. La
   divergence avant/après est ainsi prouvée *dans* le test, sans dépendre de
   l'historique git.
2. `pickerFill(isDark: true)` porte `.primary` à **≥ 4,5:1** (14,14).
3. Le chevron `.secondary` (blanc à 60 %) tient aussi (**6,08:1**) — le cas le
   plus exigeant de la vue.
4. Mode clair : `.black` sur le sélecteur ≥ 4,5:1 (19,04).
5. **Parité du mode clair** : les 3 jetons rendent, canal par canal (tolérance
   1/255), exactement les expressions d'origine.
6. **Divergence** : aucun des 3 jetons ne rend la même chose dans les 2 modes —
   c'est précisément ce qui manquait.
7. Le voile sombre **éclaircit** (luminance strictement supérieure au substrat)
   au lieu de disparaître.
8. **SSOT du pont de partage** : les 2 fichiers convergés ne construisent plus
   d'`UIActivityViewController` (assertion positive), et le balayage récursif de
   `apps/ios/Meeshy` vérifie une **inclusion** dans l'ensemble de dette connue
   `{ConversationMediaViews, TrackingLinkDetailView, StoryViewerView+Content}`,
   pas une égalité. Choix délibéré : une égalité passerait au rouge le jour où
   #2325 converge `TrackingLinkDetailView` — c'est-à-dire au moment même où la
   dette est payée. L'inclusion attrape ce qui compte : l'apparition d'un
   **nouveau** pont dupliqué. Plus une assertion que `onCompletion` reste
   optionnel **et** défailli, condition de survie des 11 appels existants.

**RED contre `main` `e90afd6`** : `StoryExportSheetPalette` n'existe pas sur
`main` (la suite n'y compile pas), et les deux fichiers convergés y portent
chacun leur `UIActivityViewController(`. Le test n° 1 encode l'ancienne valeur
explicitement, donc la mesure du défaut survit au correctif.

## Vérification

- Pas de toolchain Swift (Linux) → vérification déterministe des 24 assertions,
  par catégorie :
  - **8 assertions numériques recalculées indépendamment** hors Xcode
    (linéarisation sRGB, composition « source over » et formule WCAG
    réimplémentées séparément) : les 4 ratios de contraste, la comparaison de
    luminance du voile, les 3 divergences clair/sombre → **8/8 conformes**,
    valeurs reportées dans le tableau ci-dessus ;
  - **12 assertions de parité** vraies *par construction* : les branches claires
    des 3 jetons sont les expressions d'origine, mot pour mot ;
  - **4 assertions de source** vérifiées par balayage de l'arbre (aucun
    `UIActivityViewController(` dans les 2 fichiers convergés ; ensemble
    résiduel = les 3 fichiers attendus ; `onCompletion` défailli présent).
- Équilibre accolades / parenthèses / crochets des 4 fichiers au tokenizer
  (chaînes retirées **avant** les commentaires) : **0 / 0 / 0**.
- Aucune référence résiduelle à `ActivityView` ni `MediaShareSheet` dans l'arbre.
- `import UIKit` conservé dans `MediaSaveFlowHost` (`DocumentExportPicker` en a
  besoin), retiré de `StoryExportShareSheet` (0 symbole UIKit restant, vérifié
  par grep).
- Collision essaim : `list_pull_requests` (open, 16 PR dont **5 iOS** — #2330,
  #2326, #2325, #2319, #2275) → **aucune** ne touche les 3 fichiers de cette
  itération.
- Fichier de test **neuf** → enregistré par `xcodegen generate` (globbing
  récursif), **0 édition de `project.pbxproj`**. Nom de classe contenant
  « Story » → phase 2 de `meeshy.sh test`, conformément à
  `FINAL_PHASE_CLASS_PATTERN`.

Gate réel = CI `iOS Tests`.

## Bilan

**3 fichiers de production : +66 / −35 lignes.** 1 échec de contraste WCAG AA
réparé sur le chemin d'entrée nominal d'une feuille (2,73:1 → 14,14:1), 1 voile
de marque rétabli en sombre, 2 wrappers `UIActivityViewController` supprimés
(il en reste **1** légitime + 2 dettes connues et documentées), 1 `import`
inutile retiré, 1 chaîne localisée. **0 clé i18n neuve, 0 changement en mode
clair (prouvé canal par canal), 0 logique métier, 0 réseau, 0 layout.**

## Piste 220i+

1. **`StoryViewerView+Content.shareStory()`** — suppression de code mort (0
   caller). Le seul frein est la température de la surface story ; à faire dès
   qu'elle refroidit. Réduira l'ensemble de dette du test n° 8.
2. **`TrackingLinkDetailView`** — dès #2325 mergée/close, vérifier que la dette
   est bien retombée et resserrer l'ensemble.
3. **Balayage Dark Mode généralisé** : la famille de défaut de cette itération
   (couleur de marque claire posée sans lecture du `colorScheme`) mérite un
   audit dédié. Attention, deux pièges dûment identifiés ici : (a) beaucoup de
   `MeeshyColors.indigoNNN` sont posés sur des fonds eux-mêmes thématisés et
   sont donc corrects ; (b) toute surface descendant de `StoryViewerView` doit
   se brancher sur `colorScheme`, **jamais** sur `ThemeManager.mode`.
4. **`StatusComposerView`** (`NavigationView` → `NavigationStack`) dès #2275
   résolue, puis réduire l'attendu de `NavigationContainerMigrationTests` à
   l'ensemble vide.
5. **`MeeshyShareExtension`** : câbler un `Localizable.xcstrings` à la cible
   (3 chaînes crues) dès #2319 résolue.
