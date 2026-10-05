import XCTest
@testable import Meeshy

/// **Toucher la scène fait la mise au point ; la toucher deux fois prend la
/// photo** (#9464, spec du porteur). Le toucher simple vise TOUT DE SUITE —
/// il n'attend pas qu'un double échoue —, et le toucher qui vient d'armer le
/// viseur ne compte jamais comme premier d'un double.
@MainActor
final class ComposerCaptureTapRuleTests: XCTestCase {

    private let t0 = Date(timeIntervalSince1970: 1_000)

    func test_action_singleTap_focuses() {
        XCTAssertEqual(ComposerCaptureTapRule.action(stage: .armed, now: t0, lastTapAt: nil, armedAt: nil), .focus)
    }

    func test_action_secondTapInsideTheWindow_takesThePhoto() {
        let second = t0.addingTimeInterval(ComposerCaptureTapRule.doubleTapWindow / 2)
        XCTAssertEqual(ComposerCaptureTapRule.action(stage: .armed, now: second, lastTapAt: t0, armedAt: nil), .photo)
    }

    func test_action_secondTapTooLate_focusesAgain() {
        let tard = t0.addingTimeInterval(ComposerCaptureTapRule.doubleTapWindow + 0.05)
        XCTAssertEqual(ComposerCaptureTapRule.action(stage: .armed, now: tard, lastTapAt: t0, armedAt: nil), .focus)
    }

    func test_action_theTapThatArmed_isNotTheFirstOfADouble() {
        let second = t0.addingTimeInterval(0.1)
        XCTAssertEqual(ComposerCaptureTapRule.action(stage: .armed, now: second, lastTapAt: t0, armedAt: t0), .focus)
    }

    func test_action_whileRecording_alwaysFocuses() {
        let second = t0.addingTimeInterval(0.1)
        XCTAssertEqual(ComposerCaptureTapRule.action(stage: .recording, now: second, lastTapAt: t0, armedAt: nil),
                       .focus, "pendant une prise, le toucher règle la netteté sans délai")
    }

    func test_session_tripleTap_takesOnePhotoThenFocuses() {
        let session = ComposerCaptureSession(stage: .armed, mode: .photo)
        XCTAssertEqual(session.tapAction(at: t0), .focus)
        XCTAssertEqual(session.tapAction(at: t0.addingTimeInterval(0.15)), .photo)
        XCTAssertEqual(session.tapAction(at: t0.addingTimeInterval(0.3)), .focus,
                       "un troisième toucher n'est pas le second d'un nouveau double")
    }

    func test_session_tapRightAfterArming_focuses() {
        let session = ComposerCaptureSession()
        session.arm(mode: .photo)
        let juste = Date()
        XCTAssertEqual(session.tapAction(at: juste), .focus)
        session.disarm()
    }

    func test_chrome_focusesOnASingleTap_andPhotographsOnTheSecond() throws {
        let chrome = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("SpatialTapGesture(count: 1, coordinateSpace: .global)"))
        XCTAssertTrue(chrome.contains("session.tapAction("))
        XCTAssertFalse(chrome.contains("SpatialTapGesture(count: 2"),
                       "un double à la SwiftUI ferait attendre le toucher simple")
        XCTAssertFalse(chrome.contains("TapGesture().onEnded"))
        let copie = try Self.code("Meeshy/Features/Main/Composer/ComposerSceneCameraCopy.swift")
        XCTAssertTrue(copie.contains("defaultValue: \"Toucher deux fois : photo\""))
    }

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}
