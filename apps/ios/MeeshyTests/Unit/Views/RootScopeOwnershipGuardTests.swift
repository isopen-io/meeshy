import XCTest
@testable import Meeshy

@MainActor
final class RootScopeOwnershipGuardTests: XCTestCase {

    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/\(path)"))
    }

    func test_roots_ownNoRootScopeModel() throws {
        for file in ["RootView.swift", "iPadRootView.swift"] {
            let source = try code(file)
            for forbidden in ["StoryViewModel()", "StatusViewModel()", "ConversationListVMOwner()", "RootNotificationSource()", "UpgradeGateController()"] {
                XCTAssertFalse(source.contains(forbidden), "\(file) construit \(forbidden) : la portée racine est tenue par RootScopeModels.")
            }
            XCTAssertTrue(source.contains("init(scope: RootScopeModels)"), file)
        }
        let adaptive = try code("AdaptiveRootView.swift")
        XCTAssertTrue(adaptive.contains("RootScopeSwitch("))
        XCTAssertTrue(adaptive.contains("RootScopeModels("))
    }

    func test_scope_holdsNeitherRouterNorPresentationState() throws {
        let source = try code("RootScopeModels.swift")
        XCTAssertFalse(source.isEmpty)
        XCTAssertFalse(source.contains("Router()"))
        XCTAssertFalse(source.contains("StoryViewerCoordinator()"))
        XCTAssertFalse(source.contains("@Published"))
    }

    func test_scope_handsTheSameUpgradeGateToBothRoots() {
        let gate = UpgradeGateController()
        let scope = RootScopeModels(
            story: StoryViewModel(),
            status: StatusViewModel(),
            conversations: ConversationListVMOwner(),
            notifications: RootNotificationSource(),
            upgradeGate: gate
        )
        XCTAssertTrue(scope.upgradeGate === gate)
    }
}
