import XCTest
@testable import Meeshy

/// iPad : la liste change de colonne à chaque conversation ouverte ou fermée, et SwiftUI la reconstruit. Les sections
/// que l'utilisateur avait repliées ou dépliées survivent à ce remontage.
@MainActor
final class ConversationListSectionMemoryTests: XCTestCase {

    func test_aFirstListOpens_withTheDefaultSections() {
        XCTAssertEqual(ConversationListSectionMemory().initial, ["pinned", "other"])
    }

    func test_aRemountedList_findsTheSectionsAsTheUserLeftThem() {
        let memory = ConversationListSectionMemory()
        memory.remember(["work"])
        XCTAssertEqual(memory.initial, ["work"], "« pinned » replié par l'utilisateur reste replié")
    }

    func test_theList_readsAndWritesTheMemory_andRestoresCategoriesOnMount() throws {
        let list = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationListView.swift"))
        XCTAssertTrue(list.contains("@State private var expandedSections: Set<String> = ConversationListSectionMemory.shared.initial"))
        XCTAssertTrue(list.contains("ConversationListSectionMemory.shared.remember("))
        XCTAssertTrue(list.contains(".adaptiveOnChange(of: conversationViewModel.userCategories, initial: true)"),
                      "les catégories persistées se déplient AU MONTAGE, pas seulement à leur prochain changement")
    }
}
