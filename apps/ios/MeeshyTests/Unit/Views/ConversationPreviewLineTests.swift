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
            segments: [.label("Message vocal"), .label("Mémo")]
        )

        let spoken = ConversationPreviewLine.spokenText(preview, strings: strings())

        XCTAssertEqual(spoken, "Alice : Message vocal, Mémo")
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
            "Voice message, \(MediaFormat.duration(12, style: .spoken, locale: locale)), "
                + MediaFormat.duration(3725, style: .spoken, locale: locale)
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

    // MARK: - Les détails d'une pièce, dits en mots (#15760)

    private static let timesSign = "\u{00A0}×\u{00A0}"
    private static let sayDimensions = "%1$@ sur %2$@"

    /// Le catalogue français, explicite : la ligne se compose dans la langue du
    /// bundle de test, pas dans celle que ce témoin vérifie.
    private func frenchStrings() -> ConversationPreviewStrings {
        ConversationPreviewStrings(language: "fr") { key in
            switch key {
            case .lineAuthor: return "{author} : {line}"
            case .authorSelf: return "Vous"
            case .attachmentPhoto: return "Photo"
            case .unitMinute: return "{count} min"
            default: return key.rawValue
            }
        }
    }

    private func photoRow(
        senderName: String? = "Alice", caption: String? = "Au bord du lac",
        type: Conversation.ConversationType = .direct, ephemeralDuration: Int? = nil
    ) -> Conversation {
        var row = Conversation(
            id: "c-photo", identifier: "c-photo", type: type,
            lastMessagePreview: caption,
            lastMessageAttachments: [
                MeeshyMessageAttachment(
                    id: "a1", mimeType: "image/jpeg", fileSize: 239_616, width: 450, height: 456, uploadedBy: "u-alice"
                )
            ],
            lastMessageAttachmentCount: 1,
            lastMessageId: "m-photo",
            lastMessageSenderName: senderName,
            lastMessageSenderUserId: "u-alice"
        )
        row.lastMessageNature = LastMessageNature(messageType: "image", ephemeralDuration: ephemeralDuration)
        return row
    }

    private func composed(_ row: Conversation) -> ConversationPreview {
        ConversationPreviewLine.preview(
            for: row, viewerId: "me", preferredLanguages: ["fr"], now: start, strings: frenchStrings(),
            receipts: EphemeralReceiptLedger(defaults: UserDefaults(suiteName: "preview-line-\(UUID().uuidString)")),
            memory: EndToEndRegimeMemory(defaults: nil)
        )
    }

    func test_dimensions_readsOnlyTheComposersForm() {
        let width = ConversationPreviewLine.dimensions("1920\(Self.timesSign)1080")
        XCTAssertEqual(width?.width, "1920")
        XCTAssertEqual(width?.height, "1080")
        XCTAssertNil(ConversationPreviewLine.dimensions("1920×1080"))
        XCTAssertNil(ConversationPreviewLine.dimensions("1920 x 1080"))
        XCTAssertNil(ConversationPreviewLine.dimensions("Réunion 3\(Self.timesSign)4 pers."))
        XCTAssertNil(ConversationPreviewLine.dimensions("\(Self.timesSign)4"))
    }

    @MainActor
    func test_spokenText_dimensions_readsInWords() {
        let preview = ConversationPreview(
            kind: .message, icon: .photo, segments: [.label("Photo"), .label("1920\(Self.timesSign)1080")]
        )

        let spoken = ConversationPreviewLine.spokenText(preview, strings: strings(), dimensions: Self.sayDimensions)

        XCTAssertEqual(spoken, "Photo, 1920 sur 1080")
        XCTAssertFalse(spoken.contains("×"), "VoiceOver dirait « fois » ou « multiplié par »")
    }

    @MainActor
    func test_spokenText_aUsersOwnText_isSaidAsTyped() {
        let typed = "3\(Self.timesSign)4"
        let preview = ConversationPreview(kind: .message, segments: [.text(typed, language: nil), .text("12 Ko", language: nil)])

        let spoken = ConversationPreviewLine.spokenText(preview, strings: strings(), dimensions: Self.sayDimensions)

        XCTAssertEqual(spoken, "\(typed), 12 Ko")
    }

    func test_spokenFileSize_readsOnlyAWeight() {
        let english = Locale(identifier: "en_US")
        XCTAssertNotNil(ConversationPreviewLine.spokenFileSize("234 KB", locale: english))
        XCTAssertNotNil(ConversationPreviewLine.spokenFileSize("1.4 MB", locale: english))
        XCTAssertNotNil(ConversationPreviewLine.spokenFileSize("512 B", locale: english))
        XCTAssertNotNil(ConversationPreviewLine.spokenFileSize("512 o", locale: english))
        XCTAssertNotNil(ConversationPreviewLine.spokenFileSize("1,4 Mo", locale: english))
        XCTAssertNil(ConversationPreviewLine.spokenFileSize("2 Mo restants", locale: english))
        XCTAssertNil(ConversationPreviewLine.spokenFileSize("Mo", locale: english))
        XCTAssertNil(ConversationPreviewLine.spokenFileSize("1.45 MB", locale: english))
        XCTAssertNil(ConversationPreviewLine.spokenFileSize("4 min", locale: english))
    }

    @MainActor
    func test_spokenText_fileSize_readsInWords() {
        let preview = ConversationPreview(kind: .message, icon: .photo, segments: [.label("Photo"), .label("234 KB")])
        let english = ConversationPreviewLine.spokenText(
            preview, strings: strings(), locale: Locale(identifier: "en_US"), dimensions: Self.sayDimensions
        )
        XCTAssertTrue(english.lowercased().contains("kilobyte"), english)
        XCTAssertFalse(english.contains("KB"), english)

        let french = ConversationPreviewLine.spokenText(
            ConversationPreview(kind: .message, icon: .photo, segments: [.label("Photo"), .label("1,4 Mo")]),
            strings: strings(), locale: Locale(identifier: "fr_FR"), dimensions: Self.sayDimensions
        )
        XCTAssertTrue(french.contains("mégaoctet"), french)
        XCTAssertTrue(french.contains("1,4"), french)
        XCTAssertFalse(french.contains("Mo"), french)
    }

    @MainActor
    func test_spokenText_aClockStaysADuration_nextToAWeight() {
        let locale = Locale(identifier: "en_US")
        let preview = ConversationPreview(kind: .message, icon: .voice, segments: [.label("0:12"), .label("48 KB")])

        let spoken = ConversationPreviewLine.spokenText(preview, strings: strings(), locale: locale, dimensions: Self.sayDimensions)

        XCTAssertTrue(spoken.hasPrefix(MediaFormat.duration(12, style: .spoken, locale: locale) + ", "), spoken)
    }

    // Non-régression : la loi du composeur (SDK) est déjà fusionnée, ces trois
    // témoins sont verts dès leur écriture — ils figent ce que la ligne DIT.

    @MainActor
    func test_preview_directConversation_prefixesPeerAuthor() {
        let peer = composed(photoRow(senderName: "Alice"))
        XCTAssertTrue(ConversationPreviewLine.seenText(peer, strings: frenchStrings()).hasPrefix("Alice : "))
        XCTAssertTrue(ConversationPreviewLine.spokenText(peer, strings: frenchStrings()).hasPrefix("Alice : "))

        let mine = composed(photoRow(senderName: ConversationListAuthor.readerLabel))
        let prefix = "\(ConversationListAuthor.readerLabel) : "
        XCTAssertTrue(ConversationPreviewLine.seenText(mine, strings: frenchStrings()).hasPrefix(prefix))
        XCTAssertTrue(ConversationPreviewLine.spokenText(mine, strings: frenchStrings()).hasPrefix(prefix))
    }

    @MainActor
    func test_preview_captionedPhoto_keepsDetails() {
        let preview = composed(photoRow())

        XCTAssertEqual(
            ConversationPreviewLine.seenText(preview, strings: frenchStrings()),
            "Alice : Au bord du lac · 450\(Self.timesSign)456 · 234 Ko"
        )
        let spoken = ConversationPreviewLine.spokenText(
            preview, strings: frenchStrings(), locale: Locale(identifier: "fr_FR"), dimensions: Self.sayDimensions
        )
        XCTAssertTrue(spoken.contains("450 sur 456"), spoken)
        XCTAssertTrue(spoken.contains("kilooctet"), spoken)
    }

    @MainActor
    func test_preview_ephemeralPhoto_hidesDetails() {
        let preview = composed(photoRow(ephemeralDuration: 240))
        let seen = ConversationPreviewLine.seenText(preview, strings: frenchStrings())
        let spoken = ConversationPreviewLine.spokenText(
            preview, strings: frenchStrings(), locale: Locale(identifier: "fr_FR"), dimensions: Self.sayDimensions
        )

        for said in [seen, spoken] {
            XCTAssertFalse(said.contains("×"), said)
            XCTAssertFalse(said.contains("450"), said)
            XCTAssertFalse(said.contains("Ko"), said)
            XCTAssertFalse(said.contains("octet"), said)
            XCTAssertFalse(said.contains(" sur "), said)
        }
        XCTAssertEqual(seen.replacingOccurrences(of: ConversationPreviewLine.segmentSeparator, with: ", "), spoken)
    }
}
