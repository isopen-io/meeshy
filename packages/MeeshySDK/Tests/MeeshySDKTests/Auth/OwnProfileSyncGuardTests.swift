import XCTest
@testable import MeeshySDK

/// #19306 — la garde optimiste du profil ne se lève que sur ce que `profile:updated` PORTE (il ne porte pas la bio),
/// et le sélecteur de comptes suit le nom et la photo de l'instantané appliqué.
final class OwnProfileSyncGuardTests: XCTestCase {

    private static let me = "moi-19306"

    private func user(displayName: String?, bio: String?, avatar: String?, updatedAt: String = "2026-11-17T10:00:00.000Z") -> MeeshyUser {
        MeeshyUser(
            id: Self.me, username: "alice", email: "alice@example.com",
            firstName: "Alice", lastName: "Dupont", displayName: displayName, bio: bio,
            avatar: avatar, role: "USER", systemLanguage: "fr", regionalLanguage: "en", updatedAt: updatedAt
        )
    }

    private func event(displayName: String?, avatar: String?) -> ProfileUpdatedEvent {
        ProfileUpdatedEvent(
            userId: Self.me, updatedAt: "2026-11-17T10:05:00.000Z",
            profile: OwnProfileSnapshot(
                systemLanguage: "fr", regionalLanguage: "en", customDestinationLanguage: nil,
                displayName: displayName, firstName: "Alice", lastName: "Dupont", username: "alice",
                avatar: avatar, banner: nil
            )
        )
    }

    @MainActor
    func test_apply_snapshotMatchingNameAndPhoto_keepsTheGuardWhileABioIsInFlight() {
        let auth = AuthManager.shared
        let previousUser = auth.currentUser
        let previousPending = auth.pendingOptimisticProfile
        defer { auth.currentUser = previousUser; auth.pendingOptimisticProfile = previousPending }
        auth.currentUser = user(displayName: "Alice", bio: "Nouvelle bio", avatar: "https://cdn/a.jpg")
        auth.pendingOptimisticProfile = ProfileSnapshot(displayName: "Alice", bio: "Nouvelle bio", avatarUrl: "https://cdn/a.jpg")

        OwnProfileSync.apply(event(displayName: "Alice", avatar: "https://cdn/a.jpg"), to: auth)

        XCTAssertNotNil(auth.pendingOptimisticProfile, "le nom et la photo concordent, mais la bio en vol n'est pas confirmée")
        let revalidated = user(displayName: "Alice", bio: "Ancienne bio", avatar: "https://cdn/a.jpg", updatedAt: "2026-11-17T10:06:00.000Z")
        let resolved = AuthManager.resolveServerUserWithOptimistic(revalidated, pending: auth.pendingOptimisticProfile)
        XCTAssertEqual(resolved.user.bio, "Nouvelle bio", "une relecture ultérieure n'écrase pas la bio non confirmée")
    }

    @MainActor
    func test_apply_updatesTheSavedAccountWithTheAppliedNameAndPhoto() {
        let auth = AuthManager.shared
        let previousUser = auth.currentUser
        let previousPending = auth.pendingOptimisticProfile
        let previousAccounts = auth.savedAccounts
        defer {
            auth.currentUser = previousUser; auth.pendingOptimisticProfile = previousPending
            auth.savedAccounts = previousAccounts
        }
        auth.pendingOptimisticProfile = nil
        auth.currentUser = user(displayName: "Alice", bio: nil, avatar: "https://cdn/old.jpg")
        auth.savedAccounts = [SavedAccount(
            id: Self.me, username: "alice", displayName: "Alice", avatarURL: "https://cdn/old.jpg",
            lastActiveAt: Date(), keepsSession: true
        )]

        OwnProfileSync.apply(event(displayName: "Alicia", avatar: "https://cdn/new.jpg"), to: auth)

        let saved = auth.savedAccounts.first { $0.id == Self.me }
        XCTAssertEqual(saved?.displayName, "Alicia")
        XCTAssertEqual(saved?.avatarURL, "https://cdn/new.jpg")
    }
}
