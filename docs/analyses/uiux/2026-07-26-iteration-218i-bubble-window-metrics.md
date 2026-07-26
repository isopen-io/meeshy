# iOS UI/UX — Iteration 218i

**Date** : 2026-07-26
**Surfaces** :
- `apps/ios/Meeshy/Core/DeviceLayout.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift`
- `apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListView.swift`

**Axe** : Adaptation multi-fenêtre / HIG — les métriques de la conversation se
mesurent sur la **fenêtre** de l'app, pas sur l'écran physique déprécié
**Base** : `main` HEAD `e0a6224`

## Sélection de la cible

La piste (a) laissée par 217i était : « couple
`MessageListView.MessageMenuPreviewContainer.maxHeight` ↔
`MessageOverlayMenu.maxPreviewHeight`, tous deux `UIScreen.main.bounds.height * 0.62`,
explicitement alignés l'un sur l'autre ». **Vérification faite, le couple n'existe
pas** : `MessageOverlayMenu.maxPreviewHeight` est un **`320` en dur**
(`MessageOverlayMenu.swift:207`), pas un ratio d'écran. Le commentaire de
`MessageListView.swift:305` qui affirme la parité est faux depuis son écriture —
523 pt contre 320 pt sur un iPhone de 844 pt — et le commentaire voisin sur le
plancher de scale l'est aussi (0.5 contre 0.55). C'est de la documentation
trompeuse, pas un couplage.

Le balayage a en revanche fait apparaître le vrai défaut du même axe, plus net :
**`DeviceLayout.bubbleMaxWidth(containerWidth:sizeClass:)` est un helper dont le
paramètre s'appelle littéralement `containerWidth`, et ses deux seuls appelants
lui passaient `UIScreen.main.bounds.width`.**

État de l'essaim au moment du choix : `list_pull_requests` (open) = 14 PR, dont
4 iOS — #2325 (216i, partage), #2319 (214i, `NavigationStack`), #2275 (213i,
`StatusComposerView`), #2326 (217i, `StatusBubbleOverlay`). **Aucune** ne touche
les 4 fichiers ci-dessus. Numéro **218i** choisi strictement > 217i (#2326, en vol).

## Le défaut

Les surfaces de conversation se dimensionnent en **part de l'espace donné à
l'app** :

| Site | Règle | Mesurait |
|---|---|---|
| `BubbleStandardLayout` (bulle en conversation) | 70 % (compact) / 62 % plafonné 560 pt (regular) | `UIScreen.main.bounds.width` |
| `MessageOverlayMenu.messagePreview` (aperçu long-press) | même plafond, « pour que l'aperçu soit la MÊME bulle » | `UIScreen.main.bounds.width` |
| `MessageMenuPreviewContainer` (aperçu du `.contextMenu` natif iOS 26) | 62 % de la hauteur | `UIScreen.main.bounds.height` |

`UIScreen.main` est **déprécié depuis iOS 16** — la doctrine est déjà écrite
deux fois dans le dépôt (`CallManager.swift:2902` « avoids UIScreen.main
(deprecated in iOS 16+) », `StoryViewerView.swift:329` « Use the active window
bounds rather than `UIScreen.main.bounds` so iPad split-screen / Stage Manager /
multi-window scenes report the viewer's actual window ») — mais elle n'avait
jamais atteint la conversation.

Surtout, `UIScreen.main` rapporte le **display**. Sous Split View, Slide Over ou
Stage Manager, l'app n'en possède qu'une fraction : **un ratio de l'écran est un
ratio d'un espace que l'app n'a pas**, et il gonfle jusqu'à ne plus contraindre
quoi que ce soit.

### A. Le plafond de bulle cesse de plafonner

La rangée est `HStack { Spacer(minLength: 50) ; bulle.frame(maxWidth: cap) }`.
Le **couloir laissé en face d'une bulle n'est pas décoratif** : c'est ce qui
distingue expéditeur et destinataire d'un coup d'œil (et c'est le seul signal
non textuel de cette information — le reste passe par la couleur).

iPad Pro 12,9" paysage = **1366 pt** de display. Une fenêtre **Slide Over** fait
~**320 pt**, en classe compacte :

```
cap = min(1366 × 0.70, ∞) = 956 pt   ← dans une fenêtre de 320 pt
```

`.frame(maxWidth: 956)` ne contraint plus rien : la bulle prend toute la largeur
disponible moins le `Spacer(minLength: 50)`, soit **~84 %** de la fenêtre au lieu
des 70 % voulus. Le couloir tombe de 96 pt (règle) à 50 pt (plancher de secours).

À largeur **regular**, le plafond de 560 pt masque le défaut sans le corriger.
iPad 12,9" en Split View 50/50 ≈ **683 pt** de fenêtre :

```
mesuré sur le display :  min(1366 × 0.62, 560) = 560 pt  →  82 % de la fenêtre
mesuré sur la fenêtre :  min(683  × 0.62, 560) = 423 pt  →  62 %, la règle
```

### B. L'aperçu du menu contextuel hérite du même biais

`MessageOverlayMenu.messagePreview` porte le commentaire « Match the
in-conversation bubble cap … so the preview reads as the SAME bubble the user
just long-pressed — not a wider clone ». L'intention est juste ; la mesure ne
l'était pas — les deux sites étaient faux **ensemble**, donc l'aperçu restait
cohérent avec la bulle, tous deux trop larges.

`MessageMenuPreviewContainer.maxHeight` (aperçu du `.contextMenu` natif) est le
même cas en hauteur : sous Stage Manager, une fenêtre bien plus courte que
l'écran laissait un plafond de 62 % de l'écran qui ne plafonnait plus — l'aperçu
pouvait dépasser la fenêtre au lieu de se mettre à l'échelle.

### C. Documentation fausse

`MessageListView.swift:305` affirmait que son plafond vaut « 62 % de l'écran,
comme l'overlay custom (`MessageOverlayMenu.maxPreviewHeight`) ». Celui-ci vaut
**320 pt fixes** et applique un mécanisme différent (mise à l'échelle d'une frame
déjà capturée, pas d'une taille naturelle). Le plancher de scale voisin est
annoncé « même garde-fou que l'overlay custom » alors qu'il vaut 0.5 contre 0.55.

## Correctif (218i)

Une seule source de vérité, dans `DeviceLayout` — le fichier qui possède déjà
tous les ratios de l'app :

```swift
/// Size of the window the app is actually rendered in.
static var windowSize: CGSize {
    for scene in UIApplication.shared.connectedScenes {
        guard let windowScene = scene as? UIWindowScene,
              windowScene.activationState == .foregroundActive else { continue }
        for window in windowScene.windows where window.isKeyWindow {
            return window.bounds.size
        }
        if let anyWindow = windowScene.windows.first {
            return anyWindow.bounds.size
        }
    }
    return UIScreen.main.bounds.size
}

/// Bubble cap for the conversation surfaces, which span the whole window.
static func bubbleMaxWidth(sizeClass: UserInterfaceSizeClass?) -> CGFloat {
    bubbleMaxWidth(containerWidth: windowSize.width, sizeClass: sizeClass)
}
```

La scène est résolue par **`activationState`**, jamais par `connectedScenes.first`
— `connectedScenes` est un **`Set` non ordonné**, `.first` peut renvoyer une
scène en arrière-plan (c'est le défaut B soldé par 215i/216i sur le partage,
ici évité d'emblée).

Le repli est **à deux étages, délibérément** : dans la scène de premier plan la
key window est préférée, mais **n'importe laquelle de ses fenêtres vaut mieux que
le display** — une scène dont aucune fenêtre n'est key pendant un instant (mise
en place de la scène) connaît quand même la place dont l'app dispose, et
retomber sur `UIScreen` à cet endroit réintroduirait exactement le bug corrigé
ici. Le display n'intervient que si **aucune scène de premier plan n'existe**,
c'est-à-dire quand aucun layout n'a lieu.

Écrit en **boucle avec sortie anticipée** plutôt qu'en
`compactMap { … }.first { … }` : cette chaîne alloue un tableau intermédiaire à
**chaque appel**, et l'appel a lieu dans le `body` d'une cellule de la liste de
messages — la liste la plus chaude de l'app. La règle du dépôt (« keep body pure
and fast », `apps/ios/CLAUDE.md`) impose de rester sans allocation sur le chemin
nominal. La première version de ce correctif ne respectait pas cette règle ;
c'est la seule voie par laquelle il pouvait peser sur les temps du MainActor.

**La surcharge est le cœur du correctif, pas du sucre** : elle rend la mesure
correcte plus courte à écrire que la mauvaise. La forme explicite
`bubbleMaxWidth(containerWidth:sizeClass:)` reste la primitive — elle demeure
pure, donc directement testable, et reste la bonne réponse pour tout appelant
capable de mesurer son propre conteneur.

| Site | Après |
|---|---|
| `BubbleStandardLayout:516` | `DeviceLayout.bubbleMaxWidth(sizeClass: horizontalSizeClass)` |
| `MessageOverlayMenu:521` | idem (+ commentaire rectifié) |
| `MessageMenuPreviewContainer.maxHeight` | `DeviceLayout.windowSize.height * 0.62` (+ commentaires rectifiés) |

**Aucune constante visuelle n'est modifiée** : 0.70, 0.62, 560, 0.62 et les
planchers de scale sont identiques. L'itération corrige la **grandeur mesurée**,
pas le réglage.

## Changement de comportement, assumé

Plein écran (tout iPhone, iPad non partagé) : **fenêtre == display**, les trois
valeurs sont inchangées — l'itération est visuellement un no-op sur iPhone. Un
test le vérifie sur l'hôte de test, qui tourne plein écran.

Là où la fenêtre est plus petite que l'écran — Split View, Slide Over, Stage
Manager — les bulles retrouvent leur couloir et l'aperçu se remet à l'échelle.
C'est précisément le correctif.

## Hors périmètre (délibéré, et documenté dans le code)

- **`BubbleStandardLayout:564`** (`UIScreen.main.bounds.width * UIScreen.main.scale`)
  reste sur l'**écran** : c'est un **budget de décodage** d'image, pas une
  métrique de layout. Sur-décoder est invisible, sous-décoder ne l'est pas, et
  la fenêtre peut grandir jusqu'à l'écran (Stage Manager) après le choix de la
  variante. Un commentaire l'inscrit dans le code pour qu'un balayage futur ne
  le « corrige » pas à l'aveugle.
- **`StoryViewerView.windowSize`** — même logique, candidate évidente à la
  délégation vers `DeviceLayout.windowSize`. **Surface chaude** : 5 commits en
  10 jours. Leçon `tasks/lessons.md` : ne pas ré-attaquer une surface chaude.
  → 219i.
- **`ConversationView:338`, `RootView:551/556`, `ComposerModels:190`,
  `IslandEmergingBanner:62`** — quatre autres résolutions de key window
  dupliquées, à faire converger vers le même SSOT. → 219i+.
- **`StatusBubbleOverlay`** — détenu par la PR #2326 (217i), exclu.

## Test

`apps/ios/MeeshyTests/Unit/Views/BubbleWindowMetricsTests.swift` (neuf).
8 tests / 20 assertions :

1. **Nominal** — `bubbleMaxWidth(320, .compact) == 224`, couloir de 96 pt, donc
   **strictement plus large** que le `Spacer(minLength: 50)` de la rangée :
   l'assertion prouve que le couloir est piloté par le ratio (une décision de
   design) et non par le plancher de secours.
2. **Le défaut, en une assertion** — `bubbleMaxWidth(1366, .compact) = 956 > 320` :
   un plafond plus large que la fenêtre qu'il régit est inerte.
3. **Largeur regular** — le plafond de 560 pt sature et occupe **> 80 %** d'une
   fenêtre de 683 pt, contre les 62 % de la règle.
4. **Parité plein écran** — `windowSize == UIScreen.main.bounds` sur l'hôte de
   test : les sites migrés conservent leurs valeurs, l'iPhone ne bouge pas.
5. **La surcharge délègue** (compact + regular) — une seule formule, pas deux.
6-8. **Verrou SSOT** sur les 4 fichiers : les 3 appelants ne mentionnent plus
   `UIScreen.main` (ni `bubbleMaxWidth(containerWidth: UIScreen`), et
   `DeviceLayout` en conserve **exactement une** occurrence — le repli documenté
   — ce qui en fait une source unique plutôt qu'une quatrième copie. Le verrou
   contrôle aussi que la scène est choisie par `activationState`/`isKeyWindow`.

Les lignes de commentaire sont retirées avant correspondance : les doc-comments
nomment volontairement l'API proscrite pour expliquer pourquoi elle l'est, et un
garde qui trébuche sur sa propre justification est un garde qu'on supprime.

**RED prouvé contre `main` `e0a6224`** : **9/9** assertions de verrou de source
échouent. Les autres portent sur `DeviceLayout.windowSize` et la surcharge, qui
n'existent pas sur `main` — la suite n'y compile pas ; la divergence de valeurs
est donc démontrée *à l'intérieur* des tests 2 et 3, qui écrivent côte à côte la
mesure écran et la mesure fenêtre.

## Vérification

- Pas de toolchain Swift (Linux) → les **9 assertions de source** ont été
  rejouées par correspondance de chaînes contre l'arbre courant (9/9 vertes) et
  contre `origin/main` (9/9 rouges) ; les **valeurs arithmétiques** ont été
  recalculées indépendamment (224 / 96 / 956.2 / 560 / 423.46 / 0.8199) —
  conformes aux 6 assertions numériques. Équilibre
  accolades / parenthèses / crochets des **5** fichiers au tokenizer (chaînes
  puis commentaires retirés dans le bon ordre) : **0 / 0 / 0**.
- `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` sur la cible app → `windowSize`
  et la surcharge sont main-actor, comme leurs appelants (corps de `View`) ;
  la cible de test est `nonisolated` par défaut, la classe opte donc
  explicitement pour `@MainActor` comme ses sœurs.
- Les tests sont hébergés dans `Meeshy.app` (`TEST_HOST`) → `UIApplication.shared`
  est atteignable, l'assertion de parité plein écran a bien une fenêtre à lire.
- Aucun test existant ne référençait `bubbleMaxWidth`,
  `MessageMenuPreviewContainer` (hors garde de nom) ni `windowSize`.
- Fichier de test **neuf** → enregistré par `xcodegen generate` en CI (globbing
  récursif), **0 édition de `project.pbxproj`**. Nom de classe contenant
  « Bubble » → phase 2 de `meeshy.sh test` (`FINAL_PHASE_CLASS_PATTERN`).

Gate réel = CI `iOS Tests`.

## Bilan

**4 fichiers de production : +57 / −10 lignes** (net +47, dont ~35 de doc-comment).
1 SSOT de fenêtre créé, 3 lectures de l'écran physique déprécié supprimées des
métriques de layout, 1 lecture délibérée documentée pour qu'elle ne soit pas
balayée, 3 commentaires factuellement faux rectifiés. **0 clé i18n, 0 couleur,
0 constante visuelle, 0 logique métier, 0 appel réseau.**

## Piste 219i+

1. Faire converger les **5 résolutions de key window restantes**
   (`StoryViewerView` ×2, `ConversationView`, `RootView` ×2, `ComposerModels`,
   `IslandEmergingBanner`) sur `DeviceLayout.windowSize`. `StoryViewerView`
   d'abord **si la surface story a refroidi** — sinon commencer par les autres.
2. `StatusComposerView` `NavigationView` → `NavigationStack` dès #2275
   mergée/close, puis réduire l'attendu de `NavigationContainerMigrationTests` à
   l'ensemble vide.
3. Câbler un `Localizable.xcstrings` à `MeeshyShareExtension` (3 chaînes crues)
   dès #2319 résolue.
4. `sensoryFeedback` (iOS 17+) : **0 usage** contre 11 `UIImpactFeedbackGenerator`
   — adoption native à évaluer sous garde de disponibilité (plancher iOS 16).
5. **Ne plus re-flagger** : `ImageDownsamplingConfig` / `BubbleStandardLayout+Media`
   (`UIScreen.main.scale`, identique sur toutes les fenêtres d'un appareil) ;
   `RecentMediaStrip.compactCell` (délibéré, documenté) ;
   `BubbleStandardLayout:564` (budget de décodage, désormais documenté).
