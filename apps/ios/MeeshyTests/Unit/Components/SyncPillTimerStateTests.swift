import XCTest
@testable import Meeshy

/// Audit backlog 2026-07-20, lane "Perf divers" (P2) — `SyncPill.dotTimer`
/// was declared `private let dotTimer = Timer.publish(...).autoconnect()`
/// on a `struct View`. A plain stored `let` re-evaluates its initializer
/// every time SwiftUI reconstructs the view value (any unrelated re-render
/// of the parent `ConnectionBanner`), handing `.onReceive` a brand-new,
/// not-yet-ticked publisher each time. When reconstructions arrive faster
/// than the 0.5s interval, the timer never survives long enough to fire and
/// the pulsing dot / activity ellipsis freeze. `@State`'s initializer runs
/// once per view identity, so the same connected publisher persists across
/// re-renders — this is a source-guard locking the property wrapper.
@MainActor
final class SyncPillTimerStateTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Components/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Components/SyncPill.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_syncPill_declaresDotTimerAsState() throws {
        let source = try source()
        XCTAssertTrue(
            source.contains("@State private var dotTimer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()"),
            "SyncPill.dotTimer must be @State — a plain `let` gets re-initialized " +
            "(a fresh, not-yet-ticked Timer publisher) on every reconstruction of " +
            "this View value, which can starve the 0.5s interval and freeze the " +
            "pulsing dot / activity ellipsis."
        )
        XCTAssertFalse(
            source.contains("private let dotTimer = Timer.publish"),
            "SyncPill.dotTimer must not be a `let` — see @State requirement above."
        )
    }
}
