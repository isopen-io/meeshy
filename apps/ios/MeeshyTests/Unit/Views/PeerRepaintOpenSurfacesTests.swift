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

    func test_admitting_peerRename_repaintsTitleHandleAndKeepsThePhoto() throws {
        let repaints = try XCTUnwrap(DirectPeerRepaints().admitting(try renamedBob(), over: direct()))
        let live = try XCTUnwrap(repaints.applied(to: direct()))
        XCTAssertEqual(live.title, "Bobby")
        XCTAssertEqual(live.displayName, "Bobby", "le titre de l'en-tête lit ce nom")
        XCTAssertEqual(live.participantUsername, "bobby")
        XCTAssertEqual(live.participantAvatarURL, "https://cdn/old.png")
    }

    func test_admitting_successiveAnnouncements_foldInOrder() throws {
        let renamed = try XCTUnwrap(DirectPeerRepaints().admitting(try renamedBob(), over: direct()))
        let photo = try event(#"{"avatar":"https://cdn/new.png"}"#)
        let both = try XCTUnwrap(renamed.admitting(photo, over: renamed.applied(to: direct())))
        let live = try XCTUnwrap(both.applied(to: direct()))
        XCTAssertEqual(live.title, "Bobby", "la photo n'efface pas le nom reçu avant elle")
        XCTAssertEqual(live.participantAvatarURL, "https://cdn/new.png")
    }

    func test_admitting_photoRemoved_removesIt() throws {
        let repaints = try XCTUnwrap(DirectPeerRepaints().admitting(try event(#"{"avatar":null}"#), over: direct()))
        XCTAssertNil(repaints.applied(to: direct())?.participantAvatarURL)
    }

    func test_admitting_anotherUserGroupOrNoChange_writesNothing() throws {
        XCTAssertNil(DirectPeerRepaints().admitting(try renamedBob(userId: "u-alice"), over: direct()))
        XCTAssertNil(DirectPeerRepaints().admitting(try renamedBob(), over: direct(type: .group)))
        XCTAssertNil(DirectPeerRepaints().admitting(try event(#"{"avatar":"https://cdn/old.png"}"#), over: direct()),
                     "une annonce qui ne change rien ne redessine pas l'écran")
        XCTAssertNil(DirectPeerRepaints().admitting(try renamedBob(), over: nil))
    }

    func test_applied_withoutAnnouncement_isTheSameValue() {
        XCTAssertEqual(DirectPeerRepaints().applied(to: direct())?.title, "Bob")
        XCTAssertNil(DirectPeerRepaints().applied(to: nil))
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
