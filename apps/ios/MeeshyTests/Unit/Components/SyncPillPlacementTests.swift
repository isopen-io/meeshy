import XCTest
@testable import Meeshy

/// **La pastille de synchronisation se pose sous la zone sûre, décollée du
/// capteur, et elle a grandi** (#10371, retour porteur 2026-10-12 : « trop proche
/// de la Dynamic Island […] redescendre d'environ 2 fois la hauteur de ce
/// composant […] augmenter sa taille d'environ 1,6 fois »). La règle supplante
/// celle de #9680 (« dans la bande de la barre d'état ») ; elle se décide toujours
/// à UN endroit pour tous les hôtes (#5835, #5941, #5944).
final class SyncPillPlacementTests: XCTestCase {

    private let islandInsets: [CGFloat] = [59, 62]
    private let notchInsets: [CGFloat] = [44, 47, 48, 50]

    /// La pose de #9680, gelée ici pour mesurer la descente : juste sous le
    /// capteur, `safeAreaTop − 11 + 1`.
    private func formerTop(_ safeAreaTop: CGFloat) -> CGFloat {
        safeAreaTop - 11 + 1
    }

    private func top(_ safeAreaTop: CGFloat) -> CGFloat {
        SyncPillPlacement.topOffset(safeAreaTop: safeAreaTop)
    }

    // MARK: - La descente

    /// « Redescendre d'environ 2 fois la hauteur de ce composant » : 2 × 22 pt.
    func test_topOffset_onASensorIPhone_descendsTwiceTheFormerHeight() {
        for inset in islandInsets + notchInsets {
            XCTAssertEqual(top(inset) - formerTop(inset), 44, accuracy: 0.5,
                           "encart \(inset) : la pastille descend de 2 × 22 pt")
        }
    }

    /// Plus à cheval sur le haut de la zone sûre : elle se pose dessous, nettement.
    func test_topOffset_neverTouchesTheSensorBand() {
        for inset in islandInsets + notchInsets {
            XCTAssertGreaterThanOrEqual(top(inset) - inset, 30,
                                        "encart \(inset) : la pastille est décollée de l'îlot / l'encoche")
        }
    }

    /// iPad et iPhone à bouton d'accueil : la même règle, plus jamais dans la
    /// barre d'état (l'heure et la batterie y vivent).
    func test_topOffset_onIPadAndHomeButtonIPhone_followsTheSameRule() {
        for inset: CGFloat in [20, 24] {
            XCTAssertGreaterThan(top(inset), inset, "encart \(inset) : sous la barre d'état, jamais dedans")
            XCTAssertEqual(top(inset) - inset, SyncPillPlacement.seatBelowSafeArea)
        }
        let container = CGRect(x: 0, y: 0, width: 1024, height: 1366)
        let safe = CGRect(x: 0, y: 24, width: 1024, height: 1322)
        XCTAssertEqual(SyncPillPlacement.topOffset(container: container, safeRegion: safe, reportedTop: 0, isPad: true),
                       24 + SyncPillPlacement.seatBelowSafeArea)
    }

    // MARK: - La taille

    /// « Augmenter sa taille d'environ 1,6 fois sa taille initiale (hauteur) ».
    func test_height_isAboutOnePointSixTimesTheFormerPill() {
        XCTAssertEqual(SyncPillMetrics.height / SyncPillPlacement.formerPillHeight, 1.6, accuracy: 0.05)
    }

    /// La hauteur déclarée est celle que les mesures rendent : une ligne de texte
    /// (≈ 1,2 × la taille de police) et la marge verticale des deux côtés.
    func test_height_matchesTheRenderedMeasures() {
        let line = (SyncPillMetrics.labelSize * 1.2).rounded()
        XCTAssertEqual(line + 2 * SyncPillMetrics.verticalPadding, SyncPillMetrics.height, accuracy: 1.5)
    }

    // MARK: - Mesure de l'encart dans le repère de l'ÉCRAN (recette 2026-10-08)

    private let iPhone17Pro = CGRect(x: 0, y: 0, width: 402, height: 874)
    private let iPhone17ProSafe = CGRect(x: 0, y: 62, width: 402, height: 778)

    /// Un lecteur qui ignore la zone sûre rapporte 0 : l'écart des deux cadres
    /// rend l'encart réel.
    func test_screenSafeAreaTop_readsTheFrameGap_whenTheReportedInsetIsZero() {
        XCTAssertEqual(
            SyncPillPlacement.screenSafeAreaTop(container: iPhone17Pro, safeRegion: iPhone17ProSafe, reportedTop: 0),
            62
        )
    }

    func test_onAnIslandIPhone_withAZeroReportedInset_thePillSitsBelowTheSafeArea() {
        let top = SyncPillPlacement.topOffset(
            container: iPhone17Pro, safeRegion: iPhone17ProSafe, reportedTop: 0, isPad: false
        )
        XCTAssertEqual(top, 62 + SyncPillPlacement.seatBelowSafeArea)
    }

    /// Mesure ratée sur un iPhone en portrait : la pastille ne remonte pas sous
    /// l'îlot, elle prend l'encart du plus haut des îlots.
    func test_aZeroMeasure_onAPortraitIPhone_stillSitsBelowTheIsland() {
        let top = SyncPillPlacement.topOffset(
            container: iPhone17Pro, safeRegion: iPhone17Pro, reportedTop: 0, isPad: false
        )
        XCTAssertEqual(top, SyncPillPlacement.unmeasuredPortraitInset + SyncPillPlacement.seatBelowSafeArea)
    }

    func test_landscapeIPhone_withoutStatusBar_stillShowsThePill() {
        let landscape = CGRect(x: 0, y: 0, width: 874, height: 402)
        XCTAssertEqual(SyncPillPlacement.topOffset(
            container: landscape, safeRegion: landscape, reportedTop: 0, isPad: false
        ), SyncPillPlacement.seatBelowSafeArea)
    }

    /// Conteneur poussé vers le bas (bannière du joueur) : aucun capteur
    /// au-dessus de lui, encart nul.
    func test_aContainerPushedDown_hasNoSensorAboveIt() {
        let pushed = CGRect(x: 0, y: 96, width: 402, height: 778)
        XCTAssertEqual(SyncPillPlacement.screenSafeAreaTop(container: pushed, safeRegion: pushed, reportedTop: 0), 0)
        XCTAssertEqual(SyncPillPlacement.topOffset(
            container: pushed, safeRegion: pushed, reportedTop: 0, isPad: false
        ), SyncPillPlacement.seatBelowSafeArea)
    }
}
