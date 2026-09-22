import XCTest
import Combine
@testable import MeeshySDK

/// #7350 (I-2) — fermer une conversation lui redonne ce qui reste VRAIMENT
/// non lu. Pendant l'affichage le moteur montre 0 (le lecteur la regarde) ;
/// avant ce lot, ce 0 était aussi daté d'une frontière de lecture posée à
/// l'ouverture, et survivait à la fermeture : 99 non-lus, 5 vus, liste à 0
/// pendant que le serveur disait 94.
final class ConversationUnreadRestoreOnCloseTests: XCTestCase {

    private var engine: ConversationSyncEngine!
    private var mockMessageSocket: MockMessageSocket!

    override func setUp() {
        super.setUp()
        mockMessageSocket = MockMessageSocket()
        engine = ConversationSyncEngine(
            cache: .shared,
            conversationService: MockConversationService(),
            messageService: MockMessageService(),
            messageSocket: mockMessageSocket,
            socialSocket: MockSocialSocket(),
            api: MockAPIClient(),
            syncDelta: MockSyncDeltaMuet()
        )
    }

    private func seed(_ id: String, unread: Int) async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        let conversation = MeeshyConversation(id: id, identifier: "test-\(id)", type: .direct, unreadCount: unread)
        try? await CacheCoordinator.shared.conversations.save([conversation], for: "list")
        await engine.startSocketRelay()
        mockMessageSocket.unreadUpdated.send(UnreadUpdateEvent(conversationId: id, unreadCount: unread))
        try? await Task.sleep(nanoseconds: 150_000_000)
    }

    private func cachedRow(_ id: String) async -> MeeshyConversation? {
        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        return cached.first { $0.id == id }
    }

    func test_close_afterPartialRead_restoresTheRemainingCount() async {
        await seed("restore-partial", unread: 99)
        engine.setCurrentlyOpenConversation("restore-partial")
        try? await Task.sleep(nanoseconds: 150_000_000)
        engine.noteUnreadRemaining("restore-partial", 94)

        engine.setCurrentlyOpenConversation(nil)
        try? await Task.sleep(nanoseconds: 200_000_000)

        let row = await cachedRow("restore-partial")
        XCTAssertEqual(row?.userState.unreadCount, 94, "99 non-lus, 5 affichés ⇒ 94")
        XCTAssertNil(row?.userState.lastReadAt, "ouvrir n'a posé aucune frontière de lecture")
        XCTAssertEqual(engine.totalConversationsUnreadValue, 94)
    }

    func test_close_withNothingRead_restoresTheOpeningCount() async {
        await seed("restore-none", unread: 12)
        engine.setCurrentlyOpenConversation("restore-none")
        try? await Task.sleep(nanoseconds: 150_000_000)

        engine.setCurrentlyOpenConversation(nil)
        try? await Task.sleep(nanoseconds: 200_000_000)

        let row = await cachedRow("restore-none")
        XCTAssertEqual(row?.userState.unreadCount, 12)
    }

    func test_close_afterACompleteRead_staysAtZero() async {
        await seed("restore-full", unread: 7)
        engine.setCurrentlyOpenConversation("restore-full")
        try? await Task.sleep(nanoseconds: 150_000_000)
        await engine.markConversationReadLocally("restore-full")

        engine.setCurrentlyOpenConversation(nil)
        try? await Task.sleep(nanoseconds: 200_000_000)

        let row = await cachedRow("restore-full")
        XCTAssertEqual(row?.userState.unreadCount, 0)
        XCTAssertNotNil(row?.userState.lastReadAt, "une lecture RÉELLE garde sa frontière")
    }

    func test_switchingToAnotherConversation_restoresThePreviousOne() async {
        await seed("restore-switch-a", unread: 20)
        engine.setCurrentlyOpenConversation("restore-switch-a")
        try? await Task.sleep(nanoseconds: 150_000_000)
        engine.noteUnreadRemaining("restore-switch-a", 15)

        engine.setCurrentlyOpenConversation("restore-switch-b")
        try? await Task.sleep(nanoseconds: 200_000_000)

        let row = await cachedRow("restore-switch-a")
        XCTAssertEqual(row?.userState.unreadCount, 15)
    }

    /// Un message arrive PENDANT l'affichage sans être vu : le serveur compte 1,
    /// la ligne montre 0 tant que l'écran est ouvert — et doit montrer 1 à sa
    /// fermeture. Sans quoi la liste dit 0 pendant que le badge, qui suit le
    /// serveur, compte la conversation.
    func test_close_restoresTheCountTheServerServedWhileOpen() async {
        await seed("restore-served", unread: 0)
        engine.setCurrentlyOpenConversation("restore-served")
        try? await Task.sleep(nanoseconds: 150_000_000)
        mockMessageSocket.unreadUpdated.send(UnreadUpdateEvent(conversationId: "restore-served", unreadCount: 1))
        try? await Task.sleep(nanoseconds: 150_000_000)
        let whileOpen = await cachedRow("restore-served")
        XCTAssertEqual(whileOpen?.userState.unreadCount, 0, "l'écran affiché reste à 0")

        engine.setCurrentlyOpenConversation(nil)
        try? await Task.sleep(nanoseconds: 200_000_000)

        let row = await cachedRow("restore-served")
        XCTAssertEqual(row?.userState.unreadCount, 1, "le message arrivé sans être vu reste non lu")
    }

    func test_noteForAConversationThatIsNoLongerOpen_isIgnored() async {
        await seed("restore-stale", unread: 9)
        engine.setCurrentlyOpenConversation("restore-stale")
        try? await Task.sleep(nanoseconds: 150_000_000)
        engine.setCurrentlyOpenConversation(nil)
        try? await Task.sleep(nanoseconds: 200_000_000)

        engine.noteUnreadRemaining("restore-stale", 1)
        try? await Task.sleep(nanoseconds: 100_000_000)

        let row = await cachedRow("restore-stale")
        XCTAssertEqual(row?.userState.unreadCount, 9)
    }
}
