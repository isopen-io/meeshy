import XCTest
import SwiftUI
import MeeshySDK
@testable import Meeshy

/// #7548 — la ligne d'aperçu partagée par les deux rangées de la liste.
final class ConversationPreviewLineTests: XCTestCase {

    private let start = Date(timeIntervalSince1970: 1_790_000_000)

    private func strings() -> ConversationPreviewStrings {
        ConversationPreviewStrings(language: "fr") { key in
            key == .lineAuthor ? "{author} : {line}" : key.rawValue
        }
    }

    // MARK: - Le décompte d'un éphémère

    func test_countdownSchedule_ticksEachSecond_andLandsExactlyOnTheDeadline() {
        let deadline = start.addingTimeInterval(2.5)
        let entries = Array(CountdownSchedule(until: deadline).entries(from: start, mode: .normal))

        XCTAssertEqual(entries, [start, start.addingTimeInterval(1), start.addingTimeInterval(2), deadline])
    }

    func test_countdownSchedule_stopsOnceTheDeadlineHasPassed() {
        let entries = Array(CountdownSchedule(until: start).entries(from: start.addingTimeInterval(10), mode: .normal))

        XCTAssertEqual(entries.count, 1, "une ligne déjà expirée recompose une fois, puis plus jamais")
    }

    // MARK: - L'iconographie

    func test_everyComposerIcon_hasItsSymbol() {
        for icon in ConversationPreviewIcon.allCases {
            XCTAssertNotNil(ConversationPreviewLine.symbol(for: icon), "\(icon) n'a pas de glyphe")
        }
        XCTAssertNil(ConversationPreviewLine.symbol(for: nil))
    }

    // MARK: - Ce que VoiceOver dit

    func test_spokenText_saysTheAuthorAndTheSegments_withoutAnyGlyph() {
        let preview = ConversationPreview(
            kind: .message, icon: .voice, author: .member(id: "p", label: "Alice"),
            segments: [.label("Message vocal"), .label("0:12")]
        )

        let spoken = ConversationPreviewLine.spokenText(preview, strings: strings())

        XCTAssertEqual(spoken, "Alice : Message vocal, 0:12")
        XCTAssertFalse(spoken.contains(ConversationPreviewIcon.voice.glyph))
    }

    func test_protectedPlaceholders_readInItalic_butAMemberMessageDoesNot() {
        let viewOnce = ConversationPreview(kind: .message, icon: .viewOnce, segments: [.label("Vue unique")])
        let text = ConversationPreview(kind: .message, segments: [.text("Bonjour", language: nil)])

        XCTAssertTrue(ConversationPreviewLine.isItalic(viewOnce))
        XCTAssertFalse(ConversationPreviewLine.isItalic(text))
    }
}
