import XCTest
import SwiftUI
@testable import Meeshy

/// "Reduce Motion" is not a preference about taste. Users enable it because
/// sustained on-screen movement triggers vertigo, nausea or migraine
/// (vestibular disorders), and `.repeatForever` is the one animation family
/// that never stops on its own — it runs for as long as the view is on screen.
/// WCAG 2.3.3 and Apple's HIG both ask that such motion be honoured.
///
/// The two surfaces locked here are the ones a user cannot avoid: the typing
/// dots pulse in the conversation list next to whoever is writing, and the sync
/// dot pulses in the app's persistent chrome. Neither is dismissible, so a user
/// who has asked the system for less motion gets it in the one place they look
/// most.
///
/// The repo idiom is `@Environment(\.accessibilityReduceMotion)`, already used
/// by `FloatingCallPillView` and `ReelAudioBackdrop`.
@MainActor
final class ReduceMotionComplianceTests: XCTestCase {

    /// `apps/ios/` — four levels up from `MeeshyTests/Unit/Views/<this file>`.
    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Comments are stripped before matching: a doc-comment naming the very
    /// symbol under test would otherwise satisfy the assertion on its own.
    ///
    /// Runs of whitespace then collapse to a single space, so an assertion
    /// describes the *code* and not the line breaks a formatter happened to
    /// choose — a multi-line ternary must read the same as a one-line one.
    private func codeLines(_ source: String) -> String {
        let withoutComments = source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
        return withoutComments
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
    }

    private static let conversationRow = "Meeshy/Features/Main/Views/ThemedConversationRow.swift"
    private static let syncPill = "Meeshy/Features/Main/Components/SyncPill.swift"

    // MARK: - Every unstoppable animation must be reachable by the setting

    func test_typingDots_honourReduceMotion() throws {
        let code = codeLines(try source(Self.conversationRow))

        XCTAssertTrue(
            code.contains("@Environment(\\.accessibilityReduceMotion)"),
            "The typing dots run `.repeatForever` in the conversation list — the setting must reach them."
        )
        XCTAssertTrue(
            code.contains("reduceMotion ? nil :"),
            "Under Reduce Motion the animation must be nil, not merely shortened: a repeating " +
            "animation with a smaller duration still never stops."
        )
    }

    func test_syncPillDot_honoursReduceMotion() throws {
        let code = codeLines(try source(Self.syncPill))

        XCTAssertTrue(
            code.contains("@Environment(\\.accessibilityReduceMotion)"),
            "The sync dot pulses in the app's persistent chrome — the setting must reach it."
        )
        XCTAssertTrue(
            code.contains("reduceMotion ? nil :"),
            "The pulse must be switched off, not slowed."
        )
    }

    /// Turning the motion off must not turn the *meaning* off. Both indicators
    /// convey a live state ("someone is typing", "syncing"), and both encoded it
    /// partly through the animation's low phase — a dot at 0.4 opacity or 0.5
    /// scale. Frozen at that phase they would read as disabled, so the static
    /// state has to be the full-strength one.
    func test_reducedMotionKeepsTheIndicatorsLegible() throws {
        let row = codeLines(try source(Self.conversationRow))
        let pill = codeLines(try source(Self.syncPill))

        XCTAssertTrue(
            row.contains("reduceMotion ? 1.0 :"),
            "With motion off the typing dots must rest at full scale and opacity, not at the " +
            "animation's dimmed low phase."
        )
        XCTAssertTrue(
            pill.contains("reduceMotion ? 1.0 :"),
            "Same for the sync dot: no motion, but still plainly visible."
        )
    }
}
