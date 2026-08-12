import XCTest
@testable import Meeshy

/// Source-analysis guard for the "pastilles de présence jamais rafraîchies
/// sur user:status" fix (audit 2026-07-20). The two integration points below
/// can't be exercised live: `ConversationListView` is a SwiftUI `View` (no
/// hosting in this test target — reading its `@ObservedObject` wiring
/// requires mounting a live hierarchy) and `PresenceManager`'s 30s recalc
/// timer isn't feasible to await in a unit test. `PresenceManagerTests`
/// covers the debounced `refreshSignal` bump end-to-end (real Combine +
/// Task.sleep, no source reading) for the part that IS testable live.
final class ConversationListViewPresenceRefreshWiringTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_conversationListView_observesPresenceRefreshSignal_notPresenceManagerItself() throws {
        let viewSource = try source("Meeshy/Features/Main/Views/ConversationListView.swift")

        XCTAssertTrue(
            viewSource.contains("@ObservedObject private var presencePulse: PresenceRefreshSignal"),
            "ConversationListView must observe the debounced PresenceRefreshSignal companion object"
        )
        // The per-row lookup must stay a PLAIN (unobserved) read — observing
        // PresenceManager itself would re-fire the whole list on every
        // single presenceMap mutation, defeating the debounce entirely.
        XCTAssertTrue(
            viewSource.contains("private var presenceManager: PresenceManager { PresenceManager.shared }"),
            "presenceManager must remain a plain computed property, never @ObservedObject/@EnvironmentObject"
        )
        XCTAssertFalse(
            viewSource.contains("@ObservedObject private var presenceManager"),
            "PresenceManager itself must never become the observed object — only the debounced signal"
        )
    }

    func test_presenceManager_recalcTimer_bumpsRefreshSignalOnStateFlip() throws {
        let managerSource = try source("Meeshy/Features/Main/Services/PresenceManager.swift")

        guard let range = managerSource.range(of: "let hasTransition = self.presenceMap.values.contains") else {
            XCTFail("PresenceManager's recalc timer body not found")
            return
        }
        let end = managerSource.index(range.lowerBound, offsetBy: 900, limitedBy: managerSource.endIndex)
            ?? managerSource.endIndex
        let block = String(managerSource[range.lowerBound..<end])

        XCTAssertTrue(
            block.contains("self.objectWillChange.send()"),
            "Existing 1/3/5 flip-detection signal must be preserved untouched. Block read: \(block)"
        )
        XCTAssertTrue(
            block.contains("self.refreshSignal.bump()"),
            "The recalc timer must ALSO reach the new debounced signal on a detected state flip — previously it published into the void (nobody observed PresenceManager). Block read: \(block)"
        )
    }

    func test_presenceManager_didSet_schedulesVersionBump_alongsidePersist() throws {
        let managerSource = try source("Meeshy/Features/Main/Services/PresenceManager.swift")

        guard let range = managerSource.range(of: "@Published var presenceMap: [String: UserPresence] = [:] {") else {
            XCTFail("presenceMap declaration not found")
            return
        }
        let end = managerSource.index(range.lowerBound, offsetBy: 250, limitedBy: managerSource.endIndex)
            ?? managerSource.endIndex
        let block = String(managerSource[range.lowerBound..<end])

        XCTAssertTrue(block.contains("schedulePersist()"), "Existing disk-persist debounce must be preserved. Block read: \(block)")
        XCTAssertTrue(block.contains("scheduleVersionBump()"), "New debounced signal must hook the SAME didSet. Block read: \(block)")
    }
}
