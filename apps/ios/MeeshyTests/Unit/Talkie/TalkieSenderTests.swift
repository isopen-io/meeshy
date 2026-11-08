import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// Émettre le talkie depuis iOS (#16927, iso `talkie-sender.test.ts`) : ce qui est capté avant l'accusé part après,
/// dans l'ordre ; relâcher vide le reste puis ferme ; un refus arrête le micro sans `talkie:end` et se dit sans fuite ;
/// la durée maximale et une fin servie pour MA prise de parole arrêtent tout.
@MainActor
final class TalkieSenderTests: XCTestCase {

    private static let frameDuration: TimeInterval = 1024.0 / 48_000
    private static let opened = TalkieOpened(talkieId: "aaaaaaaaaaaaaaaaaaaaaaaa", maxDuration: 30, maxChunkBytes: 16_384)

    final class FakeEmitter: TalkieEmitting, @unchecked Sendable {
        struct Chunk: Equatable {
            let talkieId: String
            let seq: Int
            let bytes: Int
        }

        var isConnected = true
        var startCalls: [String] = []
        var chunks: [Chunk] = []
        var ends: [String] = []
        private var pending: CheckedContinuation<TalkieStartVerdict, Never>?

        @MainActor
        func start(toUserId: String) async -> TalkieStartVerdict {
            startCalls.append(toUserId)
            return await withCheckedContinuation { pending = $0 }
        }

        @MainActor
        func resolve(_ verdict: TalkieStartVerdict) {
            pending?.resume(returning: verdict)
            pending = nil
        }

        func sendChunk(talkieId: String, seq: Int, capturedAt: Date, data: Data) {
            chunks.append(Chunk(talkieId: talkieId, seq: seq, bytes: data.count))
        }

        func end(talkieId: String) {
            ends.append(talkieId)
        }
    }

    final class FakeCapture: TalkieCapturing {
        var allow = true
        var stops = 0
        private var onFrame: (@MainActor @Sendable (Data, TimeInterval) -> Void)?

        func start(onFrame: @escaping @MainActor @Sendable (Data, TimeInterval) -> Void) async -> Bool {
            guard allow else { return false }
            self.onFrame = onFrame
            return true
        }

        func stop() async {
            stops += 1
        }

        func speak(frames: Int, bytes: Int = 10) {
            (0..<frames).forEach { _ in onFrame?(Data(count: bytes), TalkieSenderTests.frameDuration) }
        }
    }

    @MainActor
    final class FakeDeadline {
        var delays: [TimeInterval] = []
        var run: (@MainActor () -> Void)?
        var cancelled = 0
    }

    private struct Rig {
        let sut: TalkieSender
        let emitter: FakeEmitter
        let capture: FakeCapture
        let deadline: FakeDeadline
        let ended: PassthroughSubject<TalkieEnded, Never>
    }

    private func makeRig() -> Rig {
        let emitter = FakeEmitter()
        let capture = FakeCapture()
        let deadline = FakeDeadline()
        let ended = PassthroughSubject<TalkieEnded, Never>()
        let sut = TalkieSender(
            emitter: emitter,
            capture: capture,
            endedEvents: ended.eraseToAnyPublisher(),
            now: { Date(timeIntervalSince1970: 1_800_000_000) },
            schedule: { delay, run in
                deadline.delays.append(delay)
                deadline.run = run
                return { deadline.cancelled += 1 }
            }
        )
        return Rig(sut: sut, emitter: emitter, capture: capture, deadline: deadline, ended: ended)
    }

    private func settle() async {
        for _ in 0..<30 { await Task.yield() }
    }

    func test_whatIsCapturedBeforeTheAck_leavesAfterIt_inOrder() async {
        let rig = makeRig()
        rig.sut.press(toUserId: "bob")
        await settle()
        XCTAssertEqual(rig.sut.phase, .starting(toUserId: "bob"))

        rig.capture.speak(frames: 12)
        XCTAssertTrue(rig.emitter.chunks.isEmpty)

        rig.emitter.resolve(.opened(Self.opened))
        await settle()
        XCTAssertEqual(rig.sut.phase, .talking(toUserId: "bob", talkieId: Self.opened.talkieId))
        XCTAssertEqual(rig.emitter.chunks, [FakeEmitter.Chunk(talkieId: Self.opened.talkieId, seq: 0, bytes: 120)])
        XCTAssertEqual(rig.deadline.delays, [30])

        rig.capture.speak(frames: 13)
        await rig.sut.release()

        XCTAssertEqual(rig.emitter.chunks.map(\.seq), [0, 1, 2])
        XCTAssertEqual(rig.emitter.chunks.map(\.bytes), [120, 120, 10])
        XCTAssertEqual(rig.emitter.ends, [Self.opened.talkieId])
        XCTAssertEqual(rig.capture.stops, 1)
        XCTAssertEqual(rig.sut.phase, .idle)
        XCTAssertNil(rig.sut.notice)
    }

    func test_releasingBeforeTheAck_sendsTheWholeTalkOnceOpened_thenCloses() async {
        let rig = makeRig()
        rig.sut.press(toUserId: "bob")
        await settle()
        rig.capture.speak(frames: 3)
        await rig.sut.release()
        XCTAssertTrue(rig.emitter.ends.isEmpty)

        rig.emitter.resolve(.opened(Self.opened))
        await settle()

        XCTAssertEqual(rig.emitter.chunks, [FakeEmitter.Chunk(talkieId: Self.opened.talkieId, seq: 0, bytes: 30)])
        XCTAssertEqual(rig.emitter.ends, [Self.opened.talkieId])
        XCTAssertEqual(rig.sut.phase, .idle)
    }

    func test_aBlock_isSaidLikeAFallback_andNothingIsSent() async {
        let rig = makeRig()
        rig.sut.press(toUserId: "bob")
        await settle()
        rig.capture.speak(frames: 12)
        rig.emitter.resolve(.refused(.voice))
        await settle()

        XCTAssertEqual(rig.sut.notice, .voice)
        XCTAssertTrue(rig.emitter.chunks.isEmpty)
        XCTAssertTrue(rig.emitter.ends.isEmpty)
        XCTAssertEqual(rig.capture.stops, 1)
        XCTAssertEqual(rig.sut.phase, .idle)
    }

    func test_notAllowed_isReported_soTheRowWithdraws() async {
        let rig = makeRig()
        rig.sut.press(toUserId: "bob")
        await settle()
        rig.emitter.resolve(.refused(.notAllowed))
        await settle()

        XCTAssertEqual(rig.sut.notice, .notAllowed)
    }

    func test_anEndServedForAnotherTalk_stopsNothing_butMineStopsWithoutTalkieEnd() async {
        let rig = makeRig()
        rig.sut.press(toUserId: "bob")
        await settle()
        rig.emitter.resolve(.opened(Self.opened))
        await settle()

        rig.ended.send(TalkieEnded(talkieId: "bbbbbbbbbbbbbbbbbbbbbbbb", fromUserId: "me", toUserId: "bob", reason: .cut))
        await settle()
        XCTAssertEqual(rig.sut.phase, .talking(toUserId: "bob", talkieId: Self.opened.talkieId))

        rig.ended.send(TalkieEnded(talkieId: Self.opened.talkieId, fromUserId: "me", toUserId: "bob", reason: .limit))
        await settle()
        XCTAssertEqual(rig.sut.phase, .idle)
        XCTAssertEqual(rig.sut.notice, .limit)
        XCTAssertTrue(rig.emitter.ends.isEmpty)
        XCTAssertEqual(rig.capture.stops, 1)
    }

    func test_theServedMaximumDuration_closesTheTalkByItself() async {
        let rig = makeRig()
        rig.sut.press(toUserId: "bob")
        await settle()
        rig.emitter.resolve(.opened(Self.opened))
        await settle()

        rig.deadline.run?()
        await settle()

        XCTAssertEqual(rig.emitter.ends, [Self.opened.talkieId])
        XCTAssertEqual(rig.sut.notice, .limit)
        XCTAssertEqual(rig.sut.phase, .idle)
    }

    func test_aRefusedMicrophone_closesTheOpenedTalk_andSaysSo() async {
        let rig = makeRig()
        rig.capture.allow = false
        rig.sut.press(toUserId: "bob")
        await settle()
        rig.emitter.resolve(.opened(Self.opened))
        await settle()

        XCTAssertEqual(rig.emitter.ends, [Self.opened.talkieId])
        XCTAssertEqual(rig.sut.notice, .micDenied)
        XCTAssertEqual(rig.capture.stops, 0)
        XCTAssertEqual(rig.sut.phase, .idle)
    }

    func test_offline_saysSo_withoutOpeningAnything() async {
        let rig = makeRig()
        rig.emitter.isConnected = false
        rig.sut.press(toUserId: "bob")
        await settle()

        XCTAssertEqual(rig.sut.notice, .offline)
        XCTAssertTrue(rig.emitter.startCalls.isEmpty)
        XCTAssertEqual(rig.sut.phase, .idle)
    }

    func test_aSecondPressWhileTalking_opensNothingMore() async {
        let rig = makeRig()
        rig.sut.press(toUserId: "bob")
        rig.sut.press(toUserId: "bob")
        await settle()

        XCTAssertEqual(rig.emitter.startCalls, ["bob"])
    }
}
