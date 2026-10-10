import XCTest
import MeeshySDK
@testable import Meeshy

// MARK: - Un pair renommé à `user:updated` se voit dans les surfaces OUVERTES (#9359)

// La liste, les bulles et les caches suivaient depuis #9307. Restaient figés
// l'en-tête d'un direct OUVERT — sa conversation est une valeur capturée à la
// navigation — et la fiche d'un participant. Les deux appliquent la loi du SDK,
// sans règle parallèle, et n'écrivent leur état que si le pair affiché change.
@MainActor
final class PeerRepaintOpenSurfacesTests: XCTestCase {

    private let epoch = Date(timeIntervalSince1970: 1_700_000_000)

    private func event(_ changes: String, userId: String = "u-bob") throws -> UserUpdatedEvent {
        let json = #"{"userId":"\#(userId)","changes":\#(changes)}"#
        return try JSONDecoder().decode(UserUpdatedEvent.self, from: Data(json.utf8))
    }

    private func renamedBob(userId: String = "u-bob") throws -> UserUpdatedEvent {
        try event(#"{"displayName":"Bobby","firstName":"Robert","lastName":"Jones","username":"bobby"}"#, userId: userId)
    }

    private func direct(peer: String = "u-bob", type: Conversation.ConversationType = .direct) -> Conversation {
        Conversation(
            id: "d1", identifier: "d1", type: type, title: "Bob",
            lastMessageAt: epoch, createdAt: epoch, updatedAt: epoch,
            participantUserId: peer, participantUsername: "bob",
            participantAvatarURL: "https://cdn/old.png"
        )
    }

    // MARK: - En-tête d'un direct ouvert

    func test_repainted_peerRename_repaintsTitleHandleAndKeepsThePhoto() throws {
        let live = try XCTUnwrap(DirectPeerRepaint.repainted(direct(), by: try renamedBob()))
        XCTAssertEqual(live.title, "Bobby")
        XCTAssertEqual(live.displayName, "Bobby", "le titre de l'en-tête lit ce nom")
        XCTAssertEqual(live.participantUsername, "bobby")
        XCTAssertEqual(live.participantAvatarURL, "https://cdn/old.png")
    }

    func test_repainted_successiveAnnouncements_foldInOrder() throws {
        let renamed = try XCTUnwrap(DirectPeerRepaint.repainted(direct(), by: try renamedBob()))
        let photo = try event(#"{"avatar":"https://cdn/new.png"}"#)
        let live = try XCTUnwrap(DirectPeerRepaint.repainted(renamed, by: photo))
        XCTAssertEqual(live.title, "Bobby", "la photo n'efface pas le nom reçu avant elle")
        XCTAssertEqual(live.participantAvatarURL, "https://cdn/new.png")
    }

    func test_repainted_photoRemoved_removesIt() throws {
        let live = try XCTUnwrap(DirectPeerRepaint.repainted(direct(), by: try event(#"{"avatar":null}"#)))
        XCTAssertNil(live.participantAvatarURL)
    }

    func test_repainted_anotherUserGroupOrNoChange_writesNothing() throws {
        XCTAssertNil(DirectPeerRepaint.repainted(direct(), by: try renamedBob(userId: "u-alice")))
        XCTAssertNil(DirectPeerRepaint.repainted(direct(type: .group), by: try renamedBob()))
        XCTAssertNil(DirectPeerRepaint.repainted(direct(), by: try event(#"{"avatar":"https://cdn/old.png"}"#)),
                     "une annonce qui ne change rien ne redessine pas l'écran")
        XCTAssertNil(DirectPeerRepaint.repainted(nil, by: try renamedBob()))
    }

    // MARK: - Fiche d'un participant

    /// Décodée comme la passerelle la sert : l'initialiseur du modèle est
    /// interne au SDK.
    private func profile(userId: String? = "u-bob") throws -> ConversationParticipantProfile {
        let id = userId.map { #""\#($0)""# } ?? "null"
        let json = #"""
        {"participantId":"p-bob","conversationId":"g1","isAnonymous":\#(userId == nil),"userId":\#(id),
         "username":"bob","displayName":"Bob","isOnline":false,"hasEmail":false,"hasBirthday":false}
        """#
        return try JSONDecoder().decode(ConversationParticipantProfile.self, from: Data(json.utf8))
    }

    func test_participantSheet_loadedPeer_followsTheRename() throws {
        let repainted = try XCTUnwrap(ParticipantProfileSheet.repaintedProfile(try profile(), with: try renamedBob()))
        XCTAssertEqual(repainted.resolvedFullName, "Robert Jones")
        XCTAssertEqual(repainted.username, "bobby")
    }

    func test_participantSheet_notLoadedOrVisitorOrOtherUser_writesNothing() throws {
        XCTAssertNil(ParticipantProfileSheet.repaintedProfile(nil, with: try renamedBob()))
        XCTAssertNil(ParticipantProfileSheet.repaintedProfile(try profile(userId: nil), with: try renamedBob()))
        XCTAssertNil(ParticipantProfileSheet.repaintedProfile(try profile(), with: try renamedBob(userId: "u-alice")))
    }
}
