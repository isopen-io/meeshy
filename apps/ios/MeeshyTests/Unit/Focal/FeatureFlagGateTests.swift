import XCTest
@testable import Meeshy

/// F-080 (WS-1) — `MeeshyFeatureFlags.isReadingModesEnabled` : délègue à
/// `LentilleFeatureFlag.readingModes` (M-046, déjà couvert par
/// `LentilleFlagGateTests`, y compris la cascade vers `BetaFeaturesPreference`
/// — I-075, second amendement 2026-08-16) plutôt que de dupliquer la
/// résolution `UserDefaults`/`ProcessInfo`. Ce fichier ne re-teste PAS la
/// matrice complète (déjà verte côté `LentilleFlagGateTests`) — il prouve la
/// DÉLÉGATION (témoin discriminant unique : la cascade bêta, absente d'ici
/// AVANT l'amendement), et le critère d'acceptation §WS-1 : « drapeau OFF
/// ⇒ toute décision rend `.bubbles` » (le mode de repli, contrat
/// §3.1 `.bubbleLegacy` — RE-PREUVE : rawValue identique, nom de cas réel
/// `.bubbles` sur la loi gelée).
///
/// **I-075 RETIRÉ le 2026-08-18 (décision produit)** — la cascade bêta
/// SUBSISTE (donc la délégation reste ce que ce fichier prouve), mais son
/// étage 3 n'est plus consulté que si la préférence bêta est EXPLICITEMENT
/// exprimée : absence de toute clé ⇒ OFF. Un seul témoin de délégation
/// changeait de verdict, il est retourné et documenté sur place ; les
/// témoins « env prime » et « clé explicite » sont INCHANGÉS.
@MainActor
final class FeatureFlagGateTests: XCTestCase {

    private func makeIsolatedDefaults() -> UserDefaults {
        UserDefaults(suiteName: "FeatureFlagGateTests-\(UUID().uuidString)")!
    }

    // MARK: - Délégation, pas de duplication

    /// I-075 RETIRÉ le 2026-08-18 (décision produit) — la délégation porte
    /// désormais le RETRAIT : `defaults`/`environment` fraîches ⇒ `false`.
    ///
    /// AVANT (2026-08-16 → 2026-08-18), ce témoin s'appelait
    /// `…_defaultsToTrue_viaBetaCascade` et affirmait `XCTAssertTrue` sur ce
    /// décor EXACT, au motif que `readingModes` repliait sur
    /// `BetaFeaturesPreference.isEnabled` (défaut ON) quand sa propre clé
    /// n'avait jamais été posée. L'étage bêta n'est plus consulté que si la
    /// préférence est EXPRIMÉE — ici elle ne l'est pas, donc OFF.
    ///
    /// La paire discriminante survit au retrait, mais elle est REDISTRIBUÉE :
    /// ce test-ci resterait vert même si `MeeshyFeatureFlags` recalculait sa
    /// propre résolution (`defaults.bool` rendrait `false` lui aussi). Ce
    /// sont `…_matchesUnderlyingFlagForSameInputs` (égalité stricte) et le
    /// témoin d'opt-in ci-dessous — que SEULE une vraie délégation peut
    /// satisfaire — qui referment l'échappatoire.
    func test_isReadingModesEnabled_injectable_defaultsToFalse_afterBetaCascadeWithdrawal() {
        let defaults = makeIsolatedDefaults()
        XCTAssertFalse(MeeshyFeatureFlags.isReadingModesEnabled(defaults: defaults, environment: [:]))
    }

    /// Témoin d'opt-in de la délégation : la bêta EXPLICITEMENT activée
    /// suffit encore à allumer les modes de lecture À TRAVERS
    /// `MeeshyFeatureFlags`. Discriminant vis-à-vis d'une implémentation qui
    /// aurait dupliqué la résolution en `defaults.bool(forKey:)` — celle-ci
    /// rendrait `false` ici, la clé `meeshy.flag.reading_modes` n'étant
    /// jamais posée.
    func test_isReadingModesEnabled_injectable_betaExplicitlyOn_returnsTrue() {
        let defaults = makeIsolatedDefaults()
        BetaFeaturesPreference.setEnabled(true, defaults: defaults)

        XCTAssertTrue(MeeshyFeatureFlags.isReadingModesEnabled(defaults: defaults, environment: [:]))
    }

    func test_isReadingModesEnabled_injectable_userDefaultsTrue_returnsTrue() {
        let defaults = makeIsolatedDefaults()
        defaults.set(true, forKey: LentilleFeatureFlag.readingModes.userDefaultsKey)

        XCTAssertTrue(MeeshyFeatureFlags.isReadingModesEnabled(defaults: defaults, environment: [:]))
    }

    func test_isReadingModesEnabled_injectable_envOverridePrimes() {
        let defaults = makeIsolatedDefaults()
        defaults.set(true, forKey: LentilleFeatureFlag.readingModes.userDefaultsKey)
        let environment = [LentilleFeatureFlag.readingModes.environmentKey: "0"]

        XCTAssertFalse(MeeshyFeatureFlags.isReadingModesEnabled(defaults: defaults, environment: environment))
    }

    func test_isReadingModesEnabled_injectable_matchesUnderlyingFlagForSameInputs() {
        let defaults = makeIsolatedDefaults()
        let environment = [LentilleFeatureFlag.readingModes.environmentKey: "1"]

        XCTAssertEqual(
            MeeshyFeatureFlags.isReadingModesEnabled(defaults: defaults, environment: environment),
            LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: environment)
        )
    }

    // MARK: - Flag OFF ⇒ toute décision rend le mode de repli (bit-à-bit identique à aujourd'hui)

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

    func test_flagDisabled_readingModeController_resolvesToBubbles() {
        let store = InMemoryPreferenceStoreStub()
        let capabilities = ReadingModeOrchestrator.resolveCapabilities(
            .init(identity: .init(isAnonymous: false), isFlagEnabled: false, conversationType: .group, activeParticipantCount: 3)
        )

        let controller = ReadingModeController(
            conversationId: "c1",
            scope: .registered(userId: "u1"),
            unreadCount: 0,
            capabilities: capabilities,
            isFlagEnabled: false,
            store: store
        )

        XCTAssertEqual(controller.mode, .bubbles)
        XCTAssertEqual(controller.decision.reason, .flagDisabled)
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
