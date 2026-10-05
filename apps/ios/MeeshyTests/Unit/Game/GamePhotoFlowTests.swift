import XCTest
@testable import Meeshy

/// Le déroulé de la photo est un réducteur PUR (#9382) : un événement hors de son
/// étape est ignoré, et le refus de la caméra n'est jamais une impasse.
final class GamePhotoFlowTests: XCTestCase {

    private func run(_ events: [PhotoFlowEvent], from state: PhotoFlowState = .offer) -> PhotoFlowState {
        events.reduce(state) { GamePhotoFlow.reduce($0, $1) }
    }

    func test_selfie_opensTheCamera_thenIsLive() {
        XCTAssertEqual(run([.selfie]), .camera(.opening))
        XCTAssertEqual(run([.selfie, .cameraReady]), .camera(.live))
    }

    func test_shutter_beforeTheCameraIsLive_isIgnored() {
        XCTAssertEqual(run([.selfie, .shutter]), .camera(.opening))
        XCTAssertEqual(run([.shutter]), .offer)
    }

    func test_shutter_whenLive_strikesInPlaceAsASelfie() {
        XCTAssertEqual(run([.selfie, .cameraReady, .shutter]), .striking(.selfie))
    }

    func test_aCameraRefusal_isNamed_andTheGalleryAndTheCardStayPossible() {
        let denied = run([.selfie, .cameraFailed(.denied)])
        XCTAssertEqual(denied, .camera(.failed(.denied)))
        XCTAssertEqual(run([.gallery], from: denied), .striking(.gallery))
        XCTAssertEqual(run([.card], from: denied), .striking(.card))
    }

    func test_cardOnly_fromTheOffer_skipsTheCamera() {
        XCTAssertEqual(run([.card]), .striking(.card))
    }

    func test_later_closesTheFlowAsDeferred() {
        XCTAssertEqual(run([.later]), .done(deferred: true))
    }

    func test_composed_givesTheResult_keptStartsUnknown_thenFollowsTheOutcome() {
        let result = run([.card, .composed])
        XCTAssertEqual(result, .result(.card, kept: nil))
        XCTAssertEqual(run([.kept(true)], from: result), .result(.card, kept: true))
        XCTAssertEqual(run([.kept(false)], from: result), .result(.card, kept: false))
    }

    func test_aCompositionFailure_endsInFailed() {
        XCTAssertEqual(run([.card, .composeFailed]), .failed)
    }

    func test_close_endsEverywhere_andNothingLeavesDone() {
        for state in [PhotoFlowState.offer, .camera(.live), .striking(.card), .result(.card, kept: nil), .failed] {
            XCTAssertEqual(GamePhotoFlow.reduce(state, .close), .done(deferred: false))
        }
        XCTAssertEqual(run([.selfie], from: .done(deferred: true)), .done(deferred: true))
    }

    func test_keptOutsideTheResult_isIgnored() {
        XCTAssertEqual(run([.kept(true)]), .offer)
    }
}
