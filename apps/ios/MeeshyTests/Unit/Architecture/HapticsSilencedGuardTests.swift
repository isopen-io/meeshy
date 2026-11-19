import XCTest
import MeeshyUI
@testable import Meeshy

/// #19783 — les retours haptiques ne se jouent qu'aux endroits stratégiques : l'engagement d'une action et son issue.
/// Les tics d'ambiance se taisent. `HapticFeedback.plays(_:)` est la seule loi ; aucun générateur UIKit, aucun
/// `.sensoryFeedback` ne joue hors d'elle, dans l'app comme dans le SDK.
@MainActor
final class HapticsSilencedGuardTests: XCTestCase {

    private static var repoRoot: URL {
        (0..<6).reduce(URL(fileURLWithPath: #filePath)) { url, _ in url.deletingLastPathComponent() }
    }

    private static let players = ["UIImpactFeedbackGenerator(", "UINotificationFeedbackGenerator(",
                                  "UISelectionFeedbackGenerator(", ".sensoryFeedback(", "CHHapticEngine("]

    func test_onlyStrategicHapticsPlay_actionsAndOutcomes_neverAmbientTicks() {
        XCTAssertFalse(HapticFeedback.plays(.tick))
        XCTAssertTrue(HapticFeedback.plays(.action))
        XCTAssertTrue(HapticFeedback.plays(.outcome))
    }

    func test_noHapticPlaysOutsideTheDoor() throws {
        let roots = ["apps/ios/Meeshy", "packages/MeeshySDK/Sources"].map { Self.repoRoot.appendingPathComponent($0) }
        var offenders: [String] = []
        for root in roots {
            let files = (FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)?.allObjects as? [URL] ?? [])
                .filter { $0.pathExtension == "swift" }
            for file in files where file.lastPathComponent != "HapticFeedback.swift" {
                let code = AppSourceGuard.stripComments(try String(contentsOf: file, encoding: .utf8))
                guard Self.players.contains(where: { code.contains($0) }) else { continue }
                if !code.contains("HapticFeedback.plays") { offenders.append(file.lastPathComponent) }
            }
        }
        XCTAssertEqual(offenders, [], "un retour haptique joue hors de la loi")
    }
}
