import XCTest
import MeeshySDK
@testable import Meeshy

/// **« Imager la discussion »** (#9039) — depuis « Transférer », la discussion
/// jusqu'au message choisi devient UNE carte de l'atelier « Imagine » : les mots
/// que le lecteur lit, qui les a dits, et les médias peignables — bornés pour
/// la mémoire, et sans jamais rien de ce qu'un message protégé cache.
@MainActor
final class MessageCardDiscussionTests: XCTestCase {

    private static let now = Date(timeIntervalSince1970: 1_790_000_000)
    private static let viewer = MessageCardSubject.Viewer(id: "u-me", displayName: "Moi", username: "moi")

    private static func message(_ id: String, _ content: String, from sender: String = "u-awa", name: String = "Awa",
                                at offset: TimeInterval = 0, attachments: [MeeshyMessageAttachment] = []) -> Message {
        Message(id: id, conversationId: "c", senderId: sender, content: content,
                createdAt: now.addingTimeInterval(offset), attachments: attachments, senderName: name, senderUsername: name.lowercased())
    }

    private static func thread(_ count: Int) -> [Message] {
        (0..<count).map { index in message("m\(index)", "Message \(index)", at: TimeInterval(index)) }
    }

    // MARK: - La fenêtre

    func test_window_endsAtTheChosenMessage_inThreadOrder() {
        let window = MessageCardDiscussion.window(of: Self.thread(5), endingAt: "m3", now: Self.now)
        XCTAssertEqual(window.map(\.id), ["m0", "m1", "m2", "m3"], "ce qui suit le message choisi n'en fait pas partie")
    }

    func test_window_isBoundedToTheLastMessages() {
        let window = MessageCardDiscussion.window(of: Self.thread(40), endingAt: "m39", now: Self.now)
        XCTAssertEqual(window.count, MessageCardDiscussion.maxMessages)
        XCTAssertEqual(window.last?.id, "m39")
        XCTAssertEqual(window.first?.id, "m\(40 - MessageCardDiscussion.maxMessages)")
    }

    func test_window_skipsProtectedMessages() {
        var viewOnce = Self.message("secret", "Ne pas copier", at: 1)
        viewOnce.isBlurred = true
        let messages = [Self.message("a", "Salut"), viewOnce, Self.message("b", "Ça va ?", at: 2)]

        let window = MessageCardDiscussion.window(of: messages, endingAt: "b", now: Self.now)

        XCTAssertEqual(window.map(\.id), ["a", "b"], "ce qui ne se copie pas ne se peint pas")
    }

    /// La loi de sortie (#9573) : une flamme, même vivante, n'entre pas dans
    /// l'image d'une discussion.
    func test_window_skipsMessagesThatDisappear_evenAlive() {
        var timed = Self.message("flamme", "Dans trente secondes", at: 1)
        timed.effects = MessageEffects(flags: .ephemeral, ephemeralDuration: 30)
        var afterRead = Self.message("oeil", "Après lecture", at: 2)
        afterRead.effects = MessageEffects(flags: [.ephemeral, .ephemeralAfterRead])
        let messages = [Self.message("a", "Salut"), timed, afterRead, Self.message("b", "Ça va ?", at: 3)]

        let window = MessageCardDiscussion.window(of: messages, endingAt: "b", now: Self.now)

        XCTAssertEqual(window.map(\.id), ["a", "b"], "ce qui disparaît ne sort pas en image")
        XCTAssertTrue(MessageCardDiscussion.window(of: messages, endingAt: "flamme", now: Self.now).map(\.id) == ["a"])
    }

    func test_window_ofAnUnknownMessage_isEmpty() {
        XCTAssertTrue(MessageCardDiscussion.window(of: Self.thread(3), endingAt: "absent", now: Self.now).isEmpty)
    }

    // MARK: - La carte

    func test_subject_writesEachMessageWithItsAuthor_inTheServedText() throws {
        let messages = [
            Self.message("a", "Hello", at: 0),
            Self.message("b", "Je suis là", from: "u-me", name: "Moi-même", at: 1),
        ]

        let subject = try XCTUnwrap(MessageCardDiscussion.subject(
            of: messages, servedText: { $0.id == "a" ? "Bonjour" : nil },
            viewer: Self.viewer, title: "Équipe"
        ))

        XCTAssertEqual(subject.reply.text, "Awa : Bonjour\nMoi : Je suis là", "le texte servi par le Prisme, jamais l'original en douce")
        XCTAssertEqual(subject.reply.author, "Équipe")
        XCTAssertNil(subject.quoted)
        XCTAssertEqual(subject.sentAt, messages.last?.createdAt)
    }

    func test_subject_paintsTheMediaOfTheDiscussion_bounded() throws {
        let photos = (0..<6).map { index in
            Self.message("p\(index)", "", at: TimeInterval(index), attachments: [
                MeeshyMessageAttachment(id: "img\(index)", mimeType: "image/jpeg", fileUrl: "https://x/\(index).jpg")
            ])
        }

        let subject = try XCTUnwrap(MessageCardDiscussion.subject(of: photos, servedText: { _ in nil }, viewer: Self.viewer, title: nil))

        XCTAssertEqual(subject.media.map(\.media.id), ["img2", "img3", "img4", "img5"], "les derniers médias, au plus quatre")
        XCTAssertTrue(subject.reply.text.contains("Awa :"), "un message sans texte garde sa ligne")
    }

    func test_subject_ofNothing_isNil() {
        XCTAssertNil(MessageCardDiscussion.subject(of: [], servedText: { _ in nil }, viewer: Self.viewer, title: nil))
    }

    // MARK: - Une réponse qui CITE un contenu protégé (#9573, décision porteur 2026-10-08)
    //
    // Citer reste permis et la contagion de protection des réponses s'applique ;
    // mais « Imager » — et « Imager la discussion » qui contient la réponse — ne
    // s'offre pas. Les autres sorties de la réponse suivent SA propre nature.

    /// Une citation dont le fil a déclaré la nature — `nil` : non déclarée.
    private static func quote(nature: ContentExitLaw.Nature?, protectedMedia: Bool = false) -> ReplyReference {
        var reference = ReplyReference(messageId: "q", authorName: "Awa", previewText: "La citation",
                                       attachmentIsProtected: protectedMedia ? true : nil)
        reference.quotedExitNature = nature
        return reference
    }

    private static func replying(_ id: String, to reference: ReplyReference, at offset: TimeInterval = 0) -> Message {
        var reply = message(id, "Ma réponse", at: offset)
        reply.replyTo = reference
        return reply
    }

    /// Flamme à durée, flamme après lecture, vue unique, flou, nature illisible.
    private static let protectedQuotes: [(String, ReplyReference)] = [
        ("flamme à durée", quote(nature: .timedFlame)),
        ("flamme après lecture", quote(nature: .afterReadFlame)),
        ("vue unique", quote(nature: .viewOnce)),
        ("flou", quote(nature: .ordinary, protectedMedia: true)),
        ("nature non déclarée", quote(nature: nil)),
    ]

    func test_aReplyQuotingProtectedContent_offersNoImager_butKeepsItsOtherExits() {
        for (label, reference) in Self.protectedQuotes {
            let offer = Self.replying("r", to: reference).exitOffer
            XCTAssertFalse(offer.offers(.imagine), "citer \(label) : « Imager » n'est pas rendu")
            XCTAssertTrue(offer.offers(.copy), "citer \(label) : la réponse se copie toujours")
            XCTAssertTrue(offer.offers(.forward), "citer \(label) : la réponse se transfère toujours")
            XCTAssertFalse(MessageCardSubject.isExportable(Self.replying("r", to: reference), now: Self.now),
                           "citer \(label) : aucune carte, même appelée par une autre porte")
            XCTAssertFalse(ForwardSheetOffer(message: Self.replying("r", to: reference)).imaginesDiscussion,
                           "citer \(label) : « Imager la discussion » n'est pas rendu depuis la réponse")
        }
    }

    func test_aReplyQuotingAnOrdinaryMessage_stillImages() {
        let reply = Self.replying("r", to: Self.quote(nature: .ordinary))
        XCTAssertTrue(reply.exitOffer.offers(.imagine))
        XCTAssertTrue(MessageCardSubject.isExportable(reply, now: Self.now))
        XCTAssertTrue(ForwardSheetOffer(message: reply).imaginesDiscussion)
    }

    func test_aReplyToAStory_orToADeletedMessage_isNotConcerned() {
        let story = ReplyReference(messageId: "s", authorName: "Story", previewText: "", isStoryReply: true)
        XCTAssertTrue(Self.replying("r", to: story).exitOffer.offers(.imagine), "une story citée n'est pas un message protégé")
        let deleted = Self.quote(nature: nil).tombstoned(at: Self.now)
        XCTAssertTrue(Self.replying("r", to: deleted).exitOffer.offers(.imagine),
                      "la citation d'un message supprimé ne porte plus rien de lui")
        let expired = Self.quote(nature: .timedFlame).tombstoned(at: Self.now, expired: true)
        XCTAssertFalse(Self.replying("r", to: expired).exitOffer.offers(.imagine),
                       "une flamme citée qui a expiré reste une flamme citée")
    }

    func test_window_containingAReplyThatQuotesProtectedContent_imagesNothing() {
        for (label, reference) in Self.protectedQuotes {
            let messages = [Self.message("a", "Salut"), Self.replying("r", to: reference, at: 1), Self.message("b", "Ça va ?", at: 2)]
            XCTAssertTrue(MessageCardDiscussion.window(of: messages, endingAt: "b", now: Self.now).isEmpty,
                          "une discussion qui contient une réponse citant \(label) ne s'image pas")
            XCTAssertFalse(MessageCardDiscussion.offers(messages: messages, endingAt: "b", now: Self.now),
                           "et son bouton n'est pas rendu")
            XCTAssertTrue(MessageCardDiscussion.window(of: messages, endingAt: "a", now: Self.now).map(\.id) == ["a"],
                          "jusqu'à un message qui la PRÉCÈDE, la discussion ne la contient pas")
        }
    }

    func test_window_aQuotingReplyBeyondTheWindow_doesNotCloseIt() {
        let older = Self.replying("old", to: Self.quote(nature: .timedFlame), at: -1)
        let messages = [older] + Self.thread(MessageCardDiscussion.maxMessages)
        let last = "m\(MessageCardDiscussion.maxMessages - 1)"
        XCTAssertEqual(MessageCardDiscussion.window(of: messages, endingAt: last, now: Self.now).count,
                       MessageCardDiscussion.maxMessages,
                       "une réponse hors de la fenêtre ne fait pas partie de la discussion peinte")
    }
}
