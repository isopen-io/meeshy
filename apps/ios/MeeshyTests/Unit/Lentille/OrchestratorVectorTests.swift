import XCTest
@testable import Meeshy

/// Vecteurs de parité — `ReadingModeOrchestrator.resolveOrchestratorDecision`
/// + `.toBridgeSuggestedMode` contre le domicile de vérité TypeScript
/// (`packages/shared/utils/reading-modes.ts`, contrat GELÉ S1).
///
/// Charge `packages/shared/fixtures/reading-modes/orchestrator.vectors.json`
/// (21 cas, câblé en ressource de bundle de tests via `project.yml`
/// `MeeshyTests.resources` → `../../packages/shared/fixtures`, `type: folder`).
/// Chaque cas rejoue DEUX choses : la décision de l'orchestrateur (`mode` +
/// `reason`) ET sa projection vers le pont (`expectedBridgeSuggestedMode`,
/// clé SŒUR de `input`/`expected` — pas nichée dans l'un ou l'autre).
///
/// **Nommage** — comme `LentilleMetricsTests` : aucun jeton qui bascule cette
/// suite en phase 2 du gate (`meeshy.sh` `FINAL_PHASE_CLASS_PATTERN`,
/// ligne ~1591). `OrchestratorVectorTests`, pas
/// `ConversationOrchestratorVectorTests`.
final class OrchestratorVectorTests: XCTestCase {

    // MARK: - Décodage tolérant du vecteur

    private struct VectorCase: Decodable {
        let label: String
        let input: VectorInput
        let expected: VectorExpected
        let expectedBridgeSuggestedMode: String

        enum CodingKeys: String, CodingKey {
            case label = "_label"
            case input
            case expected
            case expectedBridgeSuggestedMode
        }
    }

    private struct VectorInput: Decodable {
        let unreadCount: Int
        /// Nichée : `null` en JSON ⇒ `nil` — miroir du `null` TypeScript
        /// (« jamais ouverte »). Type numérique tolérant : les timestamps du
        /// fixture sont des entiers epoch-ms (`Int64`-safe), décodés en
        /// `Double` pour rejoindre directement `Date(timeIntervalSince1970:)`.
        let lastOpenedAt: Double?
        let now: Double
        let stickyChoice: String
        let isFlagEnabled: Bool
        let capabilities: VectorCapabilities
    }

    private struct VectorCapabilities: Decodable {
        let availableModes: [String]
        let riverEligible: Bool
        let riverEligibilityReason: VectorRiverEligibilityReason
    }

    private struct VectorRiverEligibilityReason: Decodable {
        let threshold: Int
        let current: Int
    }

    private struct VectorExpected: Decodable {
        let mode: String
        let reason: String
    }

    /// Ressource de bundle : `packages/shared/fixtures/reading-modes/orchestrator.vectors.json`.
    /// Zéro cas chargé ⇒ `XCTFail` explicite (leçon 257 : un tableau vide fait
    /// passer une boucle `for` sans jamais l'exécuter — un test qui ne peut
    /// pas rougir n'a rien prouvé).
    private static func loadVectors() throws -> [VectorCase] {
        guard let url = Bundle(for: OrchestratorVectorTests.self).url(
            forResource: "orchestrator.vectors",
            withExtension: "json",
            subdirectory: "fixtures/reading-modes"
        ) else {
            XCTFail("""
                orchestrator.vectors.json introuvable dans le bundle de tests sous \
                `fixtures/reading-modes/`. Vérifier la ressource `../../packages/shared/fixtures` \
                (type: folder, buildPhase: resources, sous `sources:`) dans project.yml, \
                puis `xcodegen generate`.
                """)
            return []
        }
        let data = try Data(contentsOf: url)
        let cases = try JSONDecoder().decode([VectorCase].self, from: data)
        if cases.isEmpty {
            XCTFail("orchestrator.vectors.json chargé mais vide — 0 cas rejoué (leçon 257).")
        }
        return cases
    }

    // MARK: - Conversion vecteur → types de la loi

    private func mode(_ raw: String, label: String) throws -> ReadingModeOrchestrator.ConversationReadingMode {
        try XCTUnwrap(
            ReadingModeOrchestrator.ConversationReadingMode(rawValue: raw),
            "mode inconnu '\(raw)' — cas '\(label)'"
        )
    }

    private func preference(_ raw: String, label: String) throws -> ReadingModeOrchestrator.ReadingModePreference {
        try XCTUnwrap(
            ReadingModeOrchestrator.ReadingModePreference(rawValue: raw),
            "stickyChoice inconnu '\(raw)' — cas '\(label)'"
        )
    }

    private func reason(_ raw: String, label: String) throws -> ReadingModeOrchestrator.OrchestratorDecisionReason {
        try XCTUnwrap(
            ReadingModeOrchestrator.OrchestratorDecisionReason(rawValue: raw),
            "reason inconnue '\(raw)' — cas '\(label)'"
        )
    }

    private func bridgeMode(
        _ raw: String,
        label: String
    ) throws -> ReadingModeOrchestrator.BridgeSuggestedMode {
        try XCTUnwrap(
            ReadingModeOrchestrator.BridgeSuggestedMode(rawValue: raw),
            "expectedBridgeSuggestedMode inconnu '\(raw)' — cas '\(label)'"
        )
    }

    private func capabilities(
        _ raw: VectorCapabilities,
        label: String
    ) throws -> ReadingModeOrchestrator.ReadingModeCapabilities {
        let availableModes = try raw.availableModes.map { try mode($0, label: label) }
        return ReadingModeOrchestrator.ReadingModeCapabilities(
            availableModes: availableModes,
            riverEligible: raw.riverEligible,
            riverEligibilityReason: ReadingModeOrchestrator.RiverEligibilityReason(
                threshold: raw.riverEligibilityReason.threshold,
                current: raw.riverEligibilityReason.current
            )
        )
    }

    // MARK: - Rejeu

    func test_resolveOrchestratorDecision_and_toBridgeSuggestedMode_matchAllVectors() throws {
        let cases = try Self.loadVectors()

        for vector in cases {
            let input = ReadingModeOrchestrator.OrchestratorDecisionInput(
                unreadCount: vector.input.unreadCount,
                lastOpenedAt: vector.input.lastOpenedAt.map { Date(timeIntervalSince1970: $0 / 1000) },
                now: Date(timeIntervalSince1970: vector.input.now / 1000),
                stickyChoice: try preference(vector.input.stickyChoice, label: vector.label),
                capabilities: try capabilities(vector.input.capabilities, label: vector.label),
                isFlagEnabled: vector.input.isFlagEnabled
            )

            let decision = ReadingModeOrchestrator.resolveOrchestratorDecision(input)

            let expectedMode = try mode(vector.expected.mode, label: vector.label)
            let expectedReason = try reason(vector.expected.reason, label: vector.label)

            XCTAssertEqual(decision.mode, expectedMode, "mode — cas '\(vector.label)'")
            XCTAssertEqual(decision.reason, expectedReason, "reason — cas '\(vector.label)'")

            let bridge = ReadingModeOrchestrator.toBridgeSuggestedMode(decision)
            let expectedBridge = try bridgeMode(vector.expectedBridgeSuggestedMode, label: vector.label)

            XCTAssertEqual(bridge, expectedBridge, "expectedBridgeSuggestedMode — cas '\(vector.label)'")
        }
    }
}
