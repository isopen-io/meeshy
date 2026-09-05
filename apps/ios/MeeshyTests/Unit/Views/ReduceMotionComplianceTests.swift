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
        AppSourceGuard.stripComments(source)
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
    }

    private static let conversationRow = "Meeshy/Features/Main/Views/ThemedConversationRow.swift"
    private static let syncPill = "Meeshy/Features/Main/Components/SyncPill.swift"
    private static let lentilleStoryRail = "Meeshy/Features/Main/Lentille/Chrome/StoriesVivantsRail.swift"

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

    // MARK: - L'ancien décor d'inscription (#5218)
    //
    // Trois règles vivaient ici : le décor du wizard d'inscription
    // (`AnimatedStepBackground`) faisait passer ses dix-neuf décorations par un
    // entonnoir `ambient(_:)`, et ses deux moteurs se posaient sur l'état
    // composé plutôt qu'au milieu du geste.
    //
    // Elles sont parties AVEC leur sujet : le wizard en huit étapes est
    // remplacé par `SignupView`, un seul écran qui n'a AUCUNE animation
    // soutenue — ni orbe, ni onde, ni particule. Il n'y a donc plus rien à
    // garder ici, et la règle générale (`PerpetualMotionGuardTests`, qui balaie
    // TOUT le dépôt à la recherche d'un `repeatForever` non gardé) couvre
    // l'écran neuf sans qu'un témoin nommé lui soit dédié.
    //
    // Les épingler sur `SignupView` aurait été pire qu'inutile : une garde qui
    // exige un entonnoir dans un fichier qui n'anime rien est verte pour la
    // mauvaise raison — elle ne mesure plus rien.

    // MARK: - Lentille story rail — the mood badges (lot 3, 2026-08-22)

    /// The rail at the top of the conversation list shows up to seven mood
    /// badges at once (`LentilleMetrics.Rail.maxEntries` authors, plus "me"),
    /// each one breathing on a `.repeatForever` spring. That is the densest
    /// sustained motion in the list, and it sits above content the user came
    /// for — they cannot scroll it away without also leaving the stories.
    ///
    /// The gate is not written in the rail: the rail mounts the shared
    /// `MeeshyMoodBadge` atom, which is the only place the spring exists and
    /// the only place that reads the setting (system **and** the in-app
    /// override — see `MoodBadgeTests` in the SDK package suite). Delegation
    /// is what makes the compliance structural: a skin cannot forget a gate it
    /// does not own.
    func test_lentilleStoryRail_delegatesItsMoodPulseToTheGatedAtom() throws {
        let code = codeLines(try source(Self.lentilleStoryRail))

        XCTAssertTrue(
            code.contains("MeeshyMoodBadge("),
            "The rail must mount the shared badge atom — the single home of the mood spring."
        )
        XCTAssertFalse(
            code.contains("repeatForever"),
            "A hand-rolled repeating spring in the skin would run outside the atom's Reduce " +
            "Motion gate: motion the setting cannot reach is exactly what this suite exists " +
            "to prevent."
        )
        XCTAssertFalse(
            code.contains("withAnimation("),
            "Same reason, one step earlier: the rail must own no animation driver at all."
        )
    }

    // Le fondu entre deux étapes du wizard d'inscription était épinglé ici comme
    // une exclusion VOULUE (discret, auto-terminé, donc hors du champ de Reduce
    // Motion). Il est parti avec les huit étapes : `SignupView` n'a plus
    // d'étapes à enchaîner (#5218).
}
