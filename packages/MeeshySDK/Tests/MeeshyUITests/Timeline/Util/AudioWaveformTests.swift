import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// La lane audio doit afficher une VRAIE forme d'onde même quand
/// `waveformSamples` est vide (draft restauré/repost) — extraction RMS par
/// buckets depuis le fichier, normalisée sur le pic.
final class AudioWaveformTests: XCTestCase {

    func test_computeRMSBuckets_silenceThenLoud_yieldsLowThenHighBuckets() throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("wf-\(UUID().uuidString).caf")
        defer { try? FileManager.default.removeItem(at: url) }
        let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        let frames: AVAudioFrameCount = 44100
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames)!
        buffer.frameLength = frames
        let data = buffer.floatChannelData![0]
        for i in 0..<Int(frames) {
            data[i] = i < Int(frames) / 2 ? 0 : 0.9
        }
        try file.write(from: buffer)

        let buckets = AudioWaveform.computeRMSBuckets(url: url, count: 10)

        XCTAssertEqual(buckets.count, 10)
        XCTAssertLessThan(buckets[1], 0.05, "Première moitié = silence → bucket ~0")
        XCTAssertGreaterThan(buckets[8], 0.9, "Seconde moitié forte, normalisée sur le pic → ~1")
    }

    func test_normalize_silence_staysZero_noNoiseAmplification() {
        XCTAssertEqual(AudioWaveform.normalize([0, 0.00001, 0]), [0, 0, 0])
    }

    func test_normalize_scalesPeakToOne() {
        let out = AudioWaveform.normalize([0.1, 0.4, 0.2])
        XCTAssertEqual(out[1], 1.0, accuracy: 0.001)
        XCTAssertEqual(out[0], 0.25, accuracy: 0.001)
    }
}
