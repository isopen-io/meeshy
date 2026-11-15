import XCTest
@testable import MeeshySDK

/// #9359 — la suite de #9307 : la loi `UserUpdatedEvent.repainted(_:)` atteint
/// l'aperçu « Bob : … » d'une ligne de GROUPE et la fiche d'un participant.
///
/// L'aperçu n'avait aucun identifiant sur lequel s'apparier : la ligne porte
/// désormais `lastMessageSenderUserId`, écrit AVEC le nom et seulement quand ce
/// nom désigne un pair — jamais « Vous ».
final class UserProfileRepaintRestTests: XCTestCase {

    private let epoch = Date(timeIntervalSince1970: 1_700_000_000)

    private func event(_ changes: String, userId: String = "u-bob") throws -> UserUpdatedEvent {
        let json = #"{"userId":"\#(userId)","changes":\#(changes)}"#
        return try JSONDecoder().decode(UserUpdatedEvent.self, from: Data(json.utf8))
    }

    private func renamedBob(userId: String = "u-bob") throws -> UserUpdatedEvent {
        try event(#"{"displayName":null,"firstName":"Robert","lastName":"Jones","username":"bobby"}"#, userId: userId)
    }

    private func groupRow(senderName: String? = "Bob", senderUserId: String? = "u-bob") -> MeeshyConversation {
        MeeshyConversation(
            id: "g1", identifier: "g1", type: .group, title: "Les amis",
            lastMessageAt: epoch, createdAt: epoch, updatedAt: epoch,
            lastMessagePreview: "salut", lastMessageId: "m1",
            lastMessageSenderName: senderName, lastMessageSenderUserId: senderUserId
        )
    }

    private func message(isMe: Bool = false, senderUserId: String? = "u-bob") -> MeeshyMessage {
        MeeshyMessage(
            id: "m2", conversationId: "g1", senderId: "p-bob", content: "re",
            createdAt: epoch, updatedAt: epoch,
            senderName: "Bob", senderUsername: "bob", senderUserId: senderUserId, isMe: isMe
        )
    }

    private func profile(userId: String? = "u-bob", avatar: String? = "https://cdn/old.png") -> ConversationParticipantProfile {
        ConversationParticipantProfile(
            participantId: "p-bob", conversationId: "g1", isAnonymous: userId == nil, userId: userId,
            username: "bob", displayName: "Bob", firstName: "Bob", lastName: nil, avatar: avatar,
            language: "fr", country: nil, conversationRole: "member", joinedAt: epoch,
            isOnline: false, lastActiveAt: nil, shareLinkName: nil,
            hasEmail: false, hasBirthday: false, email: nil, birthday: nil,
            entryCapabilities: nil, entryLink: nil, historyVisibleFrom: epoch, canGrantHistory: true
        )
    }

    // MARK: - (1) L'auteur de la dernière ligne d'un groupe

    func test_repaintedLastMessageAuthor_peerDesignatedById_takesTheComposedName() throws {
        XCTAssertEqual(try renamedBob().repaintedLastMessageAuthor(of: groupRow()), "Robert Jones")
    }

    func test_repaintedLastMessageAuthor_anotherUser_isNil() throws {
        XCTAssertNil(try renamedBob(userId: "u-alice").repaintedLastMessageAuthor(of: groupRow()))
    }

    func test_repaintedLastMessageAuthor_rowWithoutSenderId_isNil() throws {
        XCTAssertNil(try renamedBob().repaintedLastMessageAuthor(of: groupRow(senderUserId: nil)),
                     "sans identifiant, le nom ne s'apparie jamais — pas par le pseudo")
    }

    func test_repaintedLastMessageAuthor_readerLabel_isKept() throws {
        let row = groupRow(senderName: ConversationListAuthor.readerLabel)
        XCTAssertNil(try renamedBob().repaintedLastMessageAuthor(of: row))
    }

    func test_repaintedLastMessageAuthor_avatarOnlyOrSameName_isNil() throws {
        XCTAssertNil(try event(#"{"avatar":"https://cdn/new.png"}"#).repaintedLastMessageAuthor(of: groupRow()))
        XCTAssertNil(try renamedBob().repaintedLastMessageAuthor(of: groupRow(senderName: "Robert Jones")),
                     "rien ne change : aucune republication")
    }

    func test_merging_groupRow_repaintsTheAuthorAndKeepsTheGroupIdentity() throws {
        let merged = try XCTUnwrap(ConversationStore.merging(groupRow(), withUserUpdate: try renamedBob()))
        XCTAssertEqual(merged.lastMessageSenderName, "Robert Jones")
        XCTAssertEqual(merged.title, "Les amis", "la ligne d'un groupe porte l'identité du GROUPE")
        XCTAssertEqual(merged.lastMessagePreview, "salut")
    }

    func test_merging_groupRowByAnotherAuthor_isNil() throws {
        XCTAssertNil(ConversationStore.merging(groupRow(senderUserId: "u-alice"), withUserUpdate: try renamedBob()))
    }

    // MARK: - L'identifiant voyage avec le nom

    func test_facetFromPeerMessage_carriesThePeerUserId() {
        var row = groupRow(senderName: nil, senderUserId: nil)
        row.applyLastMessage(LastMessageFacet(message: message(), preview: "re"))
        XCTAssertEqual(row.lastMessageSenderUserId, "u-bob")
    }

    func test_facetFromMyMessage_carriesNoId() {
        var row = groupRow()
        row.applyLastMessage(LastMessageFacet(message: message(isMe: true), preview: "re"))
        XCTAssertNil(row.lastMessageSenderUserId, "« Vous » ne s'apparie à personne")
    }

    func test_facetWithoutName_dropsTheId() {
        let facet = LastMessageFacet(id: "m3", preview: "x", senderName: nil, senderUserId: "u-bob", at: epoch)
        XCTAssertNil(facet.senderUserId)
    }

    func test_adoptingAnotherMessage_dropsTheAuthorId() {
        var row = groupRow()
        row.adoptLastMessage(id: "m9")
        XCTAssertNil(row.lastMessageSenderUserId, "l'auteur de l'ancien message ne s'hérite pas")
    }

    func test_clearingTheLastMessage_dropsTheAuthorId() {
        var row = groupRow()
        XCTAssertTrue(row.clearLastMessage())
        XCTAssertNil(row.lastMessageSenderUserId)
    }

    func test_peerUserId_readerOrReaderLabelOrEmpty_isNil() {
        XCTAssertNil(ConversationListAuthor.peerUserId(senderUserId: "u-me", senderName: "Moi", readerId: "u-me"))
        XCTAssertNil(ConversationListAuthor.peerUserId(senderUserId: "u-bob", senderName: "Vous", readerId: "u-me", youLabel: "Vous"))
        XCTAssertNil(ConversationListAuthor.peerUserId(senderUserId: "", senderName: "Bob", readerId: "u-me"))
        XCTAssertEqual(ConversationListAuthor.peerUserId(senderUserId: "u-bob", senderName: "Bob", readerId: "u-me"), "u-bob")
    }

    func test_codable_roundTripsTheAuthorId_andAnOlderRowDecodesWithout() throws {
        let data = try JSONEncoder().encode(groupRow())
        XCTAssertEqual(try JSONDecoder().decode(MeeshyConversation.self, from: data).lastMessageSenderUserId, "u-bob")

        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        object.removeValue(forKey: "lastMessageSenderUserId")
        let older = try JSONSerialization.data(withJSONObject: object)
        let decoded = try JSONDecoder().decode(MeeshyConversation.self, from: older)
        XCTAssertNil(decoded.lastMessageSenderUserId)
        XCTAssertEqual(decoded.lastMessageSenderName, "Bob")
    }

    // MARK: - (2) La fiche d'un participant

    func test_repaintedProfile_peer_takesComposedNameHandleAndKeepsTheRest() throws {
        let repainted = try XCTUnwrap(try renamedBob().repainted(profile()))
        XCTAssertEqual(repainted.displayName, "Robert Jones")
        XCTAssertEqual(repainted.username, "bobby")
        XCTAssertEqual(repainted.firstName, "Robert")
        XCTAssertEqual(repainted.lastName, "Jones")
        XCTAssertEqual(repainted.resolvedFullName, "Robert Jones")
        XCTAssertEqual(repainted.avatar, "https://cdn/old.png")
        XCTAssertEqual(repainted.historyVisibleFrom, epoch, "les faits de modération sont recopiés")
        XCTAssertEqual(repainted.canGrantHistory, true)
    }

    func test_repaintedProfile_photoRemoved_isRemoved() throws {
        let repainted = try XCTUnwrap(try event(#"{"avatar":null}"#).repainted(profile()))
        XCTAssertNil(repainted.avatar)
        XCTAssertEqual(repainted.displayName, "Bob")
    }

    func test_repaintedProfile_anonymousVisitorOrAnotherUserOrNoChange_isNil() throws {
        XCTAssertNil(try renamedBob().repainted(profile(userId: nil)))
        XCTAssertNil(try renamedBob(userId: "u-alice").repainted(profile()))
        XCTAssertNil(try event(#"{"avatar":"https://cdn/old.png"}"#).repainted(profile()))
    }
}
