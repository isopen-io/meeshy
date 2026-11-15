import XCTest
@testable import Meeshy

/// F-080 (WS-1) — `MeeshyFeatureFlags.isReadingModesEnabled` : délègue à
/// `LentilleFeatureFlag.readingModes` (matrice complète dans
/// `LentilleFlagGateTests`) plutôt que de dupliquer la résolution
/// `UserDefaults`/`ProcessInfo`. Ce fichier prouve la DÉLÉGATION, puis ce que
/// l'écran rend quand les modes de lecture sont coupés.
///
/// **Sortie de bêta (directive porteur du 2026-09-14, #6482).** Les modes de
/// lecture sont actifs par défaut. Coupés dans les Réglages, la loi partagée
/// rend toujours `.bubbles`/`.flagDisabled` (vecteurs TS↔Swift, inchangés) et
/// c'est la couche de rendu iOS (`ReadingModeController.renderDecision`) qui
/// ouvre la conversation en SCRIPT — le mode classique n'est plus Bulles.
@MainActor
final class FeatureFlagGateTests: XCTestCase {

    private func makeIsolatedDefaults() throws -> UserDefaults {
        try XCTUnwrap(UserDefaults(suiteName: "FeatureFlagGateTests-\(UUID().uuidString)"))
    }

    // MARK: - Délégation, pas de duplication

    /// Discriminant vis-à-vis d'une résolution dupliquée en
    /// `defaults.bool(forKey:)`, qui rendrait `false` sur ce décor vierge :
    /// seule la délégation voit le défaut ON.
    func test_isReadingModesEnabled_injectable_nothingWritten_returnsTrue() throws {
        let defaults = try makeIsolatedDefaults()

        XCTAssertTrue(MeeshyFeatureFlags.isReadingModesEnabled(defaults: defaults, environment: [:]))
    }

    func test_isReadingModesEnabled_injectable_ownKeyExplicitlyFalse_returnsFalse() throws {
        let defaults = try makeIsolatedDefaults()
        LentilleFeatureFlag.setEnabled(.readingModes, enabled: false, defaults: defaults)

        XCTAssertFalse(MeeshyFeatureFlags.isReadingModesEnabled(defaults: defaults, environment: [:]))
    }

    func test_isReadingModesEnabled_injectable_envOverridePrimes() throws {
        let defaults = try makeIsolatedDefaults()
        defaults.set(true, forKey: LentilleFeatureFlag.readingModes.userDefaultsKey)
        let environment = [LentilleFeatureFlag.readingModes.environmentKey: "0"]

        XCTAssertFalse(MeeshyFeatureFlags.isReadingModesEnabled(defaults: defaults, environment: environment))
    }

    func test_isReadingModesEnabled_injectable_matchesUnderlyingFlagForSameInputs() throws {
        let defaults = try makeIsolatedDefaults()
        let environment = [LentilleFeatureFlag.readingModes.environmentKey: "0"]

        XCTAssertEqual(
            MeeshyFeatureFlags.isReadingModesEnabled(defaults: defaults, environment: environment),
            LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: environment)
        )
    }

    // MARK: - Drapeau OFF — la LOI partagée rend Bulles (inchangée, vecteurs TS↔Swift)

    func test_flagDisabled_orchestratorDecision_alwaysResolvesToBubbles() {
        let capabilities = ReadingModeOrchestrator.resolveCapabilities(
            .init(
                identity: .init(isAnonymous: false),
                isFlagEnabled: false,
                conversationType: .direct,
                activeParticipantCount: 2
            )
        )
        let decision = ReadingModeOrchestrator.resolveOrchestratorDecision(
            .init(
                unreadCount: 999,
                lastOpenedAt: nil,
                now: Date(),
                stickyChoice: .focal,
                capabilities: capabilities,
                isFlagEnabled: false
            )
        )

        XCTAssertEqual(decision.mode, .bubbles)
        XCTAssertEqual(decision.reason, .flagDisabled)
    }

    // MARK: - Drapeau OFF — l'écran iOS rend Script (#6482)

    /// La raison de la loi est conservée : `.flagDisabled` dit à l'encoche que
    /// rien n'a été choisi ni décidé automatiquement.
    func test_flagDisabled_readingModeController_rendersScript_keepingTheLawReason() {
        let controller = ReadingModeController(
            conversationId: "c1",
            scope: .registered(userId: "u1"),
            unreadCount: 0,
            capabilities: flagDisabledCapabilities(),
            isFlagEnabled: false,
            store: InMemoryPreferenceStoreStub()
        )

        XCTAssertEqual(controller.mode, .script)
        XCTAssertEqual(controller.decision.reason, .flagDisabled)
    }

    /// Un choix collant `.bubbles` mémorisé quand les modes étaient actifs ne
    /// rouvre pas Bulles une fois les modes coupés : c'est le choix du mode de
    /// lecture lui-même qui est retiré, pas seulement son automatisme.
    func test_flagDisabled_stickyBubbles_stillRendersScript() {
        let store = InMemoryPreferenceStoreStub()
        store.setMode(.bubbles, for: "c1", scope: .registered(userId: "u1"))

        let controller = ReadingModeController(
            conversationId: "c1",
            scope: .registered(userId: "u1"),
            unreadCount: 3,
            capabilities: flagDisabledCapabilities(),
            isFlagEnabled: false,
            store: store
        )

        XCTAssertEqual(controller.mode, .script)
        XCTAssertEqual(controller.decision.reason, .flagDisabled)
    }

    private func flagDisabledCapabilities() -> ReadingModeOrchestrator.ReadingModeCapabilities {
        ReadingModeOrchestrator.resolveCapabilities(
            .init(identity: .init(isAnonymous: false), isFlagEnabled: false, conversationType: .group, activeParticipantCount: 3)
        )
    }
}

/// Double minimal en mémoire — pas `ReadingModePreferenceStore` réel, pour
/// isoler `ReadingModeController` de `UserDefaults` dans ce fichier.
/// `nonisolated` : le protocole l'exige (voir `FocalReadingModePreferenceStoring`).
private nonisolated final class InMemoryPreferenceStoreStub: FocalReadingModePreferenceStoring {
    private var modes: [String: ConversationReadingMode] = [:]
    private var lastOpened: [String: Date] = [:]

    private func key(_ conversationId: String, _ scope: ReadingModePreferenceScope) -> String {
        "\(scope.storageKey)_\(conversationId)"
    }

    func mode(for conversationId: String, scope: ReadingModePreferenceScope) -> ConversationReadingMode? {
        modes[key(conversationId, scope)]
    }

    func setMode(_ mode: ConversationReadingMode?, for conversationId: String, scope: ReadingModePreferenceScope) {
        modes[key(conversationId, scope)] = mode
    }

    func lastOpenedAt(for conversationId: String, scope: ReadingModePreferenceScope) -> Date? {
        lastOpened[key(conversationId, scope)]
    }

    func noteOpened(_ conversationId: String, scope: ReadingModePreferenceScope, at date: Date) {
        lastOpened[key(conversationId, scope)] = date
    }
}
