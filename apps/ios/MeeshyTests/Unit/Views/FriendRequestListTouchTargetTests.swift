import XCTest
@testable import Meeshy

/// Iteration 223i — the three controls of `FriendRequestListView` reach the
/// 44 × 44 pt HIG floor.
///
/// A `Button`'s tappable region is exactly its label's layout region. Before this
/// iteration: the back chevron had **no `frame` at all** (~17 pt glyph) and was
/// the screen's only exit, while Decline and Accept sat at 36 × 36 with an 8 pt
/// gap between them. Two of the three are socially irreversible — a missed tap on
/// Accept lands on Decline, so the failure mode is not "nothing happened" but
/// **the opposite action**.
///
/// The fix deliberately does NOT enlarge the visible pills. They carry a
/// `Circle().fill(…)` background, so growing their frame would redraw the screen.
/// The Apple-sanctioned pattern is to wrap the unchanged visual in a larger
/// layout region and make that region hit-testable:
///
///     Image(systemName: "xmark")
///         .frame(width: 36, height: 36)   // visible pill — unchanged
///         .background(Circle().fill(…))
///         .frame(width: 44, height: 44)   // touch target
///         .contentShape(Circle())
///
/// `spacing: 8` becomes `spacing: 0` so the 4 pt transparent inset on each side
/// of a 36 pt pill centred in 44 pt *becomes* the original 8 pt gap: the row
/// grows by 8 pt total instead of 16, and the visible rhythm is identical.
@MainActor
final class FriendRequestListTouchTargetTests: XCTestCase {

    private static let appRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()   // Views
        .deletingLastPathComponent()   // Unit
        .deletingLastPathComponent()   // MeeshyTests
        .deletingLastPathComponent()   // apps/ios

    private static let view = "Meeshy/Features/Main/Views/FriendRequestListView.swift"

    private func readSource() throws -> String {
        try String(contentsOf: Self.appRoot.appendingPathComponent(Self.view), encoding: .utf8)
    }

    /// Production source with comments dropped, so asserting the *absence* of
    /// a value is not defeated by a comment that documents it. Shared stripper:
    /// the old prefix-only filter let a TRAILING comment defeat the assertion.
    private func code() throws -> String {
        AppSourceGuard.stripComments(try readSource())
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        guard !needle.isEmpty else { return 0 }
        var count = 0
        var index = haystack.startIndex
        while let found = haystack.range(of: needle, range: index..<haystack.endIndex) {
            count += 1
            index = found.upperBound
        }
        return count
    }

    /// Text within `window` characters after `anchor`. Anchoring matters here:
    /// after this iteration the file contains three 44 pt frames and three
    /// `contentShape` calls, so a global `contains` would pass even if the back
    /// button — the worst offender — had been left untouched.
    private func slice(after anchor: String, window: Int, in source: String) throws -> String {
        let range = try XCTUnwrap(source.range(of: anchor), "anchor '\(anchor)' not found")
        let end = source.index(range.upperBound, offsetBy: window, limitedBy: source.endIndex)
            ?? source.endIndex
        return String(source[range.upperBound..<end])
    }

    // MARK: - Back control — the sole exit, and the smallest target

    /// `alignment: .leading` is load-bearing: a bare `.frame(width: 44, height: 44)`
    /// would centre the chevron in its box and shift it ~13 pt right. Leading
    /// alignment keeps the glyph exactly where it was and grows the hit region
    /// right and down instead.
    ///
    /// The slice is taken from **comment-stripped** source: a comment naming
    /// `frame(width: 44…)` must not be able to satisfy the assertion. The
    /// region is then WHITESPACE-NORMALISED before matching — the shared
    /// stripper keeps line structure (a stripped comment leaves its
    /// indentation), so raw char distances depend on how much prose sat
    /// between the glyph and its frame; that is exactly the fixed-window rot
    /// this guard once fell to (window 260, real offsets 216/287 under the
    /// shared stripper). Normalising makes the assertion depend on the CODE,
    /// not the commentary volume; 400 chars bounds the search region without
    /// reaching the next control.
    func test_backControl_reachesTheTouchTargetFloorWithoutMovingTheGlyph() throws {
        let source = try code()
        let region = try slice(after: "Image(systemName: \"chevron.backward\")", window: 400, in: source)
        let normalized = region.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")

        XCTAssertTrue(
            normalized.contains("frame(width: 44, height: 44, alignment: .leading)"),
            "The back control is the screen's only exit and had no frame at all (~17 pt). It must " +
            "reach 44x44, leading-aligned so the chevron does not move."
        )
        XCTAssertTrue(
            normalized.contains("contentShape"),
            "Without contentShape the transparent area between the glyph and the 44 pt edge does " +
            "not reliably participate in hit-testing, so the enlarged frame buys nothing."
        )
    }

    /// The header is a symmetric `HStack`: `[back] Spacer() [title] Spacer() [Color.clear]`.
    /// The trailing counterweight must mirror the back control, otherwise the
    /// title is no longer centred.
    func test_headerCounterweight_mirrorsTheBackControl() throws {
        let source = try code()

        XCTAssertTrue(
            source.contains("Color.clear.frame(width: 44)"),
            "The header counterweight must match the back control's new width so the title stays centred."
        )
        XCTAssertFalse(
            source.contains("Color.clear.frame(width: 24)"),
            "The old 24 pt counterweight must be replaced, not left alongside the new one."
        )
    }

    // MARK: - Decline / Accept — adjacent and socially irreversible

    func test_requestActions_growTheTouchTargetAndLeaveThePillsUntouched() throws {
        let source = try code()

        XCTAssertEqual(
            occurrences(of: "frame(width: 36, height: 36)", in: source), 2,
            "Both visible pills must STAY at 36 pt. This is the assertion that fails if the fix " +
            "grew the circles instead of the hit regions."
        )
        XCTAssertEqual(
            occurrences(of: "frame(width: 44, height: 44)\n", in: source), 2,
            "Decline and Accept each need a 44 pt touch target wrapping their unchanged pill."
        )
        XCTAssertEqual(
            occurrences(of: "contentShape(Circle())", in: source), 2,
            "Each enlarged region must be hit-testable, and Circle matches the pill it wraps."
        )
    }

    /// Without this the row would widen by 16 pt and the visible gap between the
    /// two pills would double from 8 pt to 16 pt.
    func test_requestActions_letTheTouchTargetsProvideTheSpacing() throws {
        let source = try code()
        let region = try slice(after: "HStack(spacing: 0)", window: 400, in: source)

        XCTAssertTrue(
            region.contains("viewModel.reject(requestId:"),
            "The Decline/Accept row must be the HStack(spacing: 0): the 4 pt inset on each side of " +
            "a 36 pt pill centred in 44 pt restores the original 8 pt gap."
        )
        XCTAssertFalse(
            try code().contains("HStack(spacing: 8)"),
            "No 8 pt spacing may remain on the action row — it would double the visible gap."
        )
    }

    // MARK: - Coverage lock

    /// If this screen gains a fourth control, these counts fail rather than
    /// letting it ship below the floor unnoticed.
    func test_everyControlOnTheScreenIsCoveredAndLabelled() throws {
        let source = try code()

        XCTAssertEqual(
            occurrences(of: "frame(width: 44, height: 44", in: source), 3,
            "Exactly three controls on this screen (back, decline, accept) — each needs a 44 pt target."
        )
        XCTAssertEqual(
            occurrences(of: ".accessibilityLabel(", in: source), 3,
            "The three controls keep their localized VoiceOver labels: this iteration is the motor " +
            "pass, and it must not cost the screen-reader pass that was already done."
        )
    }
}
