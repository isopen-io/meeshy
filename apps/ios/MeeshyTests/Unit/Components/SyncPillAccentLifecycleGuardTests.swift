import XCTest
import MeeshySDK
@testable import Meeshy

/// Directive porteur 2026-08-27 (précision #4026) : l'accent de la pastille
/// (grossi ×1.5, fond primaire) pour une frappe (`typing.<conv>`) ou une
/// reconnexion (`status.offline`/`status.disconnected`, dotStyle `.warning`)
/// doit durer EXACTEMENT tant que le signal sous-jacent dure — jamais un
/// délai fixe. `SyncPill.isOngoingSignal(_:)` est le prédicat pur qui décide
/// ; testé directement (pas une garde de source) puisqu'il n'est pas
/// `private` et ne touche aucun `@State`.
///
/// Le reste de la mécanique (`handleEntriesChange`/`surfaceWithAccent`)
/// pilote du `@State` privé de la View — non inspectable sans ViewInspector,
/// donc gardé par forme de source, même patron que
/// `ConversationSelectionGuardTests`/`FocalMatrixWiringGuardTests`.
@MainActor
final class SyncPillAccentLifecycleGuardTests: XCTestCase {

    private func entry(
        id: String,
        dotStyle: SyncPillDotStyle,
        label: String = "x"
    ) -> SyncPillEntry {
        SyncPillEntry(id: id, label: label, iconName: nil, dotStyle: dotStyle, source: nil)
    }

    // MARK: - `isOngoingSignal` — le prédicat pur

    func test_isOngoingSignal_true_forATypingEntry() {
        let typing = entry(id: "typing.conv1", dotStyle: .brand)
        XCTAssertTrue(SyncPill.isOngoingSignal(typing),
                      "une frappe est un signal en cours, quel que soit son dotStyle")
    }

    func test_isOngoingSignal_true_forAWarningDotStyle_offlineOrReconnecting() {
        let offline = entry(id: "status.offline", dotStyle: .warning)
        let disconnected = entry(id: "status.disconnected", dotStyle: .warning)
        XCTAssertTrue(SyncPill.isOngoingSignal(offline))
        XCTAssertTrue(SyncPill.isOngoingSignal(disconnected))
    }

    func test_isOngoingSignal_false_forTheTransientOnlineConfirmation() {
        // status.online est `.success` — la reconnexion est déjà TERMINÉE à
        // ce stade, elle doit garder le pulse bref existant (#4018), pas
        // l'accent indéfini.
        let online = entry(id: "status.online", dotStyle: .success)
        XCTAssertFalse(SyncPill.isOngoingSignal(online))
    }

    func test_isOngoingSignal_false_forAFailedSend() {
        // Un envoi/mutation en échec (dotStyle .error) N'EST PAS un signal en
        // cours — le tenir accentué indéfiniment jusqu'à résolution manuelle
        // contredirait le pulse bref voulu par #4018 pour cette famille.
        let failed = entry(id: "outbox.msg-1", dotStyle: .error)
        XCTAssertFalse(SyncPill.isOngoingSignal(failed))
    }

    func test_isOngoingSignal_false_forAPlainBrandEntry() {
        let syncing = entry(id: "status.syncing", dotStyle: .brand)
        XCTAssertFalse(SyncPill.isOngoingSignal(syncing))
    }

    // MARK: - Forme de source : pas de minuteur pour un signal en cours

    private func source(_ relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Components
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")
        return AppSourceGuard.stripComments(
            try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
        )
    }

    private func body(of anchor: String, in code: String) -> String? {
        guard let start = code.range(of: anchor) else { return nil }
        var depth = 0
        var result = ""
        for character in code[start.lowerBound...] {
            result.append(character)
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { return result }
            }
        }
        return nil
    }

    func test_handleEntriesChange_tracksOngoingIDs_withoutSchedulingATimer() throws {
        let code = try source("Features/Main/Components/SyncPill.swift")
        guard let fn = body(of: "private func handleEntriesChange() {", in: code) else {
            return XCTFail("`handleEntriesChange` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("accentedOngoingIDs.formIntersection(currentOngoingIDs)")
                && fn.contains("accentedOngoingIDs.formUnion(newIDs.intersection(currentOngoingIDs))"),
            "un signal en cours qui a disparu doit sortir du suivi, un nouveau doit y entrer."
        )
        XCTAssertTrue(
            fn.contains("if !accentedOngoingIDs.isEmpty") && !fn.contains("DispatchQueue.main.asyncAfter"),
            "tant qu'un signal en cours est suivi, AUCUN minuteur ne doit être posé dans cette fonction — "
                + "le retour au repos vient de la disparition de l'id, jamais d'un délai fixe."
        )
    }

    func test_handleEntriesChange_endsTheAccentImmediately_whenTheLastOngoingSignalClears() throws {
        let code = try source("Features/Main/Components/SyncPill.swift")
        guard let fn = body(of: "private func handleEntriesChange() {", in: code) else {
            return XCTFail("`handleEntriesChange` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("else if isAccented {"),
            "quand le dernier signal en cours disparaît et qu'aucune entrée neuve n'arrive, l'accent doit "
                + "revenir au repos IMMÉDIATEMENT (directive porteur), pas après un délai périmé."
        )
    }

    func test_isOngoingSignal_isDefinedOnceAndReusedByHandleEntriesChange() throws {
        let code = try source("Features/Main/Components/SyncPill.swift")
        XCTAssertTrue(
            code.contains("static func isOngoingSignal(_ entry: SyncPillEntry) -> Bool"),
            "le prédicat doit être une fonction UNIQUE, pas dupliqué inline à chaque site d'usage."
        )
        guard let fn = body(of: "private func handleEntriesChange() {", in: code) else {
            return XCTFail("`handleEntriesChange` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("entries.filter(Self.isOngoingSignal)"),
            "`handleEntriesChange` doit appeler le prédicat partagé, jamais reproduire sa condition."
        )
    }
}
