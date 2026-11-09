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
        XCTAssertEqual(sut.presenceMap["typer"]?.isOnline, false, "l'activité date le pair, elle ne le déclare pas connecté (#11412)")
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

    // MARK: - Un instantané serveur qui répète un utilisateur ne plante pas

    func test_ingestSnapshot_duplicateUser_keepsTheLatestEntry() {
        sut.ingestSnapshot([
            masked("dup"),
            UserStatusEvent(userId: "dup", username: "dup", isOnline: true, lastActiveAt: nil)
        ])
        XCTAssertEqual(sut.presenceMap["dup"]?.isOnline, true, "le dernier relevé d'un même utilisateur l'emporte")
    }

    // MARK: - #14023 — une présence que le serveur ne sert plus quitte la carte vivante

    func test_reconcileServed_afterRupture_purgesTheLiveEntry_andTheIdentityCardShowsNoDot() {
        sut.presenceMap["ex"] = UserPresence(isOnline: true, lastActiveAt: Date())
        let served = servedGroup("ex", presence: UserPresence(isOnline: false, lastActiveAt: nil))

        sut.reconcile(withServed: [served])

        XCTAssertNil(sut.presenceMap["ex"], "l'entrée vivante d'un lien rompu est purgée")
        XCTAssertEqual(StoryExportAuthor.served(from: served).presence, PresenceState.offline,
                       "l'export n'affiche aucun point")
        XCTAssertEqual(sut.servedPresence(for: "ex", fallback: served.authorPresence)?.state, PresenceState.offline,
                       "la carte d'identité de la visionneuse n'affiche aucun point")
    }

    func test_reconcileServed_withoutAnyServedPresence_purgesTheLiveEntry() {
        sut.presenceMap["ex"] = UserPresence(isOnline: true, lastActiveAt: Date())

        sut.reconcile(withServed: [servedGroup("ex", presence: nil)])

        XCTAssertNil(sut.presenceMap["ex"])
    }

    func test_reconcileServed_whenTheServerStillServesPresence_keepsTheFresherLiveEntry() {
        let live = UserPresence(isOnline: true, lastActiveAt: Date())
        sut.presenceMap["friend"] = live

        sut.reconcile(withServed: [servedGroup("friend", presence: UserPresence(isOnline: true, lastActiveAt: nil))])

        XCTAssertEqual(sut.presenceMap["friend"]?.isOnline, true)
        XCTAssertEqual(sut.presenceState(for: "friend"), PresenceState.online)
    }

    func test_reconcileServed_leavesPeopleTheGroupsDoNotNameUntouched() {
        sut.presenceMap["bystander"] = UserPresence(isOnline: true, lastActiveAt: Date())

        sut.reconcile(withServed: [servedGroup("ex", presence: nil)])

        XCTAssertEqual(sut.presenceState(for: "bystander"), PresenceState.online)
    }

    private func servedGroup(_ userId: String, presence: UserPresence?) -> StoryGroup {
        StoryGroup(id: userId, username: userId, avatarColor: "FF2E63", stories: [], authorPresence: presence)
    }

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
