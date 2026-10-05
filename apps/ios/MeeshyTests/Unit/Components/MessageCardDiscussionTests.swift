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
}
