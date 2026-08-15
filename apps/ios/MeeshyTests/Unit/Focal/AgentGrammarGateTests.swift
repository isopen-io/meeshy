import XCTest
@testable import Meeshy

/// F-089 (WS-10) — grammaire pointillée : garde source (`agent_grammar` OFF
/// ⇒ aucune surface agent rendue, aucun texte fabriqué dans le code) +
/// résolution pure de `AgentAuthoredStyle`.
final class AgentGrammarGateTests: XCTestCase {

    private func makeIsolatedDefaults() -> UserDefaults {
        UserDefaults(suiteName: "AgentGrammarGateTests-\(UUID().uuidString)")!
    }

    // MARK: - `isAgentGrammarEnabled` — OFF par défaut, résolution injectable

    func test_isAgentGrammarEnabled_injectable_defaultsToFalse() {
        let defaults = makeIsolatedDefaults()
        XCTAssertFalse(MeeshyFeatureFlags.isAgentGrammarEnabled(defaults: defaults, environment: [:]))
    }

    func test_isAgentGrammarEnabled_injectable_userDefaultsTrue_returnsTrue() {
        let defaults = makeIsolatedDefaults()
        defaults.set(true, forKey: "meeshy.flag.agent_grammar")
        XCTAssertTrue(MeeshyFeatureFlags.isAgentGrammarEnabled(defaults: defaults, environment: [:]))
    }

    func test_isAgentGrammarEnabled_injectable_envOverridePrimes() {
        let defaults = makeIsolatedDefaults()
        defaults.set(true, forKey: "meeshy.flag.agent_grammar")
        XCTAssertFalse(MeeshyFeatureFlags.isAgentGrammarEnabled(defaults: defaults, environment: ["MEESHY_FLAG_AGENT_GRAMMAR": "0"]))
    }

    func test_isAgentGrammarEnabled_injectable_envOverrideForcesOn() {
        let defaults = makeIsolatedDefaults()
        XCTAssertTrue(MeeshyFeatureFlags.isAgentGrammarEnabled(defaults: defaults, environment: ["MEESHY_FLAG_AGENT_GRAMMAR": "1"]))
    }

    func test_isAgentGrammarEnabled_independentFromReadingModesFlag() {
        let defaults = makeIsolatedDefaults()
        defaults.set(true, forKey: LentilleFeatureFlag.readingModes.userDefaultsKey)
        XCTAssertFalse(
            MeeshyFeatureFlags.isAgentGrammarEnabled(defaults: defaults, environment: [:]),
            "agent_grammar doit rester indépendant de reading_modes — activer l'un n'active jamais l'autre"
        )
    }

    // MARK: - `AgentAuthoredStyle.resolve` — flag OFF ⇒ rendu identique à un message humain

    func test_resolve_flagOff_agentAuthoredTrue_isStillHuman() {
        let descriptor = AgentAuthoredStyle.resolve(isAgentAuthored: true, isAgentGrammarEnabled: false)
        XCTAssertEqual(descriptor, .human)
        XCTAssertFalse(descriptor.showsDashedRing)
        XCTAssertFalse(descriptor.showsSpark)
    }

    func test_resolve_flagOn_agentAuthoredFalse_isHuman() {
        let descriptor = AgentAuthoredStyle.resolve(isAgentAuthored: false, isAgentGrammarEnabled: true)
        XCTAssertEqual(descriptor, .human)
    }

    func test_resolve_flagOn_agentAuthoredTrue_showsDashedRingAndSpark() {
        let descriptor = AgentAuthoredStyle.resolve(isAgentAuthored: true, isAgentGrammarEnabled: true)
        XCTAssertTrue(descriptor.showsDashedRing)
        XCTAssertTrue(descriptor.showsSpark)
    }

    func test_resolve_flagOff_agentAuthoredFalse_isHuman() {
        XCTAssertEqual(AgentAuthoredStyle.resolve(isAgentAuthored: false, isAgentGrammarEnabled: false), .human)
    }

    // MARK: - Cotes pointillées — 1.5 / 14, via FocalMetrics uniquement (garde R15)

    func test_dashedGrammarCotes_matchFocalMetricsAgent() {
        XCTAssertEqual(FocalMetrics.Agent.borderWidth, 1.5)
        XCTAssertEqual(FocalMetrics.Agent.radius, 14)
    }

    // MARK: - Garde source : aucun texte de suggestion fabriqué dans WS-10

    private func source(_ fileName: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Focal/Agent/\(fileName)")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private static let agentFiles = ["NullAgentAssistProvider.swift", "AgentAuthoredStyle.swift", "FocalBridgeRow.swift"]

    /// Aucune chaîne littérale de plus de 20 caractères — la limite du
    /// critère §WS-10 littéral. Une clé passée en argument `localized:` est
    /// EXEMPTÉE (c'est une clé i18n, jamais du texte affiché en dur).
    func test_agentFiles_containNoLongLiteralStringOutsideLocalizationKeys() throws {
        let stringLiteralPattern = try NSRegularExpression(pattern: #""([^"\\]|\\.)*""#)

        for fileName in Self.agentFiles {
            let raw = try source(fileName)
            let stripped = AppSourceGuard.stripComments(raw)
            let nsRange = NSRange(stripped.startIndex..<stripped.endIndex, in: stripped)
            let matches = stringLiteralPattern.matches(in: stripped, range: nsRange)

            for match in matches {
                guard let range = Range(match.range, in: stripped) else { continue }
                let literal = String(stripped[range])
                let contentLength = literal.count - 2 // sans les guillemets

                // Exemption : littéral immédiatement précédé de `localized:`
                // (clé i18n, jamais du texte affiché).
                let prefixStart = stripped.index(range.lowerBound, offsetBy: -12, limitedBy: stripped.startIndex) ?? stripped.startIndex
                let prefix = stripped[prefixStart..<range.lowerBound]
                let isLocalizationKey = prefix.contains("localized:")

                XCTAssertTrue(
                    contentLength <= 20 || isLocalizationKey,
                    "\(fileName) contient une chaîne littérale de \(contentLength) caractères hors clé de localisation : \(literal) — aucun texte de suggestion ne doit être fabriqué en dur (contrat §WS-10)"
                )
            }
        }
    }

    func test_nullAgentAssistProvider_neverReferencesAssistEndpointStrings() throws {
        let stripped = AppSourceGuard.stripComments(try source("NullAgentAssistProvider.swift"))
        for forbidden in ["assist:suggestion", "assist:summary-patch", "assist:actions", "assist:episode"] {
            XCTAssertFalse(stripped.contains(forbidden), "\(forbidden) n'existe nulle part côté serveur — ne doit apparaître dans aucune chaîne de ce fichier")
        }
    }
}
