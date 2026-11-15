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
            presenceProvider: { _ in .online },
            dependencies: ProfileDependencyDoubles.make()
        )
        XCTAssertEqual(sut.resolvedPresence, .online)
    }

    func test_resolvedPresence_providerOffline_overridesStaleOnlineSnapshot() {
        let sut = UserProfileSheet(
            user: makeUser(isOnline: true),
            presenceProvider: { _ in .offline },
            dependencies: ProfileDependencyDoubles.make()
        )
        XCTAssertEqual(sut.resolvedPresence, .offline)
    }

    func test_resolvedPresence_providerAway_isSurfaced() {
        let sut = UserProfileSheet(
            user: makeUser(isOnline: true),
            presenceProvider: { _ in .away },
            dependencies: ProfileDependencyDoubles.make()
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
            },
            dependencies: ProfileDependencyDoubles.make()
        )
        _ = sut.resolvedPresence
        XCTAssertEqual(receivedUserId, "64b000000000000000000002")
    }

    // MARK: - Fallback snapshot REST

    func test_resolvedPresence_providerUnknownUser_fallsBackToOnlineSnapshot() {
        let sut = UserProfileSheet(
            user: makeUser(isOnline: true),
            presenceProvider: { _ in nil },
            dependencies: ProfileDependencyDoubles.make()
        )
        XCTAssertEqual(sut.resolvedPresence, .online)
    }

    func test_resolvedPresence_providerUnknownUser_fallsBackToOfflineSnapshot() {
        let sut = UserProfileSheet(
            user: makeUser(isOnline: false),
            presenceProvider: { _ in nil },
            dependencies: ProfileDependencyDoubles.make()
        )
        XCTAssertEqual(sut.resolvedPresence, .offline)
    }

    func test_resolvedPresence_noProvider_usesSnapshot() {
        XCTAssertEqual(UserProfileSheet(user: makeUser(isOnline: true), dependencies: ProfileDependencyDoubles.make()).resolvedPresence, .online)
        XCTAssertEqual(UserProfileSheet(user: makeUser(isOnline: false), dependencies: ProfileDependencyDoubles.make()).resolvedPresence, .offline)
        XCTAssertEqual(UserProfileSheet(user: makeUser(isOnline: nil), dependencies: ProfileDependencyDoubles.make()).resolvedPresence, .offline)
    }

    func test_resolvedPresence_noProvider_disconnectedActive2minAgo_returnsAway() {
        let sut = UserProfileSheet(
            user: makeUser(isOnline: false, lastActiveAt: Date().addingTimeInterval(-120)),
            dependencies: ProfileDependencyDoubles.make()
        )
        XCTAssertEqual(sut.resolvedPresence, .away)
    }

    func test_resolvedPresence_noProvider_connectedWithStaleTimestamp_returnsOnline() {
        // isOnline backend est autoritatif : connecté = vert, même si le
        // dernier lastActiveAt date de quelques minutes (garde 5 min).
        let sut = UserProfileSheet(
            user: makeUser(isOnline: true, lastActiveAt: Date().addingTimeInterval(-180)),
            dependencies: ProfileDependencyDoubles.make()
        )
        XCTAssertEqual(sut.resolvedPresence, .online)
    }

    func test_resolvedPresence_noProvider_disconnectedActive4minAgo_returnsIdle() {
        let sut = UserProfileSheet(
            user: makeUser(isOnline: false, lastActiveAt: Date().addingTimeInterval(-240)),
            dependencies: ProfileDependencyDoubles.make()
        )
        XCTAssertEqual(sut.resolvedPresence, .idle)
    }

    func test_resolvedPresence_noProvider_onlineButStaleOver5min_returnsOffline() {
        // Garde anti-stale : un flag isOnline avec lastActiveAt > 5min est une
        // donnee incoherente -> la decroissance temporelle prime (offline).
        let sut = UserProfileSheet(
            user: makeUser(isOnline: true, lastActiveAt: Date().addingTimeInterval(-600)),
            dependencies: ProfileDependencyDoubles.make()
        )
        XCTAssertEqual(sut.resolvedPresence, .offline)
    }

    func test_resolvedPresence_noProvider_offlinePast5min_returnsOffline() {
        let sut = UserProfileSheet(
            user: makeUser(isOnline: false, lastActiveAt: Date().addingTimeInterval(-360)),
            dependencies: ProfileDependencyDoubles.make()
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
            },
            dependencies: ProfileDependencyDoubles.make()
        )
        XCTAssertEqual(sut.resolvedPresence, .online)
        XCTAssertFalse(providerCalled)
    }
}
