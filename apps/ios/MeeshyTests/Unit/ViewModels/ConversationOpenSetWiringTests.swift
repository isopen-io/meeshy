import XCTest
@testable import Meeshy

/// iPad multi-fenêtre : chaque écran de conversation déclare SON ouverture au moteur de synchro et la referme à sa
/// destruction. L'ancien gate unique (`setCurrentlyOpenConversation`) faisait remplacer la conversation d'une fenêtre
/// par celle de l'autre — elle se remettait à compter ses messages comme non lus pendant qu'on la lisait.
final class ConversationOpenSetWiringTests: XCTestCase {

    func test_theScreen_opensAndClosesItsOwnConversation() throws {
        let start = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/ViewModels/ConversationViewModel+Lifecycle.swift"))
        XCTAssertTrue(start.contains("syncEngine.openConversation(conversationId)"))
        let vm = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/ViewModels/ConversationViewModel.swift"))
        XCTAssertTrue(vm.contains("syncEngine.closeConversation(conversationId)"))
    }

    func test_noAppScreen_usesTheSingleSlotGate() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
        let walker = try XCTUnwrap(FileManager.default.enumerator(atPath: root.path))
        var offenders: [String] = []
        for case let path as String in walker where path.hasSuffix(".swift") {
            let code = AppSourceGuard.stripComments(try AppSourceGuard.text(at: root.appendingPathComponent(path)))
            if code.contains("setCurrentlyOpenConversation(") { offenders.append(path) }
        }
        XCTAssertEqual(offenders, [], "openConversation / closeConversation — une ouverture par écran")
    }

    func test_theList_readsEveryOpenConversation() throws {
        let list = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift"))
        XCTAssertTrue(list.contains("openConversationIds: syncEngine.openConversationIds"))
    }

    func test_theMock_countsOpeningsPerConversation() {
        let engine = MockConversationSyncEngine()
        engine.openConversation("a")
        engine.openConversation("b")
        engine.openConversation("a")
        engine.closeConversation("a")
        XCTAssertEqual(engine.openConversationIds, ["a", "b"])
        engine.closeConversation("a")
        XCTAssertEqual(engine.openConversationIds, ["b"])
    }
}
