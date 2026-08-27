import XCTest
import MeeshySDK
@testable import Meeshy

/// **Le cycle de vie de l'accent de la pastille — forme de source.**
///
/// Histoire de la règle, parce qu'elle a changé deux fois en un jour et que
/// la garde doit dire LAQUELLE elle garde :
///
/// - #4018 — l'accent était un pulse fixe de 0,5 s à chaque nouveau contenu.
/// - #4026 — l'accent d'un signal EN COURS (frappe, reconnexion) durait
///   exactement tant que le signal, via un suivi d'identifiants
///   (`accentedOngoingIDs`) et sans aucun minuteur.
/// - **#4050 (en vigueur)** — l'accent est une **fenêtre de six secondes
///   réarmée par chaque entrée NEUVE**, gouvernée par le temps seul :
///   « rester bien visible avant de reprendre la forme normale au bout d'au
///   moins 6 secondes si l'utilisateur écrit encore ; si un nouvel utilisateur
///   écrit entre-temps […] qu'elle grossisse encore aussi pendant 6 s, et ainsi
///   de suite » (directive porteur 2026-08-27).
///
/// #4050 amende donc #4026 sur ses DEUX bords : la durée du signal n'entre
/// plus dans la décision, ni pour prolonger l'accent, ni pour l'interrompre.
/// La décision elle-même vit dans `SyncPillAccentLaw` et est testée par
/// `SyncPillAccentWindowTests` ; cette garde-ci vérifie que la VUE la
/// consomme — son `@State` privé n'étant pas inspectable sans ViewInspector,
/// même patron que `ConversationSelectionGuardTests` /
/// `FocalMatrixWiringGuardTests`.
@MainActor
final class SyncPillAccentLifecycleGuardTests: XCTestCase {

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

    private func pillSource() throws -> String {
        try source("Features/Main/Components/SyncPill.swift")
    }

    // MARK: - La vue consomme la loi, elle ne la réécrit pas

    func test_handleEntriesChange_delegatesTheWindowToTheLaw() throws {
        let code = try pillSource()
        guard let fn = body(of: "private func handleEntriesChange() {", in: code) else {
            return XCTFail("`handleEntriesChange` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("SyncPillAccentLaw.deadline("),
            "la fenêtre d'accent se décide dans `SyncPillAccentLaw`, jamais en ligne dans la vue : c'est là qu'elle est testée sur le temps injecté."
        )
        XCTAssertTrue(
            fn.contains("hasNewEntries: !newIDs.isEmpty"),
            "seule une entrée NEUVE réarme — une frappe qui continue garde son id `typing.<conv>` et ne doit rien prolonger (borne haute de #4050)."
        )
    }

    func test_theAccentTimerIsArmedOnTheDeadline_andReplacedOnEveryRearm() throws {
        let code = try pillSource()
        guard let fn = body(of: "private func applyAccentWindow(now: Date) {", in: code) else {
            return XCTFail("`applyAccentWindow` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("accentResetWorkItem?.cancel()"),
            "un réarmement doit ANNULER le retour au repos précédent : sans cela, N arrivées laissent N minuteurs en vol et la pastille redescend au milieu de sa fenêtre."
        )
        XCTAssertTrue(
            fn.contains("deadline.timeIntervalSince(now)"),
            "le retour au repos est programmé à l'ÉCHÉANCE de la fenêtre, pas après un délai fixe — c'est ce qui rend le réarmement exact."
        )
        XCTAssertFalse(
            fn.contains("repeatForever"),
            "minuteur borné, jamais répété — cf. audit chauffe #3940."
        )
    }

    // MARK: - L'ancien régime ne revient pas

    func test_theOngoingSignalRegimeIsGone() throws {
        let code = try pillSource()
        for vestige in ["accentedOngoingIDs", "isOngoingSignal", "accentHold"] {
            XCTAssertFalse(
                code.contains(vestige),
                "`\(vestige)` appartient au régime #4026, où l'accent suivait la DURÉE du signal. #4050 l'amende : "
                    + "le réintroduire ferait cohabiter deux horloges pour une seule forme."
            )
        }
    }

    func test_theAccentDoesNotEndWhenTheSignalDisappears() throws {
        let code = try pillSource()
        guard let fn = body(of: "private func handleEntriesChange() {", in: code) else {
            return XCTFail("`handleEntriesChange` introuvable — la garde ne mesurerait rien.")
        }
        // La branche « le dernier signal en cours a disparu ⇒ accent coupé
        // immédiatement » était le cœur de #4026. Sous #4050, seule l'échéance
        // éteint l'accent (borne basse) — sauf file vide, traitée en amont par
        // le retour anticipé.
        XCTAssertFalse(
            fn.contains("else if isAccented {"),
            "la disparition d'un signal ne coupe plus l'accent : il tient ses six secondes même si la personne cesse d'écrire (borne basse de #4050)."
        )
    }

    // MARK: - Les deux durées de six secondes restent distinctes

    func test_theHideDelayAndTheAccentWindowAreTwoNamedConstants() throws {
        let code = try pillSource()
        XCTAssertTrue(
            code.contains("private static let idleHideDelay: TimeInterval = 6.0"),
            "le délai d'effacement (#4017) reste une constante de la VUE."
        )
        guard let fn = body(of: "private func scheduleAutoHide() {", in: code) else {
            return XCTFail("`scheduleAutoHide` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("idleHideDelay: Self.idleHideDelay"),
            "l'effacement passe SA durée à la loi : les deux valent six secondes aujourd'hui, régler l'une ne doit pas bouger l'autre."
        )
        XCTAssertTrue(
            fn.contains("SyncPillAccentLaw.hideDelay("),
            "l'effacement se compte depuis la FIN de l'accent (#4050) — parties du même instant, les deux durées auraient fait rétrécir et disparaître la pastille en même temps, et la forme normale n'aurait jamais été visible."
        )
    }
}
