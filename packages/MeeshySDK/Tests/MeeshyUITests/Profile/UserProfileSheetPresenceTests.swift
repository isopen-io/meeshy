import XCTest
import MeeshySDK
@testable import MeeshyUI

/// `UserProfileSheet.resolvedPresence` — la pastille de présence du profil
/// doit refléter la MÊME source temps réel que la liste de conversations
/// quand l'app injecte un `presenceProvider`, et ne retomber sur le snapshot
/// REST `isOnline` que lorsque la donnée live n'existe pas.
@MainActor
final class UserProfileSheetPresenceTests: XCTestCase {

    private func makeUser(
        userId: String? = "64b000000000000000000001",
        isOnline: Bool? = nil,
        lastActiveAt: Date? = nil
    ) -> ProfileSheetUser {
        ProfileSheetUser(userId: userId, username: "alice", isOnline: isOnline, lastActiveAt: lastActiveAt)
    }

    // MARK: - Provider (source temps réel)

    func test_resolvedPresence_providerOnline_overridesStaleOfflineSnapshot() {
        let sut = UserProfileSheet(
            user: makeUser(isOnline: false),
            presenceProvider: { _ in .online }
        )
        XCTAssertEqual(sut.resolvedPresence, .online)
    }

    func test_resolvedPresence_providerOffline_overridesStaleOnlineSnapshot() {
        let sut = UserProfileSheet(
            user: makeUser(isOnline: true),
            presenceProvider: { _ in .offline }
        )
        XCTAssertEqual(sut.resolvedPresence, .offline)
    }

    func test_resolvedPresence_providerAway_isSurfaced() {
        let sut = UserProfileSheet(
            user: makeUser(isOnline: true),
            presenceProvider: { _ in .away }
        )
        XCTAssertEqual(sut.resolvedPresence, .away)
    }

    func test_resolvedPresence_providerReceivesResolvedUserId() {
        var receivedUserId: String?
        let sut = UserProfileSheet(
            user: makeUser(userId: "64b000000000000000000002"),
            presenceProvider: { userId in
                receivedUserId = userId
                return .online
            }
        )
        _ = sut.resolvedPresence
        XCTAssertEqual(receivedUserId, "64b000000000000000000002")
    }

    // MARK: - Fallback snapshot REST

    func test_resolvedPresence_providerUnknownUser_fallsBackToOnlineSnapshot() {
        let sut = UserProfileSheet(
            user: makeUser(isOnline: true),
            presenceProvider: { _ in nil }
        )
        XCTAssertEqual(sut.resolvedPresence, .online)
    }

    func test_resolvedPresence_providerUnknownUser_fallsBackToOfflineSnapshot() {
        let sut = UserProfileSheet(
            user: makeUser(isOnline: false),
            presenceProvider: { _ in nil }
        )
        XCTAssertEqual(sut.resolvedPresence, .offline)
    }

    func test_resolvedPresence_noProvider_usesSnapshot() {
        XCTAssertEqual(UserProfileSheet(user: makeUser(isOnline: true)).resolvedPresence, .online)
        XCTAssertEqual(UserProfileSheet(user: makeUser(isOnline: false)).resolvedPresence, .offline)
        XCTAssertEqual(UserProfileSheet(user: makeUser(isOnline: nil)).resolvedPresence, .offline)
    }

    func test_resolvedPresence_noProvider_offlineButRecentlyActive_returnsAway() {
        let sut = UserProfileSheet(
            user: makeUser(isOnline: false, lastActiveAt: Date().addingTimeInterval(-600))
        )
        XCTAssertEqual(sut.resolvedPresence, .away)
    }

    func test_resolvedPresence_noProvider_connectedWithStaleTimestamp_returnsOnline() {
        // isOnline backend est autoritatif : connecté = vert, même si le
        // dernier lastActiveAt date de quelques minutes.
        let sut = UserProfileSheet(
            user: makeUser(isOnline: true, lastActiveAt: Date().addingTimeInterval(-180))
        )
        XCTAssertEqual(sut.resolvedPresence, .online)
    }

    func test_resolvedPresence_noProvider_disconnectedButRecentlyActive_returnsRecent() {
        let sut = UserProfileSheet(
            user: makeUser(isOnline: false, lastActiveAt: Date().addingTimeInterval(-180))
        )
        XCTAssertEqual(sut.resolvedPresence, .recent)
    }

    func test_resolvedPresence_noProvider_onlineButIdleOver30min_returnsOffline() {
        // Garde anti-stale : un flag isOnline avec lastActiveAt > 30min est une
        // donnee incoherente -> la decroissance temporelle prime (offline).
        let sut = UserProfileSheet(
            user: makeUser(isOnline: true, lastActiveAt: Date().addingTimeInterval(-2700))
        )
        XCTAssertEqual(sut.resolvedPresence, .offline)
    }

    func test_resolvedPresence_noProvider_offlinePast30min_returnsOffline() {
        let sut = UserProfileSheet(
            user: makeUser(isOnline: false, lastActiveAt: Date().addingTimeInterval(-1860))
        )
        XCTAssertEqual(sut.resolvedPresence, .offline)
    }

    func test_resolvedPresence_usernameOnlyProfile_skipsProviderBeforeIdResolution() {
        var providerCalled = false
        let sut = UserProfileSheet(
            user: makeUser(userId: nil, isOnline: true),
            presenceProvider: { _ in
                providerCalled = true
                return .offline
            }
        )
        XCTAssertEqual(sut.resolvedPresence, .online)
        XCTAssertFalse(providerCalled)
    }
}
