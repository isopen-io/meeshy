import AVFoundation
import XCTest
@testable import Meeshy

/// Les briques d'une voix (#20531) : le gain normalise tous les canaux d'un même gain, l'analyseur pousse sous la
/// bonne personne et le bon sens, et un changement de fréquence ne remet pas le gain à zéro.
final class TalkieVoiceProcessorTests: XCTestCase {

    private static let startedAt = Date(timeIntervalSince1970: 1_800_000_000)

    private func sine(sampleRate: Double, seconds: Double, rmsDecibels: Float, channels: AVAudioChannelCount = 1) throws -> AVAudioPCMBuffer {
        let format = try XCTUnwrap(AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: channels))
        let count = AVAudioFrameCount(sampleRate * seconds)
        let buffer = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: count))
        buffer.frameLength = count
        let amplitude = Float(pow(10, Double(rmsDecibels) / 20)) * Float(2.0.squareRoot())
        let data = try XCTUnwrap(buffer.floatChannelData)
        (0..<Int(channels)).forEach { channel in
            (0..<Int(count)).forEach { index in
                data[channel][index] = amplitude * Float(sin(2 * Double.pi * 440 * Double(index) / sampleRate))
            }
        }
        return buffer
    }

    func test_levelThenPublish_pushesUnderTheUserAndTheDirection() throws {
        let stage = TalkieVoiceStage()
        stage.begin(userId: "bob", direction: .outgoing, at: Self.startedAt)
        stage.begin(userId: "bob", direction: .incoming, at: Self.startedAt)
        let sut = TalkieVoiceProcessor(userId: "bob", direction: .outgoing, sampleRate: 48_000, stage: stage)
        let buffer = try sine(sampleRate: 48_000, seconds: 0.05, rmsDecibels: -20)

        sut.level(buffer)
        let rms = sut.publish(buffer, at: 0)

        XCTAssertGreaterThan(rms, 0)
        XCTAssertGreaterThan(stage.bands(for: "bob", direction: .outgoing).max() ?? 0, 0)
        XCTAssertEqual(stage.bands(for: "bob", direction: .incoming).max(), 0)
    }

    func test_push_4800FrameBuffer_yieldsFourOrMoreTimedFrames() throws {
        let stage = TalkieVoiceStage()
        stage.begin(userId: "bob", direction: .incoming, at: Self.startedAt)
        let sut = TalkieVoiceProcessor(userId: "bob", direction: .incoming, sampleRate: 48_000, stage: stage)

        sut.publish(try sine(sampleRate: 48_000, seconds: 0.1, rmsDecibels: -20), at: 100)

        let times = stage.frameTimes(for: "bob", direction: .incoming)
        XCTAssertGreaterThanOrEqual(times.count, 4)
        zip(times, times.dropFirst()).forEach { XCTAssertEqual($1 - $0, 1024.0 / 48_000, accuracy: 1e-9) }
        XCTAssertEqual(times.first ?? 0, 100, accuracy: 1e-9)
    }

    /// La fin d'un tampon qui ne remplit pas une fenêtre est reportée sur le suivant, à son heure.
    func test_publish_carriesThePartialWindowIntoTheNextBuffer() throws {
        let stage = TalkieVoiceStage()
        stage.begin(userId: "bob", direction: .incoming, at: Self.startedAt)
        let sut = TalkieVoiceProcessor(userId: "bob", direction: .incoming, sampleRate: 48_000, stage: stage)
        let buffer = try sine(sampleRate: 48_000, seconds: 0.1, rmsDecibels: -20)

        sut.publish(buffer, at: 100)
        sut.publish(buffer, at: 100 + 0.1)

        let times = stage.frameTimes(for: "bob", direction: .incoming)
        XCTAssertEqual(stage.receivedFrames(for: "bob", direction: .incoming), 9, "9600 échantillons = 9 fenêtres pleines")
        zip(times, times.dropFirst()).forEach { XCTAssertEqual($1 - $0, 1024.0 / 48_000, accuracy: 1e-9) }
    }

    /// Un tampon qui ne suit pas le précédent (trou, reprise) ne se raccorde pas à son reste.
    func test_publish_discontinuousBuffer_dropsTheCarry() throws {
        let stage = TalkieVoiceStage()
        stage.begin(userId: "bob", direction: .incoming, at: Self.startedAt)
        let sut = TalkieVoiceProcessor(userId: "bob", direction: .incoming, sampleRate: 48_000, stage: stage)
        let buffer = try sine(sampleRate: 48_000, seconds: 0.1, rmsDecibels: -20)

        sut.publish(buffer, at: 100)
        sut.publish(buffer, at: 200)

        XCTAssertEqual(stage.receivedFrames(for: "bob", direction: .incoming), 8)
        XCTAssertEqual(stage.frameTimes(for: "bob", direction: .incoming).last ?? 0, 200 + 3 * 1024.0 / 48_000, accuracy: 1e-9)
    }

    func test_level_rateChange_keepsTheLevelerGain() throws {
        let sut = TalkieVoiceProcessor(userId: "bob", direction: .incoming, sampleRate: 48_000, stage: TalkieVoiceStage())
        sut.level(try sine(sampleRate: 48_000, seconds: 1, rmsDecibels: -40))
        let before = sut.currentGainDecibels
        XCTAssertGreaterThan(before, 6)

        sut.level(try sine(sampleRate: 16_000, seconds: 0.01, rmsDecibels: -40))

        XCTAssertEqual(sut.currentGainDecibels, before, accuracy: 3)
    }

    func test_level_stereo_levelsEveryChannelWithTheSameGain() throws {
        let sut = TalkieVoiceProcessor(userId: "bob", direction: .incoming, sampleRate: 48_000, stage: TalkieVoiceStage())
        let buffer = try sine(sampleRate: 48_000, seconds: 0.5, rmsDecibels: -40, channels: 2)
        let original = try XCTUnwrap(buffer.floatChannelData)[1][Int(buffer.frameLength) - 7]

        sut.level(buffer)

        let data = try XCTUnwrap(buffer.floatChannelData)
        let last = Int(buffer.frameLength) - 7
        XCTAssertEqual(data[0][last], data[1][last])
        XCTAssertGreaterThan(abs(data[1][last]), abs(original) * 1.5, "le second canal est amplifié aussi")
    }

    // MARK: - L'envoi laisse 6 dB de marge, la réception normalise pleinement

    func test_level_outgoingLoudVoice_neverExceedsMinus7() throws {
        let sut = TalkieVoiceProcessor(userId: "bob", direction: .outgoing, sampleRate: 48_000, stage: TalkieVoiceStage())
        let buffer = try sine(sampleRate: 48_000, seconds: 1, rmsDecibels: -3)

        sut.level(buffer)

        let samples = UnsafeBufferPointer(start: try XCTUnwrap(buffer.floatChannelData)[0], count: Int(buffer.frameLength))
        XCTAssertLessThanOrEqual(samples.map(abs).max() ?? 0, Float(pow(10, -7.0 / 20)))
    }

    func test_level_incomingLoudVoice_reachesTheReceiveCeilingBand() throws {
        let sut = TalkieVoiceProcessor(userId: "bob", direction: .incoming, sampleRate: 48_000, stage: TalkieVoiceStage())
        let buffer = try sine(sampleRate: 48_000, seconds: 1, rmsDecibels: -3)

        sut.level(buffer)

        let samples = UnsafeBufferPointer(start: try XCTUnwrap(buffer.floatChannelData)[0], count: Int(buffer.frameLength))
        let peak = samples.map(abs).max() ?? 0
        XCTAssertGreaterThan(peak, Float(pow(10, -7.0 / 20)))
        XCTAssertLessThanOrEqual(peak, Float(pow(10, -1.0 / 20)))
    }

    // MARK: - La voix reçue se date à l'heure où elle SORT

    func test_outputDelay_sumsLatencyAndIOBuffer() {
        XCTAssertEqual(TalkieVoiceProcessor.outputDelay(outputLatency: 0.18, ioBufferDuration: 0.02), 0.2, accuracy: 1e-12)
    }

    func test_outputDelay_isBoundedBetweenZeroAndHalfASecond() {
        XCTAssertEqual(TalkieVoiceProcessor.outputDelay(outputLatency: 0.6, ioBufferDuration: 0.02), 0.5)
        XCTAssertEqual(TalkieVoiceProcessor.outputDelay(outputLatency: -0.3, ioBufferDuration: 0.01), 0)
        XCTAssertEqual(TalkieVoiceProcessor.outputDelay(outputLatency: .nan, ioBufferDuration: 0.01), 0)
        XCTAssertEqual(TalkieVoiceProcessor.outputDelay(outputLatency: .infinity, ioBufferDuration: 0.01), 0)
    }

    func test_soundTime_shiftsTheRenderTimeByTheOutputDelay() {
        XCTAssertEqual(TalkieVoiceProcessor.soundTime(renderTime: 100, outputDelay: 0.2), 100.2, accuracy: 1e-12)
        XCTAssertEqual(TalkieVoiceProcessor.soundTime(renderTime: 100, outputDelay: 0), 100)
    }

    func test_publish_withOutputDelay_datesTheFramesWhenTheySound() throws {
        let stage = TalkieVoiceStage()
        stage.begin(userId: "bob", direction: .incoming, at: Self.startedAt)
        let sut = TalkieVoiceProcessor(userId: "bob", direction: .incoming, sampleRate: 48_000, stage: stage)

        sut.updateOutputDelay(0.2)
        sut.publish(try sine(sampleRate: 48_000, seconds: 0.1, rmsDecibels: -20), at: 100)

        XCTAssertEqual(stage.frameTimes(for: "bob", direction: .incoming).first ?? 0, 100.2, accuracy: 1e-9)
    }

    func test_publish_outgoingWithoutDelay_keepsTheTapTime() throws {
        let stage = TalkieVoiceStage()
        stage.begin(userId: "bob", direction: .outgoing, at: Self.startedAt)
        let sut = TalkieVoiceProcessor(userId: "bob", direction: .outgoing, sampleRate: 48_000, stage: stage)

        sut.publish(try sine(sampleRate: 48_000, seconds: 0.1, rmsDecibels: -20), at: 100)

        XCTAssertEqual(stage.frameTimes(for: "bob", direction: .outgoing).first ?? 0, 100, accuracy: 1e-9)
    }

    func test_buffersWithoutFloatChannels_areSafe() throws {
        let stage = TalkieVoiceStage()
        stage.begin(userId: "bob", direction: .incoming, at: Self.startedAt)
        let sut = TalkieVoiceProcessor(userId: "bob", direction: .incoming, sampleRate: 48_000, stage: stage)
        let format = try XCTUnwrap(AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 48_000, channels: 1, interleaved: false))
        let buffer = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 1024))
        buffer.frameLength = 1024
        XCTAssertNil(buffer.floatChannelData)

        sut.level(buffer)

        XCTAssertEqual(sut.publish(buffer, at: 0), 0)
        XCTAssertEqual(stage.bands(for: "bob").max(), 0)
        XCTAssertEqual(sut.currentGainDecibels, 0)
    }
}

/// Le lecteur inscrit la voix reçue au registre sous son expéditeur, l'alimente pendant qu'elle SONNE (tap du nœud
/// de la voix), et la retire quand elle se tait ou finit de sonner (#20531).
@MainActor
final class TalkieVoicePlayerStageTests: XCTestCase {

    private final class NoSession: TalkieVoiceSessionProviding {
        nonisolated deinit {}
        func activateVoice() {}
        func releaseVoice() {}
    }

    private final class NoListening: MeeshyListeningProviding {
        nonisolated deinit {}
        func pauseListening() {}
        func resumeListening() {}
    }

    private final class FrameBox: @unchecked Sendable {
        private(set) var frames: [TalkieAacFrame] = []
        func append(_ batch: [TalkieAacFrame]) { frames += batch }
    }

    private func makePlayer(stage: TalkieVoiceStage) -> TalkieVoicePlayer {
        TalkieVoicePlayer(
            isInCall: { false },
            listening: TalkieListeningHold(session: NoSession(), listening: NoListening()),
            stage: stage
        )
    }

    private func fragment(seconds: Double) throws -> Data {
        let format = try XCTUnwrap(AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1))
        let count = AVAudioFrameCount(48_000 * seconds)
        let input = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: count))
        input.frameLength = count
        let samples = try XCTUnwrap(input.floatChannelData?[0])
        (0..<Int(count)).forEach { samples[$0] = 0.3 * sin(Float($0) * 2 * .pi * 440 / 48_000) }
        let collected = FrameBox()
        let encoder = try XCTUnwrap(TalkieAacEncoder(input: format) { collected.append($0) })
        encoder.encode(input)
        encoder.drain()
        return collected.frames.reduce(Data()) { $0 + $1.data }
    }

    private func waitUntil(_ condition: @escaping @MainActor () -> Bool, seconds: TimeInterval = 4) async {
        let deadline = Date().addingTimeInterval(seconds)
        while !condition(), Date() < deadline {
            try? await Task.sleep(for: .milliseconds(20))
        }
    }

    func test_play_beginsTheIncomingVoiceUnderTheSender_andSilenceEndsIt() async throws {
        let stage = TalkieVoiceStage()
        let sut = makePlayer(stage: stage)

        sut.prepare("t1", fromUserId: "alice")
        sut.play("t1", try fragment(seconds: 0.5))
        XCTAssertEqual(stage.direction(for: "alice"), .incoming)

        await waitUntil { stage.bands(for: "alice").contains { $0 > 0 } }
        XCTAssertTrue(stage.bands(for: "alice").contains { $0 > 0 }, "le tap du nœud alimente les bandes · reçues \(stage.receivedFrames(for: "alice", direction: .incoming)) · en attente \(stage.frameTimes(for: "alice", direction: .incoming).map { $0 - TalkieVoiceStage.hostNow() })")

        sut.silence("t1")
        XCTAssertNil(stage.direction(for: "alice"))
    }

    /// Mesure du débit qui atteint le registre : une fenêtre de 1024 échantillons, soit ~47 trames par seconde à 48 kHz.
    /// L'attente est bornée, sans fenêtre fixe : une machine lente met plus de temps à rendre la seconde de voix, elle
    /// ne la rend pas moins dense.
    func test_play_feedsTheStageAtTheWindowRate() async throws {
        let stage = TalkieVoiceStage()
        let sut = makePlayer(stage: stage)
        sut.prepare("t1", fromUserId: "alice")
        sut.play("t1", try fragment(seconds: 1))
        var lags: [TimeInterval] = []
        var seen = 0
        let deadline = Date().addingTimeInterval(4)
        while stage.receivedFrames(for: "alice", direction: .incoming) < 40, Date() < deadline {
            let received = stage.receivedFrames(for: "alice", direction: .incoming)
            if received > seen, let newest = stage.frameTimes(for: "alice", direction: .incoming).last {
                lags.append(TalkieVoiceStage.hostNow() - newest)
                seen = received
            }
            try? await Task.sleep(for: .milliseconds(2))
        }
        let frames = stage.receivedFrames(for: "alice", direction: .incoming)
        let lagMs = lags.map { Int(($0 * 1000).rounded()) }
        print("talkie-mesure · trames reçues pour 1 s de voix : \(frames) · retard de la plus récente à sa livraison (ms) : \(lagMs)")
        XCTAssertGreaterThanOrEqual(frames, 40)
        sut.silence("t1")
    }

    func test_release_endsTheVoiceOnceItHasPlayed() async throws {
        let stage = TalkieVoiceStage()
        let sut = makePlayer(stage: stage)
        sut.prepare("t1", fromUserId: "alice")
        sut.play("t1", try fragment(seconds: 0.2))

        sut.release("t1")
        await waitUntil { stage.direction(for: "alice") == nil }

        XCTAssertNil(stage.direction(for: "alice"))
    }

    func test_deinit_releasedPlayer_leavesNoListenerOnTheStage() {
        let stage = TalkieVoiceStage()
        var sut: TalkieVoicePlayer? = makePlayer(stage: stage)
        XCTAssertEqual(stage.listenerCount, 1, "le lecteur écoute le registre pour savoir si le micro est ouvert")

        sut = nil

        XCTAssertNil(sut)
        XCTAssertEqual(stage.listenerCount, 0, "un lecteur libéré ne laisse aucun écouteur au registre")
    }
}
