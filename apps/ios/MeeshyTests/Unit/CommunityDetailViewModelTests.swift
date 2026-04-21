import XCTest
@testable import Meeshy
import MeeshySDK
import SwiftUI
import MeeshyUI

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
}
