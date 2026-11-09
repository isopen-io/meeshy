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
        "Meeshy/Features/Stories/Views/StoryTrayActions.swift",
        "Meeshy/Features/Stories/Views/StoryViewerContainer.swift",
        "Meeshy/Features/Navigation/SceneCommandHosts.swift",
        "Meeshy/Features/Main/Views/AdaptiveRootView.swift",
        "Meeshy/Features/Main/Views/ConversationListView+Presentations.swift"
    ]

    private static let commandOnlyViews = [
        "Meeshy/Features/Contacts/AffiliatesListView.swift",
        "Meeshy/Features/Contacts/ContactsHubView.swift",
        "Meeshy/Features/Contacts/PeopleDiscoveryView.swift",
        "Meeshy/Features/Contacts/PhonebookListView.swift",
        "Meeshy/Features/Game/ProgressionConceptPage.swift",
        "Meeshy/Features/Profile/Views/ProgressionHub.swift",
        "Meeshy/Features/Profile/Views/ProgressionView.swift",
        "Meeshy/Features/Links/Views/CommunityLinksView.swift",
        "Meeshy/Features/Links/Views/LinksHubView.swift",
        "Meeshy/Features/Settings/Views/SettingsView.swift",
        "Meeshy/Features/Main/Views/GlobalSearchView.swift",
        "Meeshy/Features/Main/Views/ConversationSearchCommunitiesBand.swift",
        "Meeshy/Features/Main/Views/NearbyDiscoveryView.swift",
        "Meeshy/Features/Stories/Views/MyStoriesView.swift",
        "Meeshy/Features/Stories/Views/StoryViewerSheets.swift",
        "Meeshy/Features/Main/Views/FeedPostRow.swift",
        "Meeshy/Features/Main/Views/PostDetailView.swift",
        "Meeshy/Features/Contacts/ContactsListTab.swift",
        "Meeshy/Features/Contacts/DiscoverTab.swift",
        "Meeshy/Features/Contacts/KeypadTab.swift",
        "Meeshy/Features/Main/Views/ConversationListView.swift",
        "Meeshy/Features/Main/Views/ConversationListView+Tail.swift",
        "Meeshy/Features/Main/Views/ConversationView+ReaderLayers.swift",
        "Meeshy/Features/Profile/Views/ProfileView.swift",
        "Meeshy/Features/Main/Views/StarredMessagesView.swift",
        "Meeshy/Features/Main/Views/WidgetPreviewView.swift"
    ]

    private static let routerStateReaders: [(path: String, reason: String)] = [
        ("Meeshy/Features/Main/Views/ConversationView.swift", "lit pendingOpenSearch, pendingHighlightMessageId, replyContextVersion et consomme pendingReplyContext"),
        ("Meeshy/Features/Main/Views/RootViewComponents.swift", "lit pendingOpenFeedComposer et consomme consumePendingFeedComposer")
    ]

    private static let routerRelays = [
        "Meeshy/Features/Composer/StoryEditComposer.swift",
        "Meeshy/Features/Composer/StoryRepublishComposer.swift",
        "Meeshy/Features/Main/Views/BookmarksView.swift",
        "Meeshy/Features/Main/Views/ConversationListView+Presentations.swift",
        "Meeshy/Features/Main/Views/ConversationView+Presentations.swift",
        "Meeshy/Features/Main/Views/ConversationView+StoryCovers.swift",
        "Meeshy/Features/Main/Views/FeedView.swift",
        "Meeshy/Features/Main/Views/MessageListView.swift",
        "Meeshy/Features/Stories/Views/StoryTrayView.swift"
    ]

    private static var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func swiftSources(under folder: String) -> [URL] {
        let root = Self.appRoot.appendingPathComponent(folder)
        let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)
        return (walker?.allObjects as? [URL] ?? []).filter { $0.pathExtension == "swift" }
    }

    private func declaresRouterObject(_ source: String) -> Bool {
        source.range(of: #"@EnvironmentObject\s+(?:\w+(?:\(set\))?\s+)*var\s+\w+\s*:\s*Router\b"#, options: .regularExpression) != nil
    }

    func test_injectionSites_poseBothChannels() throws {
        for path in Self.injectionSites {
            let source = try code(path)
            XCTAssertTrue(source.contains(".modifier(MeeshyRouterInjection(router: router))"), "\(path) ne pose pas les commandes")
            XCTAssertFalse(source.contains(".environmentObject(router)"), "\(path) pose l'objet seul")
        }
    }

    func test_sceneNavigation_publishesRouterCommands() throws {
        let source = try code("Meeshy/Features/Navigation/SceneCommandFocus.swift")
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

    func test_routerRelays_readTheRouterWithoutObservingIt() throws {
        for path in Self.routerRelays {
            let source = try principalCode(path)
            XCTAssertFalse(declaresRouterObject(source), "\(path) observe encore le Router")
            XCTAssertTrue(source.contains("@Environment(\\.meeshyRouter)"), "\(path) ne lit pas le routeur par l'environnement")
        }
    }

    func test_onlyTheListedStateReadersObserveTheRouter() throws {
        let observers = try swiftSources(under: "Meeshy")
            .filter { declaresRouterObject(AppSourceGuard.stripComments(try AppSourceGuard.text(at: $0))) }
            .map(\.lastPathComponent)
        let expected = Self.routerStateReaders.map { URL(fileURLWithPath: $0.path).lastPathComponent }
        XCTAssertEqual(Set(observers), Set(expected))
    }

    func test_routerStateReaders_stillReadRouterState() throws {
        for reader in Self.routerStateReaders {
            XCTAssertFalse(reader.reason.isEmpty)
            let source = try code(reader.path)
            XCTAssertTrue(declaresRouterObject(source), "\(reader.path) ne déclare plus le Router : sortir de la liste")
            XCTAssertTrue(source.contains("router.pending") || source.contains("router.consumePending"), "\(reader.path) ne lit pas l'état du Router")
        }
    }

    func test_routerObject_isOnlyInjectedWithItsCommands() throws {
        let injectors = try swiftSources(under: "Meeshy")
            .filter { AppSourceGuard.stripComments(try AppSourceGuard.text(at: $0)).contains(".environmentObject(router)") }
            .map(\.lastPathComponent)
        XCTAssertEqual(injectors, ["RouterCommands.swift"])
    }
}
