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

    func test_aFragmentCarryingDozensOfFrames_comesOutWhole() throws {
        let frames = try encodedTalk(seconds: 1)
        XCTAssertGreaterThanOrEqual(frames.count, 40)

        let decoded = decode([frames.reduce(Data()) { $0 + $1.data }])

        XCTAssertEqual(decoded.count, frames.count * 1024)
    }

    func test_theVoiceCopy_lastsAsLongAsTheTalk_whenEachFragmentCarriesDozensOfFrames() throws {
        let frames = try encodedTalk(seconds: 3)
        let perFragment = 47
        let fragments = stride(from: 0, to: frames.count, by: perFragment).map { start in
            frames[start..<min(start + perFragment, frames.count)].reduce(Data()) { $0 + $1.data }
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("talkie-copy-test-\(UUID().uuidString).m4a")
        defer { try? FileManager.default.removeItem(at: url) }

        let duration = try XCTUnwrap(TalkieVoiceCopyFile.write(fragments, to: url))
        let written = try AVAudioFile(forReading: url)

        let expected = Double(frames.count * 1024) / Self.sampleRate
        XCTAssertEqual(duration, expected, accuracy: 0.001)
        XCTAssertEqual(Double(written.length) / written.fileFormat.sampleRate, expected, accuracy: 0.1)
    }

    func test_theVoiceCopy_isClosedAndComplete_assoonAsWriteReturns_beforeAnyAutoreleasePoolDrains() throws {
        let frames = try encodedTalk(seconds: 3)
        let fragments = stride(from: 0, to: frames.count, by: 47).map { start in
            frames[start..<min(start + 47, frames.count)].reduce(Data()) { $0 + $1.data }
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("talkie-copy-test-\(UUID().uuidString).m4a")
        defer { try? FileManager.default.removeItem(at: url) }
        let size: () -> Int? = { (try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? Int }

        let (returned, readBack, sizeOnReturn): (TimeInterval?, TimeInterval?, Int?) = autoreleasepool {
            let returned = TalkieVoiceCopyFile.write(fragments, to: url)
            let sizeOnReturn = size()
            let readBack = (try? AVAudioFile(forReading: url)).map { Double($0.length) / $0.fileFormat.sampleRate }
            return (returned, readBack, sizeOnReturn)
        }

        let duration = try XCTUnwrap(returned)
        XCTAssertEqual(duration, Double(frames.count * 1024) / Self.sampleRate, accuracy: 0.05)
        XCTAssertEqual(try XCTUnwrap(readBack), duration, accuracy: 0.001)
        XCTAssertEqual(sizeOnReturn, size())
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

    func test_aDecoderThatHandsBackOnePacketPerCall_stillYieldsEveryFrameOfTheFragment() throws {
        let frames = try encodedTalk(seconds: 1)
        let decoder = TalkieAdtsStreamDecoder { _, output in OnePacketPerCallDecoder(output: output) }

        let decoded = decoder.pcm(frames.reduce(Data()) { $0 + $1.data })

        XCTAssertEqual(decoded?.frameLength, AVAudioFrameCount(frames.count * 1024))
    }

    /// Le décodeur que trahit la recette sur iPhone réel (#17255) : un appel rend UN paquet décodé, le reste du tampon
    /// fourni est perdu, et l'appel suivant redemande de l'entrée. Le simulateur, lui, décode tout le tampon.
    private final class OnePacketPerCallDecoder: TalkieAacDecoding {
        let output: AVAudioFormat
        init(output: AVAudioFormat) { self.output = output }

        func convert(to buffer: AVAudioBuffer, error: NSErrorPointer, withInputFrom block: AVAudioConverterInputBlock) -> AVAudioConverterOutputStatus {
            var status = AVAudioConverterInputStatus.haveData
            guard let pcm = buffer as? AVAudioPCMBuffer, block(1, &status) != nil, status == .haveData else {
                (buffer as? AVAudioPCMBuffer)?.frameLength = 0
                return .inputRanDry
            }
            pcm.frameLength = min(1024, pcm.frameCapacity)
            return .haveData
        }
    }

    private final class FrameBox: @unchecked Sendable {
        private(set) var frames: [TalkieAacFrame] = []
        func append(_ batch: [TalkieAacFrame]) { frames += batch }
    }
}
