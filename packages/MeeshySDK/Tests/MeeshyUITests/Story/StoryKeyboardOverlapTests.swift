import XCTest
@testable import MeeshyUI

/// Sur iPad, la hauteur BRUTE du clavier n'est pas ce qu'il cache : clavier flottant ou scindé, fenêtre Stage Manager
/// qui ne descend pas jusqu'au bas de l'écran, barre de raccourcis d'un clavier physique. L'éditeur de texte de story
/// se soulève de la part du clavier qui RECOUVRE sa fenêtre — rien de plus.
final class StoryKeyboardOverlapTests: XCTestCase {
    private let fullScreen = CGRect(x: 0, y: 0, width: 1024, height: 1366)

    func test_aDockedKeyboard_coversItsHeight() {
        let kb = CGRect(x: 0, y: 1366 - 398, width: 1024, height: 398)
        XCTAssertEqual(StoryKeyboardOverlap.height(keyboardEndFrame: kb, windowFrame: fullScreen, current: 0), 398)
    }

    func test_aFloatingKeyboard_coversNothing() {
        let floating = CGRect(x: 300, y: 700, width: 320, height: 260)
        XCTAssertEqual(StoryKeyboardOverlap.height(keyboardEndFrame: floating, windowFrame: fullScreen, current: 398), 0)
    }

    func test_aStageManagerWindow_aboveTheKeyboardTop_coversOnlyTheOverlap() {
        let window = CGRect(x: 100, y: 80, width: 700, height: 1000)   // bas à 1080
        let kb = CGRect(x: 0, y: 1366 - 398, width: 1024, height: 398)  // haut à 968
        XCTAssertEqual(StoryKeyboardOverlap.height(keyboardEndFrame: kb, windowFrame: window, current: 0), 112)
    }

    func test_aWindowEntirelyAboveTheKeyboard_isNotLifted() {
        let window = CGRect(x: 100, y: 80, width: 700, height: 600)
        let kb = CGRect(x: 0, y: 1366 - 398, width: 1024, height: 398)
        XCTAssertEqual(StoryKeyboardOverlap.height(keyboardEndFrame: kb, windowFrame: window, current: 0), 0)
    }

    func test_theHardwareKeyboardShortcutBar_liftsByItsOwnHeight() {
        let bar = CGRect(x: 0, y: 1366 - 69, width: 1024, height: 69)
        XCTAssertEqual(StoryKeyboardOverlap.height(keyboardEndFrame: bar, windowFrame: fullScreen, current: 0), 69)
    }

    func test_aDegenerateFrame_keepsTheCurrentLift() {
        XCTAssertEqual(StoryKeyboardOverlap.height(keyboardEndFrame: .zero, windowFrame: fullScreen, current: 320), 320)
    }

    func test_withoutAWindow_theScreenStandsInForIt() {
        let kb = CGRect(x: 0, y: 1366 - 398, width: 1024, height: 398)
        XCTAssertEqual(StoryKeyboardOverlap.height(keyboardEndFrame: kb, windowFrame: nil, current: 0, screenBounds: fullScreen), 398)
    }

    /// Le composeur ne lit plus la hauteur brute de la trame.
    func test_theComposer_liftsByTheOverlap_notTheRawHeight() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/StoryComposerView+Canvas.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
        XCTAssertFalse(code.contains("keyboardHeight = frame.height"))
        XCTAssertTrue(code.contains("StoryKeyboardOverlap.height("))
        XCTAssertTrue(code.contains("UIResponder.keyboardWillChangeFrameNotification"),
                      "détacher ou recoller le clavier d'iPad ne passe que par un changement de trame")
    }
}
