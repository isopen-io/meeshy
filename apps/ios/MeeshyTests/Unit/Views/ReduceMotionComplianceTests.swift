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
    /// L'unique indicateur de frappe (#9891) : les rangées et la bulle le montent.
    private static let typingDots = "../../packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyTypingDots.swift"
    private static let syncPill = "Meeshy/Features/Main/Components/SyncPill.swift"

    // MARK: - Every unstoppable animation must be reachable by the setting

    func test_typingDots_honourReduceMotion() throws {
        let code = codeLines(try source(Self.typingDots))

        XCTAssertTrue(
            codeLines(try source(Self.conversationRow)).contains("MeeshyTypingDots(color:"),
            "The conversation list mounts the single typing indicator of the SDK."
        )
        XCTAssertTrue(
            code.contains("@Environment(\\.accessibilityReduceMotion)"),
            "The typing dots run `.repeatForever` in the conversation list — the setting must reach them."
        )
        XCTAssertTrue(
            code.contains("restsStill ? nil :"),
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
        let row = codeLines(try source(Self.typingDots))
        let pill = codeLines(try source(Self.syncPill))

        XCTAssertTrue(
            row.contains("restsStill || isAnimating ? 1.0 : 0.5"),
            "With motion off the typing dots must rest at full scale and opacity, not at the " +
            "animation's dimmed low phase."
        )
        XCTAssertTrue(
            pill.contains("reduceMotion ? 1.0 :"),
            "Same for the sync dot: no motion, but still plainly visible."
        )
    }

    /// **Une seule implémentation des points de frappe** (#9891). Trois copies
    /// vivaient côté app ; une quatrième se reconnaîtrait à sa cadence
    /// (« 0.18 » de décalage par point) posée hors de l'atome du SDK.
    func test_typingDotsHaveASingleImplementation() throws {
        let appRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
        let walker = try XCTUnwrap(FileManager.default.enumerator(at: appRoot, includingPropertiesForKeys: nil))
        let files = walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
        XCTAssertGreaterThan(files.count, 500, "the sweep must see the app sources")

        let copies = try files.filter { file in
            let code = codeLines(try String(contentsOf: file, encoding: .utf8))
            return code.contains("repeatForever") && code.contains("Double(i) * 0.18")
        }.map(\.lastPathComponent)
        XCTAssertEqual(copies, [], "typing dots are `MeeshyTypingDots` (SDK) — never a local copy")
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

    // Le fondu entre deux étapes du wizard d'inscription était épinglé ici comme
    // une exclusion VOULUE (discret, auto-terminé, donc hors du champ de Reduce
    // Motion). Il est parti avec les huit étapes : `SignupView` n'a plus
    // d'étapes à enchaîner (#5218).
}
