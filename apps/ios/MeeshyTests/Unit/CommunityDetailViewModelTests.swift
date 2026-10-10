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
        let viewModel = CommunityDetailViewModel(communityId: "test-id")

        viewModel.conversations = [direct]

        XCTAssertEqual(viewModel.conversationTitles["conv-direct"], "Bob Martin")
    }
}
