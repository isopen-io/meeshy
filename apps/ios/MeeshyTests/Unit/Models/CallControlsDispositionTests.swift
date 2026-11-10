import CoreGraphics
import XCTest
@testable import Meeshy

/// #17327 — où se rangent les actions du (…) selon le nombre de participants :
/// À DEUX, deux rails sur les bords (« mon image » à gauche, « l'appel » à droite,
/// la pilule ne grandit pas) ; À PLUSIEURS, deux rangées légendées DANS la pilule
/// (aucun rail par-dessus la grille, aucune vignette masquée). Une seule forme par
/// disposition, et le passage de deux à trois en cours d'appel ne touche pas à
/// l'état du (…).
@MainActor
final class CallControlsDispositionTests: XCTestCase {

    private func actions(isVideoEnabled: Bool = true) -> CallActionSet {
        CallActionSet.resolve(CallActionContext(
            isOnMac: false,
            isVideoEnabled: isVideoEnabled,
            hasSelectableCameras: false,
            isConnected: true,
            mayRecord: true,
            canPictureInPicture: false
        ))
    }

    // MARK: - Le nombre de participants choisit la disposition

    func test_resolve_aDuo_isRails() {
        XCTAssertEqual(CallControlsDisposition.resolve(participantCount: 2), .rails)
    }

    func test_resolve_aloneWhileWaiting_isRails() {
        XCTAssertEqual(CallControlsDisposition.resolve(participantCount: 1), .rails)
    }

    func test_resolve_threeOrMore_isRows() {
        XCTAssertEqual(CallControlsDisposition.resolve(participantCount: 3), .rows)
        XCTAssertEqual(CallControlsDisposition.resolve(participantCount: 8), .rows)
    }

    /// #9085 — la grille remplace l'écran 1:1 dès qu'un membre est tenu par le maillage,
    /// même à deux : des rails par-dessus elle masqueraient ses vignettes.
    func test_resolve_aGridOnScreen_isRowsWhateverTheCount() {
        XCTAssertEqual(CallControlsDisposition.resolve(participantCount: 2, showsGroupGrid: true), .rows)
    }

    // MARK: - Les rails du duo

    func test_rails_menuOpen_aRailPerFamily_myImageThenTheCall() {
        let rows = CallControlsDisposition.rails.rails(actions(), layer: .menu)
        XCTAssertEqual(rows.map(\.family), [.myImage, .theCall])
    }

    func test_rails_menuClosed_noRailLeaves() {
        XCTAssertTrue(CallControlsDisposition.rails.rails(actions(), layer: .idle).isEmpty)
    }

    func test_rails_aModeFreesTheScreen_noRail() {
        XCTAssertTrue(CallControlsDisposition.rails.rails(actions(), layer: .mode(.effects)).isEmpty)
    }

    /// Enregistrer et Réagir s'ouvrent DANS la pilule (morphisme) : les rails se retirent.
    func test_rails_anOptionDrawnInThePill_hidesTheRails() {
        XCTAssertTrue(CallControlsDisposition.rails.rails(actions(), layer: .panel(.react)).isEmpty)
        XCTAssertTrue(CallControlsDisposition.rails.rails(actions(), layer: .panel(.record)).isEmpty)
    }

    /// Ajouter et Journal s'ouvrent en feuille : les rails restent.
    func test_rails_aSheetPanel_keepsTheRails() {
        XCTAssertEqual(CallControlsDisposition.rails.rails(actions(), layer: .panel(.journal)).count, 2)
        XCTAssertEqual(CallControlsDisposition.rails.rails(actions(), layer: .panel(.people)).count, 2)
    }

    func test_rails_cameraOff_myImageKeepsOnlyCameraAndScreen() {
        let rows = CallControlsDisposition.rails.rails(actions(isVideoEnabled: false), layer: .menu)
        XCTAssertEqual(rows.first { $0.family == .myImage }?.actions, [.camera, .screenShare])
    }

    func test_rails_cameraOn_myImageIsCameraFlipEffectsScreen() {
        let rows = CallControlsDisposition.rails.rails(actions(), layer: .menu)
        XCTAssertEqual(rows.first { $0.family == .myImage }?.actions, [.camera, .flipCamera, .effects, .screenShare])
    }

    func test_rails_theCall_isCaptionsRecordAddJournalReactCapture() {
        let rows = CallControlsDisposition.rails.rails(actions(), layer: .menu)
        XCTAssertEqual(rows.first { $0.family == .theCall }?.actions, [.captions, .recording, .addPeople, .journal, .react, .capture])
    }

    func test_railSide_myImageLeads_theCallTrails() {
        XCTAssertEqual(CallActionFamily.myImage.railSide, .leading)
        XCTAssertEqual(CallActionFamily.theCall.railSide, .trailing)
    }

    // MARK: - Les rangées du groupe

    func test_rows_menuOpen_theTwoLabelledRowsUnfoldInThePill() {
        let rows = CallControlsDisposition.rows.pillRows(actions(), layer: .menu)
        XCTAssertEqual(rows.map(\.family), [.myImage, .theCall])
        XCTAssertTrue(CallControlsDisposition.rows.unfoldsPill(for: .menu))
    }

    func test_rows_neverDrawsARailOverTheGrid() {
        for layer in [CallScreenLayer.idle, .menu, .panel(.journal), .panel(.react), .mode(.montage)] {
            XCTAssertTrue(CallControlsDisposition.rows.rails(actions(), layer: layer).isEmpty, "\(layer)")
        }
    }

    func test_rails_neverUnfoldsTheRowsOfThePill() {
        for layer in [CallScreenLayer.idle, .menu, .panel(.journal), .panel(.people)] {
            XCTAssertTrue(CallControlsDisposition.rails.pillRows(actions(), layer: layer).isEmpty, "\(layer)")
        }
    }

    /// « La pilule ne grandit pas » à deux : le (…) ouvert ne la déplie pas.
    func test_rails_menuOpen_thePillDoesNotGrow() {
        XCTAssertFalse(CallControlsDisposition.rails.unfoldsPill(for: .menu))
        XCTAssertFalse(CallControlsDisposition.rails.unfoldsPill(for: .idle))
    }

    /// Enregistrer / Réagir : la pilule grandit pour contenir l'option, en duo comme en groupe.
    func test_unfoldsPill_anOptionDrawnInThePill_growsItInBothDispositions() {
        XCTAssertTrue(CallControlsDisposition.rails.unfoldsPill(for: .panel(.react)))
        XCTAssertTrue(CallControlsDisposition.rows.unfoldsPill(for: .panel(.record)))
    }

    // MARK: - De deux à trois, l'état du (…) ne bouge pas

    func test_fromTwoToThree_theOpenMenuStaysOpen_andChangesShape() {
        let layer = CallScreenLayer.idle.togglingMenu()
        let set = actions()
        let duo = CallControlsDisposition.resolve(participantCount: 2)
        let group = CallControlsDisposition.resolve(participantCount: 3)
        XCTAssertEqual(duo.rails(set, layer: layer).map(\.family), [.myImage, .theCall])
        XCTAssertTrue(duo.pillRows(set, layer: layer).isEmpty)
        XCTAssertEqual(group.pillRows(set, layer: layer).map(\.family), [.myImage, .theCall])
        XCTAssertTrue(group.rails(set, layer: layer).isEmpty)
        XCTAssertEqual(layer.reconciled(with: set), .menu, "La disposition ne réécrit jamais l'état du (…)")
    }

    func test_fromThreeToTwo_aClosedMenuStaysClosed() {
        let set = actions()
        XCTAssertTrue(CallControlsDisposition.rows.pillRows(set, layer: .idle).isEmpty)
        XCTAssertTrue(CallControlsDisposition.rails.rails(set, layer: .idle).isEmpty)
    }

    func test_everyActionAppearsExactlyOnce_inEitherDisposition() {
        let set = actions()
        let onRails = CallControlsDisposition.rails.rails(set, layer: .menu).flatMap(\.actions)
        let inRows = CallControlsDisposition.rows.pillRows(set, layer: .menu).flatMap(\.actions)
        XCTAssertEqual(onRails, inRows)
        XCTAssertEqual(Set(onRails).count, onRails.count)
    }

    // MARK: - La géométrie des rails

    private typealias Layout = CallRailsLayout

    func test_rails_everyButtonIs44Points() {
        XCTAssertGreaterThanOrEqual(Layout.buttonSide, 44)
    }

    func test_height_countsEveryButtonAndItsGaps() {
        XCTAssertEqual(Layout.height(buttonCount: 0), 0)
        XCTAssertEqual(Layout.height(buttonCount: 1), Layout.buttonSide + 2 * Layout.padding)
        XCTAssertEqual(
            Layout.height(buttonCount: 6),
            6 * Layout.buttonSide + 5 * Layout.buttonSpacing + 2 * Layout.padding
        )
    }

    /// Portrait : la pilule occupe presque toute la largeur, les rails s'arrêtent au-dessus d'elle.
    func test_bottomClearance_portrait_railsStopAbovethePill() {
        XCTAssertEqual(Layout.bottomClearance(containerWidth: 393, safeHorizontal: 0), Layout.pillHeight + Layout.pillGap)
    }

    /// Paysage : la pilule tient entre les deux rails, qui descendent au pied de l'écran
    /// et se centrent verticalement.
    func test_bottomClearance_landscape_railsFitBesideThePill() {
        XCTAssertEqual(Layout.bottomClearance(containerWidth: 844, safeHorizontal: 59), 0)
    }
}
