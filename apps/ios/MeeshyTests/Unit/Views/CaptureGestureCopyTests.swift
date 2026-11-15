import XCTest
@testable import Meeshy

/// APP-4 — le mode capture de l'appel dit le geste avec la phrase du viseur :
/// même geste, mêmes mots, dans toutes les langues.
@MainActor
final class CaptureGestureCopyTests: XCTestCase {

    func test_callModeGestureHint_isTheSharedCapturePhrase() {
        XCTAssertEqual(CallModeCopy.gestureHint, CaptureGestureCopy.photoOrVideo)
    }

    func test_sharedPhrase_matchesTheViewfinderPhotoHint() {
        XCTAssertEqual(
            CaptureGestureCopy.photoOrVideo,
            ComposerSceneCameraCopy.hint(mode: .photo, stage: .armed)
        )
    }

    func test_catalog_keepsOneKeyForTheGesture_andNoCallTwin() throws {
        let strings = try catalogStrings()
        XCTAssertNotNil(strings["composer.camera.hint.photo"])
        XCTAssertNil(strings["capture.gesture.photoOrVideo"], "la phrase du geste n'a qu'une clé, celle du viseur")
        XCTAssertNil(strings["call.mode.gesture.hint"], "l'ancienne formulation de l'appel ne doit plus exister")
    }

    func test_gestureHintSeenKey_isKept_soTheHintIsNotShownAgain() {
        XCTAssertEqual(CallModeCopy.gestureHintSeenKey, "call.mode.gestureHint.seen")
    }

    private func catalogStrings() throws -> [String: Any] {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // …/Unit/Views
            .deletingLastPathComponent()  // …/Unit
            .deletingLastPathComponent()  // …/MeeshyTests
            .deletingLastPathComponent()  // …/apps/ios
            .appendingPathComponent("Meeshy/Localizable.xcstrings")
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        return try XCTUnwrap(root["strings"] as? [String: Any])
    }
}
