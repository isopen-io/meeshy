import XCTest
import MeeshyUI
@testable import Meeshy

/// #19783 — Meeshy ne joue plus aucun retour haptique : `HapticFeedback.plays` est la seule porte et elle est fermée.
/// Aucun générateur UIKit, aucun `.sensoryFeedback` ne joue hors de cette porte, dans l'app comme dans le SDK.
@MainActor
final class HapticsSilencedGuardTests: XCTestCase {

    private static var repoRoot: URL {
        (0..<6).reduce(URL(fileURLWithPath: #filePath)) { url, _ in url.deletingLastPathComponent() }
    }

    private static let players = ["UIImpactFeedbackGenerator(", "UINotificationFeedbackGenerator(",
                                  "UISelectionFeedbackGenerator(", ".sensoryFeedback(", "CHHapticEngine("]

    func test_theOnlyHapticDoor_isClosed() {
        XCTAssertFalse(HapticFeedback.plays)
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
        XCTAssertEqual(offenders, [], "un retour haptique joue hors de la porte fermée")
    }
}
