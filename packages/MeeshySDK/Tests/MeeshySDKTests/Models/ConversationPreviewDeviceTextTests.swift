import Foundation
import Testing
@testable import MeeshySDK

/// #12968 — la ligne d'une conversation chiffrée de bout en bout lit le clair
/// que CET appareil tient de son dernier message ; sans lui, ou hors de SA
/// place, « Message chiffré ».
struct ConversationPreviewDeviceTextTests {

    private let now = Date(timeIntervalSince1970: 1_790_000_000)
    private var sentAt: Date { now.addingTimeInterval(-60) }

    private func strings() -> ConversationPreviewStrings {
        ConversationPreviewStrings(language: "fr") { $0.rawValue }
    }

    private func sealedRow(configure: (inout MeeshyConversation) -> Void = { _ in }) -> MeeshyConversation {
        var row = MeeshyConversation(id: "conv-1", identifier: "conv-1", type: .direct,
                                     lastMessageAt: sentAt,
                                     lastMessagePreview: "", lastMessageId: "m-1")
        row.lastMessageSenderName = "Alice"
        row.lastMessageSenderUserId = "u-alice"
        row.lastMessageNature = LastMessageNature(messageType: "text", isEncrypted: true)
        configure(&row)
        return row
    }

    private func text(
        _ body: String, messageId: String = "m-1", conversationId: String = "conv-1",
        author: ConversationPreviewDeviceText.Author = .peer(userId: "u-alice"), composedAt: Date? = nil,
        language: String? = "fr"
    ) -> ConversationPreviewDeviceText {
        ConversationPreviewDeviceText(
            messageId: messageId, conversationId: conversationId, author: author,
            composedAt: composedAt ?? sentAt, text: body, language: language
        )
    }

    private func compose(_ row: MeeshyConversation, readOnDevice: ConversationPreviewDeviceText?) -> ConversationPreview {
        let input = ConversationPreviewInput(
            conversation: row, viewerId: "u-me", language: "fr",
            preferredLanguages: ["fr"], now: now, readOnDevice: readOnDevice
        )
        return ConversationPreviewComposer.compose(input, strings: strings())
    }

    private func isLabelled(_ preview: ConversationPreview) -> Bool {
        preview.icon == .encrypted && preview.segments == [.label("protection.encrypted")]
    }

    @Test func sealedLastMessage_withoutDeviceText_staysLabelled() {
        #expect(isLabelled(compose(sealedRow(), readOnDevice: nil)))
    }

    @Test func sealedLastMessage_readOnDevice_showsItsText() {
        let preview = compose(sealedRow(), readOnDevice: text("On se voit à 18 h"))

        #expect(preview.kind == .message)
        #expect(preview.icon == nil)
        #expect(preview.author?.label == "Alice")
        #expect(preview.segments == [.text("On se voit à 18 h", language: nil)])
    }

    @Test func myOwnMessage_asTheRowStoresIt_isRead() {
        let row = sealedRow {
            $0.lastMessageSenderName = ConversationListAuthor.readerLabel
            $0.lastMessageSenderUserId = nil
        }

        let preview = compose(row, readOnDevice: text("Je pars", author: .reader))

        #expect(preview.segments == [.text("Je pars", language: nil)])
    }

    @Test func myOwnMessage_onARowThatNamesAPeer_staysLabelled() {
        #expect(isLabelled(compose(sealedRow(), readOnDevice: text("Je pars", author: .reader))))
    }

    @Test func peerText_onARowThatSaysYou_staysLabelled() {
        let row = sealedRow {
            $0.lastMessageSenderName = ConversationListAuthor.readerLabel
            $0.lastMessageSenderUserId = nil
        }

        #expect(isLabelled(compose(row, readOnDevice: text("Envoie-moi le code"))))
    }

    @Test func authorTheServerReassigned_staysLabelled() {
        let row = sealedRow { $0.lastMessageSenderUserId = "u-mallory" }

        #expect(isLabelled(compose(row, readOnDevice: text("Envoie-moi le code"))))
    }

    @Test func deviceText_ofAnotherMessage_neverDressesTheLastOne() {
        #expect(isLabelled(compose(sealedRow(), readOnDevice: text("Ancien message", messageId: "m-0"))))
    }

    @Test func deviceText_writtenForAnotherConversation_staysLabelled() {
        #expect(isLabelled(compose(sealedRow(), readOnDevice: text("Ailleurs", conversationId: "conv-2"))))
    }

    @Test func deviceText_neverDressesASystemLine() {
        let row = sealedRow { $0.lastMessageNature = LastMessageNature(messageType: "system", isEncrypted: true) }

        let preview = compose(row, readOnDevice: text("Le chiffrement a été désactivé"))

        #expect(!preview.segments.contains(.text("Le chiffrement a été désactivé", language: nil)))
    }

    @Test func oldMessageReplayedAsTheLastOne_staysLabelled() {
        let replayed = text("Oui, je confirme le virement", composedAt: sentAt.addingTimeInterval(-3 * 86_400))

        #expect(isLabelled(compose(sealedRow(), readOnDevice: replayed)))
    }

    @Test func compositionWithinTheTolerance_isRead() {
        let late = text("Bien reçu", composedAt: sentAt.addingTimeInterval(-14 * 60))

        #expect(compose(sealedRow(), readOnDevice: late).segments == [.text("Bien reçu", language: nil)])
    }

    /// #13002 — mesure : l'auteur dont l'horloge retarde de 40 min (ou cet
    /// appareil, pour ses propres envois) voyait son message scellé à tort.
    @Test func anAuthorClockBehindByMinutes_isStillRead() {
        let skewed = text("Bien reçu", composedAt: sentAt.addingTimeInterval(-40 * 60))

        #expect(compose(sealedRow(), readOnDevice: skewed).segments == [.text("Bien reçu", language: nil)])
    }

    /// #13002 — mesure : une horloge en avance ne désigne jamais un message
    /// plus ancien ; elle scellait aussi à tort.
    @Test func anAuthorClockAhead_isRead() {
        let ahead = text("Bien reçu", composedAt: sentAt.addingTimeInterval(2 * 3_600))

        #expect(compose(sealedRow(), readOnDevice: ahead).segments == [.text("Bien reçu", language: nil)])
    }

    @Test func compositionMoreThanADayBeforeTheServedHour_staysLabelled() {
        let old = text("Bien reçu", composedAt: sentAt.addingTimeInterval(-25 * 3_600))

        #expect(isLabelled(compose(sealedRow(), readOnDevice: old)))
    }

    @Test func rowTheServerDoesNotSeal_keepsWhatItServes() {
        let row = sealedRow {
            $0.lastMessagePreview = "Servi"
            $0.lastMessageNature = LastMessageNature(messageType: "text", isEncrypted: false)
        }

        let preview = compose(row, readOnDevice: text("Clair local"))

        #expect(preview.segments == [.text("Servi", language: nil)])
    }

    @Test func deviceText_neverServesAServerTranslation() {
        let row = sealedRow {
            $0.lastMessageOriginalLanguage = "en"
            $0.lastMessageTranslations = ["fr": "Traduction servie"]
        }

        let preview = compose(row, readOnDevice: text("See you at 6", language: "en"))

        #expect(preview.segments == [.text("See you at 6", language: nil)])
    }

    /// #13002 — la ligne sert la traduction faite sur l'appareil, descendue
    /// par le Prisme du lecteur comme dans le fil ; jamais celle du serveur.
    @Test func deviceTranslation_isServedInTheReadersLanguage() {
        let row = sealedRow { $0.lastMessageTranslations = ["fr": "Traduction servie"] }
        let read = text("See you at 6", language: "en").translated(["fr": "On se voit à 18 h"])

        let preview = compose(row, readOnDevice: read)

        #expect(preview.segments.contains { segment in
            if case .text(let body, _) = segment { return body == "On se voit à 18 h" }
            return false
        })
    }

    @Test func deviceTranslation_intoALanguageOutOfThePrism_servesTheOriginal() {
        let read = text("See you at 6", language: "en").translated(["de": "Bis um 6"])

        let preview = compose(sealedRow(), readOnDevice: read)

        #expect(preview.segments == [.text("See you at 6", language: nil)])
    }

    @Test func viewOnceProtection_stillWins_overTheDeviceText() {
        let row = sealedRow { $0.lastMessageIsViewOnce = true }

        let preview = compose(row, readOnDevice: text("Secret"))

        #expect(preview.icon == .viewOnce)
        #expect(!preview.segments.contains(.text("Secret", language: nil)))
    }

    @Test func emptyDeviceText_staysLabelled() {
        #expect(isLabelled(compose(sealedRow(), readOnDevice: text("   "))))
    }
}
