import XCTest
@testable import Meeshy

final class RouterInjectionGuardTests: XCTestCase {

    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    private func principalCode(_ path: String) throws -> String {
        let name = URL(fileURLWithPath: path).lastPathComponent
        let url = try XCTUnwrap(AppSourceGuard.unitURLs(path).first { $0.lastPathComponent == name }, "\(path) introuvable")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private static let injectionSites = [
        "Meeshy/Features/Main/Views/RootLayers/RootViewLayers.swift",
        "Meeshy/Features/Main/Views/RootLayers/iPadRootViewLayers.swift",
        "Meeshy/Features/Main/Views/GuestConversationContainer.swift",
        "Meeshy/Features/Main/Views/StoryTrayActions.swift",
        "Meeshy/Features/Main/Views/StoryViewerContainer.swift",
        "Meeshy/Features/Main/Navigation/SceneCommandHosts.swift",
        "Meeshy/Features/Main/Views/AdaptiveRootView.swift",
        "Meeshy/Features/Main/Views/ConversationListView+Presentations.swift"
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
        "Meeshy/Features/Main/Views/PostDetailView.swift",
        "Meeshy/Features/Contacts/ContactsListTab.swift",
        "Meeshy/Features/Contacts/DiscoverTab.swift",
        "Meeshy/Features/Contacts/KeypadTab.swift",
        "Meeshy/Features/Main/Views/ConversationListView.swift",
        "Meeshy/Features/Main/Views/ConversationListView+Tail.swift",
        "Meeshy/Features/Main/Views/ConversationView+ReaderLayers.swift",
        "Meeshy/Features/Main/Views/ProfileView.swift",
        "Meeshy/Features/Main/Views/StarredMessagesView.swift",
        "Meeshy/Features/Main/Views/WidgetPreviewView.swift"
    ]

    private enum RouterObjectHolder {
        case stateReader
        case relay
    }

    private static let routerObjectHolders: [(path: String, role: RouterObjectHolder)] = [
        ("Meeshy/Features/Main/Views/ConversationView.swift", .stateReader),
        ("Meeshy/Features/Main/Views/RootViewComponents.swift", .stateReader),
        ("Meeshy/Features/Main/Composer/StoryEditComposer.swift", .relay),
        ("Meeshy/Features/Main/Composer/StoryRepublishComposer.swift", .relay),
        ("Meeshy/Features/Main/Views/BookmarksView.swift", .relay),
        ("Meeshy/Features/Main/Views/ConversationListView+Presentations.swift", .relay),
        ("Meeshy/Features/Main/Views/ConversationView+Presentations.swift", .relay),
        ("Meeshy/Features/Main/Views/ConversationView+StoryCovers.swift", .relay),
        ("Meeshy/Features/Main/Views/FeedView.swift", .relay),
        ("Meeshy/Features/Main/Views/MessageListView.swift", .relay),
        ("Meeshy/Features/Main/Views/StoryTrayView.swift", .relay)
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
            let source = try principalCode(path)
            XCTAssertFalse(declaresRouterObject(source), "\(path) observe encore le Router")
            XCTAssertTrue(source.contains("@Environment(\\.routerCommands)"), "\(path) ne lit pas les commandes")
        }
    }

    func test_bottomBar_doesNotDeclareAnUnusedRouter() throws {
        let source = try code("Meeshy/Features/Main/Views/ConversationListView+BottomBar.swift")
        XCTAssertFalse(declaresRouterObject(source))
    }

    func test_creationSheets_readRouterCommands() throws {
        let source = try code("Meeshy/Features/Main/Views/ConversationListView+Presentations.swift")
        let start = try XCTUnwrap(source.range(of: "struct ConversationListCreationSheets"))
        let tail = source[start.lowerBound...]
        let end = tail.dropFirst().range(of: "\nstruct ")?.lowerBound ?? tail.endIndex
        let body = String(tail[..<end])
        XCTAssertFalse(declaresRouterObject(body))
        XCTAssertTrue(body.contains("@Environment(\\.routerCommands)"))
    }

    func test_routerObjectHolders_areTheListedReadersAndRelays() throws {
        for holder in Self.routerObjectHolders {
            let source = try code(holder.path)
            XCTAssertTrue(declaresRouterObject(source), "\(holder.path) ne déclare plus le Router : sortir de la liste")
            guard holder.role == .stateReader else { continue }
            XCTAssertTrue(source.contains("router.pending") || source.contains("router.consumePending"), "\(holder.path) ne lit pas l'état du Router")
        }
    }
}
