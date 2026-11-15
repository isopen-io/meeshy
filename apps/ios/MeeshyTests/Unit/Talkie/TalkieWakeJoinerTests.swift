import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// Réveillé par un talkie (#17143) : le push lève la socket, et `talkie:join` part UNE fois dès qu'elle est connectée,
/// tant que la passerelle a encore quelque chose à rejouer.
@MainActor
final class TalkieWakeJoinerTests: XCTestCase {

    final class FakeEmitter: TalkieEmitting, @unchecked Sendable {
        var isConnected = false
        var joins: [String] = []

        func start(toUserId: String) async -> TalkieStartVerdict { .refused(.failed) }
        func sendChunk(talkieId: String, seq: Int, capturedAt: Date, data: Data) {}
        func end(talkieId: String) {}
        func join(talkieId: String) { joins.append(talkieId) }
    }

    final class Clock: @unchecked Sendable {
        var now = Date(timeIntervalSince1970: 1_800_000_000)
    }

    private struct Rig {
        let sut: TalkieWakeJoiner
        let emitter: FakeEmitter
        let connected: PassthroughSubject<Bool, Never>
        let connects: () -> Int
    }

    private final class Counter: @unchecked Sendable { var value = 0 }

    private func makeRig(clock: Clock = Clock()) -> Rig {
        let emitter = FakeEmitter()
        let connected = PassthroughSubject<Bool, Never>()
        let counter = Counter()
        let sut = TalkieWakeJoiner(
            emitter: emitter,
            connected: connected.eraseToAnyPublisher(),
            connect: { counter.value += 1 },
            now: { clock.now }
        )
        return Rig(sut: sut, emitter: emitter, connected: connected, connects: { counter.value })
    }

    private func push(_ id: String = "aaaaaaaaaaaaaaaaaaaaaaaa") -> TalkieWakePush {
        TalkieWakePush(talkieId: id, fromUserId: "bob", fromUserName: "Bob", voiceURL: nil)
    }

    func test_wake_withoutSocket_connects_thenJoinsOnceConnected() {
        let rig = makeRig()
        rig.sut.wake(push())

        XCTAssertEqual(rig.connects(), 1)
        XCTAssertTrue(rig.emitter.joins.isEmpty)
        XCTAssertEqual(rig.sut.waiting, ["aaaaaaaaaaaaaaaaaaaaaaaa"])

        rig.emitter.isConnected = true
        rig.connected.send(true)

        XCTAssertEqual(rig.emitter.joins, ["aaaaaaaaaaaaaaaaaaaaaaaa"])
        XCTAssertTrue(rig.sut.waiting.isEmpty)
    }

    func test_wake_withSocketUp_joinsAtOnce_withoutReconnecting() {
        let rig = makeRig()
        rig.emitter.isConnected = true
        rig.sut.wake(push())

        XCTAssertEqual(rig.emitter.joins, ["aaaaaaaaaaaaaaaaaaaaaaaa"])
        XCTAssertEqual(rig.connects(), 0)
    }

    func test_aDuplicatePush_joinsNothingMore() {
        let rig = makeRig()
        rig.emitter.isConnected = true
        rig.sut.wake(push())
        rig.sut.wake(push())
        rig.connected.send(true)

        XCTAssertEqual(rig.emitter.joins, ["aaaaaaaaaaaaaaaaaaaaaaaa"])
    }

    func test_aWakePastTheCatchUpWindow_joinsNothing() {
        let clock = Clock()
        let rig = makeRig(clock: clock)
        rig.sut.wake(push())
        clock.now = clock.now.addingTimeInterval(TalkieWakeContract.catchUpWindow + 1)

        rig.emitter.isConnected = true
        rig.connected.send(true)

        XCTAssertTrue(rig.emitter.joins.isEmpty)
        XCTAssertTrue(rig.sut.waiting.isEmpty)
    }

    func test_aDisconnectionSignal_joinsNothing() {
        let rig = makeRig()
        rig.sut.wake(push())
        rig.connected.send(false)

        XCTAssertTrue(rig.emitter.joins.isEmpty)
        XCTAssertEqual(rig.sut.waiting, ["aaaaaaaaaaaaaaaaaaaaaaaa"])
    }
}
