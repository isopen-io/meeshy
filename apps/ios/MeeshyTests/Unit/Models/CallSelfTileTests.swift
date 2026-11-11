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
