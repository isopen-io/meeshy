import XCTest
@testable import Meeshy

/// **La pastille de synchronisation se pose dans la bande de la barre d'état,
/// hors du contenu** (#9680) — et cette position se décide à UN endroit pour
/// les quatre hôtes (#5835, #5941, #5944).
final class SyncPillPlacementTests: XCTestCase {

    private let islandInsets: [CGFloat] = [59, 62]
    private let notchInsets: [CGFloat] = [44, 47, 48, 50]

    private func top(_ safeAreaTop: CGFloat, pad: Bool = false) -> CGFloat {
        SyncPillPlacement.topOffset(safeAreaTop: safeAreaTop, isPad: pad)
    }

    private func bottom(_ safeAreaTop: CGFloat, pad: Bool = false) -> CGFloat {
        top(safeAreaTop, pad: pad) + SyncPillMetrics.height
    }

    func test_band_followsTheDevice() {
        for inset in islandInsets + notchInsets {
            XCTAssertEqual(SyncPillPlacement.band(safeAreaTop: inset, isPad: false), .underSensorHousing,
                           "un iPhone à capteur (encart \(inset)) pose la pastille sous l'îlot / l'encoche")
        }
        XCTAssertEqual(SyncPillPlacement.band(safeAreaTop: 20, isPad: false), .belowStatusBar,
                       "iPhone à bouton : l'heure occupe le centre de la barre d'état")
        XCTAssertEqual(SyncPillPlacement.band(safeAreaTop: 0, isPad: false), .belowStatusBar,
                       "paysage, barre d'état masquée")
        XCTAssertEqual(SyncPillPlacement.band(safeAreaTop: 24, isPad: true), .statusBarCenter,
                       "iPad : le centre de la barre d'état est libre")
        XCTAssertEqual(SyncPillPlacement.band(safeAreaTop: 0, isPad: true), .belowStatusBar)
    }

    /// Sous l'îlot : JAMAIS derrière le capteur (qui la masquerait), et la
    /// pastille tient dans la bande au lieu de flotter dans le fil.
    func test_underSensorHousing_sitsJustBelowTheSensorAndAboveTheContent() {
        for inset in islandInsets + notchInsets {
            XCTAssertGreaterThan(top(inset), inset - SyncPillPlacement.sensorToSafeAreaGap,
                                 "encart \(inset) : la pastille passerait derrière le capteur")
            XCTAssertLessThanOrEqual(top(inset), inset,
                                     "encart \(inset) : elle doit monter jusqu'au haut de la zone sûre, pas rester dans le contenu")
        }
    }

    /// #5835 et #5941 : le titre des écrans à en-tête flottant et les boutons
    /// du chrome de conversation commencent à `safeAreaTop + 8` au plus tôt —
    /// la pastille s'arrête avant le titre, et ne mord sur une cible tactile
    /// que de son bord haut.
    func test_underSensorHousing_neverReachesAHeaderTitle() {
        for inset in islandInsets + notchInsets {
            XCTAssertLessThanOrEqual(bottom(inset) - inset, SyncPillPlacement.maximumIntrusionIntoSafeArea)
        }
        XCTAssertLessThanOrEqual(SyncPillPlacement.maximumIntrusionIntoSafeArea, 16,
                                 "un titre d'en-tête (64 pt, centré) commence au-delà de 16 pt sous la zone sûre")
    }

    /// L'ancienne position, mesurée : 72 pt sous la zone sûre à la racine,
    /// 122 en conversation. Elle doit être remontée d'au moins sa hauteur
    /// partout — c'est la demande.
    func test_isHigherThanEveryFormerMount() {
        for inset in islandInsets {
            XCTAssertLessThan(top(inset) + SyncPillMetrics.height, inset + 8 + SyncPillMetrics.height,
                              "plus haut que l'ancienne assise minimale (8 pt sous la zone sûre)")
            XCTAssertLessThan(top(inset), inset + 72 - SyncPillMetrics.height)
        }
    }

    func test_onIPad_isCenteredInsideTheStatusBar() {
        let inset: CGFloat = 24
        XCTAssertGreaterThanOrEqual(top(inset, pad: true), 0)
        XCTAssertLessThanOrEqual(bottom(inset, pad: true), inset,
                                 "sur iPad la pastille tient DANS la barre d'état, au-dessus de tout contenu")
    }

    func test_belowStatusBar_neverCoversTheClock() {
        XCTAssertGreaterThanOrEqual(top(20), 20, "iPhone à bouton : l'heure est au centre, la pastille passe dessous")
        XCTAssertGreaterThanOrEqual(top(0), 0)
        XCTAssertLessThanOrEqual(top(20), 20 + 8)
    }

    // MARK: - Mesure de l'encart dans le repère de l'ÉCRAN (recette 2026-10-08)

    private let iPhone17Pro = CGRect(x: 0, y: 0, width: 402, height: 874)
    private let iPhone17ProSafe = CGRect(x: 0, y: 62, width: 402, height: 778)

    /// Le défaut constaté : un lecteur qui ignore la zone sûre rapporte 0, et
    /// la pastille se posait à y = 1, sous l'îlot (y = 11…48). L'écart des deux
    /// cadres rend l'encart réel.
    func test_screenSafeAreaTop_readsTheFrameGap_whenTheReportedInsetIsZero() {
        XCTAssertEqual(
            SyncPillPlacement.screenSafeAreaTop(container: iPhone17Pro, safeRegion: iPhone17ProSafe, reportedTop: 0),
            62
        )
    }

    func test_onAnIslandIPhone_withAZeroReportedInset_thePillClearsTheIsland() {
        let top = SyncPillPlacement.topOffset(
            container: iPhone17Pro, safeRegion: iPhone17ProSafe, reportedTop: 0, isPad: false
        )
        XCTAssertGreaterThanOrEqual(top, 48, "le bas de l'îlot de l'iPhone 17 Pro est à y = 48")
        XCTAssertLessThanOrEqual(top + SyncPillMetrics.height, 62 + SyncPillPlacement.maximumIntrusionIntoSafeArea)
    }

    /// Mesure ratée (transitoire, ou hôte qui a consommé la zone sûre) : un
    /// iPhone en portrait n'a JAMAIS un encart haut nul. La pastille ne se pose
    /// ni sous l'îlot (y = 1, recette du 2026-10-08) ni nulle part (une version
    /// qui attendait la passe suivante ne s'affichait plus) : elle reste
    /// visible, sous le plus haut des îlots.
    func test_aZeroMeasure_onAPortraitIPhone_stillShowsThePillBelowTheIsland() {
        let top = SyncPillPlacement.topOffset(
            container: iPhone17Pro, safeRegion: iPhone17Pro, reportedTop: 0, isPad: false
        )
        XCTAssertGreaterThanOrEqual(top, 48, "sous l'îlot, jamais dessous")
        XCTAssertLessThan(top, 80, "et toujours dans le haut de l'écran")
    }

    func test_landscapeIPhone_withoutStatusBar_stillShowsThePill() {
        let landscape = CGRect(x: 0, y: 0, width: 874, height: 402)
        XCTAssertEqual(SyncPillPlacement.topOffset(
            container: landscape, safeRegion: landscape, reportedTop: 0, isPad: false
        ), 1)
    }

    /// Conteneur poussé vers le bas (bannière du joueur) : aucun capteur
    /// au-dessus de lui, la pastille se pose en haut du conteneur.
    func test_aContainerPushedDown_hasNoSensorAboveIt() {
        let pushed = CGRect(x: 0, y: 96, width: 402, height: 778)
        XCTAssertEqual(SyncPillPlacement.screenSafeAreaTop(container: pushed, safeRegion: pushed, reportedTop: 0), 0)
        XCTAssertEqual(SyncPillPlacement.topOffset(
            container: pushed, safeRegion: pushed, reportedTop: 0, isPad: false
        ), 1)
    }
}
