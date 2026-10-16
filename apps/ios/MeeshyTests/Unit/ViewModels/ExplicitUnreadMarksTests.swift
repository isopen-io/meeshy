import XCTest
@testable import Meeshy

@MainActor
final class ExplicitUnreadMarksTests: XCTestCase {

    func test_aMark_isConsumedOnce() {
        ExplicitUnreadMarks.note("c-once")
        XCTAssertTrue(ExplicitUnreadMarks.consume("c-once"))
        XCTAssertFalse(ExplicitUnreadMarks.consume("c-once"))
    }

    /// Rouvrir la conversation efface la marque : une sortie ultérieure du
    /// Résumé rattrape de nouveau, normalement.
    func test_reopening_clearsTheMark() {
        ExplicitUnreadMarks.note("c-reopen")
        ExplicitUnreadMarks.clear("c-reopen")
        XCTAssertFalse(ExplicitUnreadMarks.consume("c-reopen"))
    }

    func test_theExitCatchUp_honoursTheMark_andOpeningClearsIt() throws {
        let vm = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/ViewModels/ConversationViewModel.swift"))
        let catchUp = try XCTUnwrap(vm.range(of: "func markCaughtUpFromSummaryOrRiver() {"))
        XCTAssertTrue(vm[catchUp.upperBound...].prefix(300).contains("ExplicitUnreadMarks.consume(conversationId)"))
        let lifecycle = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/ViewModels/ConversationViewModel+Lifecycle.swift"))
        let start = try XCTUnwrap(lifecycle.range(of: "func start() {"))
        XCTAssertTrue(lifecycle[start.upperBound...].prefix(300).contains("ExplicitUnreadMarks.clear(conversationId)"))
    }
}
