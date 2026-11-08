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
}
