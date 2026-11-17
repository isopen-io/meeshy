import XCTest
@testable import MeeshySDK

/// #18924 — changer sa langue, son nom ou sa photo sur un appareil se voit aussitôt sur les autres :
/// `profile:updated` projeté sur le compte connecté, sans relecture réseau, arbitré par `updatedAt`.
final class OwnProfileSyncTests: XCTestCase {

    private static let me = "moi-18924"
    private static let held = "2026-11-17T10:00:00.000Z"
    private static let later = "2026-11-17T10:05:00.000Z"

    private func user(
        systemLanguage: String? = "fr", regionalLanguage: String? = "en", displayName: String? = "Alice D.",
        avatar: String? = "https://cdn/a-old.jpg", updatedAt: String? = held
    ) -> MeeshyUser {
        MeeshyUser(
            id: Self.me, username: "alice", email: "alice@example.com",
            firstName: "Alice", lastName: "Dupont", displayName: displayName, bio: "Bonjour",
            avatar: avatar, avatarThumbHash: "hash-avatar", banner: "https://cdn/b.jpg", bannerThumbHash: "hash-banner",
            role: "USER", systemLanguage: systemLanguage, regionalLanguage: regionalLanguage,
            updatedAt: updatedAt, deviceLocale: "pt"
        )
    }

    private func snapshot(
        systemLanguage: String = "en", regionalLanguage: String? = "es", displayName: String? = nil,
        avatar: String? = "https://cdn/a-new.jpg"
    ) -> OwnProfileSnapshot {
        OwnProfileSnapshot(
            systemLanguage: systemLanguage, regionalLanguage: regionalLanguage, customDestinationLanguage: nil,
            displayName: displayName, firstName: "Alicia", lastName: "Durand", username: "alicia",
            avatar: avatar, banner: "https://cdn/b.jpg"
        )
    }

    private func event(_ profile: OwnProfileSnapshot? = nil, userId: String = me, at updatedAt: String = later) -> ProfileUpdatedEvent {
        ProfileUpdatedEvent(userId: userId, updatedAt: updatedAt, profile: profile ?? snapshot())
    }

    // MARK: - L'arbitrage par `updatedAt`

    func test_isStale_onlyAStrictlyOlderInstantIsStale() {
        XCTAssertTrue(OwnProfileSync.isStale(knownUpdatedAt: Self.later, incomingUpdatedAt: Self.held))
        XCTAssertFalse(OwnProfileSync.isStale(knownUpdatedAt: Self.held, incomingUpdatedAt: Self.held), "l'écho de sa propre écriture s'applique")
        XCTAssertFalse(OwnProfileSync.isStale(knownUpdatedAt: Self.held, incomingUpdatedAt: Self.later))
    }

    func test_isStale_nothingKnownOrAnIllegibleInstant_applies() {
        XCTAssertFalse(OwnProfileSync.isStale(knownUpdatedAt: nil, incomingUpdatedAt: Self.held))
        XCTAssertFalse(OwnProfileSync.isStale(knownUpdatedAt: "hier", incomingUpdatedAt: Self.held))
        XCTAssertFalse(OwnProfileSync.isStale(knownUpdatedAt: Self.later, incomingUpdatedAt: "bientôt"))
    }

    // MARK: - La charge

    func test_decode_readsTheSnapshot_ignoringUnknownKeys_andNullMeansCleared() throws {
        let json = #"""
        {"userId":"moi-18924","updatedAt":"2026-11-17T10:05:00.000Z","futureKey":1,
         "profile":{"systemLanguage":"en","regionalLanguage":null,"customDestinationLanguage":null,"displayName":null,
                    "firstName":"Alicia","lastName":"Durand","username":"alicia","avatar":null,"banner":null,"pronouns":"elle"}}
        """#

        let decoded = try MeeshyCoders.decoder(.socket).decode(ProfileUpdatedEvent.self, from: Data(json.utf8))

        XCTAssertEqual(decoded.profile.systemLanguage, "en")
        XCTAssertNil(decoded.profile.regionalLanguage)
        XCTAssertNil(decoded.profile.avatar)
        XCTAssertEqual(decoded.updatedAt, Self.later)
    }

    // MARK: - La projection

    func test_projected_appliesTheNineFields_andKeepsTheRestOfTheAccount() throws {
        let projected = try XCTUnwrap(OwnProfileSync.projected(user(), applying: event()))

        XCTAssertEqual(projected.systemLanguage, "en")
        XCTAssertEqual(projected.regionalLanguage, "es")
        XCTAssertNil(projected.displayName, "un nom affiché effacé retombe sur « Prénom Nom »")
        XCTAssertEqual([projected.firstName, projected.lastName, projected.username], ["Alicia", "Durand", "alicia"])
        XCTAssertEqual(projected.avatar, "https://cdn/a-new.jpg")
        XCTAssertNil(projected.avatarThumbHash, "l'empreinte de l'ancienne photo ne peint pas la nouvelle")
        XCTAssertEqual(projected.bannerThumbHash, "hash-banner", "la bannière inchangée garde son empreinte")
        XCTAssertEqual(projected.updatedAt, Self.later)
        XCTAssertEqual([projected.email, projected.bio, projected.role, projected.deviceLocale], ["alice@example.com", "Bonjour", "USER", "pt"])
    }

    func test_projected_anotherAccountAnOlderOrAnIdenticalSnapshot_changesNothing() throws {
        XCTAssertNil(OwnProfileSync.projected(user(), applying: event(userId: "autre")))
        XCTAssertNil(OwnProfileSync.projected(user(updatedAt: Self.later), applying: event(at: Self.held)), "périmé")

        let applied = try XCTUnwrap(OwnProfileSync.projected(user(), applying: event()))
        XCTAssertNil(OwnProfileSync.projected(applied, applying: event()), "l'écho de ce qu'on tient déjà ne republie rien")
    }

    // MARK: - Le compte connecté

    @MainActor
    func test_apply_repaintsTheSignedInAccount_andTheReaderPrismFollowsItsLanguages() {
        let auth = AuthManager.shared
        let previousUser = auth.currentUser
        let previousPending = auth.pendingOptimisticProfile
        defer {
            auth.currentUser = previousUser
            auth.pendingOptimisticProfile = previousPending
        }
        auth.pendingOptimisticProfile = nil
        auth.currentUser = user()

        OwnProfileSync.apply(event(), to: auth)

        XCTAssertEqual(auth.currentUser?.systemLanguage, "en")
        XCTAssertEqual(ReaderPrism.resolve(for: auth.currentUser), ["en", "es", "pt"])
    }

    @MainActor
    func test_apply_keepsAnOptimisticEditInFlight_andLiftsItOnceTheSnapshotCarriesIt() {
        let auth = AuthManager.shared
        let previousUser = auth.currentUser
        let previousPending = auth.pendingOptimisticProfile
        defer {
            auth.currentUser = previousUser
            auth.pendingOptimisticProfile = previousPending
        }
        let editing = user(displayName: "Bob", avatar: "https://cdn/a-bob.jpg")
        auth.currentUser = editing
        auth.pendingOptimisticProfile = ProfileSnapshot(displayName: "Bob", bio: "Bonjour", avatarUrl: "https://cdn/a-bob.jpg")

        OwnProfileSync.apply(event(snapshot(displayName: "Robert")), to: auth)

        XCTAssertEqual(auth.currentUser?.displayName, "Bob", "l'écriture en vol sur CET appareil n'est pas écrasée")
        XCTAssertEqual(auth.currentUser?.systemLanguage, "en", "le reste de l'instantané s'applique")
        XCTAssertNotNil(auth.pendingOptimisticProfile)

        OwnProfileSync.apply(
            event(snapshot(displayName: "Bob", avatar: "https://cdn/a-bob.jpg"), at: "2026-11-17T10:06:00.000Z"), to: auth
        )

        XCTAssertNil(auth.pendingOptimisticProfile, "l'instantané porte l'écriture : la garde se lève")
    }
}
