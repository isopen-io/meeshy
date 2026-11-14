import SwiftUI
import XCTest
@testable import Meeshy

/// #8577 — pincer MA vignette la fait changer de taille par paliers x1 · x2 ·
/// x3, accrochés, et le palier choisi tient toute la durée de l'appel.
@MainActor
final class CallSelfTileTests: XCTestCase {

    // MARK: - Paliers

    func test_standard_isTheCurrentTileSize() {
        XCTAssertEqual(CallSelfTileScale.standard, .x2)
        XCTAssertEqual(CallSelfTileScale.x2.size, CGSize(width: 100, height: 140))
    }

    func test_sizes_growWithTheStep() {
        XCTAssertLessThan(CallSelfTileScale.x1.width, CallSelfTileScale.x2.width)
        XCTAssertLessThan(CallSelfTileScale.x2.width, CallSelfTileScale.x3.width)
    }

    func test_larger_atTheTop_staysThere() {
        XCTAssertEqual(CallSelfTileScale.x1.larger, .x2)
        XCTAssertEqual(CallSelfTileScale.x3.larger, .x3)
    }

    func test_smaller_atTheBottom_staysThere() {
        XCTAssertEqual(CallSelfTileScale.x3.smaller, .x2)
        XCTAssertEqual(CallSelfTileScale.x1.smaller, .x1)
    }

    // MARK: - Le pincement

    func test_selfTileScale_noPinch_keepsTheStep() {
        XCTAssertEqual(CallSelfTileScale.selfTileScale(fromPinch: 1, from: .x2), .x2)
    }

    func test_selfTileScale_slightTremor_keepsTheStep() {
        XCTAssertEqual(CallSelfTileScale.selfTileScale(fromPinch: 1.05, from: .x2), .x2)
        XCTAssertEqual(CallSelfTileScale.selfTileScale(fromPinch: 0.95, from: .x2), .x2)
    }

    func test_selfTileScale_modestSpread_stepsUpOnce() {
        XCTAssertEqual(CallSelfTileScale.selfTileScale(fromPinch: 1.2, from: .x2), .x3)
    }

    func test_selfTileScale_modestPinch_stepsDownOnce() {
        XCTAssertEqual(CallSelfTileScale.selfTileScale(fromPinch: 0.85, from: .x2), .x1)
    }

    func test_selfTileScale_wideSpread_landsOnTheNearestStep() {
        XCTAssertEqual(CallSelfTileScale.selfTileScale(fromPinch: 2.1, from: .x1), .x3)
        XCTAssertEqual(CallSelfTileScale.selfTileScale(fromPinch: 1.4, from: .x1), .x2)
    }

    func test_selfTileScale_beyondTheLargest_staysLargest() {
        XCTAssertEqual(CallSelfTileScale.selfTileScale(fromPinch: 5, from: .x3), .x3)
        XCTAssertEqual(CallSelfTileScale.selfTileScale(fromPinch: 0.1, from: .x1), .x1)
    }

    func test_selfTileScale_invalidMagnification_keepsTheStep() {
        XCTAssertEqual(CallSelfTileScale.selfTileScale(fromPinch: 0, from: .x2), .x2)
        XCTAssertEqual(CallSelfTileScale.selfTileScale(fromPinch: .nan, from: .x3), .x3)
    }

    // MARK: - Pendant le geste

    func test_liveSize_followsTheFingers_withinTheSteps() {
        XCTAssertEqual(CallSelfTileScale.liveSize(pinch: 1.2, from: .x2).width, 120, accuracy: 0.001)
        XCTAssertEqual(CallSelfTileScale.liveSize(pinch: 4, from: .x2).width, CallSelfTileScale.x3.width)
        XCTAssertEqual(CallSelfTileScale.liveSize(pinch: 0.2, from: .x2).width, CallSelfTileScale.x1.width)
    }

    func test_liveSize_keepsTheTileProportions() {
        let size = CallSelfTileScale.liveSize(pinch: 1.3, from: .x2)
        XCTAssertEqual(size.height / size.width, CallSelfTileScale.aspectRatio, accuracy: 0.001)
    }

    // MARK: - Zone sûre

    func test_fitted_largeTileInASmallWindow_staysInside() {
        let fitted = CallSelfTileScale.fitted(CallSelfTileScale.x3.size, in: CGSize(width: 120, height: 400))
        XCTAssertLessThanOrEqual(fitted.width, 120)
        XCTAssertEqual(fitted.height / fitted.width, CallSelfTileScale.aspectRatio, accuracy: 0.001)
    }

    func test_fitted_roomEnough_keepsTheSize() {
        XCTAssertEqual(CallSelfTileScale.fitted(CallSelfTileScale.x3.size, in: CGSize(width: 400, height: 900)), CallSelfTileScale.x3.size)
    }

    // MARK: - L1.5 — dans une fenêtre plus large que haute, ma vignette se couche

    func test_size_inALandscapeWindow_isTheLyingTile_130By96() {
        XCTAssertEqual(CallSelfTileScale.x2.size(isLandscape: true), CGSize(width: 130, height: 96))
    }

    func test_size_inAPortraitWindow_staysTheStandingTile() {
        XCTAssertEqual(CallSelfTileScale.x2.size(isLandscape: false), CGSize(width: 100, height: 140))
        XCTAssertEqual(CallSelfTileScale.x2.size(isLandscape: false), CallSelfTileScale.x2.size)
    }

    func test_size_landscape_growsWithTheStep_andStaysWiderThanHigh() {
        let sizes = CallSelfTileScale.allCases.map { $0.size(isLandscape: true) }
        XCTAssertLessThan(sizes[0].width, sizes[1].width)
        XCTAssertLessThan(sizes[1].width, sizes[2].width)
        sizes.forEach { XCTAssertGreaterThan($0.width, $0.height) }
    }

    func test_isLandscape_isTheShapeOfTheWindow_notTheDevice() {
        XCTAssertTrue(CallSelfTileScale.isLandscape(CGSize(width: 1024, height: 700)))
        XCTAssertFalse(CallSelfTileScale.isLandscape(CGSize(width: 700, height: 1024)))
        XCTAssertFalse(CallSelfTileScale.isLandscape(CGSize(width: 800, height: 800)))
    }

    func test_liveSize_landscape_followsTheFingers_withinTheLyingSteps() {
        XCTAssertEqual(CallSelfTileScale.liveSize(pinch: 1.2, from: .x2, isLandscape: true).width, 156, accuracy: 0.001)
        XCTAssertEqual(CallSelfTileScale.liveSize(pinch: 4, from: .x2, isLandscape: true), CallSelfTileScale.x3.size(isLandscape: true))
        XCTAssertEqual(CallSelfTileScale.liveSize(pinch: 0.2, from: .x2, isLandscape: true), CallSelfTileScale.x1.size(isLandscape: true))
    }

    func test_liveSize_landscape_keepsTheLyingProportions() {
        let size = CallSelfTileScale.liveSize(pinch: 1.3, from: .x2, isLandscape: true)
        XCTAssertEqual(size.height / size.width, 96.0 / 130.0, accuracy: 0.001)
    }

    func test_tile_sizeFollowsTheWindowShape() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.callViewSource())
        XCTAssertTrue(code.contains("CallSelfTileScale.isLandscape(container)"))
        XCTAssertTrue(code.contains("isLandscape: CallSelfTileScale.isLandscape(container)"))
    }

    /// L1.5 — quand la fenêtre tourne, ma vignette se couche (ou se relève) dans le même mouvement
    /// que sa place, sans saut ; Réduire les animations : elle se pose sans mouvement.
    func test_tile_turnsWithTheWindow_inOneMovement() throws {
        let selfView = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+SelfView.swift"))
        XCTAssertEqual(
            selfView.components(separatedBy: "isLandscape: CallSelfTileScale.isLandscape(geo.size), clearance: selfTileTopBannerClearance, reduceMotion: reduceMotion))").count - 1,
            2,
            "la vignette vivante ET la tuile « vidéo en pause » suivent la forme de la fenêtre"
        )
        let glass = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallControlGlass.swift"))
        XCTAssertTrue(glass.contains(".animation(nil, value: isLandscape)"), "loi 17.2 (#18207) : la place se pose d'un coup, la vignette la rejoint par une translation")
        XCTAssertTrue(glass.contains("guard old.isLandscape != new.isLandscape || old.clearance != new.clearance else { return }"))
    }

    // MARK: - Mémoire de l'appel

    func test_memory_sameCall_givesBackTheStep() {
        let memory = CallSelfTileMemory()
        memory.remember(.x3, for: "call-1")
        XCTAssertEqual(memory.scale(for: "call-1"), .x3)
    }

    func test_memory_anotherCall_startsFromTheStandard() {
        let memory = CallSelfTileMemory()
        memory.remember(.x1, for: "call-1")
        XCTAssertEqual(memory.scale(for: "call-2"), .standard)
    }

    func test_memory_noCall_neverRemembers() {
        let memory = CallSelfTileMemory()
        memory.remember(.x3, for: nil)
        XCTAssertEqual(memory.scale(for: nil), .standard)
    }

    // MARK: - La vignette

    /// Le pincement de la vignette change sa TAILLE ; son centre tient compte
    /// de cette taille pour rester dans la zone sûre.
    func test_tile_pinchResizes_andTheCornerFollowsTheSize() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.callViewSource())
        XCTAssertTrue(code.contains("CallSelfTileScale.selfTileScale(fromPinch:"))
        XCTAssertTrue(code.contains("CallSelfTileScale.liveSize(pinch:"))
        XCTAssertTrue(code.contains("selfTileMemory.remember("))
        XCTAssertFalse(code.contains("static let pipSize"), "La taille de la vignette vient de son palier")
        XCTAssertTrue(code.contains("func pipCenter(_ corner: PiPCorner, in container: CGSize, size: CGSize"))
    }

    // MARK: - #16663 — un toucher range tout, ma vignette passe à sa petite taille

    func test_resting_chromeHidden_isTheSmallestSize() {
        XCTAssertEqual(CallSelfTileScale.resting(.x3, isChromeVisible: false), .x1)
        XCTAssertEqual(CallSelfTileScale.resting(.x2, isChromeVisible: false), .x1)
    }

    func test_resting_chromeVisible_keepsTheChosenSize() {
        XCTAssertEqual(CallSelfTileScale.resting(.x3, isChromeVisible: true), .x3)
        XCTAssertEqual(CallSelfTileScale.resting(.x1, isChromeVisible: true), .x1)
    }
    /// G1.11 — ma vignette se range par une TRANSFORMATION (un facteur d'échelle), pas
    /// par un nouveau cadre : son cadre reste celui du palier choisi.
    func test_restingFactor_chromeVisible_isOne() {
        for scale in CallSelfTileScale.allCases {
            XCTAssertEqual(CallSelfTileScale.restingFactor(scale, isChromeVisible: true), 1, accuracy: 0.0001)
        }
    }

    func test_restingFactor_chromeHidden_scalesTheChosenFrameDownToTheSmallest() {
        XCTAssertEqual(CallSelfTileScale.restingFactor(.x3, isChromeVisible: false), CallSelfTileScale.x1.width / CallSelfTileScale.x3.width, accuracy: 0.0001)
        XCTAssertEqual(CallSelfTileScale.restingFactor(.x2, isChromeVisible: false), CallSelfTileScale.x1.width / CallSelfTileScale.x2.width, accuracy: 0.0001)
        XCTAssertEqual(CallSelfTileScale.restingFactor(.x1, isChromeVisible: false), 1, accuracy: 0.0001)
    }

    func test_anchor_isTheScreenCornerNearestTheTile() {
        let screen = CGSize(width: 400, height: 800)
        XCTAssertEqual(CallSelfTileScale.anchor(of: CGPoint(x: 340, y: 90), in: screen), .topTrailing)
        XCTAssertEqual(CallSelfTileScale.anchor(of: CGPoint(x: 60, y: 90), in: screen), .topLeading)
        XCTAssertEqual(CallSelfTileScale.anchor(of: CGPoint(x: 340, y: 700), in: screen), .bottomTrailing)
        XCTAssertEqual(CallSelfTileScale.anchor(of: CGPoint(x: 60, y: 700), in: screen), .bottomLeading)
    }

    /// Loi 4 · 11 — rangée par une échelle, ma vignette garde le liseré, les coins et le badge
    /// d'une petite vignette : ce qui ne doit pas rapetisser est contre-mis à l'échelle.
    func test_counterScaled_keepsTheDrawnLength_onceTheTileIsScaled() {
        let factor = CallSelfTileScale.restingFactor(.x3, isChromeVisible: false)
        XCTAssertEqual(CallSelfTileScale.counterScaled(CallSelfTileStroke.lineWidth, by: factor) * factor, CallSelfTileStroke.lineWidth, accuracy: 0.0001)
        XCTAssertEqual(CallSelfTileScale.counterScaled(12, by: 1), 12, accuracy: 0.0001)
    }

    func test_counterScaled_degenerateFactor_leavesTheLengthUntouched() {
        XCTAssertEqual(CallSelfTileScale.counterScaled(2, by: 0), 2)
        XCTAssertEqual(CallSelfTileScale.counterScaled(2, by: .nan), 2)
    }

    // MARK: - Loi 4 — le liseré porte la couleur de qui est DANS la vignette

    func test_strokeKey_myImageInTheTile_isMyId() {
        XCTAssertEqual(CallSelfTileStroke.colorKey(showsLocal: true, myId: "me0000000000000000000001", peerId: "pe0000000000000000000002"), "me0000000000000000000001")
    }

    func test_strokeKey_streamsSwapped_isThePeerId() {
        XCTAssertEqual(CallSelfTileStroke.colorKey(showsLocal: false, myId: "me0000000000000000000001", peerId: "pe0000000000000000000002"), "pe0000000000000000000002")
    }

    func test_strokeKey_withoutAnId_inventsNoColor() {
        XCTAssertNil(CallSelfTileStroke.colorKey(showsLocal: true, myId: nil, peerId: "pe0000000000000000000002"))
        XCTAssertNil(CallSelfTileStroke.colorKey(showsLocal: false, myId: "me0000000000000000000001", peerId: ""))
    }

    func test_strokeWidth_isTheTwoPointsOfThePlanche() {
        XCTAssertEqual(CallSelfTileStroke.lineWidth, 2)
    }
}

/// #17982 (P1.4, G1.2, W1.18, S2.5, P16.8, L1.5) — ma vignette de duo porte la plaque « Vous »,
/// le composant de plaque du groupe, qui suit la personne montrée, ma vignette rangée et le lecteur
/// d'écran. #17965 (L2.8) — en paysage, (…) ouvert, elle cède le coin au rail de son bord.
/// Loi 17.10 — Réduire les animations : un fondu court, jamais une bascule sèche.
@MainActor
final class CallSelfTilePlateTests: XCTestCase {

    // MARK: - La plaque suit la personne montrée (loi 4)

    func test_plateTitle_myImageInTheTile_saysYou() {
        XCTAssertEqual(CallSelfTilePlate.title(showsLocal: true, you: "Vous", peer: "Awa"), "Vous")
    }

    func test_plateTitle_streamsSwapped_isThePeerName() {
        XCTAssertEqual(CallSelfTilePlate.title(showsLocal: false, you: "Vous", peer: "Awa"), "Awa")
    }

    // MARK: - La plaque ne recouvre ni le liseré ni le badge, rangée comme dépliée

    func test_plateInset_clearsTheStroke() {
        XCTAssertGreaterThan(CallSelfTilePlate.sideInset, CallSelfTileStroke.lineWidth)
    }

    func test_plateMaxWidth_standardTile_isTheTileLessItsInsets() {
        XCTAssertEqual(CallSelfTilePlate.maxWidth(tileWidth: 100, stowFactor: 1, reservesBadge: false), 100 - 2 * CallSelfTilePlate.sideInset, accuracy: 0.0001)
    }

    func test_plateMaxWidth_stowedTile_followsTheVisibleWidth() {
        let factor = CallSelfTileScale.restingFactor(.x2, isChromeVisible: false)
        XCTAssertEqual(CallSelfTilePlate.maxWidth(tileWidth: 100, stowFactor: factor, reservesBadge: false), 72 - 2 * CallSelfTilePlate.sideInset, accuracy: 0.0001)
    }

    func test_plateMaxWidth_peerMutedBadge_leavesItsCorner() {
        XCTAssertEqual(CallSelfTilePlate.maxWidth(tileWidth: 100, stowFactor: 1, reservesBadge: true), 100 - 2 * CallSelfTilePlate.badgeReserve, accuracy: 0.0001)
        XCTAssertGreaterThan(CallSelfTilePlate.badgeReserve, CallSelfTilePlate.sideInset)
    }

    func test_plateMaxWidth_neverNegative() {
        XCTAssertEqual(CallSelfTilePlate.maxWidth(tileWidth: 20, stowFactor: 1, reservesBadge: true), 0)
        XCTAssertEqual(CallSelfTilePlate.maxWidth(tileWidth: 100, stowFactor: .nan, reservesBadge: false), 100 - 2 * CallSelfTilePlate.sideInset, accuracy: 0.0001)
    }

    func test_accessibilityValue_saysWhoThenTheSize() {
        XCTAssertEqual(CallSelfTilePlate.accessibilityValue(name: "Vous", size: "Vignette moyenne"), "Vous, Vignette moyenne")
    }

    // MARK: - §7.2 — les coins

    func test_corner_center_sitsAtItsEdgeDistances() {
        let insets = EdgeInsets(top: 60, leading: 16, bottom: 130, trailing: 76)
        let container = CGSize(width: 852, height: 393)
        let size = CGSize(width: 130, height: 96)
        XCTAssertEqual(CallSelfTileCorner.topTrailing.center(of: size, in: container, insets: insets), CGPoint(x: 852 - 76 - 65, y: 60 + 48))
        XCTAssertEqual(CallSelfTileCorner.topLeading.center(of: size, in: container, insets: insets), CGPoint(x: 16 + 65, y: 60 + 48))
        XCTAssertEqual(CallSelfTileCorner.bottomLeading.center(of: size, in: container, insets: insets), CGPoint(x: 16 + 65, y: 393 - 130 - 48))
        XCTAssertEqual(CallSelfTileCorner.bottomTrailing.center(of: size, in: container, insets: insets), CGPoint(x: 852 - 76 - 65, y: 393 - 130 - 48))
    }

    func test_corner_nearest_isTheClosestCenter() {
        let centers: [CallSelfTileCorner: CGPoint] = [.topLeading: CGPoint(x: 0, y: 0), .topTrailing: CGPoint(x: 100, y: 0), .bottomLeading: CGPoint(x: 0, y: 100), .bottomTrailing: CGPoint(x: 100, y: 100)]
        XCTAssertEqual(CallSelfTileCorner.nearest(to: CGPoint(x: 90, y: 80)) { centers[$0] ?? .zero }, .bottomTrailing)
        XCTAssertEqual(CallSelfTileCorner.nearest(to: CGPoint(x: 10, y: 20)) { centers[$0] ?? .zero }, .topLeading)
    }

    func test_corner_isTop_and_isLeading() {
        XCTAssertTrue(CallSelfTileCorner.topTrailing.isTop)
        XCTAssertFalse(CallSelfTileCorner.topTrailing.isLeading)
        XCTAssertFalse(CallSelfTileCorner.bottomLeading.isTop)
        XCTAssertTrue(CallSelfTileCorner.bottomLeading.isLeading)
    }

    // MARK: - Loi 17.10 — Réduire les animations : un fondu court

    func test_motion_reduceMotion_isTheShortFadeOfTheChrome() {
        XCTAssertEqual(CallSelfTileMotion.spring(response: 0.35, dampingFraction: 0.75, reduceMotion: true), .easeInOut(duration: CallChromeStow.reducedFadeDuration))
    }

    func test_motion_default_keepsTheSpring() {
        XCTAssertEqual(CallSelfTileMotion.spring(response: 0.35, dampingFraction: 0.75, reduceMotion: false), .spring(response: 0.35, dampingFraction: 0.75))
    }

    // MARK: - #17965 (L2.8) — ma vignette cède le coin au rail

    func test_yields_landscapeWithRails() {
        XCTAssertTrue(CallRailsLayout.selfTileYieldsToRails(isLandscape: true, railsShown: true))
    }

    func test_yields_neverInPortrait_norWithoutRails() {
        XCTAssertFalse(CallRailsLayout.selfTileYieldsToRails(isLandscape: false, railsShown: true))
        XCTAssertFalse(CallRailsLayout.selfTileYieldsToRails(isLandscape: true, railsShown: false))
    }

    func test_edgeDistance_yielding_sitsAgainstTheRail_likeTheBoard() {
        XCTAssertEqual(CallRailsLayout.selfTileEdgeDistance(ownInset: 16, safeHorizontal: 0, yieldsToRails: true), 76)
        XCTAssertEqual(CallRailsLayout.selfTileEdgeDistance(ownInset: 16, safeHorizontal: 59, yieldsToRails: true), 135)
    }

    func test_edgeDistance_notYielding_keepsItsCorner() {
        XCTAssertEqual(CallRailsLayout.selfTileEdgeDistance(ownInset: 16, safeHorizontal: 59, yieldsToRails: false), 16)
    }

    func test_edgeDistance_yielding_neverComesCloserThanItsOwnInset() {
        XCTAssertEqual(CallRailsLayout.selfTileEdgeDistance(ownInset: 200, safeHorizontal: 0, yieldsToRails: true), 200)
    }

    // MARK: - Témoins de source

    private func selfView() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+SelfView.swift"))
    }

    func test_duoTile_wearsTheGroupNameplate_readByVoiceOver() throws {
        let source = try selfView()
        let pip = try XCTUnwrap(DeclarationBodyScanner.body(containing: "var pipView: some View", in: source))
        XCTAssertTrue(pip.contains(".overlay(alignment: .bottom) { CallSelfTileNameplate(title: selfTilePlateTitle, tileWidth: size.width, stowFactor: selfTileStowFactor, reservesBadge: showsPeerMutedBadge && effectiveSwapStreams) }"), "la plaque au pied de la vignette, comme la planche")
        XCTAssertTrue(pip.contains(".accessibilityValue(CallSelfTilePlate.accessibilityValue(name: selfTilePlateTitle, size: CallSelfTileCopy.sizeName(selfTileScale)))"), "le lecteur d'écran dit qui est dans la vignette")
        let chrome = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallTileChrome.swift"))
        let plate = try XCTUnwrap(DeclarationBodyScanner.body(containing: "struct CallSelfTileNameplate: View", in: chrome))
        XCTAssertTrue(plate.contains("CallTileNameplate(title: title)"), "le composant de plaque du groupe, pas un second")
        XCTAssertTrue(plate.contains(".scaleEffect(CallSelfTileScale.counterScaled(1, by: stowFactor), anchor: .bottom)"), "rangée, la vignette garde une plaque lisible (loi 11)")
        XCTAssertTrue(plate.contains("CallSelfTilePlate.maxWidth(tileWidth: tileWidth, stowFactor: stowFactor, reservesBadge: reservesBadge)"), "ni sur le liseré ni sur le badge micro coupé")
        XCTAssertTrue(plate.contains(".accessibilityHidden(true)"), "la vignette la dit déjà : pas de double lecture")
        XCTAssertTrue(source.contains("String(localized: \"call.group.tile.you\", defaultValue: \"Vous\", bundle: .main)"), "la clé partagée du groupe, déjà dans les sept langues")
        XCTAssertTrue(source.contains("CallSelfTilePlate.title(showsLocal: !effectiveSwapStreams"), "la plaque suit la personne montrée, comme le liseré")
    }

    func test_duoTile_reduceMotion_fadesInsteadOfCutting() throws {
        let source = try selfView()
        XCTAssertFalse(source.contains("reduceMotion ? nil"), "plus aucune bascule sèche dans ma vignette")
        XCTAssertEqual(source.components(separatedBy: "withAnimation(CallSelfTileMotion.spring(").count - 1, 3, "glisser, palier, permutation")
    }

    func test_duoTile_yieldsToTheRail_inMotion() throws {
        let source = try selfView()
        let center = try XCTUnwrap(DeclarationBodyScanner.body(containing: "func pipCenter(_ corner: PiPCorner", in: source))
        XCTAssertTrue(center.contains("CallRailsLayout.selfTileEdgeDistance("), "les deux bords suivent la loi du rail")
        XCTAssertTrue(source.contains("var selfTileRailsShown: Bool { isChromeVisible && !controlsDisposition.railRows(currentActionSet, layer: layer).isEmpty }"), "les rails que (…) fait sortir, à l'écran, et rien qu'eux")
        XCTAssertTrue(source.contains("CallRailsLayout.selfTileYieldsToRails(isLandscape: CallSelfTileScale.isLandscape(container), railsShown: selfTileRailsShown)"))
        XCTAssertTrue(source.contains(".animation(CallChromeStow.animation(reduceMotion: reduceMotion), value: selfTileYieldsToRails(in: geo.size))"), "elle se décale et revient en mouvement ; Réduire les animations : un fondu court")
    }
}

/// Loi 17.1 · 17.12 (#18206) — ma vignette de duo ne paraît ni ne part d'un coup : quand ma caméra
/// s'allume ou s'éteint, qu'un mode ou un cadre en direct la range, ou que la survie réseau la fait
/// passer à la tuile « en pause », elle se fond à sa place (`CallRemoteVideoFade`, le fondu de
/// l'image du correspondant) ; « Réduire les animations » garde le fondu, plus court.
@MainActor
final class CallSelfViewPresenceTests: XCTestCase {

    private func presence(shown: Bool = true, video: Bool = true, track: Bool = true, suspended: Bool = false) -> CallSelfViewPresence {
        CallSelfViewPresence.resolve(isShown: shown, isVideoEnabled: video, hasLocalVideoTrack: track, isVideoSuspended: suspended)
    }

    func test_myCamera_withItsTrack_isShown() {
        XCTAssertEqual(presence(), .camera)
    }

    func test_aSuspendedCamera_thatKeepsItsTrack_stillShowsTheFrozenImage() {
        XCTAssertEqual(presence(suspended: true), .camera, "L6-1 : la piste reste attachée, la vignette montre l'image gelée")
    }

    func test_aSuspendedCamera_withoutItsTrack_showsThePausedTile() {
        XCTAssertEqual(presence(track: false, suspended: true), .paused)
    }

    func test_aCameraOff_showsNoTile() {
        XCTAssertEqual(presence(video: false), .hidden)
        XCTAssertEqual(presence(video: false, track: false, suspended: true), .hidden)
        XCTAssertEqual(presence(track: false), .hidden, "aucune piste et aucune pause : rien à montrer")
    }

    func test_aHiddenSelfView_showsNoTile() {
        XCTAssertEqual(presence(shown: false), .hidden, "groupe, mode Effets ou Montage, cadre en direct")
        XCTAssertEqual(presence(shown: false, track: false, suspended: true), .hidden)
    }

    func test_duoSelfView_appearsLeavesAndChangesFace_byAFade() throws {
        let connected = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+Connected.swift"))
        let root = try XCTUnwrap(DeclarationBodyScanner.body(containing: "var connectedView: some View", in: connected))
        XCTAssertTrue(root.contains("duoSelfView"))
        XCTAssertFalse(
            root.contains("if !isGroupStage && chromeVisibility.isVisible(.selfView) && !isLiveFrameShown {"),
            "une insertion sans transition faisait paraître ma vignette d'un coup"
        )
        let selfView = try XCTUnwrap(DeclarationBodyScanner.body(containing: "private var duoSelfView: some View", in: connected))
        XCTAssertTrue(selfView.contains("pipView.transition(.opacity)"))
        XCTAssertTrue(selfView.contains("localVideoSuspendedTile.transition(.opacity)"))
        XCTAssertTrue(
            selfView.contains(".animation(.easeInOut(duration: CallRemoteVideoFade.duration(reduceMotion: reduceMotion)), value: presence)"),
            "le fondu de l'image du correspondant (G4) : une loi pour la caméra qui se coupe, la sienne comme la mienne"
        )
        let resolve = try XCTUnwrap(DeclarationBodyScanner.body(containing: "private var selfViewPresence: CallSelfViewPresence", in: connected))
        XCTAssertTrue(resolve.contains("CallSelfViewPresence.resolve(isShown: !isGroupStage && chromeVisibility.isVisible(.selfView) && !isLiveFrameShown"))
    }
}
