import XCTest
import MeeshySDK
@testable import Meeshy

/// **Un rafraîchissement qui échoue ne doit pas laisser l'écran plus vide que
/// le disque.**
///
/// `loadFirstPage` détruisait le cache AVANT de savoir s'il y aurait de quoi le
/// remplacer (`invalidate()` puis `fetchNextPage()`). Hors ligne, la charge
/// encore présente sur le disque partait donc pour rien — la liste des membres
/// devenait vide sur les DEUX surfaces qui la servent (`ConversationInfoSheet`,
/// `ParticipantsView`), et l'ouverture suivante repartait du réseau puisque le
/// cache n'avait plus rien à servir.
///
/// C'est le défaut que `ConversationListViewModel.forceRefresh` a déjà corrigé
/// pour les conversations (§ « Fetch-then-replace ») et que sa branche
/// `.expired` documente : `load()` rend un `.expired` SANS charge — le signal
/// veut dire « ne t'y fie pas », jamais « il n'y a rien ».
///
/// Les témoins interrogent ce que le service SERT et ce que le disque GARDE,
/// jamais la forme de l'appel : un chiffre mesuré sur le cache ne prouverait
/// pas que l'écran l'affiche.
final class ParticipantServiceCachePreservationTests: XCTestCase {

    // MARK: - Fixtures

    /// Une clé neuve par témoin : le magasin est le VRAI
    /// `CacheCoordinator.shared.participants`, partagé par toute la suite.
    private func makeConversationId() -> String {
        "part-cache-\(UUID().uuidString)"
    }

    private func makeSUT() -> (service: ParticipantService, api: MockAPIClientForApp) {
        let api = MockAPIClientForApp()
        return (ParticipantService(apiClient: api), api)
    }

    private func makeParticipant(_ id: String) -> PaginatedParticipant {
        PaginatedParticipant(id: id, userId: id, username: id, displayName: id.uppercased())
    }

    /// Sème une charge puis recule son horloge au-delà du TTL (24 h pour
    /// `.participants`) : `load()` rendra `.expired`, `loadIgnoringExpiry` la
    /// charge intacte. C'est l'état exact d'une app rouverte le lendemain.
    private func seedExpiredCache(_ items: [PaginatedParticipant], for key: String) async {
        try? await CacheCoordinator.shared.participants.save(items, for: key)
        await CacheCoordinator.shared.participants.debugRewindFetchTimestamp(
            by: 25 * 60 * 60,
            for: key
        )
    }

    private func diskPayload(for key: String) async -> [PaginatedParticipant] {
        await CacheCoordinator.shared.participants.loadIgnoringExpiry(for: key)?.items ?? []
    }

    private func participantsResponseJSON(ids: [String]) -> String {
        let rows = ids.map { #"{"id":"\#($0)","userId":"\#($0)","username":"\#($0)"}"# }
        return #"{"success":true,"data":[\#(rows.joined(separator: ","))],"#
            + #""pagination":{"nextCursor":null,"hasMore":false,"totalCount":\#(ids.count)}}"#
    }

    // MARK: - Ce que le service SERT

    func test_loadFirstPage_whenCacheIsExpiredAndNetworkFails_servesTheDiskPayload() async {
        let conversationId = makeConversationId()
        await seedExpiredCache([makeParticipant("p1"), makeParticipant("p2")], for: conversationId)
        let (sut, api) = makeSUT()
        api.errorToThrow = URLError(.notConnectedToInternet)

        let served = try? await sut.loadFirstPage(for: conversationId)

        XCTAssertEqual(
            served?.count, 2,
            "Le disque porte encore les deux membres : les servir vaut mieux qu'une liste vide."
        )

        await CacheCoordinator.shared.participants.invalidate(for: conversationId)
    }

    func test_loadFirstPage_whenServerReportsFailure_servesTheDiskPayload() async {
        let conversationId = makeConversationId()
        await seedExpiredCache([makeParticipant("p1"), makeParticipant("p2")], for: conversationId)
        let (sut, api) = makeSUT()
        let response: PaginatedParticipantsResponse = JSONStub.decode(
            #"{"success":false,"data":[],"pagination":null}"#
        )
        api.stub(
            api.legacyPath(for: ConversationsEndpoint.byIdParticipants(id: conversationId)),
            result: response
        )

        let served = try? await sut.loadFirstPage(for: conversationId)

        XCTAssertEqual(
            served?.count, 2,
            "Un `success: false` est une panne : il ne rend pas la conversation vide de membres."
        )

        await CacheCoordinator.shared.participants.invalidate(for: conversationId)
    }

    // MARK: - Ce que le disque GARDE

    func test_loadFirstPage_whenNetworkFails_leavesTheDiskPayloadIntact() async {
        let conversationId = makeConversationId()
        await seedExpiredCache([makeParticipant("p1"), makeParticipant("p2")], for: conversationId)
        let (sut, api) = makeSUT()
        api.errorToThrow = URLError(.notConnectedToInternet)

        _ = try? await sut.loadFirstPage(for: conversationId)

        let onDisk = await diskPayload(for: conversationId)
        XCTAssertEqual(
            onDisk.count, 2,
            "Rien n'a remplacé la charge : elle doit toujours être là pour l'ouverture suivante."
        )

        await CacheCoordinator.shared.participants.invalidate(for: conversationId)
    }

    func test_loadFirstPage_whenNetworkFails_doesNotLaunderTheRecoveredPayloadAsFresh() async {
        let conversationId = makeConversationId()
        await seedExpiredCache([makeParticipant("p1"), makeParticipant("p2")], for: conversationId)
        let (sut, api) = makeSUT()
        api.errorToThrow = URLError(.notConnectedToInternet)

        _ = try? await sut.loadFirstPage(for: conversationId)

        // Servir une charge n'est pas l'avoir REVALIDÉE : son horloge reste
        // celle du dernier aller-retour réussi, sans quoi l'app cesserait de
        // tenter un rafraîchissement pendant tout le TTL.
        let freshness = await CacheCoordinator.shared.participants.load(for: conversationId)
        switch freshness {
        case .expired, .empty:
            break
        case .fresh, .stale:
            XCTFail("Une charge récupérée du disque hors ligne ne doit pas repartir pour un TTL entier.")
        }

        await CacheCoordinator.shared.participants.invalidate(for: conversationId)
    }

    func test_loadNextPage_whenPaginationIsExhausted_servesTheDiskPayload() async {
        let conversationId = makeConversationId()
        let (sut, api) = makeSUT()
        let onlyPage: PaginatedParticipantsResponse = JSONStub.decode(
            participantsResponseJSON(ids: ["p1", "p2"])
        )
        api.stub(
            api.legacyPath(for: ConversationsEndpoint.byIdParticipants(id: conversationId)),
            result: onlyPage
        )
        // Une seule page : `hasMore` retombe a false, la pagination est epuisee.
        _ = try? await sut.loadFirstPage(for: conversationId)
        // Le lendemain : la charge est toujours sur le disque, mais expiree.
        await CacheCoordinator.shared.participants.debugRewindFetchTimestamp(
            by: 25 * 60 * 60,
            for: conversationId
        )

        let served = try? await sut.loadNextPage(for: conversationId)

        XCTAssertEqual(
            served?.count, 2,
            "Pagination epuisee : on rend ce que le disque porte, jamais une liste vide — l'appelant l'assigne a `participants`."
        )

        await CacheCoordinator.shared.participants.invalidate(for: conversationId)
    }

    // MARK: - Ce que le correctif NE change pas

    func test_loadFirstPage_whenNetworkSucceeds_replacesTheCachedPageWithoutDuplicating() async {
        let conversationId = makeConversationId()
        await seedExpiredCache([makeParticipant("p1"), makeParticipant("p2")], for: conversationId)
        let (sut, api) = makeSUT()
        let response: PaginatedParticipantsResponse = JSONStub.decode(
            participantsResponseJSON(ids: ["p1", "p2"])
        )
        api.stub(
            api.legacyPath(for: ConversationsEndpoint.byIdParticipants(id: conversationId)),
            result: response
        )

        let served = try? await sut.loadFirstPage(for: conversationId)

        XCTAssertEqual(
            served?.count, 2,
            "Une PREMIÈRE page REMPLACE ce que le cache portait — elle ne s'y ajoute pas."
        )
        let onDisk = await diskPayload(for: conversationId)
        XCTAssertEqual(onDisk.count, 2, "Le disque porte la page servie, sans doublon.")

        await CacheCoordinator.shared.participants.invalidate(for: conversationId)
    }

    // MARK: - #18916 — une page `.stale` se sert aussitôt ET se revalide

    /// Une page de membres vieille de six minutes : `.stale`. Servie sans jamais
    /// être relue, elle gardait un membre parti jusqu'à l'expiration du cache,
    /// 24 h plus tard.
    private func seedStaleCache(_ items: [PaginatedParticipant], for key: String) async {
        try? await CacheCoordinator.shared.participants.save(items, for: key)
        await CacheCoordinator.shared.participants.debugRewindFetchTimestamp(by: 6 * 60, for: key)
    }

    private func stubFirstPage(_ ids: [String], for conversationId: String, on api: MockAPIClientForApp) {
        let page: PaginatedParticipantsResponse = JSONStub.decode(participantsResponseJSON(ids: ids))
        api.stub(api.legacyPath(for: ConversationsEndpoint.byIdParticipants(id: conversationId)), result: page)
    }

    func test_staleFirstPage_revalidatesFromNetwork() async {
        let conversationId = makeConversationId()
        await seedStaleCache([makeParticipant("p1")], for: conversationId)
        let (sut, api) = makeSUT()
        stubFirstPage(["p1", "p2"], for: conversationId, on: api)

        let served = try? await sut.loadFirstPage(for: conversationId)
        var attempts = 0
        while await diskPayload(for: conversationId).count < 2, attempts < 200 {
            attempts += 1
            try? await Task.sleep(for: .milliseconds(10))
        }

        XCTAssertEqual(served?.map(\.id), ["p1"], "la page `.stale` est servie aussitôt, sans attendre le réseau")
        XCTAssertEqual(api.requestCount, 1, "puis elle se revalide en silence")
        let onDisk = await diskPayload(for: conversationId)
        XCTAssertEqual(onDisk.map(\.id), ["p1", "p2"], "le disque porte la page relue")

        await CacheCoordinator.shared.participants.invalidate(for: conversationId)
    }

    func test_revalidatedFirstPage_afterStaleFirstPage_returnsTheNetworkPage() async {
        let conversationId = makeConversationId()
        await seedStaleCache([makeParticipant("p1")], for: conversationId)
        let (sut, api) = makeSUT()
        stubFirstPage(["p1", "p2"], for: conversationId, on: api)

        _ = try? await sut.loadFirstPage(for: conversationId)
        let revalidated = await sut.revalidatedFirstPage(for: conversationId)

        XCTAssertEqual(revalidated?.map(\.id), ["p1", "p2"], "l'écran qui a peint la page `.stale` repeint la page relue")

        await CacheCoordinator.shared.participants.invalidate(for: conversationId)
    }

    func test_loadFirstPage_whenCacheIsFresh_servesItWithoutTouchingTheNetwork() async {
        let conversationId = makeConversationId()
        try? await CacheCoordinator.shared.participants.save(
            [makeParticipant("p1"), makeParticipant("p2")],
            for: conversationId
        )
        let (sut, api) = makeSUT()

        let served = try? await sut.loadFirstPage(for: conversationId)

        XCTAssertEqual(served?.count, 2)
        XCTAssertEqual(api.requestCount, 0, "Un cache frais ne fait attendre AUCUN aller-retour.")

        await CacheCoordinator.shared.participants.invalidate(for: conversationId)
    }
}
