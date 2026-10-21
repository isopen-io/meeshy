import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// **L'analyseur publie une onde LINÉAIRE, crête à 1 (#9886).** Ses lecteurs
/// (bulle audio, éditeur audio, cellule du composer, cadran plein écran) la
/// dessinent telle quelle. La mesure du cache étant devenue un RMS ABSOLU, une
/// voix calme (RMS ~0,07) se dessinait en barres plates de 7 % : c'est à
/// l'analyseur, et à lui seul, de ramener la mesure au contrat de ses lecteurs.
@MainActor
final class AudioWaveformAnalyzerScaleTests: XCTestCase {

    private static func makeQuietTone() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("awa-\(UUID().uuidString).caf")
        let format = try XCTUnwrap(AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1))
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        let frames: AVAudioFrameCount = 44_100
        let buffer = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames))
        buffer.frameLength = frames
        let channel = try XCTUnwrap(buffer.floatChannelData?[0])
        for index in 0..<Int(frames) {
            let envelope = Float(index) / Float(frames)
            channel[index] = 0.1 * envelope * Float(sin(Double(index) * 0.05))
        }
        try file.write(from: buffer)
        return url
    }

    private func analyzed(_ url: URL, barCount: Int) async throws -> [Float] {
        let analyzer = AudioWaveformAnalyzer()
        analyzer.analyze(url: url, barCount: barCount)
        for _ in 0..<200 where analyzer.isAnalyzing {
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTAssertFalse(analyzer.isAnalyzing, "l'analyse doit aboutir")
        return analyzer.samples
    }

    func test_aQuietRecording_isPublishedPeakNormalized() async throws {
        let url = try Self.makeQuietTone()
        defer { try? FileManager.default.removeItem(at: url) }

        let samples = try await analyzed(url, barCount: 24)

        XCTAssertEqual(samples.count, 24)
        XCTAssertEqual(samples.max() ?? 0, 1, accuracy: 0.001,
                       "la crête vaut 1 : un son calme ne se dessine pas en barres plates")
    }

    func test_theShapeIsTheMeasure_scaledByItsPeak() async throws {
        let url = try Self.makeQuietTone()
        defer { try? FileManager.default.removeItem(at: url) }

        let measure = try await WaveformCache.shared.samples(from: url, count: 24)
        let samples = try await analyzed(url, barCount: 24)

        XCTAssertEqual(samples, WaveformScale.peakNormalized(measure),
                       "même fichier, même mesure : l'analyseur ne change que l'échelle")
    }
}
