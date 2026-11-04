import XCTest
import MeeshySDK
@testable import Meeshy

/// #15887 — ce qu'ouvre le toucher de l'avatar d'une ligne, depuis la liste.
///
/// La cible vient de la loi du SDK (`ConversationAvatarTarget`) ; la liste y
/// ajoute la porte du verrou. Une conversation verrouillée par PIN passe la
/// porte, puis montre ses DÉTAILS — jamais le fil, que le toucher d'un avatar
/// ne demande pas, et jamais le profil, qui ne s'ouvrait pas derrière un PIN
/// mais sans lui.
@MainActor
final class ConversationListAvatarRoutingTests: XCTestCase {

    // MARK: - La loi

    func test_anUnlockedDirect_withAProfileTarget_opensTheProfile() {
        XCTAssertEqual(
            ConversationOpenRoute.avatarRoute(target: .profile(userId: "u2"), isLocked: false),
            .profile(userId: "u2")
        )
    }

    func test_anUnlockedConversation_withoutAProfile_showsItsDetails() {
        XCTAssertEqual(ConversationOpenRoute.avatarRoute(target: .conversationInfo, isLocked: false), .info)
    }

    /// Verrouillée, QUEL QUE SOIT son type : le PIN, puis les détails.
    func test_aLockedConversation_asksForThePin_thenShowsItsDetails() {
        XCTAssertEqual(ConversationOpenRoute.avatarRoute(target: .profile(userId: "u2"), isLocked: true), .unlockThenInfo)
        XCTAssertEqual(ConversationOpenRoute.avatarRoute(target: .conversationInfo, isLocked: true), .unlockThenInfo)
    }

    func test_onlyTheProfileRoute_opensAProfile() {
        XCTAssertTrue(ConversationAvatarRoute.profile(userId: "u2").opensProfile)
        XCTAssertFalse(ConversationAvatarRoute.info.opensProfile)
        XCTAssertFalse(ConversationAvatarRoute.unlockThenInfo.opensProfile)
    }

    // MARK: - Le verrou et le blocage réels

    func test_aConversationLockedByPin_routesThroughThePin() {
        let locks = ConversationLockManager.shared
        let conversation = direct(peer: "u2")
        locks.setLock(conversationId: conversation.id, pin: "1234")
        defer { locks.removeLock(conversationId: conversation.id) }

        XCTAssertEqual(ConversationOpenRoute.avatarRoute(for: conversation), .unlockThenInfo)
    }

    func test_aBlockedPeer_routesToTheDetails() {
        let conversation = direct(peer: "u2")
        XCTAssertEqual(ConversationOpenRoute.avatarRoute(for: conversation, blocks: blocks(["u2"])), .info)
        XCTAssertEqual(ConversationOpenRoute.avatarRoute(for: conversation, blocks: blocks([])), .profile(userId: "u2"))
    }

    func test_aClosedPeerAccount_routesToTheDetails() {
        var conversation = direct(peer: "u2")
        conversation.participantAccountClosed = true
        XCTAssertEqual(ConversationOpenRoute.avatarRoute(for: conversation, blocks: blocks([])), .info)
    }

    func test_anAnonymousPeerWithoutId_routesToTheDetails() {
        XCTAssertEqual(ConversationOpenRoute.avatarRoute(for: direct(peer: nil), blocks: blocks([])), .info)
    }

    // MARK: - Le câblage de la liste (garde de source)

    /// La liste relit la route AU TOUCHER : un verrou posé ou un blocage décidé
    /// depuis le dernier rendu de la ligne ne laisse pas passer l'ancien geste.
    func test_theProfileHandler_readsTheRouteAtTapTime() throws {
        let code = normalizedCode(try source(at: "Meeshy/Features/Main/Views/ConversationListView+AvatarRouting.swift"))
        XCTAssertTrue(code.contains("ConversationOpenRoute.avatarRoute(for: conversation)"))
    }

    /// Verrouillée, la fiche passe par le PIN puis s'ouvre ; elle n'ouvre plus
    /// le fil (`openConversation`), qui n'était pas demandé.
    func test_presentingTheDetailsOfALockedConversation_neverOpensTheThread() throws {
        let code = normalizedCode(try source(at: "Meeshy/Features/Main/Views/ConversationListView+AvatarRouting.swift"))
        XCTAssertTrue(code.contains("sheetTargets.infoAfterUnlock = true"))
        XCTAssertFalse(code.contains("openConversation("), "le toucher d'un avatar ne demande jamais le fil")
    }

    /// Le PIN accordé vaut UNE ouverture (#11386) : la fiche la consomme, pour
    /// qu'aucun laissez-passer ne survive à côté d'elle.
    func test_theUnlockedDetails_consumeThePinPass_andOpenOnceTheLockSheetIsGone() throws {
        let code = normalizedCode(try source(at: "Meeshy/Features/Main/Views/ConversationListView+Presentations.swift"))
        XCTAssertTrue(code.contains("if sheetTargets.infoAfterUnlock { return admitInfo(of: conversation) }"))
        XCTAssertTrue(code.contains("ConversationLockManager.shared.admitsOpening(conversation.id)"))
        XCTAssertTrue(code.contains(".sheet(item: $sheetTargets.lockSheet, onDismiss: presentUnlockedInfo)"))
        XCTAssertTrue(code.contains("sheetTargets.info = conversation"))
    }

    // MARK: - Outils

    private func blocks(_ blocked: Set<String>) -> MockBlockService {
        let mock = MockBlockService()
        mock.blockedUserIds = blocked
        return mock
    }

    private func direct(peer: String?) -> Conversation {
        MeeshyConversation(
            id: "avatar-route-\(UUID().uuidString)", identifier: "direct", type: .direct,
            lastMessageAt: Date(timeIntervalSince1970: 0),
            participantUserId: peer
        )
    }

    private func source(at relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // .../Unit/Views
            .deletingLastPathComponent() // .../Unit
            .deletingLastPathComponent() // .../MeeshyTests
            .deletingLastPathComponent() // .../apps/ios
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func normalizedCode(_ source: String) -> String {
        AppSourceGuard.stripComments(source)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }
}
