import XCTest
@testable import Meeshy

/// L2b/2b-2 — le Résumé Vivant naissait VIDE quand il était le mode
/// d'OUVERTURE (décision automatique de `ReadingModeOrchestrator` au-delà de
/// `unreadCap`), c'est-à-dire précisément quand il y a le plus à rattraper.
///
/// `LivingSummaryHost` construit son `LivingSummaryViewModel` dans
/// l'autoclosure d'un `@StateObject` : elle n'est évaluée qu'à la CRÉATION de
/// l'identité de vue. Le VM, lui, ne recompose jamais son digest (`digest` et
/// `faceRamp` sont `private(set)` et affectés au seul `init`). Or le fil s'ouvre
/// souvent AVANT ses messages (cache puis réseau) — le jumeau Rivière traite ce
/// même moment par son empreinte (`RiverConversationHost.fingerprint`).
///
/// Le remède est au SITE DE MONTAGE, pas dans le VM : l'identité de l'hôte
/// bascule exactement une fois, au passage vide → peuplé. Aucun digest déjà
/// peuplé n'est remplacé sous les yeux d'un lecteur, puisqu'une conversation ne
/// redevient pas vide.
///
/// **Pourquoi pas `showsSkeleton`** : il vaut
/// `digest.messageCount == 0 && faceRamp.isEmpty && agentSummary == nil`, et
/// `refreshAgentEnrichment()` est lancé par le `.task` au montage. Si la réponse
/// agent arrive AVANT la première population (cas nominal pour un inscrit sur
/// base froide), `showsSkeleton` passe à `false` et une adoption gardée par lui
/// serait refusée pour toujours — le correctif se saborderait lui-même.
///
/// `LivingSummaryHost` n'est pas montable ici (vue SwiftUI, aucun ViewInspector
/// dans ce dépôt) : garde de SOURCE, avec sa contre-épreuve.
final class LivingSummaryMountIdentityTests: XCTestCase {

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
    }

    private func conversationViewCode() throws -> String {
        let raw = try String(
            contentsOf: Self.iosRoot.appendingPathComponent("Meeshy/Features/Main/Views/ConversationView.swift"),
            encoding: .utf8
        )
        return AppSourceGuard.stripComments(raw)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    /// La branche `.summary` seule — bornée par le pont UIKit qui la suit dans
    /// le même `ZStack`, pour qu'aucune assertion ne se satisfasse d'une
    /// occurrence appartenant à un autre mode de lecture.
    private func summaryBranch() throws -> String {
        let code = try conversationViewCode()
        let start = try XCTUnwrap(
            code.range(of: "if readingModeController.mode == .summary {"),
            "La branche de montage `mode == .summary` a disparu de `ConversationView` — cette " +
            "garde doit être re-pointée avant tout le reste."
        )
        let end = try XCTUnwrap(
            code.range(of: "MessageListView(", options: [], range: start.upperBound ..< code.endIndex),
            "Le pont UIKit qui borne la branche `.summary` est introuvable — la garde ne sait plus " +
            "où s'arrête le mode Résumé."
        )
        return String(code[start.upperBound ..< end.lowerBound])
    }

    func test_summaryBranch_rebindsItsHostIdentity_onTheFirstMessagePopulation() throws {
        let branch = try summaryBranch()

        XCTAssertTrue(
            branch.contains("LivingSummaryHost("),
            "La branche `mode == .summary` doit monter l'hôte du Résumé Vivant — sans quoi le mode " +
            "serait choisi sans écran."
        )
        XCTAssertTrue(
            branch.contains(".id(viewModel.messages.isEmpty)"),
            "L'hôte du Résumé doit être identifié par la VACUITÉ de la fenêtre de messages : son " +
            "ViewModel n'est construit qu'à la création de l'identité de vue, et le fil s'ouvre " +
            "souvent avant ses messages. Sans ce basculement, le Résumé reste un squelette pour " +
            "toute la session — vide précisément quand il y a le plus à rattraper."
        )
    }

    /// Contre-épreuve : l'identité ne doit PAS suivre une valeur qui change à
    /// chaque message.
    func test_summaryHostIdentity_isNotBoundToAValueThatKeepsChanging() throws {
        let branch = try summaryBranch()
        for volatile in [".id(viewModel.messages.count)", ".id(viewModel.messages)"] {
            XCTAssertFalse(
                branch.contains(volatile),
                "`\(volatile)` reconstruirait l'hôte à CHAQUE message reçu : le digest, la rampe " +
                "et l'enrichissement agent repartiraient de zéro sous les yeux d'un lecteur en " +
                "train de lire, et le `.task` d'enrichissement se rejouerait sans fin. " +
                "`messages.isEmpty` bascule exactement une fois — une conversation ne redevient " +
                "pas vide."
            )
        }
    }
}
