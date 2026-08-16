import XCTest
@testable import Meeshy

/// I-075 — override ÉPHÉMÈRE `ReadingModeController.init(forcedMode:)` (item
/// « Focal (bêta) » du menu d'appui long de la liste, gardé par
/// `BetaFeaturesPreference.isEnabled`, préférence utilisateur défaut ON —
/// amendement produit 2026-08-16).
///
/// Trois garanties prouvées ICI, discriminantes (mêmes entrées, forcedMode
/// présent vs absent) :
/// 1. **Le forçage GAGNE toujours** — décision `.focal` quel que soit l'état
///    du drapeau `reading_modes`, de la préférence collante ou du compte de
///    non-lus (`OrchestratorDecisionInput` n'a que ces trois leviers plus le
///    catalogue — tous adverses ici).
/// 2. **`nil` ⇒ décision INCHANGÉE** — même témoin, mêmes entrées, sans
///    `forcedMode` : la loi `ReadingModeOrchestrator.resolveOrchestratorDecision`
///    (GELÉE) décide seule, comme avant ce lot.
/// 3. **Garde « aucune écriture »** — le forçage ne touche NI `setMode` NI
///    `noteOpened` du store de préférence. Étendue ici (plus stricte que
///    l'exigence produit) : NI `mode(for:)` NI `lastOpenedAt(for:)` ne sont
///    lus non plus — le court-circuit ne dépend d'AUCUN état du store
///    (docstring `ReadingModeController.forcedMode`).
///
/// Patron `FeatureFlagGateTests` (F-080) : store en mémoire, jamais
/// `UserDefaults.standard`.
@MainActor
final class ForcedReadingModeOverrideTests: XCTestCase {

    // MARK: - Décor

    /// Capacités quelconques, cohérentes avec un mode `.focal` disponible —
    /// non déterminantes pour le forçage (garantie 1 : même un catalogue qui
    /// n'inclut PAS `.focal` ne doit pas faire dévier la décision forcée,
    /// puisque le court-circuit ne consulte jamais `capabilities`).
    private func makeCapabilities(isFlagEnabled: Bool) -> ReadingModeOrchestrator.ReadingModeCapabilities {
        ReadingModeOrchestrator.resolveCapabilities(
            .init(
                identity: .init(isAnonymous: false),
                isFlagEnabled: isFlagEnabled,
                conversationType: .group,
                activeParticipantCount: 2
            )
        )
    }

    // MARK: - Garantie 1 : le forçage gagne, quel que soit l'état adverse

    /// Drapeau OFF (rendrait `.bubbles`/`.flagDisabled` sans forçage — RE-PREUVE
    /// `FeatureFlagGateTests.test_flagDisabled_readingModeController_resolvesToBubbles`).
    func test_forcedMode_winsOverFlagDisabled() {
        let store = RecordingPreferenceStoreSpy()
        let controller = ReadingModeController(
            conversationId: "c1",
            scope: .registered(userId: "u1"),
            unreadCount: 0,
            capabilities: makeCapabilities(isFlagEnabled: false),
            isFlagEnabled: false,
            forcedMode: .focal,
            store: store
        )

        XCTAssertEqual(controller.mode, .focal)
        XCTAssertEqual(controller.decision.mode, .focal)
    }

    /// Préférence collante adverse (`.script`, primerait normalement — RE-PREUVE
    /// `resolveOrchestratorDecision` branche 2) : le forçage l'emporte quand même.
    func test_forcedMode_winsOverAdverseStickyPreference() {
        let store = RecordingPreferenceStoreSpy()
        store.stubbedMode = .script

        let controller = ReadingModeController(
            conversationId: "c1",
            scope: .registered(userId: "u1"),
            unreadCount: 0,
            capabilities: makeCapabilities(isFlagEnabled: true),
            isFlagEnabled: true,
            forcedMode: .focal,
            store: store
        )

        XCTAssertEqual(controller.mode, .focal)
    }

    /// Non-lus au-dessus du plafond (rendrait `.summary`/`unread-over-cap`
    /// sans forçage — branche 3) : le forçage l'emporte.
    func test_forcedMode_winsOverUnreadOverCap() {
        let store = RecordingPreferenceStoreSpy()

        let controller = ReadingModeController(
            conversationId: "c1",
            scope: .registered(userId: "u1"),
            unreadCount: 999,
            capabilities: makeCapabilities(isFlagEnabled: true),
            isFlagEnabled: true,
            forcedMode: .focal,
            store: store
        )

        XCTAssertEqual(controller.mode, .focal)
    }

    // MARK: - Garantie 2 : `nil` ⇒ décision inchangée (témoin discriminant)

    /// Même décor que `test_forcedMode_winsOverFlagDisabled`, `forcedMode: nil` :
    /// la décision REDEVIENT celle de la loi normale (`.bubbles`/`flagDisabled`)
    /// — la preuve que le court-circuit, ôté, ne laisse AUCUN résidu.
    func test_nilForcedMode_leavesDecisionUnchanged_flagDisabledCase() {
        let store = RecordingPreferenceStoreSpy()
        let controller = ReadingModeController(
            conversationId: "c1",
            scope: .registered(userId: "u1"),
            unreadCount: 0,
            capabilities: makeCapabilities(isFlagEnabled: false),
            isFlagEnabled: false,
            store: store
        )

        XCTAssertEqual(controller.mode, .bubbles)
        XCTAssertEqual(controller.decision.reason, .flagDisabled)
    }

    /// Même décor que `test_forcedMode_winsOverAdverseStickyPreference`,
    /// `forcedMode: nil` : la préférence collante (`.script`) redevient
    /// déterminante — témoin discriminant direct (seule différence : la
    /// présence de `forcedMode`).
    func test_nilForcedMode_leavesDecisionUnchanged_stickyCase() {
        let store = RecordingPreferenceStoreSpy()
        store.stubbedMode = .script

        let controller = ReadingModeController(
            conversationId: "c1",
            scope: .registered(userId: "u1"),
            unreadCount: 0,
            capabilities: makeCapabilities(isFlagEnabled: true),
            isFlagEnabled: true,
            store: store
        )

        XCTAssertEqual(controller.mode, .script)
        XCTAssertEqual(controller.decision.reason, .sticky)
    }

    // MARK: - Garantie 3 : aucune écriture, aucune lecture du store

    func test_forcedMode_neverWritesToThePreferenceStore() {
        let store = RecordingPreferenceStoreSpy()

        _ = ReadingModeController(
            conversationId: "c1",
            scope: .registered(userId: "u1"),
            unreadCount: 0,
            capabilities: makeCapabilities(isFlagEnabled: true),
            isFlagEnabled: true,
            forcedMode: .focal,
            store: store
        )

        XCTAssertEqual(store.setModeCallCount, 0, "L'item « Focal (bêta) » ne doit écrire AUCUNE préférence collante — override éphémère, jamais persistant.")
        XCTAssertEqual(store.noteOpenedCallCount, 0, "L'item « Focal (bêta) » ne doit écrire AUCUN horodatage d'ouverture.")
    }

    /// Plus strict que l'exigence produit : `init(forcedMode:)` ne lit même
    /// pas le store — le court-circuit est total, pas seulement « sans
    /// écriture » (docstring `ReadingModeController.forcedMode`).
    func test_forcedMode_neverReadsFromThePreferenceStore() {
        let store = RecordingPreferenceStoreSpy()

        _ = ReadingModeController(
            conversationId: "c1",
            scope: .registered(userId: "u1"),
            unreadCount: 0,
            capabilities: makeCapabilities(isFlagEnabled: true),
            isFlagEnabled: true,
            forcedMode: .focal,
            store: store
        )

        XCTAssertEqual(store.modeReadCallCount, 0, "init(forcedMode:) ne doit pas lire mode(for:scope:) — court-circuit total.")
        XCTAssertEqual(store.lastOpenedAtReadCallCount, 0, "init(forcedMode:) ne doit pas lire lastOpenedAt(for:scope:) — court-circuit total.")
    }

    /// `nil` (chemin non forcé, existant) DOIT continuer à lire le store —
    /// sinon la garantie 3 serait une coïncidence du court-circuit et non une
    /// preuve qu'il est bien conditionné sur `forcedMode`.
    func test_nilForcedMode_stillReadsFromThePreferenceStore() {
        let store = RecordingPreferenceStoreSpy()

        _ = ReadingModeController(
            conversationId: "c1",
            scope: .registered(userId: "u1"),
            unreadCount: 0,
            capabilities: makeCapabilities(isFlagEnabled: true),
            isFlagEnabled: true,
            store: store
        )

        XCTAssertGreaterThan(store.modeReadCallCount, 0, "Le chemin non forcé doit lire la préférence collante — sans quoi la garantie 3 ne prouverait rien.")
    }
}

/// Double en mémoire qui COMPTE ses appels — jamais `UserDefaults.standard`
/// (même convention que `FeatureFlagGateTests.InMemoryPreferenceStoreStub`,
/// dupliqué ici plutôt que partagé : ce type est `private` à son fichier
/// d'origine). `nonisolated` : le protocole l'exige.
private nonisolated final class RecordingPreferenceStoreSpy: FocalReadingModePreferenceStoring {
    var stubbedMode: ConversationReadingMode?
    var stubbedLastOpenedAt: Date?

    private(set) var setModeCallCount = 0
    private(set) var noteOpenedCallCount = 0
    private(set) var modeReadCallCount = 0
    private(set) var lastOpenedAtReadCallCount = 0

    func mode(for conversationId: String, scope: ReadingModePreferenceScope) -> ConversationReadingMode? {
        modeReadCallCount += 1
        return stubbedMode
    }

    func setMode(_ mode: ConversationReadingMode?, for conversationId: String, scope: ReadingModePreferenceScope) {
        setModeCallCount += 1
        stubbedMode = mode
    }

    func lastOpenedAt(for conversationId: String, scope: ReadingModePreferenceScope) -> Date? {
        lastOpenedAtReadCallCount += 1
        return stubbedLastOpenedAt
    }

    func noteOpened(_ conversationId: String, scope: ReadingModePreferenceScope, at date: Date) {
        noteOpenedCallCount += 1
        stubbedLastOpenedAt = date
    }
}
