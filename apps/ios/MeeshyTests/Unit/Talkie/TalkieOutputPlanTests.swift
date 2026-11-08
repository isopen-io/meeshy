import AVFoundation
import MeeshySDK
import XCTest
@testable import Meeshy

/// La voix d'un talkie sort fort sur l'iPhone, et n'est jamais forcée dans des écouteurs (#17087).
final class TalkieOutputPlanTests: XCTestCase {

    func test_theEarpiece_isRoutedToTheSpeaker_andBoosted() {
        XCTAssertEqual(TalkieOutputPlan.decide(outputs: [.builtInReceiver]),
                       TalkieOutputPlan(routesToSpeaker: true, gainDecibels: TalkieOutputPlan.boostDecibels))
    }

    func test_theSpeaker_isKept_andBoosted() {
        XCTAssertEqual(TalkieOutputPlan.decide(outputs: [.builtInSpeaker]),
                       TalkieOutputPlan(routesToSpeaker: false, gainDecibels: TalkieOutputPlan.boostDecibels))
    }

    func test_theBoost_doublesTheAmplitude() {
        XCTAssertEqual(pow(10, TalkieOutputPlan.boostDecibels / 20), 2, accuracy: 0.01)
    }

    func test_personalOutputs_areNeitherRedirectedNorBoosted() {
        let personal: [AVAudioSession.Port] = [.headphones, .bluetoothA2DP, .bluetoothHFP, .bluetoothLE,
                                               .carAudio, .airPlay, .usbAudio, .lineOut, .HDMI]
        personal.forEach { port in
            XCTAssertEqual(TalkieOutputPlan.decide(outputs: [port]),
                           TalkieOutputPlan(routesToSpeaker: false, gainDecibels: 0), "\(port.rawValue)")
        }
    }

    func test_aPersonalOutputBesideTheSpeaker_winsOverTheBoost() {
        XCTAssertEqual(TalkieOutputPlan.decide(outputs: [.builtInSpeaker, .airPlay]).gainDecibels, 0)
    }

    func test_noOutput_changesNothing() {
        XCTAssertEqual(TalkieOutputPlan.decide(outputs: []), TalkieOutputPlan(routesToSpeaker: false, gainDecibels: 0))
    }

    /// Ce que l'encodeur du talkie émet, le lecteur le décode : sans quoi le gain n'aurait rien à amplifier.
    func test_aFragmentFromTheEncoder_decodesToSound() throws {
        let format = try XCTUnwrap(AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1))
        let input = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 9_600))
        input.frameLength = 9_600
        let samples = try XCTUnwrap(input.floatChannelData?[0])
        (0..<Int(input.frameLength)).forEach { samples[$0] = 0.4 * sin(Float($0) * 2 * .pi * 440 / 48_000) }
        let collected = FrameBox()
        let encoder = try XCTUnwrap(TalkieAacEncoder(input: format) { collected.append($0) })
        encoder.encode(input)
        encoder.drain()

        let fragment = collected.frames.reduce(Data()) { $0 + $1.data }
        let decoded = try XCTUnwrap(TalkieAdtsStreamDecoder().pcm(fragment))
        XCTAssertGreaterThan(decoded.frameLength, 0)
    }

    private final class FrameBox: @unchecked Sendable {
        private(set) var frames: [TalkieAacFrame] = []
        func append(_ batch: [TalkieAacFrame]) { frames += batch }
    }
}

/// Le décodage d'une prise de parole (#17094) : en mémoire, fragment après fragment, sans perdre de son ni creuser
/// la voix aux jointures — un fragment décodé seul repartait d'un décodeur vierge.
final class TalkieAdtsStreamDecoderTests: XCTestCase {

    private static let sampleRate: Double = 48_000
    private static let amplitude: Float = 0.4

    private func encodedTalk(seconds: Double) throws -> [TalkieAacFrame] {
        let format = try XCTUnwrap(AVAudioFormat(standardFormatWithSampleRate: Self.sampleRate, channels: 1))
        let count = AVAudioFrameCount(seconds * Self.sampleRate)
        let input = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: count))
        input.frameLength = count
        let samples = try XCTUnwrap(input.floatChannelData?[0])
        (0..<Int(count)).forEach { samples[$0] = Self.amplitude * sin(Float($0) * 2 * .pi * 440 / Float(Self.sampleRate)) }
        let collected = FrameBox()
        let encoder = try XCTUnwrap(TalkieAacEncoder(input: format) { collected.append($0) })
        stride(from: 0, to: Int(count), by: 4_800).forEach { start in
            let length = min(4_800, Int(count) - start)
            guard let slice = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(length)) else { return }
            slice.frameLength = AVAudioFrameCount(length)
            slice.floatChannelData?[0].update(from: samples.advanced(by: start), count: length)
            encoder.encode(slice)
        }
        encoder.drain()
        return collected.frames
    }

    private func fragments(of frames: [TalkieAacFrame]) -> [Data] {
        let perFragment = Int((TalkieContract.fragmentDuration / (1024 / Self.sampleRate)).rounded(.up))
        return stride(from: 0, to: frames.count, by: perFragment).map { start in
            frames[start..<min(start + perFragment, frames.count)].reduce(Data()) { $0 + $1.data }
        }
    }

    private func decode(_ fragments: [Data]) -> [Float] {
        let decoder = TalkieAdtsStreamDecoder()
        return fragments.compactMap { decoder.pcm($0) }.flatMap { buffer in
            buffer.floatChannelData.map { Array(UnsafeBufferPointer(start: $0[0], count: Int(buffer.frameLength))) } ?? []
        }
    }

    private func quietestWindow(_ samples: [Float], skippingFirst head: Int, last tail: Int) -> Float {
        let window = 512
        return stride(from: head, to: samples.count - tail - window, by: window / 2).map { start in
            sqrt(samples[start..<(start + window)].reduce(0) { $0 + $1 * $1 } / Float(window))
        }.min() ?? 0
    }

    func test_eachPacketOfATalk_comesOutAsSound_fragmentAfterFragment() throws {
        let frames = try encodedTalk(seconds: 1)
        let decoded = decode(fragments(of: frames))

        XCTAssertEqual(decoded.count, frames.count * 1024)
    }

    func test_theVoiceKeepsItsLevel_acrossTheJoinsBetweenFragments() throws {
        let decoded = decode(fragments(of: try encodedTalk(seconds: 1)))

        XCTAssertGreaterThan(quietestWindow(decoded, skippingFirst: 4_096, last: 2_048), Self.amplitude / sqrt(2) * 0.8)
    }

    func test_aFragment_splitsIntoItsFrames_andStopsAtATruncatedOne() throws {
        let frames = try encodedTalk(seconds: 0.1)
        let whole = frames.prefix(2).reduce(Data()) { $0 + $1.data }
        let truncated = whole + frames[2].data.prefix(5)

        let split = TalkieAdtsFrame.split(truncated)

        XCTAssertEqual(split.count, 2)
        XCTAssertEqual(split.first?.layout, TalkieAdtsLayout(sampleRate: Self.sampleRate, channels: 1))
        XCTAssertEqual(split.first?.payload.count, frames[0].data.count - 7)
    }

    private final class FrameBox: @unchecked Sendable {
        private(set) var frames: [TalkieAacFrame] = []
        func append(_ batch: [TalkieAacFrame]) { frames += batch }
    }
}
