import XCTest

final class HapticFeedbackSingleSiteGuardTests: XCTestCase {

    func test_meeshyUISources_neverBuildAFeedbackGeneratorOutsideHapticFeedback() throws {
        let sources = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI")
        let enumerator = try XCTUnwrap(FileManager.default.enumerator(at: sources, includingPropertiesForKeys: nil))
        let offenders = enumerator.compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" && $0.lastPathComponent != "HapticFeedback.swift" }
            .filter { url in
                guard let text = try? String(contentsOf: url, encoding: .utf8) else { return false }
                return text.contains("UIImpactFeedbackGenerator(") || text.contains("UINotificationFeedbackGenerator(")
            }
            .map(\.lastPathComponent)
        XCTAssertEqual(offenders, [], "Haptique hors HapticFeedback : générateur jamais chaud")
    }
}
