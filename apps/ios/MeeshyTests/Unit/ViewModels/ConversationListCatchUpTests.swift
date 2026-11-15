import XCTest
import Combine
@testable import Meeshy

/// #16457 — après un redémarrage, le delta du lancement à froid tombe sur un
/// réseau pas encore prêt et échoue. La première connexion du socket n'émet
/// pas `didReconnect` : sans cette règle, rien ne rejouait le rattrapage, et la
/// liste gardait les aperçus et les non-lus d'avant l'extinction.
@MainActor
final class ConversationListCatchUpTests: XCTestCase {

    private final class SyncSpy {
        var results: [Bool]
        private(set) var calls = 0
        init(results: [Bool]) { self.results = results }
        func sync() async -> Bool {
            calls += 1
            return results.isEmpty ? true : results.removeFirst()
        }
    }

    private func waitUntil(_ condition: () -> Bool) async {
        for _ in 0..<200 where !condition() {
            try? await Task.sleep(nanoseconds: 5_000_000)
        }
    }

    private func settle() async {
        for _ in 0..<5 { await Task.yield() }
        try? await Task.sleep(nanoseconds: 50_000_000)
    }

    func test_aFailedLaunchCatchUp_isReplayedWhenTheSocketFirstConnects() async {
        let spy = SyncSpy(results: [false, true])
        let catchUp = ConversationListCatchUp(sync: { await spy.sync() })
        let connected = CurrentValueSubject<Bool, Never>(false)
        let edge = catchUp.retriesOnRisingEdge(connected.eraseToAnyPublisher())

        await catchUp.run()
        connected.send(true)
        await waitUntil { spy.calls == 2 }

        XCTAssertEqual(spy.calls, 2, "le serveur répond : le rattrapage manqué au lancement repart")
        XCTAssertFalse(catchUp.isPending)
        edge.cancel()
    }

    func test_aSucceededLaunchCatchUp_isNotReplayedWhenTheSocketConnects() async {
        let spy = SyncSpy(results: [true])
        let catchUp = ConversationListCatchUp(sync: { await spy.sync() })
        let connected = CurrentValueSubject<Bool, Never>(false)
        let edge = catchUp.retriesOnRisingEdge(connected.eraseToAnyPublisher())

        await catchUp.run()
        connected.send(true)
        await settle()

        XCTAssertEqual(spy.calls, 1, "un rattrapage réussi ne se double pas")
        edge.cancel()
    }

    func test_theSocketConnectingWhileTheLaunchCatchUpRuns_replaysItIfItFails() async {
        let gate = AsyncStream<Void>.makeStream()
        var calls = 0
        let catchUp = ConversationListCatchUp(sync: {
            calls += 1
            if calls == 1 {
                for await _ in gate.stream { break }
                return false
            }
            return true
        })
        let connected = CurrentValueSubject<Bool, Never>(false)
        let edge = catchUp.retriesOnRisingEdge(connected.eraseToAnyPublisher())

        let launch = Task { await catchUp.run() }
        await waitUntil { calls == 1 }
        connected.send(true)
        await settle()
        XCTAssertEqual(calls, 1, "aucun second rattrapage en parallèle du premier")

        gate.continuation.yield()
        await launch.value
        await waitUntil { calls == 2 }

        XCTAssertEqual(calls, 2, "le front montant survenu pendant l'échec n'est pas perdu")
        XCTAssertFalse(catchUp.isPending)
        edge.cancel()
    }

    func test_aStillFailingCatchUp_isReplayedOnTheNextRisingEdgeOnly() async {
        let spy = SyncSpy(results: [false, false, true])
        let catchUp = ConversationListCatchUp(sync: { await spy.sync() })
        let connected = CurrentValueSubject<Bool, Never>(false)
        let edge = catchUp.retriesOnRisingEdge(connected.eraseToAnyPublisher())

        await catchUp.run()
        connected.send(true)
        await waitUntil { spy.calls == 2 }
        connected.send(true)
        await settle()
        XCTAssertEqual(spy.calls, 2, "rester connecté ne relance rien")

        connected.send(false)
        connected.send(true)
        await waitUntil { spy.calls == 3 }

        XCTAssertEqual(spy.calls, 3)
        XCTAssertFalse(catchUp.isPending)
        edge.cancel()
    }
}
