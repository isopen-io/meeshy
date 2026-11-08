import AVFoundation
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
        let decoded = try XCTUnwrap(TalkieAdtsDecoder.pcm(fragment))
        XCTAssertGreaterThan(decoded.frameLength, 0)
    }

    private final class FrameBox: @unchecked Sendable {
        private(set) var frames: [TalkieAacFrame] = []
        func append(_ batch: [TalkieAacFrame]) { frames += batch }
    }
}
