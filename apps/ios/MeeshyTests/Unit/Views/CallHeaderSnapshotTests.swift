import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// LOT-10 — le bouton d'appel de l'en-tête ne lit plus qu'un instantané
/// `Equatable` de l'état d'appel : il ne se redessine plus à chaque
/// `@Published` de `CallManager` et ne réveille plus la pile d'appel.
@MainActor
final class CallHeaderSnapshotTests: XCTestCase {

    private final class Counter { var value = 0 }

    private func makeStore(
        states: CurrentValueSubject<CallState, Never> = CurrentValueSubject(.idle),
        conversationIds: CurrentValueSubject<String?, Never> = CurrentValueSubject(nil)
    ) -> CallHeaderSnapshotStore {
        CallHeaderSnapshotStore(
            states: states.eraseToAnyPublisher(),
            conversationIds: conversationIds.eraseToAnyPublisher()
        )
    }

    private func session(id: String = "call-1", conversationId: String = "c1") -> ActiveCallSession {
        ActiveCallSession(id: id, conversationId: conversationId, mode: "video", status: "active", participants: [])
    }

    func test_store_withoutCallManager_publishesIdle_andNeverWakesCallStack() {
        let counter = Counter()
        let host = CallManagerHost(factory: {
            counter.value += 1
            return CallManager.shared
        })

        let store = CallHeaderSnapshotStore.live(host: host)

        XCTAssertEqual(store.snapshot, .idle)
        XCTAssertEqual(counter.value, 0, "Lire l'état d'appel pour l'en-tête ne doit pas construire la pile d'appel.")
        XCTAssertNil(host.manager)
    }

    func test_store_ignoresCallStateTicksThatKeepTheSameActivity() {
        let states = CurrentValueSubject<CallState, Never>(.idle)
        let ids = CurrentValueSubject<String?, Never>(nil)
        let store = makeStore(states: states, conversationIds: ids)
        var emitted: [CallHeaderSnapshot] = []
        let subscription = store.$snapshot.sink { emitted.append($0) }

        ids.send("c1")
        states.send(.ringing(isOutgoing: true))
        states.send(.offering)
        states.send(.connecting)
        states.send(.connected)
        states.send(.reconnecting(attempt: 1))
        states.send(.connected)

        XCTAssertEqual(emitted, [.idle, CallHeaderSnapshot(isActive: true, conversationId: "c1")])
        subscription.cancel()
    }

    func test_store_emitsWhenCallEnds_orConversationChanges() {
        let states = CurrentValueSubject<CallState, Never>(.idle)
        let ids = CurrentValueSubject<String?, Never>("c1")
        let store = makeStore(states: states, conversationIds: ids)

        states.send(.connected)
        XCTAssertEqual(store.snapshot, CallHeaderSnapshot(isActive: true, conversationId: "c1"))

        ids.send("c2")
        XCTAssertEqual(store.snapshot, CallHeaderSnapshot(isActive: true, conversationId: "c2"))

        states.send(.ended(reason: .local))
        XCTAssertEqual(store.snapshot, .idle)
        XCTAssertFalse(store.snapshot.isActive)
    }

    func test_showsReturnIndicator() {
        XCTAssertFalse(CallHeaderSnapshot.idle.showsReturnIndicator(for: "c1"))
        XCTAssertTrue(CallHeaderSnapshot(isActive: true, conversationId: nil).showsReturnIndicator(for: "c1"))
        XCTAssertTrue(CallHeaderSnapshot(isActive: true, conversationId: "c1").showsReturnIndicator(for: "c1"))
        XCTAssertFalse(CallHeaderSnapshot(isActive: true, conversationId: "c2").showsReturnIndicator(for: "c1"))
    }

    func test_presentation_resolve() {
        let here = CallHeaderSnapshot(isActive: true, conversationId: "c1")
        let elsewhere = CallHeaderSnapshot(isActive: true, conversationId: "c2")
        let reconciled = session()

        XCTAssertEqual(
            CallHeaderPresentation.resolve(snapshot: elsewhere, reconciled: nil, canStart: true, conversationId: "c1"),
            .none
        )
        XCTAssertEqual(
            CallHeaderPresentation.resolve(snapshot: here, reconciled: nil, canStart: true, conversationId: "c1"),
            .returnToCall
        )
        XCTAssertEqual(
            CallHeaderPresentation.resolve(snapshot: .idle, reconciled: reconciled, canStart: true, conversationId: "c1"),
            .rejoin(reconciled)
        )
        XCTAssertEqual(
            CallHeaderPresentation.resolve(snapshot: .idle, reconciled: nil, canStart: false, conversationId: "c1"),
            .none
        )
        XCTAssertEqual(
            CallHeaderPresentation.resolve(snapshot: .idle, reconciled: nil, canStart: true, conversationId: "c1"),
            .start
        )
    }

    func test_reconcile_isSkipped_whenLocalCallActive() {
        XCTAssertFalse(CallHeaderPresentation.shouldReconcile(snapshot: CallHeaderSnapshot(isActive: true, conversationId: "c1")))
        XCTAssertTrue(CallHeaderPresentation.shouldReconcile(snapshot: .idle))
    }

    func test_snapshot_isEquatableValue() {
        XCTAssertEqual(
            CallHeaderSnapshot(isActive: true, conversationId: "c1"),
            CallHeaderSnapshot(isActive: true, conversationId: "c1")
        )
        XCTAssertNotEqual(
            CallHeaderSnapshot(isActive: true, conversationId: "c1"),
            CallHeaderSnapshot(isActive: true, conversationId: "c2")
        )
        XCTAssertLessThanOrEqual(MemoryLayout<CallHeaderSnapshot>.size, 32)
    }
}
