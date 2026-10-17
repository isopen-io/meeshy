import XCTest
import Combine
@testable import MeeshySDK

/// iPad multi-fenêtre : deux scènes, deux conversations à l'écran. Le moteur ne tenait qu'UNE conversation ouverte —
/// la seconde fenêtre remplaçait la première, qui se remettait à compter ses messages comme non lus pendant qu'on la
/// lisait, et sa fermeture tardive (deinit) ne fermait rien. Le moteur tient désormais un ENSEMBLE, compté par
/// conversation (la même peut être ouverte dans deux fenêtres), et rend son non-lu à CHAQUE conversation qu'on quitte.
final class ConversationSyncEngineOpenSetTests: XCTestCase {

    private var engine: ConversationSyncEngine!
    private var socket: MockMessageSocket!

    override func setUp() {
        super.setUp()
        socket = MockMessageSocket()
        engine = ConversationSyncEngine(
            cache: .shared,
            conversationService: MockConversationService(),
            messageService: MockMessageService(),
            messageSocket: socket,
            socialSocket: MockSocialSocket(),
            api: MockAPIClient(),
            syncDelta: MockSyncDeltaMuet()
        )
    }

    private func seed(_ rows: [(String, Int)]) async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        let conversations = rows.map { MeeshyConversation(id: $0.0, identifier: "t-\($0.0)", type: .direct, unreadCount: $0.1) }
        try? await CacheCoordinator.shared.conversations.save(conversations, for: "list")
        await engine.startSocketRelay()
        for (id, unread) in rows { socket.unreadUpdated.send(UnreadUpdateEvent(conversationId: id, unreadCount: unread)) }
        try? await Task.sleep(nanoseconds: 200_000_000)
    }

    private func row(_ id: String) async -> MeeshyConversation? {
        (await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []).first { $0.id == id }
    }

    func test_twoWindows_keepBothConversationsOpen_andOutOfTheAggregate() async {
        await seed([("ms-a", 5), ("ms-b", 7), ("ms-c", 2)])
        engine.openConversation("ms-a")
        engine.openConversation("ms-b")
        try? await Task.sleep(nanoseconds: 150_000_000)

        XCTAssertEqual(engine.openConversationIds, ["ms-a", "ms-b"])
        XCTAssertTrue(engine.isConversationOpen("ms-a"))
        XCTAssertTrue(engine.isConversationOpen("ms-b"))
        XCTAssertEqual(engine.totalConversationsUnreadValue, 2, "seule la conversation qu'aucune fenêtre n'affiche compte")
    }

    func test_closingOneWindow_restoresOnlyItsConversation() async {
        await seed([("ms-d", 9), ("ms-e", 4)])
        engine.openConversation("ms-d")
        engine.openConversation("ms-e")
        try? await Task.sleep(nanoseconds: 150_000_000)
        engine.noteUnreadRemaining("ms-d", 3)
        engine.noteUnreadRemaining("ms-e", 1)

        engine.closeConversation("ms-d")
        try? await Task.sleep(nanoseconds: 250_000_000)

        XCTAssertFalse(engine.isConversationOpen("ms-d"))
        XCTAssertTrue(engine.isConversationOpen("ms-e"), "l'autre fenêtre affiche toujours la sienne")
        let d = await row("ms-d")
        let e = await row("ms-e")
        XCTAssertEqual(d?.userState.unreadCount, 3, "la conversation quittée retrouve ce qui lui reste à lire")
        XCTAssertEqual(e?.userState.unreadCount, 0, "celle qu'on lit encore reste à zéro")
        XCTAssertEqual(engine.totalConversationsUnreadValue, 3)

        engine.closeConversation("ms-e")
        try? await Task.sleep(nanoseconds: 250_000_000)
        let eAfter = await row("ms-e")
        XCTAssertEqual(eAfter?.userState.unreadCount, 1, "son propre reste, pas celui de l'autre")
        XCTAssertEqual(engine.totalConversationsUnreadValue, 4)
    }

    func test_theSameConversationInTwoWindows_staysOpenUntilTheLastCloses() async {
        await seed([("ms-f", 6)])
        engine.openConversation("ms-f")
        engine.openConversation("ms-f")
        engine.closeConversation("ms-f")
        try? await Task.sleep(nanoseconds: 150_000_000)
        XCTAssertTrue(engine.isConversationOpen("ms-f"))
        engine.closeConversation("ms-f")
        XCTAssertFalse(engine.isConversationOpen("ms-f"))
    }

    /// Passage rapide A → B sur iPhone : l'ouverture de B précède le deinit de A. Fermer A ne touche pas B.
    func test_aLateCloseOfThePreviousConversation_leavesTheNewOneOpen() async {
        await seed([("ms-g", 1), ("ms-h", 8)])
        engine.openConversation("ms-g")
        engine.openConversation("ms-h")
        engine.closeConversation("ms-g")
        try? await Task.sleep(nanoseconds: 200_000_000)
        XCTAssertEqual(engine.openConversationIds, ["ms-h"])
        XCTAssertEqual(engine.currentlyOpenConversationId, "ms-h")
        let h = await row("ms-h")
        XCTAssertEqual(h?.userState.unreadCount, 0)
    }

    func test_aServerCount_forAnyOpenConversation_isServedAsZero() async {
        await seed([("ms-i", 0), ("ms-j", 0)])
        engine.openConversation("ms-i")
        engine.openConversation("ms-j")
        try? await Task.sleep(nanoseconds: 150_000_000)
        socket.unreadUpdated.send(UnreadUpdateEvent(conversationId: "ms-i", unreadCount: 6))
        try? await Task.sleep(nanoseconds: 250_000_000)
        let i = await row("ms-i")
        XCTAssertEqual(i?.userState.unreadCount, 0, "la fenêtre la moins récente lit aussi sa conversation")
    }

    func test_closingAConversationThatIsNotOpen_isANoOp() {
        engine.openConversation("ms-k")
        engine.closeConversation("ms-unknown")
        XCTAssertEqual(engine.openConversationIds, ["ms-k"])
    }

    func test_reconcile_zeroesEveryOpenConversation() {
        let a = MeeshyConversation(id: "r-a", identifier: "r-a", type: .direct, unreadCount: 3)
        let b = MeeshyConversation(id: "r-b", identifier: "r-b", type: .direct, unreadCount: 4)
        let c = MeeshyConversation(id: "r-c", identifier: "r-c", type: .direct, unreadCount: 5)
        let out = ConversationSyncEngine.reconcileUnread(incoming: [a, b, c], existing: [], openConversationIds: ["r-a", "r-b"])
        XCTAssertEqual(out.map(\.userState.unreadCount), [0, 0, 5])
    }
}
