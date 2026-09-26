import XCTest
@testable import Meeshy

/// #8133 — « Aller au message » ouvre le FIL : une ouverture qui porte un
/// message cible n'atterrit ni sur le Résumé vivant ni sur la Rivière, deux
/// hôtes qui ne montrent pas le fil et ne consomment pas le défilement vers
/// un message. Elle atterrit en Script ; un mode qui montre le fil (Bulles,
/// Focal, Script) est gardé tel quel.
@MainActor
final class JumpToMessageLandingTests: XCTestCase {

    private func makeCapabilities() -> ReadingModeOrchestrator.ReadingModeCapabilities {
        ReadingModeOrchestrator.resolveCapabilities(
            .init(identity: .init(isAnonymous: false), isFlagEnabled: true, conversationType: .group, activeParticipantCount: 2)
        )
    }

    private func makeController(
        unreadCount: Int = 0,
        sticky: ConversationReadingMode? = nil,
        landsOnMessage: Bool
    ) -> ReadingModeController {
        let store = InMemoryLandingStore()
        store.stubbedMode = sticky
        return ReadingModeController(
            conversationId: "c1",
            scope: .registered(userId: "u1"),
            unreadCount: unreadCount,
            capabilities: makeCapabilities(),
            isFlagEnabled: true,
            landsOnMessage: landsOnMessage,
            store: store
        )
    }

    func test_init_unreadOverCapWithoutJump_opensTheLiveSummary() {
        XCTAssertEqual(makeController(unreadCount: 999, landsOnMessage: false).mode, .summary,
                       "témoin discriminant : sans cible, la loi garde son Résumé vivant")
    }

    func test_init_unreadOverCapWithJump_landsOnScript() {
        XCTAssertEqual(makeController(unreadCount: 999, landsOnMessage: true).mode, .script)
    }

    func test_init_stickySummaryWithJump_landsOnScript() {
        XCTAssertEqual(makeController(sticky: .summary, landsOnMessage: true).mode, .script)
    }

    func test_init_stickyBubblesWithJump_keepsTheThreadModeTheReaderChose() {
        XCTAssertEqual(makeController(sticky: .bubbles, landsOnMessage: true).mode, .bubbles)
    }

    func test_landing_riverDecision_landsOnScriptAndKeepsItsReason() {
        let river = ReadingModeOrchestrator.OrchestratorDecision(mode: .river, reason: .sticky)

        let landed = ReadingModeController.landing(river)

        XCTAssertEqual(landed.mode, .script)
        XCTAssertEqual(landed.reason, .sticky)
    }

    func test_landing_focalDecision_isKept() {
        let focal = ReadingModeOrchestrator.OrchestratorDecision(mode: .focal, reason: .default)

        XCTAssertEqual(ReadingModeController.landing(focal).mode, .focal)
    }

    func test_select_afterAJump_takesTheLawBackForTheManualChoice() {
        let controller = makeController(unreadCount: 999, landsOnMessage: true)

        controller.select(.summary)

        XCTAssertEqual(controller.mode, .summary, "l'atterrissage ne verrouille que l'OUVERTURE, pas l'écran")
    }

    // MARK: - Le routeur dit à l'ouverture qu'elle vise un message

    private func makeConversation(id: String) -> Conversation {
        Conversation(id: id, identifier: id, type: .group, title: "Test", lastMessageAt: Date(), createdAt: Date(), updatedAt: Date())
    }

    func test_landsOnMessage_navigationWithHighlight_isTrueForThatConversationOnly() {
        let router = Router()

        router.navigateToConversation(makeConversation(id: "c-8133"), highlightMessageId: "m-1")

        XCTAssertTrue(router.landsOnMessage(in: "c-8133"))
        XCTAssertFalse(router.landsOnMessage(in: "c-other"), "un saut posé pour A ne fait pas atterrir B")
    }

    func test_landsOnMessage_plainNavigation_isFalse() {
        let router = Router()

        router.navigateToConversation(makeConversation(id: "c-8133"))

        XCTAssertFalse(router.landsOnMessage(in: "c-8133"))
    }
}

private nonisolated final class InMemoryLandingStore: FocalReadingModePreferenceStoring {
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
