# iOS UI/UX — Iteration 220i

**Date** : 2026-07-26
**Surfaces** :
- `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift`

**Axe** : Clôture de dette — deux marqueurs posés par 214i et 219i, enfin payables
**Base** : `main` HEAD `ffef1339e`

## Contexte : l'essaim a vidé sa file

Au moment de 219i, **cinq** PR iOS étaient en vol et bloquaient toutes les pistes
identifiées. Elles ont **toutes** été mergées depuis (#2275, #2319, #2325, #2330,
#2332) : le dépôt compte désormais **zéro PR ouverte**. Les deux dettes que les
itérations précédentes avaient délibérément laissées ouvertes — parce que leurs
fichiers étaient détenus par une PR tierce — deviennent payables.

Cette itération n'introduit pas de nouveau chantier : elle **ferme** ceux-là.
C'est aussi ce que leurs auteurs avaient prévu — les deux marqueurs sont écrits
pour rendre leur propre clôture obligatoire.

## Dette A — Le dernier `NavigationView` (posée par 214i)

214i a migré trois des quatre `NavigationView` restants vers `NavigationStack`,
et a écrit un test qui **fige** l'ensemble des fichiers fautifs à exactement
`{StatusComposerView.swift}` — le fichier alors détenu par la PR #2275. Son
commentaire disait explicitement :

> *When that lands, this expectation drops to the empty set and the test fails
> until it is updated — which is the intent.*

#2275 est mergée. `StatusComposerView` est libre.

### Le défaut

`NavigationView` est **déprécié depuis iOS 16**, et son style par défaut est
`DoubleColumnNavigationViewStyle` : à largeur *regular* (iPad), un
`NavigationView` à enfant unique se rend en **vue divisée dont la colonne de
détail est vide**. Le fichier ne pose pas `.navigationViewStyle(.stack)`.

`StatusComposerView` est le cas le plus exposé des quatre, parce que sa barre est
exactement la forme que le conteneur déprécié place mal :

```swift
.toolbar {
    ToolbarItem(placement: .navigationBarLeading)  { Button("Fermer") { dismiss() } }
    ToolbarItem(placement: .navigationBarTrailing) { publishToolbarButton }
}
```

Les **deux** affordances — sortir sans publier, et publier — atterrissent dans la
barre de la mauvaise colonne. Ce sont les deux seules issues de l'écran.

### Correctif

`NavigationView {` → `NavigationStack {`. **Un mot-clé, une ligne.** Migration
mécanique vérifiée sûre : le fichier ne contient **aucun** `NavigationLink`,
`navigationDestination`, `navigationViewStyle` ni `navigationBarItems` — c'est un
conteneur mono-colonne pur. Le plancher de déploiement est iOS 16.0
(`project.yml`), donc `NavigationStack` est disponible **inconditionnellement** :
aucune garde `@available`, aucune couche de compatibilité. Rendu **identique sur
iPhone** (largeur compacte).

### Clôture du marqueur

`NavigationContainerMigrationTests` passe de « dette épinglée » à « dette
close » :

- l'ensemble attendu tombe à **∅** — le test devient un garde pur : tout
  `NavigationView` réintroduit dans les cibles app échoue nommément ;
- un test positif par fichier est ajouté pour `StatusComposerView`, comme les
  trois migrés en 214i.

**Il ne reste aucun `NavigationView` dans les trois cibles app.**

## Dette B — La dernière présentation impérative (posée par 219i)

Le partage a été convergé sur trois itérations : 215i (`.sheet(item:)` +
`ShareSheet` pour les liens forgés en asynchrone), 216i (`ShareLink` pour les
liens synchrones), 219i (`ShareSheet` devient le pont unique, deux wrappers
dupliqués supprimés).

Il restait **un** site impératif : `StoryViewerView+Content.shareStory()`.

```swift
func shareStory() {
    guard let story = currentStory else { return }
    let shareURL = "https://meeshy.me/story/\(story.id)"
    let activityVC = UIActivityViewController(activityItems: [shareURL], applicationActivities: nil)
    if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
       let rootVC = windowScene.windows.first?.rootViewController {
        var topVC = rootVC
        while let presented = topVC.presentedViewController { topVC = presented }
        activityVC.popoverPresentationController?.sourceView = topVC.view
        topVC.present(activityVC, animated: true)
    }
}
```

Il concentre tout ce que l'arc a supprimé ailleurs : une URL forgée **en dur**,
`connectedScenes.first` sur un **`Set` non ordonné** (donc une scène en
arrière-plan est un résultat possible), une remontée manuelle jusqu'au contrôleur
présenté, et une ancre de popover posée sur **la vue entière** plutôt que sur
l'affordance touchée.

**Et il n'a aucun site d'appel.** Vérifié sur `apps/ios/` **et**
`packages/MeeshySDK/` : une définition, zéro appelant. Le partage d'une story
passe réellement par `SharePickerView` (transfert interne) et
`StoryExportShareSheet` (export MP4).

217i l'avait établi et en avait tiré la bonne conclusion — *« code mort, pas un
défaut d'expérience ; sa suppression est un nettoyage à traiter comme tel »* —
puis l'avait reporté deux fois parce que la surface story était brûlante. Elle
l'est moins : les PR story sont mergées.

### Correctif

Suppression de la fonction, remplacée par un commentaire qui dit **pourquoi**
elle n'est pas là, pour qu'un futur besoin de partage de story ne la réécrive
pas à l'identique. `import UIKit` n'était pas déclaré dans ce fichier (UIKit
arrive transitivement par SwiftUI) et d'autres symboles UIKit y subsistent
légitimement (`UIScreen`, `UIColor`, `UIApplication.sendAction`) : aucun import à
retirer.

### Resserrage du verrou 219i

219i avait écrit son balayage SSOT en **inclusion** plutôt qu'en égalité, avec
une raison explicite : les deux derniers sites (`TrackingLinkDetailView`, détenu
par #2325, et `shareStory()`) allaient disparaître, et une égalité serait passée
au rouge **au moment même où la dette était payée**, sur le dos d'une autre PR.

Les deux ont été traités — #2325 a convergé `TrackingLinkDetailView`, et 220i
supprime `shareStory()`. L'assertion peut enfin dire ce qu'elle voulait dire :

```swift
XCTAssertEqual(offenders, ["ConversationMediaViews.swift"])
```

**Un seul fichier de l'app construit un `UIActivityViewController` : celui qui
définit `ShareSheet`.**

## Commentaire rectifié

`NativeShareLinkAdoptionTests` (216i) portait un doc-comment devenu faux :
*« the only remaining imperative site in the app is
`StoryViewerView+Content.shareStory()`, deliberately left for a later iteration,
so this assertion must NOT be widened to a repo-wide sweep yet »*. Le site
n'existe plus et le balayage repo-wide existe désormais ailleurs. Le commentaire
dit maintenant l'état réel et renvoie vers lui — 218i a établi le précédent de
rectifier les commentaires faux plutôt que de les laisser dériver.

## Test

Aucun fichier de test neuf : cette itération **ferme** des marqueurs existants,
elle ne crée pas de surface à couvrir.

`NavigationContainerMigrationTests` (214i) — **+1 test, expectation → ∅**

1. `test_statusComposer_usesNavigationStack` — absence de `NavigationView {`
   **et** présence de `NavigationStack {`, comme les trois fichiers de 214i.
2. `test_noNavigationViewRemains` — l'ensemble attendu passe de
   `{StatusComposerView.swift}` à `[]`.

`StoryExportShareSheetPaletteTests` (219i) — **+1 test, inclusion → égalité**

3. `test_shareSheetIsTheSoleBridgeToUIActivityViewController` — `isSubset` →
   `XCTAssertEqual(offenders, ["ConversationMediaViews.swift"])`.
4. `test_storyViewerDropsUncalledImperativeShare` — ni `func shareStory`, ni
   `connectedScenes` dans les lignes de code de `StoryViewerView+Content.swift`.
   La seconde assertion est celle qui compte : elle interdit la **forme** du
   défaut, pas seulement le nom de la fonction.

**RED prouvé contre `main` `ffef1339e`** (vérifié en lisant les fichiers via
`git show origin/main:` plutôt qu'en se fiant à la mémoire) :

| Assertion | État sur `main` |
|---|---|
| `NavigationView` restants = ∅ | `{StatusComposerView.swift}` → **RED** |
| `StatusComposerView` en `NavigationStack` | `NavigationView {` présent → **RED** |
| offenders == `{ConversationMediaViews}` | + `StoryViewerView+Content` → **RED** |
| `func shareStory` absent | présent → **RED** |

## Vérification

- Pas de toolchain Swift (Linux) → les 4 assertions neuves/resserrées ont été
  **exécutées hors Xcode** par réimplémentation du balayage (mêmes règles :
  lignes de commentaire retirées, mêmes chemins, mêmes cibles) : **4/4 GREEN**
  sur l'arbre de travail, **4/4 RED** sur `origin/main`.
- Les 3 cibles balayées par `NavigationContainerMigrationTests` (`Meeshy`,
  `MeeshyShareExtension`, `MeeshyNotificationExtension`) existent bien sur disque
  — vérifié, sinon le balayage serait vert par vacuité.
- Assertions 219i préservées revérifiées : les 2 fichiers convergés restent sans
  `UIActivityViewController(`, `onCompletion` reste optionnel et défailli.
- Équilibre accolades / parenthèses / crochets des 5 fichiers au tokenizer
  (chaînes retirées **avant** les commentaires) : **0 / 0 / 0**.
- Migration `StatusComposerView` prouvée sans effet de bord : 0 `NavigationLink`,
  0 `navigationDestination`, 0 `navigationViewStyle`, 0 `navigationBarItems`.
- `shareStory` : 1 définition, **0 appelant** dans `apps/ios/` et
  `packages/MeeshySDK/`.
- Collision essaim : **0 PR ouverte** sur le dépôt.
- **Aucun fichier neuf** → aucune question `project.pbxproj`.

Gate réel = CI `iOS Tests`.

## Bilan

**2 fichiers de production : +9 / −14 lignes** (1 mot-clé migré, 13 lignes de
code mort supprimées, 9 lignes de commentaire expliquant l'absence).
**2 marqueurs de dette fermés** : plus aucun `NavigationView` dans les cibles
app, plus qu'**un seul** `UIActivityViewController` dans toute l'app. 1 doc-comment
faux rectifié. **0 clé i18n, 0 couleur, 0 layout, 0 changement visuel sur iPhone,
0 logique métier, 0 réseau, 0 fichier neuf.**

## Piste 221i+

Les deux dettes longues étant closes, la suite revient aux pistes de fond —
aucune n'est bloquée, le dépôt est vide de PR :

1. **Audit Dark Mode généralisé** (hérité de 219i, la piste la plus riche) : la
   famille de défaut de 219i — couleur de marque *claire* posée sans lecture du
   `colorScheme`. **Deux pièges déjà identifiés** : (a) beaucoup de
   `MeeshyColors.indigoNNN` sont posés sur des fonds eux-mêmes thématisés et sont
   **corrects** ; (b) toute surface descendant de `StoryViewerView` doit se
   brancher sur `colorScheme`, **jamais** sur `ThemeManager.mode` — c'est ce qui
   fait la différence entre corriger le défaut et le reproduire.
2. **`MeeshyShareExtension` i18n** : la cible n'a **aucun** `Localizable.xcstrings`
   propre — ses `String(localized:)` retombent toujours sur `defaultValue`, et 3
   chaînes sont crues (`"Cancel"`, `"Send"`, `"Share to Meeshy"`). Câbler un
   catalogue à la cible est un chantier à part entière. Débloqué depuis #2319.
3. **`sensoryFeedback` (iOS 17+)** : 0 usage contre 11 `UIImpactFeedbackGenerator`
   (piste relevée par 218i).
4. **Convergence des résolutions de key window restantes** sur
   `DeviceLayout.windowSize` (piste 218i) : `StoryViewerView` ×2,
   `ConversationView`, `RootView` ×2, `ComposerModels`, `IslandEmergingBanner`.
5. **`VoiceProfileManageView.addSamplesSheet`** (piste 214i) : rend son titre en
   `Text` dans le corps alors qu'il vit dans un `NavigationStack` sans
   `navigationTitle` → candidat `.navigationTitle` + `.inline` (change le visuel
   → itération dédiée).
