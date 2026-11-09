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
    /// Les trames de 48 kHz qu'il faut pour remplir un fragment du contrat.
    private static let framesPerFragment = Int((TalkieContract.fragmentDuration / frameDuration).rounded(.up))
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
        var onStart: (() -> Void)?
        private var onFrame: (@MainActor @Sendable (Data, TimeInterval) -> Void)?

        func start(onFrame: @escaping @MainActor @Sendable (Data, TimeInterval) -> Void) async -> Bool {
            onStart?()
            guard allow else { return false }
            self.onFrame = onFrame
            return true
        }

        /// Tient l'arrêt du micro ouvert, comme le vrai qui vide ses dernières trames : la passerelle peut parler pendant.
        var holdStop = false
        private var stopWaiter: CheckedContinuation<Void, Never>?

        func stop() async {
            stops += 1
            guard holdStop else { return }
            await withCheckedContinuation { stopWaiter = $0 }
        }

        func letStopFinish() {
            holdStop = false
            stopWaiter?.resume()
            stopWaiter = nil
        }

        func speak(frames: Int, bytes: Int = 10) {
            (0..<frames).forEach { _ in onFrame?(Data(count: bytes), TalkieSenderTests.frameDuration) }
        }
    }

    @MainActor
    final class FakeCopier: TalkieVoiceCopying {
        var sent: [(frames: [Data], toUserId: String)] = []
        var conversations: [String?] = []
        var succeeds = true
        let failed = PassthroughSubject<Void, Never>()
        var failures: AnyPublisher<Void, Never> { failed.eraseToAnyPublisher() }

        func send(_ frames: [Data], toUserId: String, conversationId: String?) async -> Bool {
            sent.append((frames, toUserId))
            conversations.append(conversationId)
            return succeeds
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
        let copier: FakeCopier
    }

    final class Clock: @unchecked Sendable {
        var now = Date(timeIntervalSince1970: 1_800_000_000)
    }

    private func makeRig(clock: Clock = Clock()) -> Rig {
        let emitter = FakeEmitter()
        let capture = FakeCapture()
        let deadline = FakeDeadline()
        let ended = PassthroughSubject<TalkieEnded, Never>()
        let copier = FakeCopier()
        let sut = TalkieSender(
            emitter: emitter,
            capture: capture,
            copier: copier,
            endedEvents: ended.eraseToAnyPublisher(),
            now: { clock.now },
            schedule: { delay, run in
                deadline.delays.append(delay)
                deadline.run = run
                return { deadline.cancelled += 1 }
            }
        )
        return Rig(sut: sut, emitter: emitter, capture: capture, deadline: deadline, ended: ended, copier: copier)
    }

    private func settle() async {
        for _ in 0..<30 { await Task.yield() }
    }

    func test_whatIsCapturedBeforeTheAck_leavesAfterIt_inOrder() async {
        let rig = makeRig()
        rig.sut.press(toUserId: "bob")
        await settle()
        XCTAssertEqual(rig.sut.phase, .starting(toUserId: "bob"))

        let fragmentBytes = Self.framesPerFragment * 10
        rig.capture.speak(frames: Self.framesPerFragment)
        XCTAssertTrue(rig.emitter.chunks.isEmpty)

        rig.emitter.resolve(.opened(Self.opened))
        await settle()
        XCTAssertEqual(rig.sut.phase, .talking(toUserId: "bob", talkieId: Self.opened.talkieId))
        XCTAssertEqual(rig.emitter.chunks, [FakeEmitter.Chunk(talkieId: Self.opened.talkieId, seq: 0, bytes: fragmentBytes)])
        XCTAssertEqual(rig.deadline.delays, [30])

        rig.capture.speak(frames: Self.framesPerFragment * 2 + 1)
        await rig.sut.release()

        XCTAssertEqual(rig.emitter.chunks.map(\.seq), [0, 1, 2, 3])
        XCTAssertEqual(rig.emitter.chunks.map(\.bytes), [fragmentBytes, fragmentBytes, fragmentBytes, 10])
        XCTAssertEqual(rig.emitter.ends, [Self.opened.talkieId])
        XCTAssertEqual(rig.capture.stops, 1)
        XCTAssertEqual(rig.sut.phase, .idle)
        XCTAssertNil(rig.sut.notice)
    }

    /// #17094 : ouvrir le micro tient l'acteur principal ; `talkie:start` doit être déjà parti, sinon l'aller-retour
    /// s'ajoute à l'ouverture au lieu de courir pendant.
    func test_talkieStart_leavesBeforeTheMicrophoneOpens() async {
        let rig = makeRig()
        var startsSeenByTheMicrophone: [Int] = []
        rig.capture.onStart = { startsSeenByTheMicrophone.append(rig.emitter.startCalls.count) }

        rig.sut.press(toUserId: "bob")
        await settle()

        XCTAssertEqual(startsSeenByTheMicrophone, [1])
    }

    func test_theTimesOfATalk_areMeasuredFromThePress_untilItsFirstChunkLeaves() async {
        let clock = Clock()
        let pressedAt = clock.now
        let rig = makeRig(clock: clock)

        rig.sut.press(toUserId: "bob")
        clock.now = pressedAt.addingTimeInterval(0.2)
        await settle()
        clock.now = pressedAt.addingTimeInterval(0.35)
        rig.emitter.resolve(.opened(Self.opened))
        await settle()
        XCTAssertNil(rig.sut.lastLatency)

        clock.now = pressedAt.addingTimeInterval(0.5)
        rig.capture.speak(frames: Self.framesPerFragment)

        XCTAssertEqual(rig.sut.lastLatency?.milliseconds(.micReady), 200)
        XCTAssertEqual(rig.sut.lastLatency?.milliseconds(.opened), 350)
        XCTAssertEqual(rig.sut.lastLatency?.milliseconds(.firstChunk), 500)
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

    /// Précision du porteur (2026-11-08) : un repli n'est plus une erreur. La voix continue de s'enregistrer tant que
    /// le doigt tient, puis part en message vocal ; un blocage rend la MÊME issue, sans fuite.
    func test_aFallback_keepsRecording_andTheVoiceLeavesAsAVoiceCopyOnRelease() async {
        let rig = makeRig()
        rig.sut.press(toUserId: "bob")
        await settle()
        rig.capture.speak(frames: Self.framesPerFragment * 2)
        rig.emitter.resolve(.refused(.voice))
        await settle()

        XCTAssertEqual(rig.sut.phase, .recordingCopy(toUserId: "bob"))
        XCTAssertNil(rig.sut.notice)
        XCTAssertEqual(rig.capture.stops, 0)
        XCTAssertEqual(rig.deadline.delays, [TalkieContract.maxDuration])

        rig.capture.speak(frames: 3)
        await rig.sut.release()

        XCTAssertEqual(rig.copier.sent.map(\.toUserId), ["bob"])
        XCTAssertEqual(rig.copier.sent.first?.frames.reduce(0) { $0 + $1.count }, (Self.framesPerFragment * 2 + 3) * 10)
        XCTAssertEqual(rig.sut.notice, .voice)
        XCTAssertTrue(rig.emitter.chunks.isEmpty)
        XCTAssertTrue(rig.emitter.ends.isEmpty)
        XCTAssertEqual(rig.capture.stops, 1)
        XCTAssertEqual(rig.sut.phase, .idle)
    }

    func test_aFallbackAfterRelease_sendsWhatWasCapturedAtOnce() async {
        let rig = makeRig()
        rig.sut.press(toUserId: "bob")
        await settle()
        rig.capture.speak(frames: 3)
        await rig.sut.release()
        rig.emitter.resolve(.refused(.voice))
        await settle()

        XCTAssertEqual(rig.copier.sent.first?.frames.reduce(0) { $0 + $1.count }, 30)
        XCTAssertEqual(rig.sut.notice, .voice)
        XCTAssertEqual(rig.sut.phase, .idle)
    }

    func test_theVoiceCopy_closesByItselfAtTheMaximumDuration() async {
        let rig = makeRig()
        rig.sut.press(toUserId: "bob")
        await settle()
        rig.capture.speak(frames: 3)
        rig.emitter.resolve(.refused(.voice))
        await settle()

        rig.deadline.run?()
        await settle()

        XCTAssertEqual(rig.copier.sent.count, 1)
        XCTAssertEqual(rig.sut.phase, .idle)
    }

    func test_aVoiceCopyThatCannotLeave_isAFailure() async {
        let rig = makeRig()
        rig.copier.succeeds = false
        rig.sut.press(toUserId: "bob")
        await settle()
        rig.capture.speak(frames: 3)
        rig.emitter.resolve(.refused(.voice))
        await settle()
        await rig.sut.release()

        XCTAssertEqual(rig.sut.notice, .failed)
    }

    /// #17255 — la copie est partie dans la file, puis la file l'a abandonnée : l'émetteur le voit.
    func test_aVoiceCopyAbandonedLaterByTheQueue_isAFailure() async {
        let rig = makeRig()
        rig.sut.press(toUserId: "bob")
        await settle()
        rig.capture.speak(frames: 3)
        rig.emitter.resolve(.refused(.voice))
        await settle()
        await rig.sut.release()
        XCTAssertEqual(rig.sut.notice, .voice)
        rig.sut.notice = nil

        rig.copier.failed.send(())

        XCTAssertEqual(rig.sut.notice, .failed)
    }

    func test_aFallbackWithARefusedMicrophone_saysTheMicrophone_andCopiesNothing() async {
        let rig = makeRig()
        rig.capture.allow = false
        rig.sut.press(toUserId: "bob")
        await settle()
        rig.emitter.resolve(.refused(.voice))
        await settle()

        XCTAssertEqual(rig.sut.notice, .micDenied)
        XCTAssertTrue(rig.copier.sent.isEmpty)
        XCTAssertEqual(rig.sut.phase, .idle)
    }

    func test_aWakingDelivery_isShownWhileTalking_andClearsAtTheEnd() async {
        let rig = makeRig()
        rig.sut.press(toUserId: "bob")
        await settle()
        let waking = TalkieOpened(talkieId: Self.opened.talkieId, maxDuration: 30, maxChunkBytes: 16_384, delivery: .waking)
        rig.emitter.resolve(.opened(waking))
        await settle()

        XCTAssertTrue(rig.sut.waking)
        XCTAssertEqual(rig.sut.phase, .talking(toUserId: "bob", talkieId: Self.opened.talkieId))

        await rig.sut.release()
        XCTAssertFalse(rig.sut.waking)
    }

    func test_aFallbackThatNamesItsConversation_sendsTheCopyThere() async {
        let rig = makeRig()
        rig.sut.press(toUserId: "bob")
        await settle()
        rig.capture.speak(frames: 3)
        rig.emitter.resolve(.voiceInto(conversationId: "cccccccccccccccccccccccc"))
        await settle()
        await rig.sut.release()

        XCTAssertEqual(rig.copier.conversations, ["cccccccccccccccccccccccc"])
        XCTAssertEqual(rig.sut.notice, .voice)
    }

    private func wakingTalk(_ rig: Rig) async {
        rig.sut.press(toUserId: "bob")
        await settle()
        rig.emitter.resolve(.opened(TalkieOpened(talkieId: Self.opened.talkieId, maxDuration: 30, maxChunkBytes: 16_384, delivery: .waking)))
        await settle()
        rig.capture.speak(frames: Self.framesPerFragment * 2)
        await rig.sut.release()
    }

    func test_aWakingVoiceNobodyJoined_leavesAsAVoiceCopy() async {
        let rig = makeRig()
        await wakingTalk(rig)
        XCTAssertTrue(rig.copier.sent.isEmpty)

        await rig.sut.ended(Self.opened.talkieId, reason: .sender, joined: false)

        XCTAssertEqual(rig.copier.sent.map(\.toUserId), ["bob"])
        XCTAssertEqual(rig.copier.sent.first?.frames.reduce(0) { $0 + $1.count }, rig.emitter.chunks.reduce(0) { $0 + $1.bytes })
        XCTAssertEqual(rig.copier.conversations, [nil])
        XCTAssertEqual(rig.sut.notice, .voice)
    }

    func test_aWakingVoiceThatWasJoined_orALiveOne_isNeverCopied() async {
        let joined = makeRig()
        await wakingTalk(joined)
        await joined.sut.ended(Self.opened.talkieId, reason: .sender, joined: true)
        await joined.sut.ended(Self.opened.talkieId, reason: .sender, joined: false)
        XCTAssertTrue(joined.copier.sent.isEmpty)

        let live = makeRig()
        live.sut.press(toUserId: "bob")
        await settle()
        live.emitter.resolve(.opened(Self.opened))
        await settle()
        live.capture.speak(frames: Self.framesPerFragment)
        await live.sut.release()
        await live.sut.ended(Self.opened.talkieId, reason: .sender, joined: false)
        XCTAssertTrue(live.copier.sent.isEmpty)
    }

    func test_aLiveDelivery_isNotWaking() async {
        let rig = makeRig()
        rig.sut.press(toUserId: "bob")
        await settle()
        rig.emitter.resolve(.opened(Self.opened))
        await settle()

        XCTAssertFalse(rig.sut.waking)
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

    // MARK: - #17248 — le verdict « personne n'a rejoint » ne se perd jamais

    private static let wakingOpened = TalkieOpened(talkieId: opened.talkieId, maxDuration: 30, maxChunkBytes: 16_384, delivery: .waking)

    private func openWakingTalk(_ rig: Rig) async {
        rig.sut.press(toUserId: "bob")
        await settle()
        rig.emitter.resolve(.opened(Self.wakingOpened))
        await settle()
    }

    /// L'ordre relevé sur appareil : la passerelle ferme la voix réveillée et rend `joined: false` pendant que le micro
    /// de l'émetteur s'arrête encore. Le verdict arrive AVANT que la voix soit rangée : il doit l'attendre.
    func test_aNobodyJoinedVerdictThatArrivesWhileTheMicStops_stillLeavesAsAVoiceCopy() async {
        let rig = makeRig()
        await openWakingTalk(rig)
        rig.capture.speak(frames: Self.framesPerFragment * 2)
        rig.capture.holdStop = true
        let releasing = Task { await rig.sut.release() }
        await settle()

        await rig.sut.ended(Self.opened.talkieId, reason: .sender, joined: false)
        await rig.sut.ended(Self.opened.talkieId, reason: .sender, joined: false)
        rig.capture.letStopFinish()
        await releasing.value
        await settle()
        XCTAssertEqual(rig.copier.sent.map(\.toUserId), ["bob"], "le verdict arrivé avant la voix rangée l'a attendue")

        await rig.sut.ended(Self.opened.talkieId, reason: .sender, joined: false)

        XCTAssertEqual(rig.copier.sent.map(\.toUserId), ["bob"], "un `ended` en double ne refait aucune copie")
        XCTAssertEqual(rig.copier.sent.first?.frames.reduce(0) { $0 + $1.count }, rig.emitter.chunks.reduce(0) { $0 + $1.bytes })
        XCTAssertEqual(rig.sut.notice, .voice)
    }

    func test_anEarlyNobodyJoinedVerdict_whoseCopyCannotLeave_isAFailure() async {
        let rig = makeRig()
        rig.copier.succeeds = false
        await openWakingTalk(rig)
        rig.capture.speak(frames: Self.framesPerFragment * 2)
        rig.capture.holdStop = true
        let releasing = Task { await rig.sut.release() }
        await settle()

        await rig.sut.ended(Self.opened.talkieId, reason: .sender, joined: false)
        rig.capture.letStopFinish()
        await releasing.value

        XCTAssertEqual(rig.copier.sent.count, 1)
        XCTAssertEqual(rig.sut.notice, .failed)
    }

    func test_anEarlyJoinedVerdict_copiesNothing() async {
        let rig = makeRig()
        await openWakingTalk(rig)
        rig.capture.speak(frames: Self.framesPerFragment * 2)
        rig.capture.holdStop = true
        let releasing = Task { await rig.sut.release() }
        await settle()

        await rig.sut.ended(Self.opened.talkieId, reason: .sender, joined: true)
        rig.capture.letStopFinish()
        await releasing.value
        await rig.sut.ended(Self.opened.talkieId, reason: .sender, joined: false)

        XCTAssertTrue(rig.copier.sent.isEmpty)
    }

    /// Une voix réveillée que la passerelle ferme d'elle-même (plafond) garde aussi ce qui restait dans le fragment en
    /// cours : la copie porte TOUTE la voix captée, pas seulement les fragments partis.
    func test_aWakingVoiceClosedByTheGateway_copiesTheUnsentTailToo() async {
        let rig = makeRig()
        await openWakingTalk(rig)
        let frames = Self.framesPerFragment * 2 + 3
        rig.capture.speak(frames: frames, bytes: 10)

        await rig.sut.ended(Self.opened.talkieId, reason: .limit, joined: false)

        XCTAssertEqual(rig.copier.sent.first?.frames.reduce(0) { $0 + $1.count }, frames * 10)
        XCTAssertEqual(rig.sut.notice, .voice)
    }
}
