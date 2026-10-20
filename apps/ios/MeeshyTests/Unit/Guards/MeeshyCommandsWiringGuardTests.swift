import XCTest
@testable import Meeshy

/// La barre de menus clavier (iPad, iPhone avec clavier) : une déclaration unique, des raccourcis lus d'une seule
/// table, et une valeur de scène publiée par chaque racine qui possède l'état qu'une commande pilote.
final class MeeshyCommandsWiringGuardTests: XCTestCase {

    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    private func occurrences(of needle: String, in text: String) -> Int {
        text.components(separatedBy: needle).count - 1
    }

    func test_app_declaresTheCommandsOnce() throws {
        let app = try code("Meeshy/MeeshyApp.swift")
        XCTAssertEqual(occurrences(of: ".commands { MeeshyCommands() }", in: app), 1)
    }

    func test_commands_readEveryBindingFromMeeshyShortcut_andThePreference() throws {
        let commands = try code("Meeshy/Features/Main/Navigation/MeeshyCommands.swift")
        XCTAssertFalse(commands.contains(".keyboardShortcut(\""))
        XCTAssertFalse(commands.contains("KeyboardShortcut(\""))
        XCTAssertTrue(commands.contains("keyboardShortcutsEnabled"))
        XCTAssertTrue(commands.contains("MeeshyShortcut.sections"))
    }

    func test_everyRoot_publishesItsSceneNavigation() throws {
        let main = try code("Meeshy/Features/Main/Views/RootLayers/RootViewLayers.swift")
        let tablet = try code("Meeshy/Features/Main/Views/RootLayers/iPadRootViewLayers.swift")
        let detached = try code("Meeshy/Features/Main/Views/AdaptiveRootView.swift")
        XCTAssertTrue(main.contains("PublishesSceneNavigation(router: router, role: .main)"))
        XCTAssertTrue(tablet.contains("PublishesSceneNavigation(router: router, role: .main)"))
        XCTAssertTrue(detached.contains("role: .detached"))
        XCTAssertTrue(detached.contains("\\.meeshyCloseWindow"))
    }

    func test_newConversationAndGlobalSearch_haveOneHostEach() throws {
        let main = try code("Meeshy/Features/Main/Views/RootLayers/RootViewLayers.swift")
        let tablet = try code("Meeshy/Features/Main/Views/RootLayers/iPadRootViewLayers.swift")
        let presentations = try code("Meeshy/Features/Main/Views/ConversationListView+Presentations.swift")
        for layer in [main, tablet] {
            XCTAssertTrue(layer.contains("NewConversationSheetHost("))
            XCTAssertFalse(layer.contains(".sheet(isPresented: $showNewConversation)"))
        }
        XCTAssertTrue(presentations.contains("GlobalSearchCoverHost("))
        XCTAssertFalse(presentations.contains(".fullScreenCover(isPresented: $showGlobalSearch)"))
    }
}
