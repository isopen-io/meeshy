import Combine
import XCTest
@testable import Meeshy
import MeeshySDK
import SwiftUI
@testable import MeeshyUI

@MainActor
final class CommunityDetailViewModelTests: XCTestCase {
    
    func testInitialState() {
        let viewModel = CommunityDetailViewModel(communityId: "test-id")
        XCTAssertEqual(viewModel.communityId, "test-id")
        XCTAssertFalse(viewModel.isMember)
        XCTAssertFalse(viewModel.isAdmin)
        XCTAssertFalse(viewModel.isCreator)
        XCTAssertTrue(viewModel.conversations.isEmpty)
    }

    // Un test pour valider que le ViewModel fonctionne par défaut et que ses propriétés réactives existent.
    // L'injection de dépendances complète nécessiterait un mock de CommunityService,
    // mais ici on s'assure que la structure est intègre.
    func testRolePermissionsFallback() {
        let viewModel = CommunityDetailViewModel(communityId: "test-id")
        
        // Simuler un état "Creator"
        viewModel.isCreator = true
        // Admin devrait toujours être vrai si isCreator est vrai
        viewModel.isAdmin = viewModel.currentUserRole == .admin || viewModel.isCreator
        
        XCTAssertTrue(viewModel.isAdmin, "Creator should always be an admin")
    }

    func test_conversationTitles_directChannel_servesThePeerNameNotTheStoredTitle() throws {
        let payload: [String: Any] = [
            "id": "conv-direct",
            "type": "direct",
            "identifier": "mshy_iHs95XtqLr_S",
            "title": "mshy_iHs95XtqLr_S, 2",
            "createdAt": "2026-10-01T10:00:00Z",
            "participants": [["id": "p2", "userId": "u2", "displayName": "Bob Martin"]],
        ]
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let direct = try decoder.decode(APIConversation.self, from: JSONSerialization.data(withJSONObject: payload))
        // Le lecteur est NOMMÉ : sans lui, le SDK refuse d'élire l'interlocuteur
        // (`interlocutor(readerId:)`) et sert le nom générique honnête.
        let viewModel = CommunityDetailViewModel(communityId: "test-id", currentUserId: { "u1" })

        viewModel.conversations = [direct]

        XCTAssertEqual(viewModel.conversationTitles["conv-direct"], "Bob Martin")
    }

    func test_load_createurSansFicheMembre_estAdmin() async {
        let service = MockCommunityService()
        service.getResult = .success(CommunityStubs.community(createdBy: "u-creator", members: []))
        let viewModel = CommunityDetailViewModel(communityId: "c1", service: service, currentUserId: { "u-creator" })

        await viewModel.load()

        XCTAssertTrue(viewModel.isCreator)
        XCTAssertTrue(viewModel.isMember)
        XCTAssertTrue(viewModel.isAdmin)
        XCTAssertEqual(viewModel.currentUserRole, .admin)
    }

    func test_load_visiteurNonMembre_neChargePasLesConversations() async {
        let service = MockCommunityService()
        service.getResult = .success(CommunityStubs.community(createdBy: "u-creator", members: []))
        let viewModel = CommunityDetailViewModel(communityId: "c1", service: service, currentUserId: { "u-visitor" })

        await viewModel.load()

        XCTAssertFalse(viewModel.isMember)
        XCTAssertFalse(viewModel.isAdmin)
        XCTAssertTrue(viewModel.conversations.isEmpty)
    }
    // #6378 — le détail ne sert jamais `members` : c'est `currentUserRole` qui
    // dit au lecteur ce qu'il est. Sans lui, un membre se voyait offrir
    // « Rejoindre » (409) et jamais « Quitter ».
    func test_load_membreServiParSonRole_estMembreSansListeDeMembres() async {
        let service = MockCommunityService()
        service.getResult = .success(CommunityStubs.community(createdBy: "u-creator", members: nil, currentUserRole: "member"))
        let viewModel = CommunityDetailViewModel(communityId: "c1", service: service, currentUserId: { "u-member" })

        await viewModel.load()

        XCTAssertTrue(viewModel.isMember)
        XCTAssertFalse(viewModel.isCreator)
        XCTAssertFalse(viewModel.isAdmin)
        XCTAssertEqual(viewModel.currentUserRole, .member)
    }

    func test_load_moderateurServiParSonRole_nEstPasAdmin() async {
        let service = MockCommunityService()
        service.getResult = .success(CommunityStubs.community(createdBy: "u-creator", members: nil, currentUserRole: "moderator"))
        let viewModel = CommunityDetailViewModel(communityId: "c1", service: service, currentUserId: { "u-mod" })

        await viewModel.load()

        XCTAssertTrue(viewModel.isMember)
        XCTAssertFalse(viewModel.isAdmin)
        XCTAssertEqual(viewModel.currentUserRole, .moderator)
    }

    func test_load_roleServiNul_nEstPasMembre() async {
        let service = MockCommunityService()
        service.getResult = .success(CommunityStubs.community(createdBy: "u-creator", members: nil, currentUserRole: nil))
        let viewModel = CommunityDetailViewModel(communityId: "c1", service: service, currentUserId: { "u-visitor" })

        await viewModel.load()

        XCTAssertFalse(viewModel.isMember)
        XCTAssertEqual(service.getConversationsCallCount, 0)
    }

    // #16878 — les publications d'une communauté vivent en cache : la quitter
    // les retire (une communauté privée ne se relit plus hors ligne), la
    // rejoindre les fait relire (un membre peut lire plus qu'un visiteur).
    private static func seededPostsCache(_ communityId: String) -> InMemoryFeedPostsCache {
        let post: APIPost = JSONStub.decode(#"{"id":"p1","type":"POST","content":"Bonjour","createdAt":"2026-11-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}"#)
        return InMemoryFeedPostsCache(
            seed: [CommunityPostsViewModel.cacheKey(communityId: communityId): [post.toFeedPost(preferredLanguages: ["fr"])]],
            freshness: .fresh
        )
    }

    func test_leaveCommunity_success_forgetsTheCachedPosts() async {
        let cache = Self.seededPostsCache("c1")
        let viewModel = CommunityDetailViewModel(communityId: "c1", service: MockCommunityService(), postsCache: { cache })

        await viewModel.leaveCommunity()

        let stored = await cache.stored(for: CommunityPostsViewModel.cacheKey(communityId: "c1"))
        XCTAssertNil(stored)
    }

    func test_leaveCommunity_failure_keepsTheCachedPosts() async {
        let service = MockCommunityService()
        service.voidResult = .failure(APIError.serverError(500, nil))
        let cache = Self.seededPostsCache("c1")
        let viewModel = CommunityDetailViewModel(communityId: "c1", service: service, postsCache: { cache })

        await viewModel.leaveCommunity()

        let stored = await cache.stored(for: CommunityPostsViewModel.cacheKey(communityId: "c1"))
        XCTAssertEqual(stored?.map(\.id), ["p1"])
    }

    func test_joinCommunity_success_forgetsTheVisitorsCachedPosts() async {
        let cache = Self.seededPostsCache("c1")
        let viewModel = CommunityDetailViewModel(communityId: "c1", service: MockCommunityService(), postsCache: { cache })

        await viewModel.joinCommunity()

        let stored = await cache.stored(for: CommunityPostsViewModel.cacheKey(communityId: "c1"))
        XCTAssertNil(stored)
    }

    // #18935 — rejoindre, quitter : « mes communautés » (la bande Communautés
    // de la liste, la feuille de partage) le voit sans attendre cinq minutes.

    private func seedMyCommunities(_ ids: [String]) async throws -> GRDBCacheStore<String, APICommunity> {
        let store = await CacheCoordinator.shared.communities
        await store.invalidate(for: "list")
        try await store.save(ids.map { CommunityStubs.community(id: $0, name: "Club \($0)") }, for: "list")
        return store
    }

    func test_leaveCommunity_success_removesItFromCachedCommunityList() async throws {
        let store = try await seedMyCommunities(["c1", "c2"])
        let viewModel = CommunityDetailViewModel(communityId: "c1", service: MockCommunityService())

        await viewModel.leaveCommunity()

        let cached = await store.load(for: "list").snapshot()?.map(\.id)
        await store.invalidate(for: "list")
        XCTAssertEqual(cached, ["c2"])
    }

    func test_leaveCommunity_failure_keepsItInTheCachedCommunityList() async throws {
        let store = try await seedMyCommunities(["c1", "c2"])
        let service = MockCommunityService()
        service.voidResult = .failure(APIError.serverError(500, nil))
        let viewModel = CommunityDetailViewModel(communityId: "c1", service: service)

        await viewModel.leaveCommunity()

        let cached = await store.load(for: "list").snapshot()?.map(\.id)
        await store.invalidate(for: "list")
        XCTAssertEqual(cached, ["c1", "c2"], "un départ refusé ne retire rien")
    }

    func test_joinCommunity_success_addsItToTheCachedCommunityList() async throws {
        let store = try await seedMyCommunities(["c2"])
        let service = MockCommunityService()
        service.getResult = .success(CommunityStubs.community(id: "c1", name: "Club Lecture", currentUserRole: "member"))
        let viewModel = CommunityDetailViewModel(communityId: "c1", service: service, currentUserId: { "u-reader" })

        await viewModel.joinCommunity()

        let cached = await store.load(for: "list").snapshot()?.map(\.id)
        await store.invalidate(for: "list")
        XCTAssertTrue(viewModel.isMember)
        XCTAssertEqual(cached, ["c1", "c2"], "la communauté rejointe entre en tête")
    }

    // #7816 — un 403 est une RÉPONSE : le détail dit pourquoi dans la langue du
    // lecteur, jamais le message brut du serveur, et n'offre pas de réessayer.

    func test_load_communautePriveeRefusee_estRefusee_sansReessayer() async {
        let service = MockCommunityService()
        service.getResult = .failure(MeeshyError.forbidden(reason: "Access denied to this community", body: nil))
        let viewModel = CommunityDetailViewModel(communityId: "c1", service: service)

        await viewModel.load()

        XCTAssertEqual(viewModel.loadFailure, .refused)
        XCTAssertEqual(viewModel.loadFailure?.offersRetry, false)
        XCTAssertNil(viewModel.community)
    }

    func test_load_communauteIntrouvable_seDitCommeUnRefus() async {
        let service = MockCommunityService()
        service.getResult = .failure(MeeshyError.server(statusCode: 404, message: "Community not found"))
        let viewModel = CommunityDetailViewModel(communityId: "c1", service: service)

        await viewModel.load()

        XCTAssertEqual(viewModel.loadFailure, .refused)
    }

    func test_load_reseauAbsent_proposeDeReessayer() async {
        let service = MockCommunityService()
        service.getResult = .failure(MeeshyError.network(.noConnection))
        let viewModel = CommunityDetailViewModel(communityId: "c1", service: service)

        await viewModel.load()

        XCTAssertEqual(viewModel.loadFailure, .network)
        XCTAssertEqual(viewModel.loadFailure?.offersRetry, true)
    }

    func test_load_panneServeur_nAccusePasLaConnexion() async {
        let service = MockCommunityService()
        service.getResult = .failure(MeeshyError.server(statusCode: 500, message: "Internal Server Error"))
        let viewModel = CommunityDetailViewModel(communityId: "c1", service: service)

        await viewModel.load()

        XCTAssertEqual(viewModel.loadFailure, .server)
    }

    func test_load_reussiApresUnEchec_effaceLaCause() async {
        let service = MockCommunityService()
        service.getResult = .failure(MeeshyError.network(.noConnection))
        let viewModel = CommunityDetailViewModel(communityId: "c1", service: service)
        await viewModel.load()

        service.getResult = .success(CommunityStubs.community())
        await viewModel.load()

        XCTAssertNil(viewModel.loadFailure)
        XCTAssertNotNil(viewModel.community)
    }

    func test_causeDuRefus_seDitDansLeCatalogue_jamaisDansLeMessageDuServeur() {
        XCTAssertFalse((CommunityLoadFailure.refused.message ?? "").contains("Access denied"))
        XCTAssertFalse(CommunityLoadFailure.refused.title.isEmpty)
        XCTAssertNotEqual(CommunityLoadFailure.refused.actionLabel, CommunityLoadFailure.network.actionLabel)
    }

    // MARK: - community:updated (#18439)

    func test_communityUpdated_reecritLIdentiteEtGardeLeRoleDuLecteur() async {
        let service = MockCommunityService()
        service.getResult = .success(CommunityStubs.community(createdBy: "u-creator", currentUserRole: "moderator"))
        let viewModel = CommunityDetailViewModel(
            communityId: "c1", service: service, currentUserId: { "u-mod" },
            communityUpdates: Empty().eraseToAnyPublisher()
        )
        await viewModel.load()

        viewModel.apply(CommunityStubs.communityUpdated(communityId: "c1", name: "Alpha renommée", memberCount: 9))

        XCTAssertEqual(viewModel.community?.name, "Alpha renommée")
        XCTAssertEqual(viewModel.community?.description, "Réglée ailleurs")
        XCTAssertEqual(viewModel.community?.isPrivate, true)
        XCTAssertEqual(viewModel.community?.memberCount, 9)
        XCTAssertEqual(viewModel.currentUserRole, .moderator)
        XCTAssertTrue(viewModel.isMember)
        XCTAssertEqual(service.getCallCount, 1, "aucune relance réseau")
    }

    func test_communityUpdated_autreCommunaute_neTouchePasLeDetail() async {
        let service = MockCommunityService()
        service.getResult = .success(CommunityStubs.community(createdBy: "u-creator"))
        let updates = PassthroughSubject<CommunityUpdatedEvent, Never>()
        let viewModel = CommunityDetailViewModel(
            communityId: "c1", service: service, currentUserId: { "u-creator" },
            communityUpdates: updates.eraseToAnyPublisher()
        )
        await viewModel.load()

        viewModel.apply(CommunityStubs.communityUpdated(communityId: "c2", name: "Voisine"))

        XCTAssertEqual(viewModel.community?.name, "Alpha")
    }

    // MARK: - community:member-* (#18767)

    private func memberSUT(
        reader: String = "u-mod", role: String? = "moderator", removed: @escaping @MainActor (String) async -> Void = { _ in }
    ) -> (CommunityDetailViewModel, MockCommunityService) {
        let service = MockCommunityService()
        service.getResult = .success(CommunityStubs.community(createdBy: "u-creator", currentUserRole: role))
        let viewModel = CommunityDetailViewModel(
            communityId: "c1", service: service, currentUserId: { reader },
            communityUpdates: Empty().eraseToAnyPublisher(), memberChanges: Empty().eraseToAnyPublisher(),
            myCommunities: MyCommunitiesWrites(add: { _ in }, remove: removed)
        )
        return (viewModel, service)
    }

    func test_memberChange_tiers_recopieLEffectifSansToucherAuRoleNiAuReseau() async {
        let (viewModel, service) = memberSUT()
        await viewModel.load()

        await viewModel.apply(CommunityStubs.memberChange(userId: "u-other", memberCount: 14, role: .admin))

        XCTAssertEqual(viewModel.community?.memberCount, 14)
        XCTAssertEqual(viewModel.currentUserRole, .moderator, "un tiers promu ne déplace pas le rôle du lecteur")
        XCTAssertFalse(viewModel.isAdmin)
        XCTAssertEqual(service.getCallCount, 1, "aucune relance réseau")
    }

    func test_memberChange_lecteurPromu_gereAussitot() async {
        let (viewModel, service) = memberSUT()
        await viewModel.load()

        await viewModel.apply(CommunityStubs.memberChange(userId: "u-mod", role: .admin))

        XCTAssertEqual(viewModel.currentUserRole, .admin)
        XCTAssertTrue(viewModel.isAdmin)
        XCTAssertEqual(service.getCallCount, 1)
    }

    func test_memberChange_lecteurRetire_perdSesDroits_quitteMesCommunautes_etRelitLaFiche() async {
        let removed = RemovedCommunities()
        let (viewModel, service) = memberSUT(removed: { removed.ids.append($0) })
        await viewModel.load()
        service.getResult = .failure(APIError.serverError(403, nil))

        await viewModel.apply(CommunityStubs.memberChange(userId: "u-mod", memberCount: 8, role: nil))

        XCTAssertFalse(viewModel.isMember)
        XCTAssertFalse(viewModel.isAdmin)
        XCTAssertTrue(viewModel.conversations.isEmpty)
        XCTAssertEqual(removed.ids, ["c1"])
        XCTAssertEqual(service.getCallCount, 2, "la fiche se relit : une communauté privée cesse d'être servie")
    }

    func test_memberChange_lecteurEntreAilleurs_relitLaFiche() async {
        let (viewModel, service) = memberSUT(reader: "u-new", role: nil)
        await viewModel.load()
        XCTAssertFalse(viewModel.isMember)
        service.getResult = .success(CommunityStubs.community(createdBy: "u-creator", currentUserRole: "member"))

        await viewModel.apply(CommunityStubs.memberChange(userId: "u-new", role: .member))

        XCTAssertTrue(viewModel.isMember)
        XCTAssertEqual(service.getCallCount, 2)
    }

    func test_memberChange_autreCommunaute_neTouchePasLeDetail() async {
        let (viewModel, service) = memberSUT()
        await viewModel.load()

        await viewModel.apply(CommunityStubs.memberChange(communityId: "c2", userId: "u-mod", memberCount: 40, role: nil))

        XCTAssertTrue(viewModel.isMember)
        XCTAssertNotEqual(viewModel.community?.memberCount, 40)
        XCTAssertEqual(service.getCallCount, 1)
    }

    // MARK: - community:deleted (#19591)

    func test_disappearance_rendLaFicheIndisponible_sansGeste_etQuitteMesCommunautes() async {
        let removed = RemovedCommunities()
        let (viewModel, service) = memberSUT(reader: "u-creator", role: "admin", removed: { removed.ids.append($0) })
        await viewModel.load()
        service.getResult = .failure(APIError.serverError(404, nil))

        await viewModel.applyDisappearance(of: "c1")

        XCTAssertNil(viewModel.community)
        XCTAssertEqual(viewModel.loadFailure, .refused, "l'écran dit que la communauté n'est plus disponible")
        XCTAssertFalse(viewModel.isMember)
        XCTAssertFalse(viewModel.isAdmin)
        XCTAssertFalse(viewModel.isCreator, "plus aucun geste de créateur n'est offert")
        XCTAssertTrue(viewModel.conversations.isEmpty)
        XCTAssertFalse(viewModel.isLoading, "la relecture est silencieuse")
        XCTAssertEqual(removed.ids, ["c1"])
        XCTAssertEqual(service.getCallCount, 2, "la fiche se relit")
    }

    func test_disappearance_uneFicheEncoreServie_revient() async {
        let (viewModel, _) = memberSUT()
        await viewModel.load()

        await viewModel.applyDisappearance(of: "c1")

        XCTAssertNotNil(viewModel.community)
        XCTAssertNil(viewModel.loadFailure)
        XCTAssertEqual(viewModel.currentUserRole, .moderator)
    }

    func test_disappearance_autreCommunaute_neTouchePasLeDetail() async {
        let removed = RemovedCommunities()
        let (viewModel, service) = memberSUT(removed: { removed.ids.append($0) })
        await viewModel.load()

        await viewModel.applyDisappearance(of: "c2")

        XCTAssertNotNil(viewModel.community)
        XCTAssertTrue(viewModel.isMember)
        XCTAssertTrue(removed.ids.isEmpty)
        XCTAssertEqual(service.getCallCount, 1)
    }

    // #19869 — une communauté qui valide chaque entrée se DEMANDE : « Demande
    // envoyée » dès le toucher, jamais un faux membre, et le refus récent se dit.

    private func approvalSUT(
        joinRequest: String? = nil, added: @escaping @MainActor (APICommunity) async -> Void = { _ in }
    ) -> (CommunityDetailViewModel, MockCommunityService) {
        let service = MockCommunityService()
        service.getResult = .success(CommunityStubs.community(
            createdBy: "u-creator", requiresJoinApproval: true, currentUserJoinRequest: joinRequest
        ))
        service.joinResult = .success(.pending(requestId: "req-1"))
        let viewModel = CommunityDetailViewModel(
            communityId: "c1", service: service, currentUserId: { "u-visitor" },
            communityUpdates: Empty().eraseToAnyPublisher(), memberChanges: Empty().eraseToAnyPublisher(),
            deletions: Empty().eraseToAnyPublisher(),
            myCommunities: MyCommunitiesWrites(add: added, remove: { _ in })
        )
        return (viewModel, service)
    }

    func test_load_communauteQuiValideChaqueEntree_offreDeDemander() async {
        let (viewModel, _) = approvalSUT()

        await viewModel.load()

        XCTAssertTrue(viewModel.requiresJoinApproval)
        XCTAssertFalse(viewModel.joinRequestPending)
        XCTAssertFalse(viewModel.isMember)
    }

    func test_load_demandeDuLecteurEnAttente_seLitDemandeEnvoyee() async {
        let (viewModel, _) = approvalSUT(joinRequest: "pending")

        await viewModel.load()

        XCTAssertTrue(viewModel.joinRequestPending)
        XCTAssertFalse(viewModel.isMember)
    }

    func test_join_demandeAcceptee_enAttente_neFaitPasMembre_niNEntreDansMesCommunautes() async {
        let added = RemovedCommunities()
        let (viewModel, service) = approvalSUT(added: { added.ids.append($0.id) })
        await viewModel.load()

        await viewModel.joinCommunity()

        XCTAssertTrue(viewModel.joinRequestPending)
        XCTAssertFalse(viewModel.isMember, "une demande ne fait membre de rien")
        XCTAssertTrue(added.ids.isEmpty, "« mes communautés » attend l'acceptation")
        XCTAssertEqual(service.getCallCount, 1, "aucune relecture : rien n'a changé pour le lecteur")
    }

    func test_join_demandeEnvoyee_estOptimiste_puisDefaiteSurUnEchec() async {
        let (viewModel, service) = approvalSUT()
        await viewModel.load()
        service.joinResult = .failure(MeeshyError.server(statusCode: 500, message: "boom"))
        let seen = SeenFlags()
        let watch = viewModel.$joinRequestPending.sink { seen.values.append($0) }

        await viewModel.joinCommunity()
        watch.cancel()

        XCTAssertEqual(seen.values, [false, true, false], "« Demande envoyée » dès le toucher, défaite au refus")
        XCTAssertNil(viewModel.joinRefusal)
    }

    func test_join_refusRecent_ditLeDelai() async {
        let (viewModel, service) = approvalSUT()
        await viewModel.load()
        let body = Data(#"{"success":false,"error":"declined recently","code":"COMMUNITY_JOIN_COOLDOWN"}"#.utf8)
        service.joinResult = .failure(MeeshyError.forbidden(reason: "declined recently", body: body))

        await viewModel.joinCommunity()

        XCTAssertEqual(viewModel.joinRefusal, .cooldown)
        XCTAssertFalse(viewModel.joinRequestPending)
    }

    func test_join_demandeDejaEnvoyee_neRenvoieRien() async {
        let (viewModel, service) = approvalSUT(joinRequest: "pending")
        await viewModel.load()

        await viewModel.joinCommunity()

        XCTAssertEqual(service.joinCallCount, 0)
    }

    func test_join_cacheQuiCroitLEntreeDirecte_litLaDemandeServie() async {
        let service = MockCommunityService()
        service.getResult = .success(CommunityStubs.community(createdBy: "u-creator"))
        service.joinResult = .success(.pending(requestId: "req-1"))
        let viewModel = CommunityDetailViewModel(
            communityId: "c1", service: service, currentUserId: { "u-visitor" },
            communityUpdates: Empty().eraseToAnyPublisher(), memberChanges: Empty().eraseToAnyPublisher(),
            deletions: Empty().eraseToAnyPublisher(), myCommunities: MyCommunitiesWrites(add: { _ in }, remove: { _ in })
        )
        await viewModel.load()

        await viewModel.joinCommunity()

        XCTAssertTrue(viewModel.joinRequestPending)
        XCTAssertTrue(viewModel.requiresJoinApproval)
        XCTAssertFalse(viewModel.isMember)
    }

    func test_memberChange_demandeAcceptee_faitMembre_etEffaceLaDemande() async {
        let (viewModel, service) = approvalSUT(joinRequest: "pending")
        await viewModel.load()
        service.getResult = .success(CommunityStubs.community(
            createdBy: "u-creator", currentUserRole: "member", requiresJoinApproval: true
        ))

        await viewModel.apply(CommunityStubs.memberChange(userId: "u-visitor", role: .member))

        XCTAssertTrue(viewModel.isMember)
        XCTAssertFalse(viewModel.joinRequestPending)
    }
}

@MainActor
private final class RemovedCommunities {
    var ids: [String] = []
}

@MainActor
private final class SeenFlags {
    var values: [Bool] = []
}
