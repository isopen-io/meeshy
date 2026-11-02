import XCTest
import MeeshySDK
@testable import Meeshy

/// **Le toucher qui montre ou masque les détails ne vibre pas** (#12421, porteur
/// 2026-10-23). Les vibrations des actions (appui long qui met en pause,
/// glissement vers le haut, boutons) restent.
final class ConversationMediaGalleryStageTapHapticTests: XCTestCase {

    func test_stageEntryHaptic_tap_isSilent() {
        XCTAssertFalse(ConversationMediaGalleryView.stageEntryVibrates(.tap))
    }

    func test_stageEntryHaptic_longPressAndSwipeUp_stillVibrate() {
        XCTAssertTrue(ConversationMediaGalleryView.stageEntryVibrates(.longPress))
        XCTAssertTrue(ConversationMediaGalleryView.stageEntryVibrates(.swipeUp))
    }

    func test_onEnterStage_everyHapticIsGuardedByTheDoor() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationMediaGalleryView+Presentation.swift")
        let stripped = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        guard let body = DeclarationBodyScanner.body(containing: "func onEnterStage(_ door: StageEntry)", in: stripped) else {
            return XCTFail("onEnterStage introuvable — le fichier a changé de forme.")
        }
        let hapticLines = body.split(separator: "\n").filter {
            $0.contains("HapticFeedback") || $0.contains("sensoryFeedback") || $0.contains("FeedbackGenerator")
        }
        XCTAssertFalse(hapticLines.isEmpty, "Les portes qui vibrent doivent encore vibrer.")
        for line in hapticLines {
            XCTAssertTrue(line.contains("door == .longPress") || line.contains("stageEntryVibrates(door)"),
                          "Retour haptique non gardé par la porte : \(line)")
        }
    }
}
