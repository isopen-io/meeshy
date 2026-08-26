import XCTest
import MeeshySDK
@testable import Meeshy

/// F11 — confidentialité de la présence (2026-08-26), jumeau iOS du correctif
/// web F10 (`mergeParticipants(_, { presence: 'keep-existing' })`).
///
/// La passerelle sert à un lecteur non autorisé `isOnline:false` +
/// `lastActiveAt:nil` (listes REST, `presence:snapshot`, `user:status`).
/// `seed(from:)` re-sème la présence depuis une page de conversations — une
/// charge SANS autorité sur la présence d'un utilisateur DÉJÀ connu : elle ne
/// doit ni ranimer un masque posé par une source vivante, ni dégrader une
/// activité fraîche (`noteActivity`, typing:start reçu) par un instantané plus
/// ancien. Seuls les INCONNUS reçoivent la présence de la liste.
@MainActor
final class PresenceManagerSeedTests: XCTestCase {

    private var sut: PresenceManager!

    override func setUp() async throws {
        sut = PresenceManager.shared
        sut.presenceMap.removeAll()
    }

    override func tearDown() async throws {
        sut.presenceMap.removeAll()
        sut = nil
    }

    // MARK: - Un masque serveur survit au re-semis

    func test_seed_afterMaskedSnapshot_keepsMaskedEntryOffline() {
        sut.ingestSnapshot([masked("hidden")])
        XCTAssertEqual(sut.presenceState(for: "hidden"), PresenceState.offline)

        sut.seed(
            from: [makeConversation(participants: [
                makeParticipant(userId: "me", isOnline: true, lastActiveAt: nil),
                makeParticipant(userId: "hidden", isOnline: true, lastActiveAt: Date().addingTimeInterval(-120))
            ])],
            currentUserId: "me"
        )

        XCTAssertEqual(
            sut.presenceState(for: "hidden"), PresenceState.offline,
            "Une présence retirée par le serveur ne doit pas être ranimée par une page de conversations"
        )
        XCTAssertEqual(sut.presenceMap["hidden"]?.isOnline, false, "Le masque (isOnline:false) doit être conservé tel quel")
        XCTAssertNil(sut.presenceMap["hidden"]?.lastActiveAt, "Le masque (lastActiveAt:nil) doit être conservé tel quel")
    }

    func test_seed_afterMaskedUserStatus_keepsMaskedEntryOffline() {
        sut.presenceMap["hidden"] = UserPresence(isOnline: false, lastActiveAt: nil)

        sut.seed(
            from: [makeConversation(participants: [
                makeParticipant(userId: "hidden", isOnline: true, lastActiveAt: Date().addingTimeInterval(-30))
            ])],
            currentUserId: "me"
        )

        XCTAssertEqual(sut.presenceState(for: "hidden"), PresenceState.offline)
    }

    // MARK: - Un inconnu reçoit la présence de la liste

    func test_seed_unknownUser_appliesListedPresence() {
        XCTAssertNil(sut.presenceMap["newcomer"])

        sut.seed(
            from: [makeConversation(participants: [
                makeParticipant(userId: "me", isOnline: true, lastActiveAt: nil),
                makeParticipant(userId: "newcomer", isOnline: true, lastActiveAt: Date().addingTimeInterval(-30))
            ])],
            currentUserId: "me"
        )

        XCTAssertEqual(sut.presenceState(for: "newcomer"), PresenceState.online)
        XCTAssertEqual(sut.presenceMap["newcomer"]?.isOnline, true)
        XCTAssertNotNil(sut.presenceMap["newcomer"]?.lastActiveAt)
    }

    func test_seed_unknownUserMaskedInList_staysOffline() {
        sut.seed(
            from: [makeConversation(participants: [
                makeParticipant(userId: "hidden", isOnline: false, lastActiveAt: nil)
            ])],
            currentUserId: "me"
        )

        XCTAssertEqual(sut.presenceState(for: "hidden"), PresenceState.offline)
        XCTAssertNil(sut.presenceMap["hidden"]?.lastActiveAt, "Le client ne fabrique jamais un lastActiveAt absent")
    }

    // MARK: - Une activité fraîche n'est pas dégradée par un instantané daté

    func test_seed_afterNoteActivity_keepsFreshPresence() {
        sut.noteActivity(userId: "typer")
        let fresh = sut.presenceMap["typer"]?.lastActiveAt
        XCTAssertNotNil(fresh)

        sut.seed(
            from: [makeConversation(participants: [
                makeParticipant(userId: "typer", isOnline: false, lastActiveAt: Date().addingTimeInterval(-600))
            ])],
            currentUserId: "me"
        )

        XCTAssertEqual(
            sut.presenceState(for: "typer"), PresenceState.online,
            "typing:start reçu = preuve d'activité ; une page REST plus ancienne ne doit pas la dégrader"
        )
        XCTAssertEqual(sut.presenceMap["typer"]?.isOnline, true)
        XCTAssertEqual(sut.presenceMap["typer"]?.lastActiveAt, fresh)
    }

    // MARK: - Un même lot : les connus gardent, les inconnus reçoivent

    func test_seed_mixedBatch_keepsKnownAndAddsUnknown() {
        sut.ingestSnapshot([masked("hidden")])
        sut.noteActivity(userId: "typer")

        sut.seed(
            from: [
                makeConversation(participants: [
                    makeParticipant(userId: "me", isOnline: true, lastActiveAt: nil),
                    makeParticipant(userId: "hidden", isOnline: true, lastActiveAt: Date().addingTimeInterval(-60))
                ]),
                makeConversation(participants: [
                    makeParticipant(userId: "typer", isOnline: false, lastActiveAt: Date().addingTimeInterval(-900)),
                    makeParticipant(userId: "newcomer", isOnline: true, lastActiveAt: nil)
                ])
            ],
            currentUserId: "me"
        )

        XCTAssertEqual(sut.presenceMap.count, 3, "hidden + typer conservés, newcomer ajouté, me exclu")
        XCTAssertEqual(sut.presenceState(for: "hidden"), PresenceState.offline)
        XCTAssertEqual(sut.presenceState(for: "typer"), PresenceState.online)
        XCTAssertEqual(sut.presenceState(for: "newcomer"), PresenceState.online)
        XCTAssertNil(sut.presenceMap["me"])
    }

    // MARK: - Fabriques

    private func masked(_ userId: String) -> UserStatusEvent {
        UserStatusEvent(userId: userId, username: userId, isOnline: false, lastActiveAt: nil)
    }

    private func makeConversation(participants: [APIParticipant]) -> APIConversation {
        APIConversation(id: UUID().uuidString, type: "direct", participants: participants, createdAt: Date())
    }

    private func makeParticipant(userId: String, isOnline: Bool, lastActiveAt: Date?) -> APIParticipant {
        APIParticipant(
            id: "participant-\(userId)",
            conversationId: "conv-f11",
            userId: userId,
            displayName: "user_\(userId)",
            isOnline: isOnline,
            lastActiveAt: lastActiveAt
        )
    }
}
