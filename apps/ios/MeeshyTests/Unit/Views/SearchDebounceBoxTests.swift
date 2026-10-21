import XCTest
@testable import Meeshy

@MainActor
final class SearchDebounceBoxTests: XCTestCase {

    func test_aNewKeystroke_cancelsThePendingSearch() {
        let box = SearchDebounceBox()
        let first = Task<Void, Never> { try? await Task.sleep(nanoseconds: 5_000_000_000) }
        box.replace(with: first)
        let second = Task<Void, Never> { try? await Task.sleep(nanoseconds: 5_000_000_000) }
        box.replace(with: second)
        XCTAssertTrue(first.isCancelled, "la frappe précédente ne lance plus sa recherche")
        XCTAssertFalse(second.isCancelled)
        box.cancel()
    }

    /// Fermer la recherche dans les 400 ms ne laisse plus la conversation
    /// filtrée, interface de recherche partie.
    func test_dismissingSearch_cancelsThePendingSearch() {
        let box = SearchDebounceBox()
        let pending = Task<Void, Never> { try? await Task.sleep(nanoseconds: 5_000_000_000) }
        box.replace(with: pending)
        box.cancel()
        XCTAssertTrue(pending.isCancelled)
        XCTAssertNil(box.task)
    }

    func test_theDebounce_isNoLongerAnAssociatedObjectOnAStruct() throws {
        let code = try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationView+MessageRow.swift")
        XCTAssertFalse(code.contains("objc_getAssociatedObject(self"), "sur une struct, le getter rendait toujours nil")
    }
}
