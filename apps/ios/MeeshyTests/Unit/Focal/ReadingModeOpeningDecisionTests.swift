import XCTest
import MeeshySDK
@testable import Meeshy

/// **La liste et le fil rendent la même décision d'ouverture** (#11213).
///
/// L'aperçu d'appui long d'une conversation se dessine dans le mode de lecture
/// que le fil ouvrirait (décision #11204). Le fil décide par
/// `ReadingModeController` ; la liste décidait à sa façon
/// (`LentilleReadingModeContext.decision`, sans la règle de rendu iOS ni le
/// compte de membres), si bien qu'un collant « Bulles » ou des modes coupés
/// donnaient deux faces différentes pour une même conversation. Les deux
/// chemins consomment désormais UNE loi, `ReadingModeController.openingDecision`.
@MainActor
final class ReadingModeOpeningDecisionTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func makeConversation(
        type: Conversation.ConversationType = .group,
        unreadCount: Int = 0,
        memberCount: Int = 3
    ) -> Conversation {
        var conversation = Conversation(
            id: "c-11213", identifier: "c-11213", type: type, title: "Test",
            lastMessageAt: now, createdAt: now, updatedAt: now
        )
        conversation.userState.unreadCount = unreadCount
        conversation.memberCount = memberCount
        return conversation
    }

    /// Le fil tel que `ConversationView.init` le construit : mêmes capacités,
    /// même drapeau, même magasin.
    private func threadDecision(
        for conversation: Conversation,
        identity: ConversationViewerIdentity,
        isFlagEnabled: Bool,
        store: FocalReadingModePreferenceStoring
    ) -> ReadingModeOrchestrator.OrchestratorDecision {
        let capabilities = ReadingModeOrchestrator.resolveCapabilities(.init(
            identity: identity.readingModeIdentity,
            isFlagEnabled: isFlagEnabled,
            isRiverFlagEnabled: false,
            conversationType: ConversationViewRules.readingModeConversationType(for: conversation.type),
            activeParticipantCount: conversation.memberCount
        ))
        let fixedNow = now
        return ReadingModeController(
            conversationId: conversation.id,
            scope: identity.scope,
            unreadCount: conversation.userState.unreadCount,
            capabilities: capabilities,
            isFlagEnabled: isFlagEnabled,
            store: store,
            now: { fixedNow }
        ).decision
    }

    private func listDecision(
        for conversation: Conversation,
        identity: ConversationViewerIdentity,
        isFlagEnabled: Bool,
        store: FocalReadingModePreferenceStoring
    ) -> ReadingModeOrchestrator.OrchestratorDecision {
        LentilleReadingModeContext.openingDecision(
            for: conversation,
            identity: identity,
            isFlagEnabled: isFlagEnabled,
            isRiverFlagEnabled: false,
            store: store,
            now: now
        )
    }

    private func assertSameDecision(
        conversation: Conversation,
        identity: ConversationViewerIdentity = .registered(userId: "u1"),
        isFlagEnabled: Bool,
        sticky: ConversationReadingMode? = nil,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let store = OpeningDecisionStore()
        store.stubbedMode = sticky
        XCTAssertEqual(
            listDecision(for: conversation, identity: identity, isFlagEnabled: isFlagEnabled, store: store),
            threadDecision(for: conversation, identity: identity, isFlagEnabled: isFlagEnabled, store: store),
            file: file, line: line
        )
    }

    // MARK: - La liste et le fil, cas par cas

    func test_openingDecision_flagOn_matchesTheThread() {
        assertSameDecision(conversation: makeConversation(), isFlagEnabled: true)
    }

    func test_openingDecision_flagOff_matchesTheThread() {
        assertSameDecision(conversation: makeConversation(), isFlagEnabled: false)
    }

    func test_openingDecision_stickyBubbles_matchesTheThread() {
        assertSameDecision(conversation: makeConversation(), isFlagEnabled: true, sticky: .bubbles)
    }

    func test_openingDecision_unreadOverCap_matchesTheThread() {
        assertSameDecision(
            conversation: makeConversation(unreadCount: ReadingModeOrchestrator.unreadCap + 1),
            isFlagEnabled: true
        )
    }

    func test_openingDecision_guest_matchesTheThread() {
        assertSameDecision(
            conversation: makeConversation(unreadCount: ReadingModeOrchestrator.unreadCap + 1),
            identity: .anonymous(participantId: "p-guest"),
            isFlagEnabled: true
        )
    }

    // MARK: - Témoins discriminants : la règle de rendu iOS est bien appliquée

    /// La loi partagée rabat un collant « Bulles » drapeau ON ; la règle de
    /// rendu iOS le garde. Sans elle, la liste montrerait des rangées plates
    /// pendant que le fil s'ouvre en bulles.
    func test_openingDecision_stickyBubblesFlagOn_isRenderedBubbles() {
        let store = OpeningDecisionStore()
        store.stubbedMode = .bubbles

        let decision = listDecision(for: makeConversation(), identity: .registered(userId: "u1"), isFlagEnabled: true, store: store)

        XCTAssertEqual(decision.mode, .bubbles)
        XCTAssertEqual(decision.reason, .sticky)
    }

    /// Modes coupés : iOS ouvre en Script (#6482), jamais en Bulles.
    func test_openingDecision_flagOff_isScript() {
        let decision = listDecision(
            for: makeConversation(), identity: .registered(userId: "u1"), isFlagEnabled: false, store: OpeningDecisionStore()
        )

        XCTAssertEqual(decision.mode, .script)
        XCTAssertEqual(decision.reason, .flagDisabled)
    }

    // MARK: - Le contrôleur consomme la même loi

    func test_controllerInit_isTheOpeningDecision() {
        let store = OpeningDecisionStore()
        store.stubbedMode = .bubbles
        let capabilities = ReadingModeOrchestrator.resolveCapabilities(.init(
            identity: .init(isAnonymous: false), isFlagEnabled: true, conversationType: .group, activeParticipantCount: 2
        ))

        let opening = ReadingModeController.openingDecision(
            conversationId: "c1", scope: .registered(userId: "u1"), unreadCount: 0,
            capabilities: capabilities, isFlagEnabled: true, store: store, now: now
        )
        let fixedNow = now
        let controller = ReadingModeController(
            conversationId: "c1", scope: .registered(userId: "u1"), unreadCount: 0,
            capabilities: capabilities, isFlagEnabled: true, store: store, now: { fixedNow }
        )

        XCTAssertEqual(controller.decision, opening)
    }

    /// Le Résumé vivant et la Rivière ne montrent pas le fil : l'aperçu, qui
    /// montre des messages, s'y pose en Script — `landing`, la loi de « Aller
    /// au message ».
    func test_previewMode_unreadOverCap_landsOnScript() {
        let conversation = makeConversation(unreadCount: ReadingModeOrchestrator.unreadCap + 1)

        let mode = LentilleReadingModeContext.previewMode(
            for: conversation, identity: .registered(userId: "u1"), isFlagEnabled: true,
            isRiverFlagEnabled: false, store: OpeningDecisionStore(), now: now
        )

        XCTAssertEqual(mode, .script)
    }

    func test_previewMode_stickyBubbles_isBubbles() {
        let store = OpeningDecisionStore()
        store.stubbedMode = .bubbles

        let mode = LentilleReadingModeContext.previewMode(
            for: makeConversation(), identity: .registered(userId: "u1"), isFlagEnabled: true,
            isRiverFlagEnabled: false, store: store, now: now
        )

        XCTAssertEqual(mode, .bubbles)
    }

    /// `select` / `resetToAuto` recalculent par la MÊME loi que l'ouverture.
    func test_recompute_afterSelect_followsTheOpeningDecision() {
        let store = OpeningDecisionStore()
        let capabilities = ReadingModeOrchestrator.resolveCapabilities(.init(
            identity: .init(isAnonymous: false), isFlagEnabled: true, conversationType: .group, activeParticipantCount: 2
        ))
        let fixedNow = now
        let controller = ReadingModeController(
            conversationId: "c1", scope: .registered(userId: "u1"), unreadCount: 0,
            capabilities: capabilities, isFlagEnabled: true, store: store, now: { fixedNow }
        )

        controller.select(.bubbles)

        XCTAssertEqual(controller.decision, ReadingModeController.openingDecision(
            conversationId: "c1", scope: .registered(userId: "u1"), unreadCount: 0,
            capabilities: capabilities, isFlagEnabled: true, store: store, now: now
        ))
        XCTAssertEqual(controller.mode, .bubbles)
    }

    // MARK: - Les entrées du fil ne divergent pas de celles de la liste

    /// Les témoins ci-dessus reconstruisent le fil comme `ConversationView.init`
    /// le construit. Si l'écran change l'une de ses entrées — le drapeau, la
    /// Rivière, le compte de membres —, la liste et le fil divergeraient sans
    /// que rien ne rougisse : cette garde lit la source de l'écran.
    func test_conversationViewInit_feedsTheInputsTheListMirrors() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.conversationViewSource())
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        for expected in [
            "let isFlagEnabled = MeeshyFeatureFlags.isReadingModesEnabled",
            "isRiverFlagEnabled: LentilleFeatureFlag.isRiviereModeEnabled",
            "activeParticipantCount: conversation?.memberCount ?? 0",
            "scope: identity.scope",
            "unreadCount: conversation?.userState.unreadCount ?? 0"
        ] {
            XCTAssertTrue(code.contains(expected), "ConversationView.init a changé d'entrée : « \(expected) » — mettre à jour LentilleReadingModeContext.openingDecision")
        }
    }
}

private nonisolated final class OpeningDecisionStore: FocalReadingModePreferenceStoring {
    var stubbedMode: ConversationReadingMode?
    var stubbedLastOpenedAt: Date?

    func mode(for conversationId: String, scope: ReadingModePreferenceScope) -> ConversationReadingMode? { stubbedMode }

    func setMode(_ mode: ConversationReadingMode?, for conversationId: String, scope: ReadingModePreferenceScope) {
        stubbedMode = mode
    }

    func lastOpenedAt(for conversationId: String, scope: ReadingModePreferenceScope) -> Date? { stubbedLastOpenedAt }

    func noteOpened(_ conversationId: String, scope: ReadingModePreferenceScope, at date: Date) {
        stubbedLastOpenedAt = date
    }
}
