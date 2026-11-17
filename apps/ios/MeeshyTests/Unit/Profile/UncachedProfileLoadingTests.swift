import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class UncachedProfileLoadingTests: XCTestCase {

    func test_cachedProfile_rendEmpty() async {
        let sut = UncachedProfileLoading()

        let result = await sut.cachedProfile(for: "u-bob")

        guard case .empty = result else { return XCTFail("attendu .empty, reçu \(result)") }
    }

    func test_cachedStats_rendEmpty() async {
        let sut = UncachedProfileLoading()

        let result = await sut.cachedStats(for: "u-bob")

        guard case .empty = result else { return XCTFail("attendu .empty, reçu \(result)") }
    }
}

/// Lire un profil en cache n'est pas le revalider (#18937). La lecture remettait l'horloge à zéro
/// (`touch`), si bien qu'un profil revisité toutes les quatre minutes restait `.fresh` pour toujours :
/// une nouvelle bio, un renommage manqué pendant une coupure n'étaient jamais relus, et chaque lecteur
/// qui s'arrête au `.fresh` (l'appel, l'export d'une story) servait un profil figé.
@MainActor
final class LiveProfileLoadingTests: XCTestCase {

    private func makeUser(id: String) -> MeeshyUser {
        MeeshyUser(id: id, username: "carla", displayName: "Carla")
    }

    private func seedProfile(id: String, age: TimeInterval) async throws {
        let store = await CacheCoordinator.shared.profiles
        try await store.save([makeUser(id: id)], for: id)
        await store.debugRewindFetchTimestamp(by: age, for: id)
    }

    private func forget(_ id: String) async {
        let store = await CacheCoordinator.shared.profiles
        await store.invalidate(for: id)
    }

    func test_cachedProfile_readingAFreshProfile_keepsItsAge() async throws {
        let id = "u-carla-\(UUID().uuidString)"
        try await seedProfile(id: id, age: 240)

        let read = await LiveProfileLoading().cachedProfile(for: id)

        let store = await CacheCoordinator.shared.profiles
        let after = await store.load(for: id)
        await forget(id)
        guard case .fresh = read else { return XCTFail("un profil relu il y a quatre minutes est frais, reçu \(read)") }
        guard case .fresh(_, let age) = after else { return XCTFail("attendu .fresh, reçu \(after)") }
        XCTAssertGreaterThanOrEqual(age, 240, "une lecture ne remet pas l'horloge de fraîcheur à zéro")
    }

    func test_cachedProfile_beyondTheFreshWindow_staysStaleAcrossReads() async throws {
        let id = "u-carla-\(UUID().uuidString)"
        try await seedProfile(id: id, age: 360)

        let first = await LiveProfileLoading().cachedProfile(for: id)
        let second = await LiveProfileLoading().cachedProfile(for: id)

        await forget(id)
        guard case .stale(let users, _) = first else { return XCTFail("au-delà de cinq minutes, attendu .stale, reçu \(first)") }
        XCTAssertEqual(users.map(\.id), [id], "le profil se peint depuis le cache, sans squelette")
        guard case .stale = second else {
            return XCTFail("la première lecture ne doit pas rendre le profil frais à la seconde, reçu \(second)")
        }
    }
}
