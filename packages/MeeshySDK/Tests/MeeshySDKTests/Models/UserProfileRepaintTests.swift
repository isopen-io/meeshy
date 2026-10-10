import XCTest
@testable import MeeshySDK

/// #9307 — la loi UNIQUE qui repeint un pair à `user:updated`, jumelle de
/// `repaintProfile` (web, `apps/web/src/lib/api/my-portrait.ts`). Une copie
/// désigne le pair par son identifiant d'UTILISATEUR ; une ligne de
/// participant ou un expéditeur porte le nom COMPOSÉ, un objet compte porte le
/// nom servi ; une clé absente du delta ne touche rien.
final class UserProfileRepaintTests: XCTestCase {

    private func event(_ changes: String, userId: String = "u-bob") throws -> UserUpdatedEvent {
        let json = #"{"userId":"\#(userId)","changes":\#(changes)}"#
        return try JSONDecoder().decode(UserUpdatedEvent.self, from: Data(json.utf8))
    }

    private func renamed(
        displayName: String? = "Bobby",
        firstName: String? = "Robert",
        lastName: String? = "Jones",
        username: String = "bobby"
    ) throws -> UserUpdatedEvent {
        func field(_ value: String?) -> String { value.map { #""\#($0)""# } ?? "null" }
        return try event(
            #"{"displayName":\#(field(displayName)),"firstName":\#(field(firstName)),"lastName":\#(field(lastName)),"username":"\#(username)"}"#
        )
    }

    private func message(senderId: String = "p-bob", senderUserId: String? = "u-bob") -> MeeshyMessage {
        MeeshyMessage(
            id: "m1", conversationId: "c1", senderId: senderId, content: "salut",
            createdAt: Date(timeIntervalSince1970: 0), updatedAt: Date(timeIntervalSince1970: 0),
            senderName: "Bob", senderUsername: "bob", senderColor: "#000000",
            senderAvatarURL: "https://cdn/old.png", senderUserId: senderUserId
        )
    }

    // MARK: - Nom composé

    func test_composedName_displayNamePresent_winsOverFullName() throws {
        XCTAssertEqual(try renamed().composedName, "Bobby")
    }

    func test_composedName_blankDisplayName_fallsBackToFirstAndLastName() throws {
        XCTAssertEqual(try renamed(displayName: "  ").composedName, "Robert Jones")
    }

    func test_composedName_noDisplayNameNorFullName_fallsBackToUsername() throws {
        XCTAssertEqual(try renamed(displayName: nil, firstName: nil, lastName: nil).composedName, "bobby")
    }

    func test_composedName_payloadWithoutNameGroup_isNil() throws {
        XCTAssertNil(try event(#"{"avatar":"https://cdn/new.png"}"#).composedName)
    }

    // MARK: - Participant

    func test_repaintedParticipant_designatedByUserId_takesComposedNameAndHandle() throws {
        let row = PaginatedParticipant(id: "p-bob", userId: "u-bob", username: "bob",
                                       firstName: "Bob", lastName: nil, displayName: "Bob",
                                       avatar: "https://cdn/old.png", conversationRole: "admin")

        let repainted = try XCTUnwrap(try renamed(displayName: nil).repainted(row))

        XCTAssertEqual(repainted.displayName, "Robert Jones")
        XCTAssertEqual(repainted.username, "bobby")
        XCTAssertEqual(repainted.firstName, "Robert")
        XCTAssertEqual(repainted.lastName, "Jones")
        XCTAssertEqual(repainted.avatar, "https://cdn/old.png", "un delta sans avatar ne touche pas la photo")
        XCTAssertEqual(repainted.conversationRole, "admin", "le reste de la ligne est recopié")
    }

    func test_repaintedParticipant_otherUser_isNil() throws {
        let row = PaginatedParticipant(id: "p-alice", userId: "u-alice", username: "alice", displayName: "Alice")
        XCTAssertNil(try renamed().repainted(row))
    }

    func test_repaintedParticipant_avatarOnly_keepsTheNameAndRepaintsThePhoto() throws {
        let row = PaginatedParticipant(id: "p-bob", userId: "u-bob", username: "bob", displayName: "Bob",
                                       avatar: "https://cdn/old.png")

        let repainted = try XCTUnwrap(try event(#"{"avatar":"https://cdn/new.png"}"#).repainted(row))

        XCTAssertEqual(repainted.avatar, "https://cdn/new.png")
        XCTAssertEqual(repainted.displayName, "Bob")
        XCTAssertEqual(repainted.username, "bob")
    }

    func test_repaintedParticipant_avatarRemoved_clearsThePhoto() throws {
        let row = PaginatedParticipant(id: "p-bob", userId: "u-bob", username: "bob", avatar: "https://cdn/old.png")
        XCTAssertNil(try XCTUnwrap(try event(#"{"avatar":null}"#).repainted(row)).avatar)
    }

    func test_repaintedParticipant_nothingDiffers_isNil() throws {
        let row = PaginatedParticipant(id: "p-bob", userId: "u-bob", username: "bobby",
                                       firstName: "Robert", lastName: "Jones", displayName: "Bobby")
        XCTAssertNil(try renamed().repainted(row), "rien ne change ⇒ aucune republication")
    }

    // MARK: - Expéditeur d'un message

    func test_repaintedMessage_designatedBySenderUserId_takesComposedNameHandleAndColor() throws {
        let repainted = try XCTUnwrap(try renamed().repainted(message()))

        XCTAssertEqual(repainted.senderName, "Bobby")
        XCTAssertEqual(repainted.senderUsername, "bobby")
        XCTAssertEqual(repainted.senderColor, DynamicColorGenerator.colorForName("Bobby"))
        XCTAssertEqual(repainted.senderAvatarURL, "https://cdn/old.png")
        XCTAssertEqual(repainted.content, "salut")
    }

    func test_repaintedMessage_reloadedFromCacheWithUserIdAsSenderId_isDesignated() throws {
        let cached = message(senderId: "u-bob", senderUserId: nil)
        XCTAssertEqual(try renamed().repainted(cached)?.senderName, "Bobby")
    }

    func test_repaintedMessage_otherSender_isNil() throws {
        XCTAssertNil(try renamed().repainted(message(senderId: "p-alice", senderUserId: "u-alice")))
    }

    func test_repaintedMessage_avatarReplaced_repaintsOnlyThePhoto() throws {
        let repainted = try XCTUnwrap(try event(#"{"avatar":"https://cdn/new.png"}"#).repainted(message()))
        XCTAssertEqual(repainted.senderAvatarURL, "https://cdn/new.png")
        XCTAssertEqual(repainted.senderName, "Bob")
        XCTAssertEqual(repainted.senderColor, "#000000")
    }

    func test_repaintedRecord_designatedBySenderId_takesComposedNameAndPhoto() throws {
        var record = MessageRecordFactory.make(senderId: "u-bob")
        record.senderName = "Bob"
        record.senderAvatarURL = "https://cdn/old.png"

        let repainted = try XCTUnwrap(try event(
            #"{"displayName":null,"firstName":"Robert","lastName":"Jones","username":"bobby","avatar":"https://cdn/new.png"}"#
        ).repainted(record))

        XCTAssertEqual(repainted.senderName, "Robert Jones")
        XCTAssertEqual(repainted.senderUsername, "bobby")
        XCTAssertEqual(repainted.senderAvatarURL, "https://cdn/new.png")
    }

    func test_repaintedRecord_otherSender_isNil() throws {
        XCTAssertNil(try renamed().repainted(MessageRecordFactory.make(senderId: "u-alice")))
    }

    // MARK: - Objets compte

    func test_repaintedFriend_accountForm_takesTheServedDisplayNameEvenWhenCleared() throws {
        let friend = FriendRequestUser(id: "u-bob", username: "bob", firstName: "Bob",
                                       displayName: "Bob", avatar: "https://cdn/old.png", isOnline: true)

        let repainted = try XCTUnwrap(try renamed(displayName: nil).repainted(friend))

        XCTAssertNil(repainted.displayName, "un objet compte porte le nom SERVI, effacé compris")
        XCTAssertEqual(repainted.name, "Robert Jones")
        XCTAssertEqual(repainted.username, "bobby")
        XCTAssertEqual(repainted.isOnline, true, "la présence n'appartient pas au delta")
    }

    func test_repaintedFriendRequest_repaintsTheDesignatedParty() throws {
        let request = FriendRequest(
            id: "fr1", senderId: "u-bob", receiverId: "u-me", status: "pending",
            sender: FriendRequestUser(id: "u-bob", username: "bob", avatar: "https://cdn/old.png"),
            receiver: FriendRequestUser(id: "u-me", username: "me"),
            createdAt: Date(timeIntervalSince1970: 0)
        )

        let repainted = try XCTUnwrap(try event(#"{"avatar":"https://cdn/new.png"}"#).repainted(request))

        XCTAssertEqual(repainted.sender?.avatar, "https://cdn/new.png")
        XCTAssertEqual(repainted.receiver?.username, "me")
        XCTAssertEqual(repainted.id, "fr1")
    }

    func test_repaintedFriendRequest_neitherParty_isNil() throws {
        let request = FriendRequest(
            id: "fr1", senderId: "u-alice", receiverId: "u-me", status: "pending",
            sender: FriendRequestUser(id: "u-alice", username: "alice"),
            createdAt: Date(timeIntervalSince1970: 0)
        )
        XCTAssertNil(try renamed().repainted(request))
    }

    func test_repaintedUser_accountForm_repaintsNamePhotoAndBannerKeepingTheRest() throws {
        let user = MeeshyUser(id: "u-bob", username: "bob", email: "bob@x.io", displayName: "Bob",
                              bio: "hello", avatar: "https://cdn/old.png", banner: "https://cdn/b-old.png",
                              systemLanguage: "fr", isOnline: true)

        let repainted = try XCTUnwrap(try event(
            #"{"displayName":"Bobby","firstName":null,"lastName":null,"username":"bobby","banner":"https://cdn/b-new.png"}"#
        ).repainted(user))

        XCTAssertEqual(repainted.displayName, "Bobby")
        XCTAssertEqual(repainted.username, "bobby")
        XCTAssertEqual(repainted.banner, "https://cdn/b-new.png")
        XCTAssertEqual(repainted.avatar, "https://cdn/old.png")
        XCTAssertEqual(repainted.bio, "hello")
        XCTAssertEqual(repainted.email, "bob@x.io")
        XCTAssertEqual(repainted.systemLanguage, "fr")
        XCTAssertEqual(repainted.isOnline, true)
    }

    func test_repaintedUser_otherUser_isNil() throws {
        XCTAssertNil(try renamed().repainted(MeeshyUser(id: "u-alice", username: "alice")))
    }

    // MARK: - Listes

    func test_repaintedElements_onlyTouchedRowsChange_orderKept() throws {
        let rows = [
            PaginatedParticipant(id: "p-alice", userId: "u-alice", username: "alice", displayName: "Alice"),
            PaginatedParticipant(id: "p-bob", userId: "u-bob", username: "bob", displayName: "Bob"),
        ]
        let update = try renamed()

        let repainted = try XCTUnwrap(rows.repaintedElements(by: update.repainted))

        XCTAssertEqual(repainted.map(\.id), ["p-alice", "p-bob"])
        XCTAssertEqual(repainted.map(\.name), ["Alice", "Bobby"])
    }

    func test_repaintedElements_nothingDesignated_isNil() throws {
        let rows = [PaginatedParticipant(id: "p-alice", userId: "u-alice", username: "alice")]
        XCTAssertNil(rows.repaintedElements(by: try renamed().repainted))
    }
}
