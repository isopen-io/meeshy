import XCTest
import AVFoundation
@testable import MeeshySDK

/// **Même fichier ⇒ mêmes échantillons, partout.** Un seul extracteur, une seule
/// mesure : la voie URL, la voie Data et une copie sous un autre nom rendent le
/// même relevé, à l'amplitude réelle.
final class WaveformCacheContentTests: XCTestCase {

    private static func makeTone(amplitude: Float, name: String = UUID().uuidString) throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("wc-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent("\(name).caf")
        let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        let frames: AVAudioFrameCount = 44_100
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames)!
        buffer.frameLength = frames
        let channel = buffer.floatChannelData![0]
        for index in 0..<Int(frames) { channel[index] = amplitude * Float(sin(Double(index) * 0.05)) }
        try file.write(from: buffer)
        return url
    }

    override func setUp() async throws {
        await WaveformCache.shared.clearAllCaches()
    }

    func test_sameContent_underAnotherName_givesTheSameSamples() async throws {
        let original = try Self.makeTone(amplitude: 0.5, name: "voice")
        let copy = original.deletingLastPathComponent().appendingPathComponent("autre-nom.caf")
        try FileManager.default.copyItem(at: original, to: copy)
        defer { try? FileManager.default.removeItem(at: original.deletingLastPathComponent()) }

        let a = try await WaveformCache.shared.samples(from: original, count: 64)
        let b = try await WaveformCache.shared.samples(from: copy, count: 64)

        XCTAssertEqual(a.count, 64)
        XCTAssertEqual(a, b)
    }

    func test_urlAndDataOfTheSameBytes_giveTheSameSamples() async throws {
        let url = try Self.makeTone(amplitude: 0.4)
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }

        let fromURL = try await WaveformCache.shared.samples(from: url, count: 48)
        await WaveformCache.shared.clearAllCaches()
        let fromData = try await WaveformCache.shared.samples(from: Data(contentsOf: url), count: 48)

        XCTAssertEqual(fromURL, fromData)
    }

    func test_sameFileName_differentContent_neverShareASample() async throws {
        let quiet = try Self.makeTone(amplitude: 0.1, name: "recording")
        let loud = try Self.makeTone(amplitude: 0.9, name: "recording")
        defer {
            try? FileManager.default.removeItem(at: quiet.deletingLastPathComponent())
            try? FileManager.default.removeItem(at: loud.deletingLastPathComponent())
        }

        let quietPeak = try await WaveformCache.shared.samples(from: quiet, count: 64).max() ?? 0
        let loudPeak = try await WaveformCache.shared.samples(from: loud, count: 64).max() ?? 0

        XCTAssertGreaterThan(loudPeak, quietPeak * 3, "deux `recording.caf` de niveaux différents ne se confondent pas")
    }

    func test_samplesAreTheAbsoluteRMS_ofTheSignal() async throws {
        let url = try Self.makeTone(amplitude: 0.5)
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }

        let samples = try await WaveformCache.shared.samples(from: url, count: 32)

        samples.forEach { XCTAssertEqual($0, 0.5 / 2.0.squareRoot(), accuracy: 0.02) }
    }

    func test_theDiskLayer_givesBackTheSameSamplesAsTheMeasure() async throws {
        let url = try Self.makeTone(amplitude: 0.3)
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }

        let measured = try await WaveformCache.shared.samples(from: url, count: 80)
        await WaveformCache.shared.clearMemoryCache()
        let fromDisk = try await WaveformCache.shared.samples(from: url, count: 80)

        XCTAssertEqual(measured, fromDisk, "la mémoire évincée, le disque rend le relevé à l'octet près")
    }
}
