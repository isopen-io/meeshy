import XCTest
@testable import Meeshy

/// **#4043 — un message jamais envoyé (.failed) se supprime de la vue locale
/// en un tap, sans confirmation.** `requestDeleteMessage(_:)` est le point
/// d'entrée UNIQUE : tous les sites qui posaient `overlayState.
/// deleteConfirmMessageId` directement doivent l'appeler à la place — même
/// patron que `beginSelectionMode(seedingWith:)` (#4021).
///
/// Garde de SOURCE, suite tournée sans UIKit réel — même style que
/// `ConversationSelectionGuardTests`.
final class ConversationDeleteMessageGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
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

    // MARK: - `requestDeleteMessage` — un message .failed n'a rien à confirmer

    func test_requestDeleteMessage_deletesImmediately_whenTheMessageIsFailed() throws {
        let code = try source("Features/Main/Views/ConversationView+MessageRow.swift")
        guard let fn = body(of: "func requestDeleteMessage(_ messageId: String) {", in: code) else {
            return XCTFail("`requestDeleteMessage` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("deliveryStatus == .failed"),
            "doit distinguer un message JAMAIS envoyé du cas normal."
        )
        XCTAssertTrue(
            fn.contains("viewModel.deleteMessage(messageId: messageId, mode: .everyone)"),
            "un message .failed doit se supprimer IMMÉDIATEMENT (le mode .everyone route déjà vers "
                + "la purge locale pour .failed, cf. ConversationViewModel.deleteMessage) — pas de "
                + "confirmationDialog."
        )
    }

    func test_requestDeleteMessage_armsTheConfirmation_forAnOrdinaryMessage() throws {
        let code = try source("Features/Main/Views/ConversationView+MessageRow.swift")
        guard let fn = body(of: "func requestDeleteMessage(_ messageId: String) {", in: code) else {
            return XCTFail("`requestDeleteMessage` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("overlayState.deleteConfirmMessageId = messageId"),
            "un message normal doit toujours passer par la confirmation habituelle."
        )
    }

    // MARK: - Les 4 sites qui déclenchaient la suppression appellent tous `requestDeleteMessage`

    func test_allDeleteTriggerSites_callRequestDeleteMessage_notTheOverlayStateDirectly() throws {
        let messageRow = try source("Features/Main/Views/ConversationView+MessageRow.swift")
        let conversationView = try source("Features/Main/Views/ConversationView.swift")

        // Le SEUL site qui doit encore poser `deleteConfirmMessageId = <id>`
        // (hors `nil` de fermeture) est le corps de `requestDeleteMessage`
        // lui-même — un second site l'écrirait directement, court-circuitant
        // le gate `.failed`.
        let directAssignments = (messageRow + conversationView)
            .components(separatedBy: "deleteConfirmMessageId = messageId")
            .count - 1
            + (messageRow + conversationView)
                .components(separatedBy: "deleteConfirmMessageId = msg.id")
                .count - 1
        XCTAssertEqual(
            directAssignments, 1,
            "UN SEUL site doit encore assigner `deleteConfirmMessageId` directement — "
                + "celui à l'intérieur de `requestDeleteMessage`. Tout autre site doit "
                + "appeler `requestDeleteMessage(_:)`."
        )

        let requestCallSites = (messageRow + conversationView)
            .components(separatedBy: "requestDeleteMessage(")
            .count - 1
        // 1 déclaration de la fonction + au moins 4 sites d'appel connus
        // (barre de réaction rapide, bulle/menu custom, menu natif, menu "Plus…").
        XCTAssertGreaterThanOrEqual(
            requestCallSites, 5,
            "les 4 sites de déclenchement connus doivent appeler `requestDeleteMessage(_:)`."
        )
    }
}
