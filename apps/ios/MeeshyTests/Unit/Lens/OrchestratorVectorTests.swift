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

    /// AMENDEMENT S1 (REV-3/B3) : `current` devient FAILLIBLE (`null` = compte
    /// inconnu, jamais « zéro ») et la raison gagne son discriminant
    /// `riverReason`. Le schéma JSON reste rétro-compatible pour tout ce que
    /// cette suite lisait déjà (`threshold` inchangé, `current` toujours
    /// présent quand il est connu) — seule s'ajoute une clé, et `current`
    /// accepte désormais `null`.
    private struct VectorRiverEligibilityReason: Decodable {
        let threshold: Int
        let current: Int?
        let riverReason: String
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
                current: raw.riverEligibilityReason.current,
                riverReason: try riverReason(raw.riverEligibilityReason.riverReason, label: label)
            )
        )
    }

    private func riverReason(
        _ raw: String,
        label: String
    ) throws -> ReadingModeOrchestrator.RiverEligibilityReasonKind {
        try XCTUnwrap(
            ReadingModeOrchestrator.RiverEligibilityReasonKind(rawValue: raw),
            "riverReason inconnue '\(raw)' — cas '\(label)'"
        )
    }

    private func conversationType(
        _ raw: String,
        label: String
    ) throws -> ReadingModeOrchestrator.ConversationType {
        try XCTUnwrap(
            ReadingModeOrchestrator.ConversationType(rawValue: raw),
            "conversationType inconnu '\(raw)' — cas '\(label)'"
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

    // =========================================================================
    // MARK: - C-012 `resolveCapabilities` — vecteurs de l'amendement S1 (REV-3/B3)
    // =========================================================================
    //
    // RE-PREUVE : `resolveCapabilities` était la seule loi de
    // `packages/shared/utils/reading-modes.ts` SANS fichier de vecteurs
    // (`fixtures/reading-modes/` portait accent, assist-tier, bridge,
    // focus-curve, orchestrator, scroll-activity, sections, sort — et rien
    // pour les capacités ; `orchestrator.vectors.json` n'en porte que comme
    // ENTRÉE figée). L'amendement S1 lui en donne un :
    // `capabilities.vectors.json`, généré en EXÉCUTANT la loi TS (C-023) et
    // rejoué ici. Même dossier de ressources que les vecteurs d'orchestrateur
    // (`MeeshyTests.resources` → `../../packages/shared/fixtures`,
    // `type: folder`) : AUCUNE modification de `project.yml` n'est nécessaire,
    // le dossier entier étant déjà embarqué.

    private struct CapabilitiesVectorCase: Decodable {
        let label: String
        let input: CapabilitiesVectorInput
        let expected: VectorCapabilities

        enum CodingKeys: String, CodingKey {
            case label = "_label"
            case input
            case expected
        }
    }

    private struct CapabilitiesVectorInput: Decodable {
        let identity: VectorIdentity
        let isFlagEnabled: Bool
        /// Optionnel côté TS (`isRiverFlagEnabled?: boolean`, absent ⇒ `false`).
        let isRiverFlagEnabled: Bool?
        let conversationType: String
        /// `null` en JSON ⇒ `nil` : compte d'actifs INCONNU (amendement S1),
        /// jamais « zéro ».
        let activeParticipantCount: Int?
    }

    private struct VectorIdentity: Decodable {
        let isAnonymous: Bool
    }

    private static func loadCapabilitiesVectors() throws -> [CapabilitiesVectorCase] {
        guard let url = Bundle(for: OrchestratorVectorTests.self).url(
            forResource: "capabilities.vectors",
            withExtension: "json",
            subdirectory: "fixtures/reading-modes"
        ) else {
            XCTFail("""
                capabilities.vectors.json introuvable dans le bundle de tests sous \
                `fixtures/reading-modes/`. Le dossier `../../packages/shared/fixtures` est déjà \
                embarqué (type: folder) pour orchestrator.vectors.json — un fichier manquant \
                signale une fixture non commitée, pas un câblage à refaire.
                """)
            return []
        }
        let data = try Data(contentsOf: url)
        let cases = try JSONDecoder().decode([CapabilitiesVectorCase].self, from: data)
        XCTAssertFalse(
            cases.isEmpty,
            "ZÉRO cas chargé — une boucle `for` sur un tableau vide passe sans rien prouver (leçon 257)."
        )
        return cases
    }

    func test_resolveCapabilities_matchesAllVectors() throws {
        let cases = try Self.loadCapabilitiesVectors()

        for vector in cases {
            let input = ReadingModeOrchestrator.ResolveCapabilitiesInput(
                identity: ReadingModeOrchestrator.ReadingModeIdentity(
                    isAnonymous: vector.input.identity.isAnonymous
                ),
                isFlagEnabled: vector.input.isFlagEnabled,
                isRiverFlagEnabled: vector.input.isRiverFlagEnabled ?? false,
                conversationType: try conversationType(vector.input.conversationType, label: vector.label),
                activeParticipantCount: vector.input.activeParticipantCount
            )

            let actual = ReadingModeOrchestrator.resolveCapabilities(input)
            let expected = try capabilities(vector.expected, label: vector.label)

            XCTAssertEqual(actual.availableModes, expected.availableModes, "availableModes — cas '\(vector.label)'")
            XCTAssertEqual(actual.riverEligible, expected.riverEligible, "riverEligible — cas '\(vector.label)'")
            XCTAssertEqual(
                actual.riverEligibilityReason, expected.riverEligibilityReason,
                "riverEligibilityReason — cas '\(vector.label)'"
            )
        }
    }

    /// Le jeu de vecteurs doit EXERCER les trois raisons ET porter au moins un
    /// compte inconnu — sinon un fichier amputé passerait au vert sans plus
    /// rien prouver de l'amendement (leçon 257 : un vert silencieux est un
    /// faux vert).
    func test_capabilitiesVectors_exerciseAllThreeRiverReasons_andAnUnknownCount() throws {
        let cases = try Self.loadCapabilitiesVectors()

        let reasons = Set(cases.map(\.expected.riverEligibilityReason.riverReason))
        XCTAssertEqual(
            reasons, ["neverEligible", "belowThreshold", "eligible"],
            "Les trois raisons de l'amendement S1 doivent toutes être couvertes par les vecteurs."
        )

        let unknownCount = cases.filter { $0.input.activeParticipantCount == nil }
        XCTAssertFalse(unknownCount.isEmpty, "Aucun cas à compte INCONNU — la moitié de l'amendement n'est pas prouvée.")
        for vector in unknownCount {
            XCTAssertNil(
                vector.expected.riverEligibilityReason.current,
                "Un compte inconnu ne doit JAMAIS ressortir en nombre — cas '\(vector.label)'."
            )
            XCTAssertFalse(vector.expected.riverEligible, "Un compte inconnu ne rend jamais éligible — cas '\(vector.label)'.")
        }

        let directHighCount = cases.filter {
            $0.input.conversationType == "direct" && ($0.input.activeParticipantCount ?? 0) >= 5
        }
        XCTAssertFalse(
            directHighCount.isEmpty,
            "Aucun cas `direct` AU-DESSUS du seuil — sans lui, `neverEligible` pourrait n'être " +
            "qu'un synonyme de « sous le seuil » (leçon 266)."
        )
        for vector in directHighCount {
            XCTAssertEqual(
                vector.expected.riverEligibilityReason.riverReason, "neverEligible",
                "Le compte ne renverse jamais `direct` — cas '\(vector.label)'."
            )
        }
    }
}
