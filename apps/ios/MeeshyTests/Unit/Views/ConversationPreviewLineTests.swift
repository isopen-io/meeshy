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

    /// #7614 — la ligne ne se réveille qu'aux instants où son libellé change :
    /// une frontière de minute, le seuil de la dernière minute (le compte à la
    /// seconde est rendu par le système), puis l'échéance. Jamais chaque seconde.
    func test_countdownSchedule_wakesOnlyWhenTheLabelChanges_thenAtTheDeadline() {
        let deadline = start.addingTimeInterval(150)
        let entries = Array(CountdownSchedule(until: deadline).entries(from: start, mode: .normal))

        XCTAssertEqual(entries.count, 4, "départ, 2 min, seuil de la dernière minute, échéance")
        XCTAssertEqual(entries[0], start)
        XCTAssertEqual(entries[1].timeIntervalSince(deadline.addingTimeInterval(-120)), 0.05, accuracy: 0.001)
        XCTAssertEqual(entries[2].timeIntervalSince(deadline.addingTimeInterval(-60)), 0.05, accuracy: 0.001)
        XCTAssertEqual(entries[3].timeIntervalSince(deadline), 0.05, accuracy: 0.001)
    }

    func test_countdownSchedule_stopsOnceTheDeadlineHasPassed() {
        let entries = Array(CountdownSchedule(until: start).entries(from: start.addingTimeInterval(10), mode: .normal))

        XCTAssertEqual(entries.count, 1, "une ligne déjà expirée recompose une fois, puis plus jamais")
    }

    // MARK: - Un dernier message en clair dans une conversation chiffrée (#11380)

    private func conversation(mode: String?, id: String = "c1") -> Conversation {
        var conversation = Conversation(
            id: id, identifier: id, encryptionMode: mode,
            lastMessagePreview: "Envoie-moi le code",
            lastMessageId: "m1",
            lastMessageSenderName: "Bob",
            lastMessageSenderUserId: "u-bob"
        )
        conversation.lastMessageNature = LastMessageNature(messageType: "text")
        conversation.lastMessageTranslations = ["fr": "Tout va bien"]
        conversation.lastMessageOriginalLanguage = "en"
        return conversation
    }

    private func line(_ conversation: Conversation, memory: EndToEndRegimeMemory = EndToEndRegimeMemory(defaults: nil)) -> String {
        ConversationPreviewLine.preview(
            for: conversation, viewerId: "me", preferredLanguages: ["fr"], now: start, strings: strings(), memory: memory
        ).segments.map(\.text).joined(separator: " ")
    }

    func test_preview_plaintextInEndToEnd_isFlaggedAndServesNoServerTranslation() {
        let encrypted = conversation(mode: "e2ee")
        let memory = EndToEndRegimeMemory(defaults: nil)

        XCTAssertTrue(ConversationPreviewLine.isUnencrypted(encrypted, memory: memory))
        XCTAssertTrue(line(encrypted, memory: memory).contains("Envoie-moi le code"))
        XCTAssertFalse(line(encrypted, memory: memory).contains("Tout va bien"), "une traduction du serveur peut dire autre chose")
    }

    func test_preview_conversationWithoutEndToEnd_keepsThePrism() {
        let plain = conversation(mode: nil)
        let memory = EndToEndRegimeMemory(defaults: nil)

        XCTAssertFalse(ConversationPreviewLine.isUnencrypted(plain, memory: memory))
        XCTAssertTrue(line(plain, memory: memory).contains("Tout va bien"))
    }

    /// Une ligne que le serveur sert soudain sans régime reste jugée : l'appareil
    /// se souvient que la conversation est chiffrée.
    func test_preview_downgradedByTheServer_staysFlagged() {
        let memory = EndToEndRegimeMemory(defaults: nil)
        XCTAssertTrue(ConversationPreviewLine.isUnencrypted(conversation(mode: "e2ee", id: "c-down"), memory: memory))

        let downgraded = conversation(mode: nil, id: "c-down")

        XCTAssertTrue(ConversationPreviewLine.isUnencrypted(downgraded, memory: memory))
        XCTAssertFalse(line(downgraded, memory: memory).contains("Tout va bien"))
    }

    // MARK: - L'iconographie

    func test_everyComposerIcon_hasItsSymbol() {
        for icon in ConversationPreviewIcon.allCases {
            XCTAssertNotNil(ConversationPreviewLine.symbol(for: icon), "\(icon) n'a pas de glyphe")
        }
        XCTAssertNil(ConversationPreviewLine.symbol(for: nil))
    }

    // MARK: - Ce que VoiceOver dit

    @MainActor
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
    @MainActor
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

    /// #7871 — la ligne visible est sans notation depuis #7849 ; la ligne
    /// DITE doit l'être aussi, sinon VoiceOver épelle les astérisques.
    @MainActor
    func test_spokenText_saysAFormattedMessage_withoutItsNotation() {
        let preview = ConversationPreview(
            kind: .message, author: .member(id: "p", label: "Alice"),
            segments: [.label("un **mot** et [la doc](https://x.fr), `code`")]
        )

        let spoken = ConversationPreviewLine.spokenText(preview, strings: strings())

        XCTAssertEqual(spoken, "Alice : un mot et la doc, code")
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
