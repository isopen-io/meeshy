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

    func test_catalog_sharedKeyCarriesTheViewfinderWordingInEveryLanguage() throws {
        let strings = try catalogStrings()
        let shared = try XCTUnwrap(strings["capture.gesture.photoOrVideo"] as? [String: Any])
        let viewfinder = try XCTUnwrap(strings["composer.camera.hint.photo"] as? [String: Any])
        XCTAssertEqual(values(shared), values(viewfinder))
        XCTAssertNil(strings["call.mode.gesture.hint"], "l'ancienne formulation de l'appel ne doit plus exister")
    }

    func test_gestureHintSeenKey_isKept_soTheHintIsNotShownAgain() {
        XCTAssertEqual(CallModeCopy.gestureHintSeenKey, "call.mode.gestureHint.seen")
    }

    func test_effectsFiltersLabel_readsTheAppBundle() throws {
        let source = try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallEffectsOverlay.swift")
        XCTAssertTrue(source.contains(#"String(localized: "call.effects.videoFilters", defaultValue: "Filtres", bundle: .main)"#))
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

    private func values(_ node: [String: Any]) -> [String: String] {
        let localizations = node["localizations"] as? [String: Any] ?? [:]
        return localizations.reduce(into: [:]) { result, entry in
            let unit = (entry.value as? [String: Any])?["stringUnit"] as? [String: Any]
            result[entry.key] = unit?["value"] as? String
        }
    }
}
