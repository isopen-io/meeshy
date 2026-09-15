import XCTest
@testable import Meeshy

/// Bout en bout « drapeau `reading_modes` → capacités → `ReadingModeController` »,
/// SANS littéral `Bool` en dur : la vraie cascade
/// `LentilleFeatureFlag.readingModes.isEnabled(defaults:environment:)` transite
/// jusqu'à la décision d'ouverture d'une conversation.
///
/// **Sortie de bêta (directive porteur du 2026-09-14, #6482).** Une
/// installation neuve a les modes de lecture ACTIFS : la loi partagée décide
/// Focal/Résumé/Rivière avec les données réelles. Les modes coupés dans les
/// Réglages ouvrent la conversation en SCRIPT (le mode classique n'est plus
/// Bulles), sans puce de mode, et la Rivière devient injoignable même si son
/// propre interrupteur reste allumé — c'est pourquoi sa rangée des Réglages
/// est grisée.
///
/// Ce fichier remplace `BetaFeaturesReadingModesIntegrationTests`, dont le nom
/// désignait un programme bêta qui n'existe plus.
///
/// **Re-preuve §0** : `MessageListViewController.swift` et
/// `MessageListView.swift` ne mentionnent NI `LentilleFeatureFlag` NI
/// `MeeshyFeatureFlags` (hors grammaire agent) — ils consomment uniquement la
/// prop `readingMode` DÉJÀ décidée par `ConversationView.init` →
/// `ReadingModeController`.
@MainActor
final class ReadingModesFlagIntegrationTests: XCTestCase {

    private func makeIsolatedDefaults() throws -> UserDefaults {
        try XCTUnwrap(UserDefaults(suiteName: "ReadingModesFlagIntegrationTests-\(UUID().uuidString)"))
    }

    private func makeCapabilities(
        defaults: UserDefaults,
        activeParticipantCount: Int = 3
    ) -> ReadingModeOrchestrator.ReadingModeCapabilities {
        ReadingModeOrchestrator.resolveCapabilities(
            .init(
                identity: .init(isAnonymous: false),
                isFlagEnabled: LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]),
                isRiverFlagEnabled: LentilleFeatureFlag.riviereMode.isEnabled(defaults: defaults, environment: [:]),
                conversationType: .group,
                activeParticipantCount: activeParticipantCount
            )
        )
    }

    private func makeController(
        defaults: UserDefaults,
        unreadCount: Int,
        store: InMemoryStore = InMemoryStore(),
        now: Date = Date()
    ) -> ReadingModeController {
        ReadingModeController(
            conversationId: "c1",
            scope: .registered(userId: "u1"),
            unreadCount: unreadCount,
            capabilities: makeCapabilities(defaults: defaults),
            isFlagEnabled: LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]),
            store: store,
            now: { now }
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

    // MARK: - Installation neuve ⇒ modes de lecture actifs (la loi décide)

    /// Rien n'est posé. Peu de non-lus, lecteur présent (ouvert il y a une
    /// minute) ⇒ branche par défaut de la loi : `.focal`, rendu tel quel.
    func test_freshInstall_fewUnread_readerPresent_autoResolvesToFocal() throws {
        let defaults = try makeIsolatedDefaults()
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let store = InMemoryStore()
        store.stubbedLastOpenedAt = now.addingTimeInterval(-60)

        let controller = makeController(defaults: defaults, unreadCount: 3, store: store, now: now)

        XCTAssertEqual(controller.mode, .focal, "Installation neuve ⇒ modes de lecture ACTIFS (directive 2026-09-14, #6482).")
        XCTAssertEqual(controller.decision.reason, .default)
    }

    func test_freshInstall_manyUnread_autoResolvesToSummary() throws {
        let defaults = try makeIsolatedDefaults()

        let controller = makeController(defaults: defaults, unreadCount: 26)

        XCTAssertEqual(controller.mode, .summary)
        XCTAssertEqual(controller.decision.reason, .unreadOverCap)
    }

    /// Choix collant `.bubbles`, modes actifs : la loi partagée le rabat,
    /// la règle de rendu iOS le rend comme un CHOIX.
    func test_freshInstall_stickyBubbles_isRenderedAsAChoice_notClampedByTheLaw() throws {
        let defaults = try makeIsolatedDefaults()
        XCTAssertFalse(
            makeCapabilities(defaults: defaults).availableModes.contains(.bubbles),
            "Prérequis DISCRIMINANT : drapeau ON, `.bubbles` n'est pas au catalogue — seule la règle de rendu iOS peut rendre `.bubbles` ici."
        )
        let store = InMemoryStore()
        store.stubbedMode = .bubbles

        let controller = makeController(defaults: defaults, unreadCount: 3, store: store)

        XCTAssertEqual(controller.mode, .bubbles)
        XCTAssertEqual(controller.decision.reason, .sticky)
    }

    // MARK: - Modes de lecture coupés ⇒ Script, sans puce

    func test_readingModesSwitchedOff_controllerRendersScript() throws {
        let defaults = try makeIsolatedDefaults()
        LentilleFeatureFlag.setEnabled(.readingModes, enabled: false, defaults: defaults)

        let controller = makeController(defaults: defaults, unreadCount: 3)

        XCTAssertEqual(controller.mode, .script, "Modes de lecture coupés ⇒ le mode classique est Script, plus Bulles (#6482).")
        XCTAssertEqual(controller.decision.reason, .flagDisabled)
    }

    func test_readingModesSwitchedOff_manyUnread_stillRendersScript() throws {
        let defaults = try makeIsolatedDefaults()
        LentilleFeatureFlag.setEnabled(.readingModes, enabled: false, defaults: defaults)

        let controller = makeController(defaults: defaults, unreadCount: 26)

        XCTAssertEqual(controller.mode, .script)
        XCTAssertEqual(controller.decision.reason, .flagDisabled)
    }

    /// La puce de mode de `ConversationView` n'apparaît que si un mode AUTRE
    /// que Bulles est ouvert par les capacités : modes coupés, elle disparaît.
    func test_readingModesSwitchedOff_noModeBeyondBubblesIsOffered_soTheModeChipStaysHidden() throws {
        let defaults = try makeIsolatedDefaults()
        LentilleFeatureFlag.setEnabled(.readingModes, enabled: false, defaults: defaults)

        XCTAssertFalse(makeCapabilities(defaults: defaults).availableModes.contains(where: { $0 != .bubbles }))
    }

    // MARK: - La Rivière dépend des modes de lecture

    func test_riverSwitchOn_readingModesOn_eligibleGroup_offersRiver() throws {
        let defaults = try makeIsolatedDefaults()

        XCTAssertTrue(makeCapabilities(defaults: defaults, activeParticipantCount: 6).availableModes.contains(.river))
    }

    /// Paire discriminante avec le témoin ci-dessus : seul l'interrupteur des
    /// modes de lecture change, et la Rivière devient injoignable alors que
    /// son propre interrupteur reste allumé.
    func test_riverSwitchOn_readingModesOff_eligibleGroup_riverIsUnreachable() throws {
        let defaults = try makeIsolatedDefaults()
        LentilleFeatureFlag.setEnabled(.readingModes, enabled: false, defaults: defaults)
        XCTAssertTrue(LentilleFeatureFlag.riviereMode.isEnabled(defaults: defaults, environment: [:]))

        XCTAssertFalse(makeCapabilities(defaults: defaults, activeParticipantCount: 6).availableModes.contains(.river))
    }

    // MARK: - Re-preuve §0(c) — l'hôte de liste ne connaît pas le drapeau

    func test_messageListViewController_neverMentionsReadingModeFlagTypes() throws {
        let code = try source("MessageListViewController.swift")
        XCTAssertFalse(
            code.contains("LentilleFeatureFlag"),
            "MessageListViewController.swift ne doit JAMAIS mentionner LentilleFeatureFlag — l'hôte consomme uniquement `readingMode`, déjà décidé par ConversationView.init → ReadingModeController."
        )
        let strippedOfAgentGrammar = code
            .replacingOccurrences(of: "MeeshyFeatureFlags.isAgentGrammarEnabled", with: "")
            .replacingOccurrences(of: "MeeshyFeatureFlags.swift", with: "")
        XCTAssertFalse(
            strippedOfAgentGrammar.contains("MeeshyFeatureFlags"),
            "MessageListViewController.swift ne doit mentionner MeeshyFeatureFlags QUE via `isAgentGrammarEnabled` (R6-2)."
        )
    }

    func test_messageListView_neverMentionsReadingModeFlagTypes() throws {
        let code = try source("MessageListView.swift")
        for forbidden in ["LentilleFeatureFlag", "MeeshyFeatureFlags"] {
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
