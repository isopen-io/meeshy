import Combine
import XCTest
@testable import MeeshySDK

private final class TalkieRegistrar: SocketEventRegistering {
    private var receivers: [String: ([Any]) -> Void] = [:]

    func listen(_ event: String, _ receive: @escaping ([Any]) -> Void) {
        receivers[event] = receive
    }

    func deliver(_ event: String, _ payload: [String: Any]) {
        receivers[event]?([payload])
    }
}

private final class ArrivalLog: @unchecked Sendable {
    var items: [String] = []
}

/// `talkie:incoming`, `talkie:chunk` (binaire) et `talkie:ended`, sur la room `user:<id>` (#13935, #16673).
final class TalkieSocketEventsTests: XCTestCase {

    private func installed() -> TalkieRegistrar {
        let registrar = TalkieRegistrar()
        registrar.install(MessageSocketRoutes.all(for: .shared))
        return registrar
    }

    private func expectValue<P: Publisher>(
        of publisher: P,
        where matches: @escaping (P.Output) -> Bool,
        after trigger: () -> Void
    ) async where P.Failure == Never {
        let published = expectation(description: "publication")
        let subscription = publisher.sink { if matches($0) { published.fulfill() } }
        trigger()
        await fulfillment(of: [published], timeout: 2)
        subscription.cancel()
    }

    func test_theWireNamesAreTheServerOnes() {
        XCTAssertEqual(SocketEvent.talkieIncoming.rawValue, "talkie:incoming")
        XCTAssertEqual(SocketEvent.talkieChunk.rawValue, "talkie:chunk")
        XCTAssertEqual(SocketEvent.talkieEnded.rawValue, "talkie:ended")
    }

    func test_incomingIsDeliveredDecoded() async {
        let registrar = installed()
        let id = "t-\(UUID().uuidString)"
        await expectValue(of: TalkieEvents.incoming, where: { $0.talkieId == id && $0.isPlayable && $0.maxDuration == 30 }) {
            registrar.deliver("talkie:incoming", [
                "talkieId": id, "fromUserId": "u2", "codec": "aac-adts",
                "startedAt": "2026-11-07T10:00:00.000Z", "maxDurationMs": 30_000,
            ])
        }
    }

    func test_aBinaryChunkIsDeliveredAsData() async {
        let registrar = installed()
        let id = "t-\(UUID().uuidString)"
        let bytes = Data([0xFF, 0xF1, 0x50, 0x80])
        await expectValue(of: TalkieEvents.chunk, where: { $0.talkieId == id && $0.seq == 3 && $0.data == bytes }) {
            registrar.deliver("talkie:chunk", [
                "talkieId": id, "fromUserId": "u2", "seq": 3, "data": bytes, "relayedAt": 1_000,
            ])
        }
    }

    func test_aChunkNeverOvertakesTheIncomingThatAnnouncesIt() async {
        let registrar = installed()
        let id = "t-\(UUID().uuidString)"
        let log = ArrivalLog()
        let both = expectation(description: "les deux")
        both.expectedFulfillmentCount = 2
        let a = TalkieEvents.incoming.filter { $0.talkieId == id }.sink { _ in log.items.append("incoming"); both.fulfill() }
        let b = TalkieEvents.chunk.filter { $0.talkieId == id }.sink { _ in log.items.append("chunk"); both.fulfill() }
        registrar.deliver("talkie:incoming", [
            "talkieId": id, "fromUserId": "u2", "codec": "aac-adts", "startedAt": "x", "maxDurationMs": 30_000,
        ])
        registrar.deliver("talkie:chunk", ["talkieId": id, "fromUserId": "u2", "seq": 0, "data": Data([1])])
        await fulfillment(of: [both], timeout: 2)
        a.cancel()
        b.cancel()
        XCTAssertEqual(log.items, ["incoming", "chunk"])
    }

    func test_endedCarriesItsReason_andAnUnknownOneIsNil() async {
        let registrar = installed()
        let cut = "t-\(UUID().uuidString)"
        await expectValue(of: TalkieEvents.ended, where: { $0.talkieId == cut && $0.silencesNow }) {
            registrar.deliver("talkie:ended", [
                "talkieId": cut, "fromUserId": "u2", "toUserId": "me", "reason": "cut", "endedAt": "x",
            ])
        }
        let odd = "t-\(UUID().uuidString)"
        await expectValue(of: TalkieEvents.ended, where: { $0.talkieId == odd && $0.reason == nil && !$0.silencesNow }) {
            registrar.deliver("talkie:ended", [
                "talkieId": odd, "fromUserId": "u2", "toUserId": "me", "reason": "teleported", "endedAt": "x",
            ])
        }
    }

    func test_anIncompleteChunkIsDropped() {
        XCTAssertNil(TalkieChunk(wire: ["talkieId": "t", "fromUserId": "u", "seq": 1]))
        XCTAssertNil(TalkieChunk(wire: ["talkieId": "t", "fromUserId": "u", "seq": -1, "data": Data([1])]))
        XCTAssertNil(TalkieChunk(wire: ["talkieId": "", "fromUserId": "u", "seq": 1, "data": Data([1])]))
        XCTAssertNil(TalkieChunk(wire: "nope"))
    }

    func test_anUnknownCodecIsNotPlayable_andTheDurationIsBounded() {
        let opus = TalkieIncoming(talkieId: "t", fromUserId: "u", codec: "opus", startedAt: "x", maxDurationMs: 30_000)
        XCTAssertFalse(opus.isPlayable)
        let absurd = TalkieIncoming(talkieId: "t", fromUserId: "u", startedAt: "x", maxDurationMs: 86_400_000)
        XCTAssertEqual(absurd.maxDuration, TalkieContract.maxDuration)
    }
}
