import XCTest
@testable import Meeshy

/// Dette « UI State Aggregation » (backlog item 3, `tasks/ios-debt-routine-progress.md`, M2
/// follow-up to PR #280) — `ConversationView.swift` still read the raw `viewModel.isLoadingInitial`
/// boolean directly at two call sites instead of the canonical `ConversationLoadingPhase` projection
/// (`viewModel.paginationPhase.isBlockingSpinnerNeeded`) that has existed since `f734bc731`
/// (2026-05-21) precisely to replace this pattern.
///
/// The substitution is behaviourally identical: `ConversationLoadingPhase.derive(...)` checks
/// `isLoadingInitial` FIRST, unconditionally ahead of the other three booleans, so
/// `paginationPhase.isBlockingSpinnerNeeded == isLoadingInitial` holds for every combination of the
/// other three flags — both properties live on the exact same `ConversationViewModel` instance (no
/// `ConversationStateStore` cross-object ambiguity for these two specific call sites; verified via
/// `grep -rn "\.isLoadingInitial\b"` before choosing this slice).
///
/// `ConversationFirstRenderWarmup.swift`'s read of `vm.isLoadingInitial` is DELIBERATELY excluded
/// from this migration — it isn't a logic call site, it's a DEBUG-only crash workaround that
/// materializes the exact `@Published` keypath emission site that used to overflow the main-thread
/// stack (see the file's own doc comment). Touching it would change what gets warmed and risk
/// resurrecting that crash for a refactor with zero user-facing benefit.
///
/// Source-only: `encryptionDisclaimer` / `bodyContent` are `@ViewBuilder private var` computed
/// properties on a SwiftUI View — not exerciseable behaviourally via XCTest without a live render
/// harness. Body isolated via `DeclarationBodyScanner` (balanced braces, not a fixed character
/// window — see `d60973459`) so an unrelated comment/property added above these two properties can
/// never desync the guard.
final class ConversationViewLoadingPhaseSourceGuardTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Views
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_encryptionDisclaimer_readsPaginationPhase_notRawLoadingInitialBoolean() throws {
        let stripped = AppSourceGuard.stripComments(try source())
        guard let body = DeclarationBodyScanner.body(containing: "private var encryptionDisclaimer", in: stripped) else {
            XCTFail("encryptionDisclaimer not found in ConversationView.swift — file changed shape.")
            return
        }
        XCTAssertFalse(
            body.contains("viewModel.isLoadingInitial"),
            "encryptionDisclaimer must stop reading the raw isLoadingInitial boolean — use the " +
            "canonical ConversationLoadingPhase projection instead (M2 follow-up to PR #280)."
        )
        XCTAssertTrue(
            body.contains("viewModel.paginationPhase.isBlockingSpinnerNeeded"),
            "encryptionDisclaimer must gate its visibility on paginationPhase.isBlockingSpinnerNeeded."
        )
    }

    func test_bodyContent_coldStartSkeleton_readsPaginationPhase_notRawLoadingInitialBoolean() throws {
        let stripped = AppSourceGuard.stripComments(try source())
        guard let body = DeclarationBodyScanner.body(containing: "private var bodyContent", in: stripped) else {
            XCTFail("bodyContent not found in ConversationView.swift — file changed shape.")
            return
        }
        XCTAssertFalse(
            body.contains("viewModel.isLoadingInitial"),
            "bodyContent's cold-start skeleton overlay must stop reading the raw isLoadingInitial " +
            "boolean — use the canonical ConversationLoadingPhase projection instead."
        )
        XCTAssertTrue(
            body.contains("viewModel.paginationPhase.isBlockingSpinnerNeeded"),
            "bodyContent's cold-start skeleton overlay must gate on paginationPhase.isBlockingSpinnerNeeded."
        )
    }

    func test_conversationFirstRenderWarmup_keepsReadingRawBoolean_untouchedByThisMigration() throws {
        // Regression guard for the deliberate exclusion documented above: if a future pass
        // "completes" the M2 migration by also touching the warmup file, this test forces a
        // conscious decision (and a re-read of ConversationFirstRenderWarmup.swift's doc comment)
        // instead of a silent mechanical sweep.
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/ConversationFirstRenderWarmup.swift")
        let warmupSource = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(
            warmupSource.contains("_ = vm.isLoadingInitial"),
            "ConversationFirstRenderWarmup.warmUpViewModelKeyPaths must keep materializing the " +
            "isLoadingInitial @Published keypath directly — it's a crash workaround reproducing an " +
            "exact emission site, not a logic call site. See the file's top-of-file doc comment."
        )
    }
}
