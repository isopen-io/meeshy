# Le cadre et le plateau (#6141) — plan d'implémentation

> **Pour un exécutant agentique :** SOUS-COMPÉTENCE REQUISE — `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans`, tâche par tâche. Les étapes sont des cases à cocher (`- [ ]`).

**But :** un média de conversation se lit dans un cadre arrondi centré, et le plateau qui l'entoure — deux couloirs, haut et bas — porte ses contrôles et le rail des autres médias.

**Architecture :** un solveur de géométrie PUR (`MediaStageFraming`, SDK core, `nonisolated`) rend les cotes du cadre ET du média, qui diffèrent dès que le plancher de hauteur mord. La galerie média iOS le consomme et cesse de dimensionner à la main. Aucune vue n'est créée : la géographie existante est redéployée sur les valeurs du solveur.

**Pile :** Swift 6.2, SwiftUI, XCTest (app) + Swift Testing / XCTest (SDK), simulateur iPhone 16 Pro iOS 18.2.

**Spec :** `docs/superpowers/specs/2026-09-12-lecture-media-plateau-design.md`

## Contraintes globales

Copiées de la spec et du `CLAUDE.md` ; elles s'appliquent à **toutes** les tâches.

- **TDD non négociable** : aucune ligne de production sans témoin ROUGE d'abord. RED → GREEN → REFACTOR.
- **Budget de taille : 1 000–1 200 lignes par fichier.** Plafond DUR à 1 200. **Ajouter à un fichier déjà hors budget est interdit** — on extrait d'abord. `ConversationMediaGalleryView.swift` est à 980 lignes : il reste ~220 lignes de marge, et ce plan la consomme partiellement. Vérifier `wc -l` avant chaque commit.
- **Pas de `any`, pas de force-unwrap, immutabilité par défaut**, pas de commentaire qui paraphrase le code.
- **SDK Purity** : `MediaStageFraming` prend des paramètres opaques, ne lit aucun singleton Meeshy, n'encode aucune décision « quand faire X » → **SDK core**. L'orchestration (quelle surface, quand) reste app-side.
- **`MeeshySDK` et non `MeeshyUI`** : `MeeshyUI` compile sous `defaultIsolation: MainActor`, donc la conformance `Equatable` d'un type qui y naît n'est plus comparable depuis une suite non isolée (« main actor-isolated conformance … cannot be used in nonisolated context »). Précédent écrit dans `StoryLetterboxFill.swift`.
- **Aucun nombre magique dans une vue** : toute cote vient du solveur ou d'une table nommée.
- **Build** : toujours `./apps/ios/meeshy.sh`, jamais `xcodebuild` directement, sauf pour la repro CI documentée.
- **Un commit par tâche**, message en français, sujet impératif, corps expliquant le POURQUOI.

## Les cotes de référence (iPhone 16 Pro, 390 × 844 pt)

Une seule table, dérivée de la spec § 2.1. Tous les nombres du plan en descendent.

| cote | valeur | d'où elle vient |
|---|---|---|
| `safeTop` | 59 | safe area haute |
| `top` | 56 | couloir haut (✕ · ⋯), cible 44 + marge |
| `rail` | **80** | `FilmstripMetrics.reservedHeight` — **mesuré, pas choisi** : `itemSide 54 + verticalPadding 2×10 + bottomPadding 6` |
| `safeBottom` | 34 | safe area basse |
| `gutter` | 12 | marge latérale ET jeu vertical |
| `minimumFrameHeight` | 330 | **dérivée** : 3 × la hauteur de l'overlay (~110) |
| `cardedCornerRadius` | 22 | rayon du cadre |

> **Le rail vaut 80 et non 84.** La maquette avait posé 84 à l'estime ; la pellicule réelle en réserve 80, et cette valeur est déjà une constante nommée (`FilmstripMetrics.reservedHeight`, `ConversationMediaFilmstrip.swift:56`). **L'app passe la constante au solveur, elle ne recopie pas le nombre** — sans quoi changer la taille d'une vignette désaccorderait silencieusement le cadre et le rail.

Zone libre : `844 − 59 − 56 − 80 − 34 − 12 = 603` de haut, `390 − 2×12 = 366` de large.

Ce que le solveur doit rendre, calculé à la main pour servir de témoin :

| ratio | cadré : cadre | cadré : média | plein : cadre | plein : média |
|---|---|---|---|---|
| 4:5 (0,8) | 366 × 457,5 | 366 × 457,5 | 390 × 844 | 390 × 487,5 |
| 16:9 (1,778) | **366 × 330** | 366 × 205,875 | 390 × 844 | 390 × 219,375 |
| 9:16 (0,5625) | 339,19 × 603 | 339,19 × 603 | 390 × 844 | 390 × 693,33 |

> **Aucune de ces six lignes ne remplit son cadre en plein écran — pas même la 9:16.** L'écran d'un iPhone 16 Pro est en **0,462**, plus étroit que le 0,5625 d'une scène : elle s'y arrête à 693 pt et laisse 75 pt en haut comme en bas. « Plein cadre » nomme le CADRE qui prend l'écran, jamais le média qui le remplirait — et c'est ce qui rend le hors-champ habillé (#6143) nécessaire sur **toutes** les natures, pas seulement sur les vidéos courtes.
>
> Cette ligne a d'abord été écrite `474,75 × 844` — un rognage, qui contredisait « ajusté puis centré, jamais rogné » posé trois paragraphes plus haut. C'est le témoin qui l'a attrapée, pas la relecture.

**Le 16:9 est la seule ligne où le plancher mord** — c'est donc le seul ratio sur lequel un témoin de plancher peut tomber. Et **le 4:5 en plein écran est la seule ligne qui prouve que le plein cadre fabrique son propre hors-champ** (média 488 dans un cadre de 844).

---

## Structure des fichiers

| fichier | responsabilité | tâche |
|---|---|---|
| `packages/MeeshySDK/Sources/MeeshySDK/Media/MediaStageFraming.swift` | **créer** — le solveur pur : couloirs → cadre + média | 1 |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Media/MediaStageFramingTests.swift` | **créer** — les témoins du solveur | 1 |
| `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift` | **modifier** — consomme le solveur, pose les deux couloirs | 2, 3 |
| `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+Pages.swift` | **modifier** — la page rend le média aux cotes du solveur | 3 |
| `apps/ios/MeeshyTests/Unit/Views/MediaGalleryStageGeometryTests.swift` | **créer** — les témoins de la galerie | 2, 3 |

---

## Tâche 1 : le solveur `MediaStageFraming`

**Fichiers :**
- Créer : `packages/MeeshySDK/Sources/MeeshySDK/Media/MediaStageFraming.swift`
- Test : `packages/MeeshySDK/Tests/MeeshySDKTests/Media/MediaStageFramingTests.swift`

**Interfaces :**
- Consomme : rien (première tâche). `CoreGraphics` seul.
- Produit, pour les tâches 2 et 3 :
  - `MediaStageFraming.Presentation` : `.carded` | `.full`
  - `MediaStageFraming.Corridors(safeTop:top:rail:safeBottom:gutter:)`
  - `MediaStageFraming.Input(viewport:mediaRatio:corridors:presentation:cardedCornerRadius:minimumFrameHeight:)`
  - `MediaStageFraming.Result` avec `frame: CGSize`, `media: CGSize`, `cornerRadius: CGFloat`, `letterboxes: Bool`
  - `MediaStageFraming.resolve(_ input: Input) -> Result`

- [ ] **Étape 1 : écrire les témoins ROUGES**

Créer `packages/MeeshySDK/Tests/MeeshySDKTests/Media/MediaStageFramingTests.swift` :

```swift
import XCTest
import CoreGraphics
@testable import MeeshySDK

/// **La loi de cadrage de la lecture : les couloirs d'abord, le cadre ensuite.**
///
/// Ces témoins ne montent aucune vue — le solveur est pur, donc tout ce qu'il
/// décide s'éprouve ici. Les valeurs attendues sont celles de la spec
/// (`docs/superpowers/specs/2026-09-12-lecture-media-plateau-design.md` § 2.1),
/// calculées à la main pour un iPhone 16 Pro.
final class MediaStageFramingTests: XCTestCase {

    // MARK: - Fabriques

    private static let viewport = CGSize(width: 390, height: 844)

    private func corridors() -> MediaStageFraming.Corridors {
        MediaStageFraming.Corridors(safeTop: 59, top: 56, rail: 84, safeBottom: 34, gutter: 12)
    }

    private func makeInput(
        ratio: CGFloat,
        presentation: MediaStageFraming.Presentation,
        viewport: CGSize = MediaStageFramingTests.viewport,
        minimumFrameHeight: CGFloat = 330
    ) -> MediaStageFraming.Input {
        MediaStageFraming.Input(
            viewport: viewport,
            mediaRatio: ratio,
            corridors: corridors(),
            presentation: presentation,
            cardedCornerRadius: 22,
            minimumFrameHeight: minimumFrameHeight
        )
    }

    // MARK: - Cadré : le cadre prend ce que les couloirs laissent

    func test_carded_portraitImage_fillsTheFreeWidth() {
        let r = MediaStageFraming.resolve(makeInput(ratio: 0.8, presentation: .carded))

        XCTAssertEqual(r.frame.width, 366, accuracy: 0.5,
                       "une 4:5 est contrainte par la LARGEUR : 390 − 2×12")
        XCTAssertEqual(r.frame.height, 457.5, accuracy: 0.5,
                       "366 / 0,8 — ajustée au ratio, jamais étirée")
        XCTAssertEqual(r.media, r.frame,
                       "sans plancher actif, le média remplit son cadre")
        XCTAssertFalse(r.letterboxes,
                       "un média qui remplit son cadre ne laisse aucune bande")
    }

    func test_carded_tallScene_losesWidthSoTheRailSurvives() {
        let r = MediaStageFraming.resolve(makeInput(ratio: 0.5625, presentation: .carded))

        XCTAssertEqual(r.frame.height, 599, accuracy: 0.5,
                       "une 9:16 est contrainte par la HAUTEUR : 844 − 59 − 56 − 84 − 34 − 12")
        XCTAssertEqual(r.frame.width, 336.9, accuracy: 0.5,
                       "599 × 0,5625 — elle perd de la largeur pour que le rail tienne")
        XCTAssertEqual(r.media, r.frame)
    }

    // MARK: - Le plancher — il ne mord QUE sur un cadre court

    func test_carded_wideVideo_frameStopsAtTheFloor_mediaDoesNot() {
        let r = MediaStageFraming.resolve(makeInput(ratio: 16.0 / 9.0, presentation: .carded))

        XCTAssertEqual(r.media.height, 205.875, accuracy: 0.5,
                       "le MÉDIA garde son ratio : 366 × 9/16")
        XCTAssertEqual(r.frame.height, 330, accuracy: 0.5,
                       "le CADRE s'arrête au plancher — trois fois la hauteur de l'overlay")
        XCTAssertEqual(r.frame.width, r.media.width, accuracy: 0.5,
                       "le plancher n'agit que sur la hauteur")
        XCTAssertTrue(r.letterboxes,
                      "un cadre plus haut que son média laisse deux bandes à habiller")
    }

    /// **Le témoin de plancher ne peut tomber que sur un cadre COURT.** Sur une
    /// 4:5 ou une 9:16, la règle juste et la règle absente rendent le même
    /// verdict — un témoin écrit là serait vert des deux côtés du diff.
    func test_carded_floorNeverShrinksATallFrame() {
        let r = MediaStageFraming.resolve(makeInput(ratio: 0.5625, presentation: .carded))

        XCTAssertEqual(r.frame.height, 599, accuracy: 0.5,
                       "le plancher est un MINIMUM, jamais un maximum")
        XCTAssertFalse(r.letterboxes)
    }

    func test_carded_floorNeverExceedsTheFreeRegion() {
        let r = MediaStageFraming.resolve(
            makeInput(ratio: 16.0 / 9.0, presentation: .carded, minimumFrameHeight: 5_000)
        )

        XCTAssertEqual(r.frame.height, 599, accuracy: 0.5,
                       "un plancher absurde est borné par la zone libre — jamais de cadre hors écran")
    }

    // MARK: - Plein cadre

    func test_full_frameTakesTheWholeViewport_andLosesItsRadius() {
        let r = MediaStageFraming.resolve(makeInput(ratio: 0.8, presentation: .full))

        XCTAssertEqual(r.frame, MediaStageFramingTests.viewport,
                       "en plein cadre, le cadre EST l'écran — les couloirs ne le bornent plus")
        XCTAssertEqual(r.cornerRadius, 0, accuracy: 0.01,
                       "un cadre qui touche les quatre bords n'a pas de coin à arrondir")
    }

    /// **Le plein cadre FABRIQUE son propre hors-champ.** Une 4:5 remplit son
    /// cadre en cadré (366 × 458) et flotte une fois l'écran pris (390 × 488
    /// dans 390 × 844). Conditionner le fond au letterbox du seul état cadré,
    /// c'est garantir du noir exactement là où on voulait l'éviter — défaut
    /// trouvé sur la maquette, et c'est ce témoin qui l'attrape.
    func test_full_portraitImage_letterboxesEvenThoughItFilledItsCard() {
        let carded = MediaStageFraming.resolve(makeInput(ratio: 0.8, presentation: .carded))
        let full = MediaStageFraming.resolve(makeInput(ratio: 0.8, presentation: .full))

        XCTAssertFalse(carded.letterboxes, "elle remplissait son cadre…")
        XCTAssertTrue(full.letterboxes, "…et elle ne remplit plus l'écran")
        XCTAssertEqual(full.media.width, 390, accuracy: 0.5)
        XCTAssertEqual(full.media.height, 487.5, accuracy: 0.5, "390 / 0,8")
    }

    func test_full_tallScene_isBoundedByHeight() {
        let r = MediaStageFraming.resolve(makeInput(ratio: 0.5625, presentation: .full))

        XCTAssertEqual(r.media.height, 844, accuracy: 0.5)
        XCTAssertEqual(r.media.width, 474.75, accuracy: 0.5,
                       "844 × 0,5625 — le média DÉBORDE la largeur, l'hôte le rogne")
    }

    // MARK: - Dégénérescences

    func test_zeroViewport_returnsZeroes_withoutCrashing() {
        let r = MediaStageFraming.resolve(makeInput(ratio: 0.8, presentation: .carded, viewport: .zero))

        XCTAssertEqual(r.frame, .zero)
        XCTAssertEqual(r.media, .zero)
        XCTAssertFalse(r.letterboxes)
    }

    func test_nonPositiveRatio_returnsZeroes_withoutDividingByZero() {
        let r = MediaStageFraming.resolve(makeInput(ratio: 0, presentation: .carded))

        XCTAssertEqual(r.frame, .zero)
        XCTAssertEqual(r.media, .zero)
    }

    func test_corridorsLargerThanTheScreen_neverProduceANegativeFrame() {
        let input = MediaStageFraming.Input(
            viewport: CGSize(width: 390, height: 200),
            mediaRatio: 0.8,
            corridors: corridors(),
            presentation: .carded,
            cardedCornerRadius: 22,
            minimumFrameHeight: 330
        )
        let r = MediaStageFraming.resolve(input)

        XCTAssertGreaterThanOrEqual(r.frame.height, 0)
        XCTAssertGreaterThanOrEqual(r.frame.width, 0)
    }
}
```

- [ ] **Étape 2 : lancer les témoins et vérifier qu'ils ÉCHOUENT**

```bash
cd /Users/smpceo/Documents/v2_meeshy-lecture-cadre
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/MediaStageFramingTests -quiet
```

Attendu : **échec de COMPILATION** — « cannot find 'MediaStageFraming' in scope ». C'est le rouge recherché ; ne pas le lire comme un test instable.

- [ ] **Étape 3 : écrire l'implémentation minimale**

Créer `packages/MeeshySDK/Sources/MeeshySDK/Media/MediaStageFraming.swift` :

```swift
import CoreGraphics

/// **La loi de cadrage de la LECTURE : les couloirs d'abord, le cadre ensuite.**
///
/// Un média ne se lit pas bord à bord sous un chrome flottant. Il se pose dans
/// un cadre arrondi centré, et le plateau qui l'entoure — deux couloirs, haut
/// et bas — porte tout ce qui n'est pas lui : la porte de sortie et le menu en
/// haut, le rail des autres médias en bas.
///
/// ## Pourquoi les couloirs sont réservés EN PREMIER
///
/// Parce que c'est ce qui rend l'équilibre indépendant du ratio. Une vidéo 16:9
/// et une scène 9:16 gardent exactement les mêmes couloirs ; seul le cadre
/// change de taille entre elles. Dimensionner d'abord le média et donner le
/// reste aux contrôles produirait l'inverse — un rail qui rétrécit quand le
/// média grandit, et qui finit par sortir de l'écran sur un 9:16.
///
/// ## Pourquoi DEUX cotes et non une
///
/// Le cadre et le média ne sont le même objet que lorsque le ratio remplit le
/// cadre. Dès que le plancher de hauteur mord — une 16:9 ne fait que 206 pt de
/// haut en pleine largeur — le cadre reste à 330 pt et le média flotte dedans.
/// Un solveur qui ne rendrait qu'une taille obligerait chaque hôte à recalculer
/// l'autre, donc à réimplémenter la règle.
///
/// Le plancher se DÉRIVE : il vaut trois fois la hauteur de l'overlay posé sur
/// le cadre, pour que celui-ci n'en couvre jamais plus du tiers. Il est passé en
/// entrée plutôt que codé ici — c'est l'hôte qui connaît son overlay.
///
/// ## Placement
///
/// Dans `MeeshySDK` et non `MeeshyUI`, pour la raison que `StoryLetterboxFill`
/// documente déjà : `MeeshyUI` compile sous `defaultIsolation: MainActor`, donc
/// la conformance `Equatable` d'un type qui y naît est isolée au `MainActor` et
/// une suite non isolée ne peut plus comparer ses valeurs. Un moteur de règles
/// sans état est un atome — donc du SDK core.
public nonisolated enum MediaStageFraming {

    /// Les deux états de la lecture. `.full` n'est pas « le cadre en plus
    /// grand » : c'est l'écran entier, coins droits, couloirs ignorés.
    public enum Presentation: Equatable, Sendable { case carded, full }

    /// Ce que le plateau réserve AVANT que le cadre ne prenne le reste.
    public struct Corridors: Equatable, Sendable {
        public let safeTop: CGFloat
        public let top: CGFloat
        public let rail: CGFloat
        public let safeBottom: CGFloat
        /// Marge latérale de chaque côté, ET jeu vertical entre le cadre et le rail.
        public let gutter: CGFloat

        public init(safeTop: CGFloat, top: CGFloat, rail: CGFloat,
                    safeBottom: CGFloat, gutter: CGFloat) {
            self.safeTop = safeTop; self.top = top; self.rail = rail
            self.safeBottom = safeBottom; self.gutter = gutter
        }

        var reservedHeight: CGFloat { safeTop + top + rail + safeBottom + gutter }
    }

    public struct Input: Equatable, Sendable {
        public let viewport: CGSize
        /// largeur / hauteur. `<= 0` ⇒ le solveur rend des zéros plutôt que
        /// de diviser par zéro.
        public let mediaRatio: CGFloat
        public let corridors: Corridors
        public let presentation: Presentation
        public let cardedCornerRadius: CGFloat
        public let minimumFrameHeight: CGFloat

        public init(viewport: CGSize, mediaRatio: CGFloat, corridors: Corridors,
                    presentation: Presentation, cardedCornerRadius: CGFloat,
                    minimumFrameHeight: CGFloat) {
            self.viewport = viewport; self.mediaRatio = mediaRatio
            self.corridors = corridors; self.presentation = presentation
            self.cardedCornerRadius = cardedCornerRadius
            self.minimumFrameHeight = minimumFrameHeight
        }
    }

    public struct Result: Equatable, Sendable {
        /// Le cadre arrondi — ce qui se peint, et ce que l'overlay habille.
        public let frame: CGSize
        /// Le média DANS ce cadre. Égal au cadre quand le ratio le remplit.
        public let media: CGSize
        public let cornerRadius: CGFloat

        public init(frame: CGSize, media: CGSize, cornerRadius: CGFloat) {
            self.frame = frame; self.media = media; self.cornerRadius = cornerRadius
        }

        /// **Y a-t-il du hors-champ à habiller ?** La question se pose dans les
        /// DEUX états : le plein cadre fabrique le sien, même pour un média qui
        /// remplissait sa carte.
        public var letterboxes: Bool {
            guard frame.width > 0, frame.height > 0 else { return false }
            return media.width < frame.width - 0.5 || media.height < frame.height - 0.5
        }

        static let zero = Result(frame: .zero, media: .zero, cornerRadius: 0)
    }

    public static func resolve(_ input: Input) -> Result {
        guard input.mediaRatio > 0,
              input.viewport.width > 0, input.viewport.height > 0 else { return .zero }

        switch input.presentation {
        case .full:
            let media = aspectFit(ratio: input.mediaRatio, in: input.viewport)
            return Result(frame: input.viewport, media: media, cornerRadius: 0)

        case .carded:
            let regionWidth = max(0, input.viewport.width - 2 * max(0, input.corridors.gutter))
            let regionHeight = max(0, input.viewport.height - input.corridors.reservedHeight)
            guard regionWidth > 0, regionHeight > 0 else { return .zero }

            let region = CGSize(width: regionWidth, height: regionHeight)
            let media = aspectFit(ratio: input.mediaRatio, in: region)

            // Le plancher est un MINIMUM, jamais un maximum : il ne rabote
            // aucun cadre haut, et il reste borné par la zone libre — un
            // plancher plus grand que l'écran pousserait le rail dehors.
            let floored = min(max(media.height, input.minimumFrameHeight), regionHeight)
            let frame = CGSize(width: media.width, height: floored)

            return Result(frame: frame, media: media, cornerRadius: input.cardedCornerRadius)
        }
    }

    /// Ajuste au ratio puis centre — jamais de rognage, jamais d'étirement.
    private static func aspectFit(ratio: CGFloat, in box: CGSize) -> CGSize {
        var height = box.height
        var width = height * ratio
        if width > box.width {
            width = box.width
            height = width / ratio
        }
        return CGSize(width: width, height: height)
    }
}
```

- [ ] **Étape 4 : lancer les témoins et vérifier qu'ils PASSENT**

```bash
cd /Users/smpceo/Documents/v2_meeshy-lecture-cadre
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/MediaStageFramingTests -quiet
```

Attendu : **11 tests verts**. Lire le journal, pas seulement le code de sortie — `** TEST SUCCEEDED **` doit apparaître.

Si `test_full_tallScene_isBoundedByHeight` échoue en rendant 390 de large : `aspectFit` a été écrit en partant de la largeur au lieu de la hauteur. La 9:16 en plein écran DÉBORDE volontairement (474,75 pt pour un écran de 390) — c'est l'hôte qui rogne, pas le solveur.

- [ ] **Étape 5 : vérifier le budget de taille**

```bash
wc -l packages/MeeshySDK/Sources/MeeshySDK/Media/MediaStageFraming.swift
```

Attendu : bien sous 1 000. Si le fichier approchait le plafond, extraire `Corridors` dans son propre fichier — pas avant.

- [ ] **Étape 6 : commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-lecture-cadre
git add packages/MeeshySDK/Sources/MeeshySDK/Media/MediaStageFraming.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Media/MediaStageFramingTests.swift
git commit -m "$(cat <<'EOF'
feat(sdk): le solveur du plateau de lecture rend le cadre ET le média (#6141)

Les couloirs sont réservés d'abord, le cadre prend ce qui reste : c'est ce qui
rend l'équilibre indépendant du ratio. Une 16:9 et une 9:16 gardent les mêmes
couloirs ; seul le cadre change de taille entre elles.

Le solveur rend DEUX cotes parce que le cadre et le média ne sont le même objet
que lorsque le ratio remplit le cadre. Dès que le plancher mord — une 16:9 ne
fait que 206 pt de haut en pleine largeur — le cadre reste à 330 et le média
flotte dedans. Une seule taille obligerait chaque hôte à recalculer l'autre,
donc à réimplémenter la règle.

Le plancher est passé en entrée, pas codé dans le solveur : il vaut trois fois
la hauteur de l'overlay, et c'est l'hôte qui connaît son overlay.

Deux témoins portent la charge et aucun des deux ne pouvait s'écrire ailleurs :
le plancher ne se prouve que sur un cadre COURT (sur une 4:5 ou une 9:16, la
règle juste et la règle absente rendent le même verdict), et le hors-champ ne
se prouve que sur l'état PLEIN — une 4:5 remplit sa carte et ne flotte qu'une
fois l'écran pris.

Placé dans MeeshySDK et non MeeshyUI : ce dernier compile sous
defaultIsolation MainActor, donc une conformance Equatable qui y naît n'est
plus comparable depuis une suite non isolée.

Refs #6141
EOF
)"
```

---

*Les tâches 2 et 3 — la consommation par la galerie média — sont écrites après le relevé du code existant, pour que chaque étape cite la ligne réelle à modifier plutôt qu'une approximation.*
