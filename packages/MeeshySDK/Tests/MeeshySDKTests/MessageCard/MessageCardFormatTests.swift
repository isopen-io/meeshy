import Foundation
import Testing
@testable import MeeshySDK

private final class MemoryStore: MessageCardPreferenceStore {
    var values: [String: String] = [:]

    init(_ values: [String: String] = [:]) {
        self.values = values
    }

    func string(forKey key: String) -> String? { values[key] }
    func setString(_ value: String, forKey key: String) { values[key] = value }
}

/// Le format par défaut (« Export rapide »), le compteur d'usage, et ce que
/// la carte a le droit de montrer — miroirs de `message-card-format.test.ts`,
/// `message-card-usage.test.ts` et `message-card-subject.test.ts`.
struct MessageCardFormatTests {

    // MARK: - Format

    @Test func format_noStoredDefault_meansNoQuickExport() {
        #expect(MessageCardFormat.readDefault(from: MemoryStore()) == nil)
    }

    @Test func format_roundTripsThroughTheStore() {
        let store = MemoryStore()
        let format = MessageCardFormat(
            template: MessageCardTemplateID(palette: .minuit, typeface: .affiche, link: .fleche),
            showConversationTitle: true, showAuthors: true, showDate: true, anonymizeQuoted: true, anonymizeReply: false
        )
        MessageCardFormat.writeDefault(format, to: store)
        #expect(MessageCardFormat.readDefault(from: store) == format)
    }

    @Test func format_readsTheWebShape() {
        let raw = #"{"template":"neige.systeme.bulles","showConversationTitle":false,"showAuthors":true,"showDate":false,"anonymizeQuoted":false,"anonymizeReply":true}"#
        #expect(MessageCardFormat.parse(raw)?.template.rawValue == "neige.systeme.bulles")
        #expect(MessageCardFormat.parse(raw)?.anonymizeReply == true)
    }

    @Test func format_aDamagedOrRenamedValue_fallsBackToNoDefault() {
        #expect(MessageCardFormat.parse("pas du json") == nil)
        #expect(MessageCardFormat.parse(#"{"template":"aurore.rond.orbite"}"#) == nil)
        #expect(MessageCardFormat.parse(#"{"template":"disparu.rond.orbite","showConversationTitle":false,"showAuthors":true,"showDate":false,"anonymizeQuoted":false,"anonymizeReply":false}"#) == nil)
        #expect(MessageCardFormat.parse(#"{"template":"aurore.rond.orbite","showConversationTitle":1,"showAuthors":true,"showDate":false,"anonymizeQuoted":false,"anonymizeReply":false}"#) == nil)
    }

    @Test func format_offersTheTitleOnlyWhenItExists_andAnonymityOnlyForAPaintedName() {
        let initial = MessageCardFormat.initial
        #expect(initial.offeredToggles(hasConversationTitle: true, hasQuote: true) == [.showConversationTitle, .showAuthors, .anonymizeQuoted, .anonymizeReply])
        #expect(initial.offeredToggles(hasConversationTitle: false, hasQuote: false) == [.showAuthors, .anonymizeReply])
        var hidden = initial
        hidden[.showAuthors] = false
        #expect(hidden.offeredToggles(hasConversationTitle: false, hasQuote: true) == [.showAuthors])
    }

    // MARK: - Usage

    @Test func usage_countsEachSavedCard_andRanksTheMostUsedFirst() {
        let store = MemoryStore()
        let minuit = MessageCardTemplateID(palette: .minuit, typeface: .affiche, link: .fleche)
        let citron = MessageCardTemplateID(palette: .citron, typeface: .machine, link: .bulles)
        MessageCardUsage.record(citron, in: store)
        MessageCardUsage.record(minuit, in: store)
        MessageCardUsage.record(minuit, in: store)
        let usage = MessageCardUsage.read(from: store)
        #expect(usage == [minuit: 2, citron: 1])
        let popular = MessageCardUsage.popular(usage, count: 6)
        #expect(Array(popular.prefix(2)) == [minuit, citron])
        #expect(popular.count == 6)
        #expect(Set(popular).count == 6)
    }

    @Test func usage_aFreshDevice_showsTheShowcase_andIgnoresDamagedEntries() {
        #expect(MessageCardUsage.popular([:], count: 6) == MessageCardTemplates.featured)
        let store = MemoryStore([MessageCardUsage.storageKey: #"{"disparu.rond.orbite":4,"aurore.rond.orbite":-1,"lagon.futur.filet":2}"#])
        #expect(MessageCardUsage.read(from: store) == [MessageCardTemplateID(palette: .lagon, typeface: .futur, link: .filet): 2])
        #expect(MessageCardUsage.read(from: MemoryStore([MessageCardUsage.storageKey: "[]"])).isEmpty)
    }

    // MARK: - Sujet

    private static let now = Date(timeIntervalSince1970: 1_790_000_000)
    private static let viewer = MessageCardSubject.Viewer(id: "u-jacques", displayName: "Jacques")

    private static func message(
        content: String = "Chez Lina, à 20 h !",
        replyTo: ReplyReference? = MessageCardFormatTests.quote(nature: .ordinary),
        isMe: Bool = true,
        configure: (inout MeeshyMessage) -> Void = { _ in }
    ) -> MeeshyMessage {
        var message = MeeshyMessage(
            id: "m-reply", conversationId: "c-1", senderId: isMe ? "u-jacques" : "u-awa",
            content: content, originalLanguage: "fr",
            createdAt: Date(timeIntervalSince1970: 1_789_999_000),
            replyTo: replyTo, senderName: isMe ? "jacques.m" : "Awa", isMe: isMe
        )
        configure(&message)
        return message
    }

    /// Une citation dont le fil a déclaré la nature — `nil` : non déclarée.
    private static func quote(nature: ContentExitLaw.Nature?) -> ReplyReference {
        var reference = ReplyReference(messageId: "m-quoted", authorName: "Amina", previewText: "On se retrouve où ce soir ?")
        reference.quotedExitNature = nature
        return reference
    }

    private static func subject(_ message: MeeshyMessage, served: String? = nil, translations: [String: String] = [:], language: String? = nil) -> MessageCardSubject? {
        MessageCardSubject.of(message: message, servedText: served, translations: translations, viewer: viewer, language: language, now: now)
    }

    @Test func subject_aReplyCarriesItsQuote_andTheViewerSignsWithTheirDisplayName() {
        #expect(Self.subject(Self.message()) == MessageCardSubject(
            quoted: MessageCardPart(author: "Amina", text: "On se retrouve où ce soir ?"),
            reply: MessageCardPart(author: "Jacques", text: "Chez Lina, à 20 h !"),
            sentAt: Date(timeIntervalSince1970: 1_789_999_000)
        ))
        #expect(Self.subject(Self.message(isMe: false))?.reply.author == "Awa")
    }

    @Test func subject_showsWhatTheReaderSees_orTheChosenLanguage() {
        let message = Self.message()
        let translations = ["en": "At Lina's, 8 pm!"]
        #expect(Self.subject(message, served: "At Lina's, 8 pm!", translations: translations)?.reply.text == "At Lina's, 8 pm!")
        #expect(Self.subject(message, served: "At Lina's, 8 pm!", translations: translations, language: "fr")?.reply.text == "Chez Lina, à 20 h !")
        #expect(Self.subject(message, translations: translations, language: "EN")?.reply.text == "At Lina's, 8 pm!")
        #expect(Self.subject(message, translations: translations, language: "de")?.reply.text == "Chez Lina, à 20 h !")
        #expect(MessageCardSubject.languages(of: message, translations: ["en": "At Lina's, 8 pm!", "es": " ", "fr": "doublon"]) == ["fr", "en"])
    }

    @Test func subject_aProtectedMessageNeverLeavesAsAnImage() {
        #expect(Self.subject(Self.message { $0.isViewOnce = true }) == nil)
        #expect(Self.subject(Self.message { $0.isBlurred = true }) == nil)
        #expect(Self.subject(Self.message { $0.deletedAt = Self.now }) == nil)
        #expect(Self.subject(Self.message { $0.expiresAt = Self.now.addingTimeInterval(-1) }) == nil)
        #expect(Self.subject(Self.message { $0.messageSource = .system }) == nil)
        #expect(Self.subject(Self.message(content: "   ")) == nil)
    }

    /// La loi de sortie (#9573) : un contenu qui disparaît ne s'image pas, même
    /// VIVANT — flamme à durée, flamme après lecture, échéance sans durée lisible.
    @Test func subject_aMessageThatDisappearsNeverLeavesAsAnImage_evenAlive() {
        #expect(Self.subject(Self.message { $0.effects = MessageEffects(flags: .ephemeral, ephemeralDuration: 300) }) == nil)
        #expect(Self.subject(Self.message { $0.effects = MessageEffects(flags: [.ephemeral, .ephemeralAfterRead]) }) == nil)
        #expect(Self.subject(Self.message { $0.expiresAt = Self.now.addingTimeInterval(60) }) == nil)
        #expect(!MessageCardSubject.isExportable(
            Self.message { $0.effects = MessageEffects(flags: .ephemeral, ephemeralDuration: 300) }, now: Self.now
        ))
        #expect(MessageCardSubject.isExportable(Self.message(), now: Self.now))
    }

    /// Un message qui CITE un contenu protégé ne s'image pas (#9573, décision
    /// porteur du 2026-10-08) : flamme, flamme après lecture, vue unique, média
    /// cité flouté, ou nature non déclarée — la carte ENTIÈRE se refuse, plutôt
    /// que de peindre la réponse sans ce qu'elle cite.
    @Test func subject_aReplyQuotingProtectedContent_neverLeavesAsAnImage() {
        for nature in [ContentExitLaw.Nature.timedFlame, .afterReadFlame, .viewOnce] {
            #expect(Self.subject(Self.message(replyTo: Self.quote(nature: nature))) == nil, "\(nature.rawValue)")
            #expect(!MessageCardSubject.isExportable(Self.message(replyTo: Self.quote(nature: nature)), now: Self.now))
            #expect(Self.message(replyTo: Self.quote(nature: nature)).quotesProtectedContent)
        }
        #expect(Self.subject(Self.message(replyTo: Self.quote(nature: nil))) == nil, "citation illisible ⇒ fermé")
        let blurredMedia = ReplyReference(messageId: "m-quoted", authorName: "Amina", previewText: "🌫️ 🖼️", attachmentIsProtected: true)
        #expect(Self.subject(Self.message(replyTo: blurredMedia)) == nil, "un média cité protégé ⇒ fermé")
        #expect(Self.subject(Self.message(replyTo: Self.quote(nature: .ordinary)))?.quoted != nil)
        #expect(!Self.message(replyTo: Self.quote(nature: .ordinary)).quotesProtectedContent)
    }

    /// Le message cité RÉEL, quand il est en mémoire, fait foi sur la citation.
    @Test func subject_theRealQuotedMessageDecides_overWhatTheReferenceDeclares() {
        func card(reference: ReplyReference, quoted: MeeshyMessage) -> MessageCardSubject? {
            MessageCardSubject.of(message: Self.message(replyTo: reference), servedText: nil, translations: [:],
                                  viewer: Self.viewer, quotedMessage: quoted, now: Self.now)
        }
        var flame = MeeshyMessage(id: "m-quoted", conversationId: "c-1", senderId: "u-amina", content: "On se retrouve où ce soir ?")
        flame.effects = MessageEffects(flags: .ephemeral, ephemeralDuration: 30)
        #expect(card(reference: Self.quote(nature: .ordinary), quoted: flame) == nil,
                "une citation qui se dit ordinaire ne fait pas sortir une flamme")
        var blurred = MeeshyMessage(id: "m-quoted", conversationId: "c-1", senderId: "u-amina", content: "Secret")
        blurred.isBlurred = true
        #expect(card(reference: Self.quote(nature: .ordinary), quoted: blurred) == nil)
        let ordinary = MeeshyMessage(id: "m-quoted", conversationId: "c-1", senderId: "u-amina", content: "On se retrouve où ce soir ?")
        #expect(card(reference: Self.quote(nature: nil), quoted: ordinary)?.quoted != nil,
                "le message réel, ordinaire, rouvre une citation que le fil n'avait pas déclarée")
        let other = MeeshyMessage(id: "autre", conversationId: "c-1", senderId: "u-amina", content: "x")
        #expect(card(reference: Self.quote(nature: nil), quoted: other) == nil,
                "un autre message que le cité ne prouve rien")
    }

    /// Une flamme citée qui a EXPIRÉ reste une flamme citée ; la citation d'un
    /// message SUPPRIMÉ ou d'une story ne porte rien de protégé — la réponse
    /// s'image, sans citation.
    @Test func subject_aDeletedOrExpiredQuoteShowsNothing() {
        var expired = ReplyReference(messageId: "m-quoted", authorName: "Amina", previewText: "Secret")
        expired.quotedExpiresAt = Self.now.addingTimeInterval(-1)
        #expect(Self.subject(Self.message(replyTo: expired)) == nil)
        let sealedFlame = Self.quote(nature: .timedFlame).tombstoned(at: Self.now, expired: true)
        #expect(Self.subject(Self.message(replyTo: sealedFlame)) == nil)
        let deleted = ReplyReference(messageId: "m-quoted", authorName: "Amina", previewText: "Secret").tombstoned(at: Self.now)
        #expect(Self.subject(Self.message(replyTo: deleted)) != nil)
        #expect(Self.subject(Self.message(replyTo: deleted))?.quoted == nil)
        let story = ReplyReference(messageId: "s", authorName: "Story", previewText: "x", isStoryReply: true)
        #expect(Self.subject(Self.message(replyTo: story)) != nil)
        #expect(Self.subject(Self.message(replyTo: story))?.quoted == nil)
        #expect(Self.subject(Self.message(replyTo: nil))?.quoted == nil)
    }

    @Test func input_appliesTheFormat_titleDateAndAnonymity() {
        let subject = Self.subject(Self.message())!
        let format = MessageCardFormat(template: MessageCardTemplates.defaultID, showConversationTitle: true, showAuthors: true, showDate: true, anonymizeQuoted: true, anonymizeReply: false)
        let input = MessageCardInput.of(subject: subject, format: format, handle: "jacques", conversationTitle: "Soirée", anonymousLabel: "Anonyme", formatDate: { _ in "28 septembre 2026" })
        #expect(input.quoted?.author == "Anonyme")
        #expect(input.reply.author == "Jacques")
        #expect(input.title == "Soirée")
        #expect(input.date == "28 septembre 2026")
        let plain = MessageCardInput.of(subject: subject, format: .initial, handle: "jacques", conversationTitle: "Soirée", anonymousLabel: "Anonyme", formatDate: { _ in "x" })
        #expect(plain.title == nil && plain.date == nil)
    }

    @Test func fileName_isReadableInAGallery_withoutAnyContent() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        #expect(MessageCardSubject.fileName(at: Date(timeIntervalSince1970: 1_790_000_000), calendar: calendar) == "meeshy-20260921-141320.png")
    }
}
