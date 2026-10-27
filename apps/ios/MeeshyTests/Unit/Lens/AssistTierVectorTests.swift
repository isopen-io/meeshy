import XCTest
@testable import Meeshy

/// Vecteurs de parité — `ReadingModeOrchestrator.resolveAssistTier` contre le
/// domicile de vérité TypeScript (`packages/shared/utils/reading-modes.ts`,
/// contrat GELÉ S1). Couvre en particulier la garde e2ee non négociable
/// (workshop §4.4) : `encryptionMode == .e2ee` ∧ appareil incapable ⇒
/// `.deterministic`, JAMAIS `.serverAgent`.
///
/// Charge `packages/shared/fixtures/reading-modes/assist-tier.vectors.json`
/// (10 cas, câblé en ressource de bundle de tests via `project.yml`
/// `MeeshyTests.resources` → `../../packages/shared/fixtures`, `type: folder`).
///
/// **Nommage** — aucun jeton qui bascule cette suite en phase 2 du gate
/// (`meeshy.sh` `FINAL_PHASE_CLASS_PATTERN`, ligne ~1591).
/// `AssistTierVectorTests`, pas `ConversationAssistTierVectorTests` ni
/// `MessageAssistTierVectorTests`.
final class AssistTierVectorTests: XCTestCase {

    // MARK: - Décodage tolérant du vecteur

    private struct VectorCase: Decodable {
        let label: String
        let input: VectorInput
        let expected: String

        enum CodingKeys: String, CodingKey {
            case label = "_label"
            case input
            case expected
        }
    }

    private struct VectorInput: Decodable {
        let deviceCapability: Bool
        /// `null` en JSON ⇒ `nil` — miroir du `null` TypeScript
        /// (`EncryptionMode | null`).
        let encryptionMode: String?
        let userConsent: Bool
        let conversationType: String
    }

    /// Ressource de bundle : `packages/shared/fixtures/reading-modes/assist-tier.vectors.json`.
    /// Zéro cas chargé ⇒ `XCTFail` explicite (leçon 257).
    private static func loadVectors() throws -> [VectorCase] {
        guard let url = Bundle(for: AssistTierVectorTests.self).url(
            forResource: "assist-tier.vectors",
            withExtension: "json",
            subdirectory: "fixtures/reading-modes"
        ) else {
            XCTFail("""
                assist-tier.vectors.json introuvable dans le bundle de tests sous \
                `fixtures/reading-modes/`. Vérifier la ressource `../../packages/shared/fixtures` \
                (type: folder, buildPhase: resources, sous `sources:`) dans project.yml, \
                puis `xcodegen generate`.
                """)
            return []
        }
        let data = try Data(contentsOf: url)
        let cases = try JSONDecoder().decode([VectorCase].self, from: data)
        if cases.isEmpty {
            XCTFail("assist-tier.vectors.json chargé mais vide — 0 cas rejoué (leçon 257).")
        }
        return cases
    }

    // MARK: - Rejeu

    func test_resolveAssistTier_matchesAllVectors() throws {
        let cases = try Self.loadVectors()

        for vector in cases {
            let conversationType = try XCTUnwrap(
                ReadingModeOrchestrator.ConversationType(rawValue: vector.input.conversationType),
                "conversationType inconnu '\(vector.input.conversationType)' — cas '\(vector.label)'"
            )
            let encryptionMode = try vector.input.encryptionMode.map { raw in
                try XCTUnwrap(
                    ReadingModeOrchestrator.EncryptionMode(rawValue: raw),
                    "encryptionMode inconnu '\(raw)' — cas '\(vector.label)'"
                )
            }
            let expected = try XCTUnwrap(
                ReadingModeOrchestrator.AssistTier(rawValue: vector.expected),
                "expected inconnu '\(vector.expected)' — cas '\(vector.label)'"
            )

            let input = ReadingModeOrchestrator.AssistTierInput(
                deviceCapability: vector.input.deviceCapability,
                encryptionMode: encryptionMode,
                userConsent: vector.input.userConsent,
                conversationType: conversationType
            )

            let tier = ReadingModeOrchestrator.resolveAssistTier(input)

            XCTAssertEqual(tier, expected, "cas '\(vector.label)'")
        }
    }

    /// Garde e2ee explicite (workshop §4.4, en plus du rejeu générique
    /// ci-dessus) : incapable + e2ee + consentement ⇒ `.deterministic`,
    /// jamais `.serverAgent`, quel que soit le consentement.
    func test_resolveAssistTier_e2eeIncapable_neverReturnsServerAgent() {
        let consenting = ReadingModeOrchestrator.AssistTierInput(
            deviceCapability: false,
            encryptionMode: .e2ee,
            userConsent: true,
            conversationType: .direct
        )
        let refusing = ReadingModeOrchestrator.AssistTierInput(
            deviceCapability: false,
            encryptionMode: .e2ee,
            userConsent: false,
            conversationType: .direct
        )

        XCTAssertEqual(ReadingModeOrchestrator.resolveAssistTier(consenting), .deterministic)
        XCTAssertEqual(ReadingModeOrchestrator.resolveAssistTier(refusing), .deterministic)
    }
}
