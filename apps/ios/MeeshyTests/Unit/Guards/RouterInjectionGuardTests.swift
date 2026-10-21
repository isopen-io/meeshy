import XCTest
@testable import Meeshy

final class RouterInjectionGuardTests: XCTestCase {

    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    private static let injectionSites = [
        "Meeshy/Features/Main/Views/RootLayers/RootViewLayers.swift",
        "Meeshy/Features/Main/Views/RootLayers/iPadRootViewLayers.swift",
        "Meeshy/Features/Main/Views/GuestConversationContainer.swift",
        "Meeshy/Features/Main/Views/StoryTrayActions.swift",
        "Meeshy/Features/Main/Views/StoryViewerContainer.swift",
        "Meeshy/Features/Main/Navigation/SceneCommandHosts.swift"
    ]

    private static let commandOnlyViews = [
        "Meeshy/Features/Contacts/AffiliatesListView.swift",
        "Meeshy/Features/Contacts/ContactsHubView.swift",
        "Meeshy/Features/Contacts/PeopleDiscoveryView.swift",
        "Meeshy/Features/Contacts/PhonebookListView.swift",
        "Meeshy/Features/Main/Game/ProgressionConceptPage.swift",
        "Meeshy/Features/Main/Views/ProgressionHub.swift",
        "Meeshy/Features/Main/Views/ProgressionView.swift",
        "Meeshy/Features/Main/Views/CommunityLinksView.swift",
        "Meeshy/Features/Main/Views/LinksHubView.swift",
        "Meeshy/Features/Main/Views/SettingsView.swift",
        "Meeshy/Features/Main/Views/GlobalSearchView.swift",
        "Meeshy/Features/Main/Views/ConversationSearchCommunitiesBand.swift",
        "Meeshy/Features/Main/Views/NearbyDiscoveryView.swift",
        "Meeshy/Features/Main/Views/MyStoriesView.swift",
        "Meeshy/Features/Main/Views/StoryViewerSheets.swift",
        "Meeshy/Features/Main/Views/FeedPostRow.swift",
        "Meeshy/Features/Main/Views/PostDetailView.swift"
    ]

    private func declaresRouterObject(_ source: String) -> Bool {
        source.range(of: #"@EnvironmentObject\s+(private\s+)?var\s+\w+\s*:\s*Router\b"#, options: .regularExpression) != nil
    }

    func test_injectionSites_poseBothChannels() throws {
        for path in Self.injectionSites {
            let source = try code(path)
            XCTAssertTrue(source.contains(".modifier(MeeshyRouterInjection(router: router))"), "\(path) ne pose pas les commandes")
            XCTAssertFalse(source.contains(".environmentObject(router)"), "\(path) pose l'objet seul")
        }
    }

    func test_sceneNavigation_publishesRouterCommands() throws {
        let source = try code("Meeshy/Features/Main/Navigation/SceneCommandFocus.swift")
        XCTAssertTrue(source.contains("\\.routerCommands, router.commands"))
    }

    func test_commandOnlyViews_readRouterCommands() throws {
        for path in Self.commandOnlyViews {
            let source = try code(path)
            XCTAssertFalse(declaresRouterObject(source), "\(path) observe encore le Router")
            XCTAssertTrue(source.contains("@Environment(\\.routerCommands)"), "\(path) ne lit pas les commandes")
        }
    }

    func test_bottomBar_doesNotDeclareAnUnusedRouter() throws {
        let source = try code("Meeshy/Features/Main/Views/ConversationListView+BottomBar.swift")
        XCTAssertFalse(declaresRouterObject(source))
    }
}
