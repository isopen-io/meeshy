import XCTest
@testable import Meeshy

/// I-075 (second amendement produit, 2026-08-16, point 5) — bout en bout
/// « préférence bêta → drapeau `reading_modes` → décision de l'orchestrateur »,
/// SANS littéral `Bool` manuel : contrairement à `FeatureFlagGateTests
/// .test_flagDisabled_readingModeController_resolvesToBubbles` (qui passe
/// `isFlagEnabled: false` en dur pour isoler la loi), ce fichier fait
/// TRANSITER la vraie cascade `LentilleFeatureFlag.readingModes
/// .isEnabled(defaults:environment:)` jusqu'à `ReadingModeController` — la
/// preuve que « activer les bêta » suffit à activer le système au TAP NORMAL
/// d'une conversation, sans site de montage supplémentaire.
///
/// **Re-preuve §0 (design imposé, point 2 du second amendement)** : les six
/// sites d'appel du pass de perspective (`MessageListViewController.swift`,
/// contrat §4.8, gardés par `FocalHostSourceGuardTests`) et `MessageListView
/// .swift` ne mentionnent NI `LentilleFeatureFlag` NI `BetaFeaturesPreference`
/// NI `MeeshyFeatureFlags` — ils consomment uniquement la prop `readingMode`
/// DÉJÀ décidée par `ConversationView.init` → `ReadingModeController`. Le
/// chemin normal liste stable → tap → `ConversationView` (RootView/
/// iPadRootView, `ConversationViewReadingModeSourceGuardTests`,
/// `FocalBetaPreviewNavigationSourceGuardTests`) est donc STRICTEMENT le
/// même, que la conversation vienne de la liste Lentille (`lentille_list`)
/// ou de la liste historique — ce drapeau ne gouverne QUE le CHROME de la
/// liste, jamais la décision de mode de lecture À L'OUVERTURE.
@MainActor
final class BetaFeaturesReadingModesIntegrationTests: XCTestCase {

    private func makeIsolatedDefaults() -> UserDefaults {
        UserDefaults(suiteName: "BetaFeaturesReadingModesIntegrationTests-\(UUID().uuidString)")!
    }

    private func makeCapabilities(isFlagEnabled: Bool) -> ReadingModeOrchestrator.ReadingModeCapabilities {
        ReadingModeOrchestrator.resolveCapabilities(
            .init(
                identity: .init(isAnonymous: false),
                isFlagEnabled: isFlagEnabled,
                conversationType: .group,
                activeParticipantCount: 3
            )
        )
    }

    /// Double en mémoire — patron `FeatureFlagGateTests.InMemoryPreferenceStoreStub`.
    private nonisolated final class InMemoryStore: FocalReadingModePreferenceStoring {
        var stubbedMode: ConversationReadingMode?
        var stubbedLastOpenedAt: Date?
        func mode(for conversationId: String, scope: ReadingModePreferenceScope) -> ConversationReadingMode? { stubbedMode }
        func setMode(_ mode: ConversationReadingMode?, for conversationId: String, scope: ReadingModePreferenceScope) { stubbedMode = mode }
        func lastOpenedAt(for conversationId: String, scope: ReadingModePreferenceScope) -> Date? { stubbedLastOpenedAt }
        func noteOpened(_ conversationId: String, scope: ReadingModePreferenceScope, at date: Date) { stubbedLastOpenedAt = date }
    }

    // MARK: - Bêta OFF ⇒ chemin historique bit-à-bit (témoin discriminant)

    /// Bêta explicitement coupée, aucune préférence — la cascade résout
    /// `readingModes` à `false`, et `ReadingModeController` rend `.bubbles`
    /// (chemin AVANT ce chantier tout entier) : le paramètre du système de
    /// modes de lecture est bien la BÊTA, pas un site nouveau.
    func test_betaOff_readingModesFlag_resolvesFalse_controllerRendersBubbles() {
        let defaults = makeIsolatedDefaults()
        BetaFeaturesPreference.setEnabled(false, defaults: defaults)

        let isFlagEnabled = LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:])
        XCTAssertFalse(isFlagEnabled, "Décor : la cascade doit résoudre FALSE avec la bêta coupée.")

        let controller = ReadingModeController(
            conversationId: "c1",
            scope: .registered(userId: "u1"),
            unreadCount: 0,
            capabilities: makeCapabilities(isFlagEnabled: isFlagEnabled),
            isFlagEnabled: isFlagEnabled,
            store: InMemoryStore()
        )

        XCTAssertEqual(controller.mode, .bubbles, "Bêta OFF ⇒ chemin historique bit-à-bit — .bubbles, comme avant ce chantier.")
        XCTAssertEqual(controller.decision.reason, .flagDisabled)
    }

    // MARK: - Bêta ON, aucune préférence sticky ⇒ AUTO (la loi gelée décide, données réelles)

    /// Bêta ON PAR DÉFAUT (rien n'est posé), aucune préférence collante,
    /// peu de non-lus, lecteur pas absent ⇒ la loi gelée rend sa branche
    /// PAR DÉFAUT : `.focal` (`clampFallbackMode`, `ReadingModeOrchestrator
    /// .swift`) — RE-PREUVE documentée au rapport final : le repli de la loi
    /// n'est PAS `.bubbles`, c'est `.focal`. Ce test le rend visible plutôt
    /// que de le supposer.
    func test_betaOn_noStickyPreference_fewUnread_readerPresent_autoResolvesToFocal() {
        let defaults = makeIsolatedDefaults()
        // Rien n'est posé : bêta reste à son défaut ON, la clé readingModes
        // n'a jamais été écrite.

        let isFlagEnabled = LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:])
        XCTAssertTrue(isFlagEnabled, "Décor : la cascade doit résoudre TRUE — bêta à son défaut ON, clé readingModes jamais posée.")

        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let store = InMemoryStore()
        // Lecteur PRÉSENT : ouvert il y a 1 minute, bien sous la fenêtre
        // d'absence de 24 h — sans ce décor, `lastOpenedAt == nil` (jamais
        // ouvert) vaudrait « absent » par défaut (`isReaderAbsent`), ce que
        // ce test ne veut PAS exercer (c'est le test suivant, branche
        // `unreadOverCap`, qui reste sous le plancher d'absence de toute
        // façon avec 26 non-lus > 25).
        store.stubbedLastOpenedAt = now.addingTimeInterval(-60)

        let controller = ReadingModeController(
            conversationId: "c1",
            scope: .registered(userId: "u1"),
            unreadCount: 3,
            capabilities: makeCapabilities(isFlagEnabled: isFlagEnabled),
            isFlagEnabled: isFlagEnabled,
            store: store,
            now: { now }
        )

        XCTAssertEqual(controller.mode, .focal, "AUTO, données réelles (peu de non-lus, pas d'absence) ⇒ branche par défaut de la loi gelée : .focal.")
        XCTAssertEqual(controller.decision.reason, .default)
    }

    /// Même décor, mais > 25 non-lus (rattrapage) ⇒ `.summary` — la branche
    /// « Résumé Vivant » de la loi, elle aussi accessible dès la bêta ON, sans
    /// site de montage supplémentaire.
    func test_betaOn_noStickyPreference_manyUnread_autoResolvesToSummary() {
        let defaults = makeIsolatedDefaults()
        let isFlagEnabled = LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:])
        XCTAssertTrue(isFlagEnabled)

        let controller = ReadingModeController(
            conversationId: "c1",
            scope: .registered(userId: "u1"),
            unreadCount: 26,
            capabilities: makeCapabilities(isFlagEnabled: isFlagEnabled),
            isFlagEnabled: isFlagEnabled,
            store: InMemoryStore()
        )

        XCTAssertEqual(controller.mode, .summary)
        XCTAssertEqual(controller.decision.reason, .unreadOverCap)
    }

    // MARK: - Re-preuve §0(c) — les 6 sites d'appel (§4.8) ne connaissent ni le drapeau ni la préférence

    func test_messageListViewController_neverMentionsFlagOrPreferenceTypes() throws {
        let code = try source("MessageListViewController.swift")
        for forbidden in ["LentilleFeatureFlag", "BetaFeaturesPreference", "MeeshyFeatureFlags"] {
            XCTAssertFalse(
                code.contains(forbidden),
                "MessageListViewController.swift ne doit JAMAIS mentionner \(forbidden) — les six sites d'appel du pass de perspective (§4.8, gardés par FocalHostSourceGuardTests) consomment uniquement `readingMode`, DÉJÀ décidé en amont par ConversationView.init → ReadingModeController. Le système de modes de lecture ne gagne aucun site de montage avec ce lot."
            )
        }
    }

    func test_messageListView_neverMentionsFlagOrPreferenceTypes() throws {
        let code = try source("MessageListView.swift")
        for forbidden in ["LentilleFeatureFlag", "BetaFeaturesPreference", "MeeshyFeatureFlags"] {
            XCTAssertFalse(
                code.contains(forbidden),
                "MessageListView.swift ne doit JAMAIS mentionner \(forbidden) — même raison que MessageListViewController."
            )
        }
    }

    private func source(_ fileName: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views/\(fileName)")
        return try String(contentsOf: url, encoding: .utf8)
    }
}
