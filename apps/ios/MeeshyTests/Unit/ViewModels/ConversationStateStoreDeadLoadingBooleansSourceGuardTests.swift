import XCTest
@testable import Meeshy

/// Dette « UI State Aggregation » (backlog item 3, `tasks/ios-debt-routine-progress.md`) — M2
/// leftover, finally studied. The note left by the run that shipped the M2 app-side sub-tranche
/// (`ConversationView.swift` migrating to `paginationPhase`) flagged a SECOND, never-synchronised
/// copy of the same 4 pagination booleans living on `ConversationStateStore` and said its mirroring
/// semantics "had not been studied yet".
///
/// Studied here: it isn't mirrored at all. Exhaustive grep across every file under `apps/ios`
/// (`grep -rn "\bisLoadingInitial\b" apps/ios`, repeated for the other 3 names) shows the ONLY
/// occurrences of `ConversationStateStore.isLoadingInitial` / `.isLoadingOlder` / `.isLoadingNewer` /
/// `.isRevalidating` are their own declarations on lines 20-23 of `ConversationStateStore.swift` —
/// no view, handler, or test ever reads or writes them through any `ConversationStateStore`-typed
/// value (the store is only ever referenced as `state`/`stateStore`, both greped clean). The real,
/// live copies that everything actually reads/writes are the identically-named `@Published`
/// properties declared directly on `ConversationViewModel` (lines 142-149) — those are UNTOUCHED by
/// this change and stay exactly as they are.
///
/// This is pure dead-scaffolding removal: since nothing ever read these 4 properties, deleting them
/// cannot change observable behaviour. Not exerciseable via a behavioural test (there is no reader to
/// assert against) — verified at the source level instead, consistent with the other source-guard
/// tests in this backlog (`Swift6TestFileArgSourceGuardTests`, `ConversationViewLoadingPhaseSourceGuardTests`).
final class ConversationStateStoreDeadLoadingBooleansSourceGuardTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/ViewModels
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/ViewModels/Conversation/ConversationStateStore.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func classBody() throws -> String {
        let stripped = AppSourceGuard.stripComments(try source())
        guard let body = DeclarationBodyScanner.body(containing: "final class ConversationStateStore", in: stripped) else {
            XCTFail("ConversationStateStore class body not found — file changed shape.")
            return ""
        }
        return body
    }

    func test_stateStore_noLongerDeclares_deadPaginationBooleans() throws {
        let body = try classBody()
        for deadName in ["isLoadingInitial", "isLoadingOlder", "isLoadingNewer", "isRevalidating"] {
            XCTAssertFalse(
                body.contains(deadName),
                "ConversationStateStore must not declare '\(deadName)' — it is dead scaffolding, " +
                "never read or written outside its own declaration anywhere under apps/ios " +
                "(the live copy everything actually uses lives on ConversationViewModel itself)."
            )
        }
    }

    func test_stateStore_keepsUnrelatedPublishedProperties_untouchedByThisRemoval() throws {
        // Regression guard against an overzealous sweep: only the 4 dead pagination booleans go,
        // everything else on the store (including the similarly-named but UNRELATED
        // `isLoadingReactions`, a real reader-backed flag for the reaction detail sheet) stays.
        let body = try classBody()
        for keep in ["hasOlderMessages", "hasNewerMessages", "isSending", "isLoadingReactions", "messages"] {
            XCTAssertTrue(
                body.contains(keep),
                "ConversationStateStore must keep declaring '\(keep)' — this removal only targets " +
                "the 4 dead pagination booleans, nothing else."
            )
        }
    }

    func test_conversationViewModel_keepsItsOwnLiveLoadingBooleans_untouchedByThisRemoval() throws {
        // The real, live copies read/written throughout ConversationViewModel.swift and
        // ConversationLoadingPhase.derive(...) are a DIFFERENT declaration on a different type —
        // this change must never touch them.
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/ViewModels/ConversationViewModel.swift")
        let vmSource = try String(contentsOf: url, encoding: .utf8)
        for live in ["@Published var isLoadingInitial = false", "@Published var isLoadingOlder = false", "@Published var isLoadingNewer = false", "@Published var isRevalidating = false"] {
            XCTAssertTrue(
                vmSource.contains(live),
                "ConversationViewModel must keep its own live '\(live)' declaration — only the " +
                "unused ConversationStateStore mirror is dead scaffolding, not this one."
            )
        }
    }
}
