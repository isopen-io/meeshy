import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK

/// #10093 — le niveau et le rang d'un membre se LISENT dès que la bannière de sa fiche s'affiche, cache vide compris.
///
/// Le badge était un `Group { if let model … }.task { charger }` : un `Group` n'est pas une vue, il distribue ses
/// modificateurs à ses enfants. Tant que rien n'est chargé il n'a AUCUN enfant, donc la tâche qui devait charger ne
/// démarre jamais — le badge attendait le modèle que seule son apparition pouvait lui donner. Sur un appareil neuf, il
/// ne se montrait sur aucune fiche, la sienne comprise. La bande de la carte de contact portait le même cercle.
@MainActor
final class GameBannerBadgeLoadingTests: XCTestCase {

    private actor MemoryCache: GameWave2Caching {
        private var store: [String: Data] = [:]
        func load<T: Decodable & Sendable>(_ type: T.Type, name: String) async -> T? {
            store[name].flatMap { try? JSONDecoder().decode(T.self, from: $0) }
        }
        func save<T: Encodable & Sendable>(_ value: T, name: String) async { store[name] = try? JSONEncoder().encode(value) }
        func remove(name: String) async { store[name] = nil }
    }

    private var ecran: RenderedScreen?

    override func tearDown() {
        ecran?.dismount()
        ecran = nil
        super.tearDown()
    }

    /// La réponse que le serveur de recette sert à un compte neuf (`GET /users/:id/game`, mesurée le 2026-10-11).
    private static func servedStanding() -> UserGameProfileResponse {
        UserGameProfileResponse(
            visible: true,
            standing: GameStanding(level: 1, tier: .etincelle, prestige: 0, flame: .braise, rank: .murmure,
                                   division: .iii, division5: .v, ladder: GameStandingLadder(level: 1, tier: .etincelle)),
            treasury: GameShownTreasury(tier: nil)
        )
    }

    private func integration() -> MockGameIntegrationService {
        let service = MockGameIntegrationService()
        service.userGameResult = .success(Self.servedStanding())
        return service
    }

    func test_bannerBadge_nothingCached_readsTheServedGameAndShowsTheLevelAndRank() {
        let service = integration()
        let userId = "badge-\(UUID().uuidString)"
        let loader = GameUserGameLoader(service: service, cache: MemoryCache(), currentUserId: "me")

        ecran = RenderedScreen(VStack {
            Text(verbatim: "fiche")
            GameBannerBadge(userId: userId, loader: loader)
        })

        XCTAssertNotNil(ecran?.frame(of: "profile.banner.game", borne: 5), "le badge ne s'est jamais posé sur la bannière")
        XCTAssertEqual(service.userGameIds, [userId])
    }

    func test_contactStrip_nothingCached_readsTheServedGameAndShowsIt() {
        let service = integration()
        let userId = "strip-\(UUID().uuidString)"
        let cache = MemoryCache()

        ecran = RenderedScreen(VStack {
            Text(verbatim: "carte")
            GameContactStrip(
                userId: userId,
                loader: GameShowcaseLoader(service: MockGameWave2Service(), cache: cache, currentUserId: "me"),
                standingLoader: GameUserGameLoader(service: service, cache: cache, currentUserId: "me")
            )
        })

        XCTAssertNotNil(ecran?.frame(of: "game.contact.strip", borne: 5), "la bande du jeu ne s'est jamais posée")
        XCTAssertEqual(service.userGameIds, [userId])
    }
}
