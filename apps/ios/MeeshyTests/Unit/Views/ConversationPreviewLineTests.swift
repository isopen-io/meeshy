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
            segments: [.label("Message vocal"), .label("48 Ko")]
        )

        let spoken = ConversationPreviewLine.spokenText(preview, strings: strings())

        XCTAssertEqual(spoken, "Alice : Message vocal, 48 Ko")
        XCTAssertFalse(spoken.contains(ConversationPreviewIcon.voice.glyph))
    }

    /// « 0:12 » lu tel quel par VoiceOver se dit comme une HEURE. La ligne
    /// visible garde l'horloge du composeur commun ; la ligne dite la convertit.
    func test_spokenText_saysAClockAsADuration_neverAsATimeOfDay() {
        let locale = Locale(identifier: "en_US")
        let preview = ConversationPreview(
            kind: .message, icon: .voice, segments: [.label("Voice message"), .label("0:12"), .label("1:02:05")]
        )

        let spoken = ConversationPreviewLine.spokenText(preview, strings: strings(), locale: locale)

        XCTAssertEqual(
            spoken,
            "Voice message, \(LocalizedNumber.spokenDuration(seconds: 12, locale: locale)), "
                + LocalizedNumber.spokenDuration(seconds: 3725, locale: locale)
        )
        XCTAssertFalse(spoken.contains("0:12"))
    }

    func test_clockSeconds_readsOnlyAClock() {
        XCTAssertEqual(ConversationPreviewLine.clockSeconds("0:12"), 12)
        XCTAssertEqual(ConversationPreviewLine.clockSeconds("12:05"), 725)
        XCTAssertEqual(ConversationPreviewLine.clockSeconds("1:02:05"), 3725)
        XCTAssertNil(ConversationPreviewLine.clockSeconds("1920×1080"))
        XCTAssertNil(ConversationPreviewLine.clockSeconds("Réunion à 10:30"))
        XCTAssertNil(ConversationPreviewLine.clockSeconds("0:7"))
    }

    func test_protectedPlaceholders_readInItalic_butAMemberMessageDoesNot() {
        let viewOnce = ConversationPreview(kind: .message, icon: .viewOnce, segments: [.label("Vue unique")])
        let text = ConversationPreview(kind: .message, segments: [.text("Bonjour", language: nil)])

        XCTAssertTrue(ConversationPreviewLine.isItalic(viewOnce))
        XCTAssertFalse(ConversationPreviewLine.isItalic(text))
    }
}
