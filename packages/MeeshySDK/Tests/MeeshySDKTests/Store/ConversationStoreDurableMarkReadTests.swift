import XCTest
@testable import MeeshySDK

/// ios-systeme-4 (#19104) — **« Marquer comme lu » depuis la bannière doit survivre au réseau coupé.**
///
/// Le geste de bannière ne faisait qu'un POST nu : hors réseau, la ligne passait lue sur l'iPhone
/// (frontière locale), le serveur ne l'apprenait jamais, et le `aps.badge` du push suivant
/// rallumait l'icône. `markReadDurably` passe par la file persistante du store — la même que
/// celle de la liste — et rejoue au retour du réseau.
final class ConversationStoreDurableMarkReadTests: XCTestCase {

    private func makeStore(
        lifecycle: MockLifecycleWriter = MockLifecycleWriter(),
        cache: MockCacheReading = MockCacheReading()
    ) -> (ConversationStore, MockLifecycleWriter, ConversationStateOutbox) {
        let outboxPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("durable-markread-outbox-\(UUID().uuidString).db").path
        let outbox = ConversationStateOutbox(dbPath: outboxPath)
        let store = ConversationStore(
            preferenceService: MockPreferenceWriter(),
            conversationService: lifecycle,
            outbox: outbox,
            cache: cache
        )
        return (store, lifecycle, outbox)
    }

    private func makeConv(id: String = "conv-1", unreadCount: Int = 3) -> MeeshyConversation {
        MeeshyConversation(
            id: id,
            identifier: id,
            type: .direct,
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000),
            userState: ConversationUserState(unreadCount: unreadCount, version: 5)
        )
    }

    func test_markReadDurably_offline_keepsTheMarkInTheOutboxForReplay() async {
        let lifecycle = MockLifecycleWriter()
        lifecycle.errorToThrow = MeeshyError.network(.noConnection)
        let (store, _, outbox) = makeStore(lifecycle: lifecycle)
        await store.hydrate(makeConv())

        let taken = await store.markReadDurably("conv-1")

        XCTAssertTrue(taken, "le store a pris le geste en charge : l'appelant ne doit pas poster une seconde fois")
        let pending = await outbox.allPending()
        XCTAssertEqual(pending.map(\.mutation), [.markAsRead])
        XCTAssertEqual(pending.map(\.convId), ["conv-1"])
        XCTAssertEqual(lifecycle.markReadCount, 1, "une seule tentative réseau, pas de double POST")
    }

    func test_markReadDurably_thenFlushOnceOnline_replaysOnceAndEmptiesTheOutbox() async {
        let lifecycle = MockLifecycleWriter()
        lifecycle.errorToThrow = MeeshyError.network(.noConnection)
        let (store, _, outbox) = makeStore(lifecycle: lifecycle)
        await store.hydrate(makeConv())
        _ = await store.markReadDurably("conv-1")

        lifecycle.errorToThrow = nil
        await store.flushOutbox()

        XCTAssertEqual(lifecycle.markReadCount, 2, "la tentative hors ligne puis UN rejeu")
        let pending = await outbox.allPending()
        XCTAssertTrue(pending.isEmpty)
    }

    func test_markReadDurably_online_postsOnceAndClearsTheLocalUnread() async {
        let (store, lifecycle, outbox) = makeStore()
        await store.hydrate(makeConv(unreadCount: 4))

        let taken = await store.markReadDurably("conv-1")

        XCTAssertTrue(taken)
        XCTAssertEqual(lifecycle.markReadCount, 1)
        let unread = await store.conversation(id: "conv-1")?.userState.unreadCount
        XCTAssertEqual(unread, 0)
        let pending = await outbox.allPending()
        XCTAssertTrue(pending.isEmpty)
    }

    func test_markReadDurably_coldLaunch_hydratesTheRowFromTheCacheFirst() async {
        let cache = MockCacheReading()
        cache.stubbed = .fresh([makeConv()], age: 10)
        let lifecycle = MockLifecycleWriter()
        lifecycle.errorToThrow = MeeshyError.network(.noConnection)
        let (store, _, outbox) = makeStore(lifecycle: lifecycle, cache: cache)

        let taken = await store.markReadDurably("conv-1")

        XCTAssertTrue(taken, "lancement à froid en arrière-plan : le store n'est pas hydraté, le cache le sert")
        let pending = await outbox.allPending()
        XCTAssertEqual(pending.map(\.mutation), [.markAsRead])
    }

    func test_markReadDurably_conversationAbsentFromStoreAndCache_declinesSoTheCallerCanPostDirectly() async {
        let (store, lifecycle, outbox) = makeStore()

        let taken = await store.markReadDurably("conv-inconnue")

        XCTAssertFalse(taken)
        XCTAssertEqual(lifecycle.markReadCount, 0)
        let pending = await outbox.allPending()
        XCTAssertTrue(pending.isEmpty)
    }

    func test_markReadDurably_serverRefusal_isNotRetriedByTheCaller() async {
        let lifecycle = MockLifecycleWriter()
        lifecycle.errorToThrow = MeeshyError.server(statusCode: 404, message: "Not found")
        let (store, _, outbox) = makeStore(lifecycle: lifecycle)
        await store.hydrate(makeConv(unreadCount: 2))

        let taken = await store.markReadDurably("conv-1")

        XCTAssertTrue(taken, "un 4xx se rejouerait à l'identique : pas de second POST direct")
        let pending = await outbox.allPending()
        XCTAssertTrue(pending.isEmpty)
        let unread = await store.conversation(id: "conv-1")?.userState.unreadCount
        XCTAssertEqual(unread, 2, "refus permanent : le retour arrière du store s'applique")
    }
}
