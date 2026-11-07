import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// Le talkie reçu sur iOS (#16673) : un fragment joue dès son arrivée, dans l'ordre, une fois ; rien ne joue hors de la
/// prise de parole annoncée ni de mon propre compte ; `cut` et « Couper » font taire ; sans fin servie, la prise de
/// parole se ferme passé sa durée maximale, comptée à l'horloge de l'appareil.
@MainActor
final class TalkieCenterTests: XCTestCase {

    private struct Rig {
        let sut: TalkieCenter
        let sink: FakeTalkieSink
        let clock: Clock
    }

    final class Clock: @unchecked Sendable {
        var now = Date(timeIntervalSince1970: 1_800_000_000)
    }

    private func makeRig(people: [CirclePerson] = [], viewer: String = "me") -> Rig {
        let sink = FakeTalkieSink()
        let clock = Clock()
        let sut = TalkieCenter(
            sink: sink,
            people: FakeCirclePeople(people),
            viewerId: { viewer },
            incomingEvents: Empty().eraseToAnyPublisher(),
            chunkEvents: Empty().eraseToAnyPublisher(),
            endedEvents: Empty().eraseToAnyPublisher(),
            now: { clock.now }
        )
        return Rig(sut: sut, sink: sink, clock: clock)
    }

    private func incoming(_ id: String = "t1", from: String = "alice", codec: String = TalkieContract.codec) -> TalkieIncoming {
        TalkieIncoming(talkieId: id, fromUserId: from, codec: codec, startedAt: "2026-11-07T10:00:00.000Z", maxDurationMs: 30_000)
    }

    private func chunk(_ seq: Int, id: String = "t1", from: String = "alice") -> TalkieChunk {
        TalkieChunk(talkieId: id, fromUserId: from, seq: seq, data: Data([UInt8(seq)]))
    }

    private func ended(_ id: String = "t1", reason: TalkieEndReason?) -> TalkieEnded {
        TalkieEnded(talkieId: id, fromUserId: "alice", toUserId: "me", reason: reason)
    }

    func test_anIncoming_showsTheSpeaker_andEachChunkPlaysOnceInOrder() {
        let rig = makeRig()

        rig.sut.open(incoming())
        rig.sut.receive(chunk(0))
        rig.sut.receive(chunk(1))
        rig.sut.receive(chunk(1))
        rig.sut.receive(chunk(0))
        rig.sut.receive(chunk(3))

        XCTAssertEqual(rig.sut.active.map(\.talkieId), ["t1"])
        XCTAssertEqual(rig.sink.played.map(\.data), [Data([0]), Data([1]), Data([3])])
    }

    func test_aChunkWithoutItsIncoming_orFromAnotherSender_playsNothing() {
        let rig = makeRig()

        rig.sut.receive(chunk(0))
        rig.sut.open(incoming())
        rig.sut.receive(chunk(1, from: "mallory"))
        rig.sut.receive(chunk(1, id: "t9"))

        XCTAssertTrue(rig.sink.played.isEmpty)
    }

    func test_myOwnVoice_fromAnotherOfMyDevices_neverOpensHere() {
        let rig = makeRig(viewer: "alice")

        rig.sut.open(incoming(from: "alice"))
        rig.sut.receive(chunk(0, from: "alice"))

        XCTAssertTrue(rig.sut.active.isEmpty)
        XCTAssertTrue(rig.sink.played.isEmpty)
    }

    func test_anUnknownCodec_neverOpens() {
        let rig = makeRig()

        rig.sut.open(incoming(codec: "opus"))

        XCTAssertTrue(rig.sut.active.isEmpty)
    }

    func test_cut_silencesAtOnce_whileSenderLetsTheQueueFinish() {
        let rig = makeRig()
        rig.sut.open(incoming("t1"))
        rig.sut.open(incoming("t2", from: "bob"))

        rig.sut.end(ended("t1", reason: .cut))
        rig.sut.end(ended("t2", reason: .sender))

        XCTAssertEqual(rig.sink.silenced, ["t1"])
        XCTAssertEqual(rig.sink.released, ["t2"])
        XCTAssertTrue(rig.sut.active.isEmpty)
    }

    func test_aClosedTalkie_neverReopens_norPlaysALateChunk() {
        let rig = makeRig()
        rig.sut.open(incoming())
        rig.sut.end(ended(reason: .sender))

        rig.sut.open(incoming())
        rig.sut.receive(chunk(5))

        XCTAssertTrue(rig.sut.active.isEmpty)
        XCTAssertTrue(rig.sink.played.isEmpty)
    }

    func test_mute_silencesHereOnly_andClosesTheIndicator() {
        let rig = makeRig()
        rig.sut.open(incoming())

        rig.sut.mute("t1")
        rig.sut.receive(chunk(0))

        XCTAssertEqual(rig.sink.silenced, ["t1"])
        XCTAssertTrue(rig.sut.active.isEmpty)
        XCTAssertTrue(rig.sink.played.isEmpty)
    }

    func test_withoutAnEnd_theTalkieClosesAfterItsMaxDuration_onTheDeviceClock() {
        let rig = makeRig()
        rig.sut.open(incoming())

        rig.clock.now = rig.clock.now.addingTimeInterval(30)
        rig.sut.expireDue()
        XCTAssertEqual(rig.sut.active.count, 1)

        rig.clock.now = rig.clock.now.addingTimeInterval(TalkieSpeaker.expiryGrace + 0.1)
        rig.sut.expireDue()
        XCTAssertTrue(rig.sut.active.isEmpty)
        XCTAssertEqual(rig.sink.released, ["t1"])
    }

    func test_theSpeakerIsNamedByTheCaches() async {
        let rig = makeRig(people: [CirclePerson(id: "alice", name: "Alice", username: nil, avatarURL: nil)])

        rig.sut.open(incoming())
        for _ in 0..<20 { await Task.yield() }

        XCTAssertEqual(rig.sut.active.first?.name, "Alice")
    }
}
