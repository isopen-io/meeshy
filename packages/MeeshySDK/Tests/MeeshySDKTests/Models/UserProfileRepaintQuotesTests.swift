import XCTest
@testable import MeeshySDK

/// #9371 — la loi `UserUpdatedEvent.repainted(_:)` gagne les citations et les
/// références de transfert. Une citation est la copie d'un EXPÉDITEUR : elle
/// prend le nom COMPOSÉ, l'avatar tri-état, et `isMe` ne bouge jamais. Elle
/// s'apparie par l'id GRAVÉ, jamais par le nom — une citation ancienne, sans
/// id, reste au nom gravé même quand ce nom est celui du pair renommé : un
/// homonyme porterait le même.
final class UserProfileRepaintQuotesTests: XCTestCase {

    private func event(_ changes: String, userId: String = "u-bob") throws -> UserUpdatedEvent {
        try JSONDecoder().decode(UserUpdatedEvent.self, from: Data(#"{"userId":"\#(userId)","changes":\#(changes)}"#.utf8))
    }

    private func renamed() throws -> UserUpdatedEvent {
        try event(#"{"displayName":"Bobby","firstName":null,"lastName":null,"username":"bobby","avatar":"https://cdn/new.png"}"#)
    }

    private func quote(authorUserId: String? = "u-bob", isMe: Bool = false) -> ReplyReference {
        ReplyReference(messageId: "q1", authorName: "Bob", previewText: "Salut", isMe: isMe,
                       authorAvatarUrl: "https://cdn/old.png", attachmentType: "image",
                       authorUserId: authorUserId)
    }

    private func forward(senderUserId: String? = "u-bob") -> ForwardReference {
        ForwardReference(originalMessageId: "f1", senderName: "Bob", senderAvatar: "https://cdn/old.png",
                         previewText: "hello", conversationId: "c-src", conversationName: "Équipe",
                         attachmentType: "image", attachmentThumbnailUrl: "https://cdn/t.png",
                         conversationType: "group", senderUserId: senderUserId)
    }

    private func message(sender: String, replyTo: ReplyReference? = nil, forwardedFrom: ForwardReference? = nil) -> MeeshyMessage {
        MeeshyMessage(
            id: "m1", conversationId: "c1", senderId: "p-\(sender)", content: "salut",
            createdAt: Date(timeIntervalSince1970: 0), updatedAt: Date(timeIntervalSince1970: 0),
            replyTo: replyTo, forwardedFrom: forwardedFrom,
            senderName: sender == "bob" ? "Bob" : "Alice", senderUsername: sender,
            senderColor: "#000000", senderAvatarURL: "https://cdn/\(sender).png", senderUserId: "u-\(sender)"
        )
    }

    // MARK: - Citation

    func test_repaintedQuote_designatedByTheGravedId_takesComposedNameColorAndPhoto() throws {
        let repainted = try XCTUnwrap(try renamed().repainted(quote()))

        XCTAssertEqual(repainted.authorName, "Bobby")
        XCTAssertEqual(repainted.authorColor, DynamicColorGenerator.colorForName("Bobby"))
        XCTAssertEqual(repainted.authorAvatarUrl, "https://cdn/new.png")
        XCTAssertEqual(repainted.previewText, "Salut", "le contenu cité ne bouge pas")
        XCTAssertEqual(repainted.attachmentType, "image")
        XCTAssertEqual(repainted.authorUserId, "u-bob")
    }

    func test_repaintedQuote_isMeNeverMoves() throws {
        XCTAssertEqual(try renamed().repainted(quote(isMe: true))?.isMe, true)
    }

    func test_repaintedQuote_otherAuthor_isNil() throws {
        XCTAssertNil(try renamed().repainted(quote(authorUserId: "u-alice")))
    }

    func test_repaintedQuote_legacyQuoteWithoutId_isNilEvenUnderTheSameName() throws {
        XCTAssertNil(try renamed().repainted(quote(authorUserId: nil)),
                     "apparier sur « Bob » repeindrait aussi un homonyme")
    }

    func test_repaintedQuote_avatarRemoved_dropsThePhotoAndKeepsTheName() throws {
        let repainted = try XCTUnwrap(try event(#"{"avatar":null}"#).repainted(quote()))

        XCTAssertNil(repainted.authorAvatarUrl)
        XCTAssertEqual(repainted.authorName, "Bob")
    }

    func test_repaintedQuote_nothingChanges_isNil() throws {
        XCTAssertNil(try event(#"{"avatar":"https://cdn/old.png"}"#).repainted(quote()))
    }

    // MARK: - Transfert

    func test_repaintedForward_designatedByTheGravedId_takesComposedNameAndPhoto() throws {
        let repainted = try XCTUnwrap(try renamed().repainted(forward()))

        XCTAssertEqual(repainted.senderName, "Bobby")
        XCTAssertEqual(repainted.senderAvatar, "https://cdn/new.png")
        XCTAssertEqual(repainted.senderUserId, "u-bob")
        XCTAssertEqual(repainted.originalMessageId, "f1")
        XCTAssertEqual(repainted.previewText, "hello")
        XCTAssertEqual(repainted.conversationName, "Équipe")
        XCTAssertEqual(repainted.conversationType, "group")
        XCTAssertEqual(repainted.attachmentThumbnailUrl, "https://cdn/t.png")
    }

    func test_repaintedForward_legacyReferenceWithoutId_isNil() throws {
        XCTAssertNil(try renamed().repainted(forward(senderUserId: nil)))
    }

    func test_repaintedForward_nothingChanges_isNil() throws {
        XCTAssertNil(try event(#"{"avatar":"https://cdn/old.png"}"#).repainted(forward()))
    }

    // MARK: - Message entier

    func test_repaintedWithQuotes_aliceQuotingBob_repaintsOnlyTheQuote() throws {
        let repainted = try XCTUnwrap(try renamed().repaintedWithQuotes(message(sender: "alice", replyTo: quote())))

        XCTAssertEqual(repainted.senderName, "Alice")
        XCTAssertEqual(repainted.replyTo?.authorName, "Bobby")
    }

    func test_repaintedWithQuotes_forwardOfBob_repaintsTheReference() throws {
        let repainted = try XCTUnwrap(try renamed().repaintedWithQuotes(message(sender: "alice", forwardedFrom: forward())))

        XCTAssertEqual(repainted.forwardedFrom?.senderName, "Bobby")
    }

    func test_repaintedWithQuotes_bobQuotingHimself_repaintsSenderAndQuote() throws {
        let repainted = try XCTUnwrap(try renamed().repaintedWithQuotes(message(sender: "bob", replyTo: quote())))

        XCTAssertEqual(repainted.senderName, "Bobby")
        XCTAssertEqual(repainted.replyTo?.authorName, "Bobby")
    }

    func test_repaintedWithQuotes_nothingDesignatesThePeer_isNil() throws {
        XCTAssertNil(try renamed().repaintedWithQuotes(message(sender: "alice", replyTo: quote(authorUserId: nil))))
    }
}
