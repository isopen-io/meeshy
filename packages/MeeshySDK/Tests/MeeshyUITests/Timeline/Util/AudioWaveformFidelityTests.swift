import XCTest
import AVFoundation
@testable import MeeshyUI

/// La waveform servait à décorer ; elle sert désormais à régler des volumes.
/// Elle doit donc refléter le niveau réel — normalisée au pic, une piste douce
/// se dessinait exactement comme une piste forte.
final class AudioWaveformFidelityTests: XCTestCase {

    func test_quietAndLoudFiles_produceDifferentHeights() async throws {
        let quiet = try Self.makeTone(amplitude: 0.1)
        let loud = try Self.makeTone(amplitude: 0.9)
        defer {
            try? FileManager.default.removeItem(at: quiet)
            try? FileManager.default.removeItem(at: loud)
        }

        let quietPeak = (await AudioWaveform.samples(url: quiet, count: 64)).max() ?? 0
        let loudPeak = (await AudioWaveform.samples(url: loud, count: 64)).max() ?? 0

        XCTAssertGreaterThan(loudPeak, quietPeak * 3,
                             "Sans normalisation au pic, un fichier fort doit dessiner "
                             + "nettement plus haut qu'un fichier doux")
    }

    // MARK: - Paliers de résolution

    func test_bucketCount_isQuantisedIntoStableTiers() {
        // Deux largeurs voisines doivent retomber sur le même palier, sinon le
        // cache est invalidé à chaque image pendant un pincement de zoom.
        XCTAssertEqual(AudioWaveform.bucketCount(forWidth: 300, scale: 3),
                       AudioWaveform.bucketCount(forWidth: 310, scale: 3))
        // Un zoom franc doit en revanche changer de palier.
        XCTAssertNotEqual(AudioWaveform.bucketCount(forWidth: 100, scale: 1),
                          AudioWaveform.bucketCount(forWidth: 3000, scale: 3))
    }

    func test_bucketCount_staysWithinBounds() {
        XCTAssertGreaterThanOrEqual(AudioWaveform.bucketCount(forWidth: 1, scale: 1), 128)
        XCTAssertLessThanOrEqual(AudioWaveform.bucketCount(forWidth: 100_000, scale: 3), 2048)
    }

    func test_bucketCount_alwaysReturnsAKnownTier() {
        for width in stride(from: CGFloat(10), through: 4000, by: 137) {
            let tier = AudioWaveform.bucketCount(forWidth: width, scale: 3)
            XCTAssertTrue(AudioWaveform.bucketTiers.contains(tier), "palier inconnu : \(tier)")
        }
    }

    // MARK: - Échelle d'affichage

    func test_displayHeight_usesDecibelScale() {
        // Un RMS faible mais audible doit rester visible : en linéaire il
        // dessinerait une bande quasi plate.
        let low = AudioWaveform.displayHeight(rms: 0.05)
        XCTAssertGreaterThan(low, 0.3)
        XCTAssertLessThan(low, 1.0)
    }

    func test_displayHeight_silenceStaysAtFloor() {
        XCTAssertEqual(AudioWaveform.displayHeight(rms: 0), 0, accuracy: 0.0001)
    }

    func test_displayHeight_nominalReachesTop() {
        XCTAssertEqual(AudioWaveform.displayHeight(rms: 1.0), 1.0, accuracy: 0.01)
    }

    func test_displayHeight_isMonotonic() {
        let a = AudioWaveform.displayHeight(rms: 0.02)
        let b = AudioWaveform.displayHeight(rms: 0.2)
        let c = AudioWaveform.displayHeight(rms: 0.8)
        XCTAssertLessThan(a, b)
        XCTAssertLessThan(b, c)
    }

    // MARK: - Cache disque

    func test_diskCache_roundTripsSamples() {
        let key = "test-waveform-\(UUID().uuidString)"
        let samples: [Float] = [0.1, 0.25, 0.5, 0.75]
        AudioWaveform.storeOnDisk(samples, key: key)
        defer {
            if let dir = AudioWaveform.diskCacheDirectory {
                try? FileManager.default.removeItem(
                    at: dir.appendingPathComponent(AudioWaveform.diskFileName(for: key)))
            }
        }

        let restored = AudioWaveform.diskCached(key: key)
        XCTAssertEqual(restored ?? [], samples)
    }

    func test_diskCache_missReturnsNil() {
        XCTAssertNil(AudioWaveform.diskCached(key: "absent-\(UUID().uuidString)"))
    }

    /// Deux clés distinctes ne doivent pas se marcher dessus.
    func test_diskFileName_differsPerKey() {
        XCTAssertNotEqual(AudioWaveform.diskFileName(for: "a|128"),
                          AudioWaveform.diskFileName(for: "a|256"))
    }

    // MARK: - Helper

    private static func makeTone(amplitude: Float) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("wf-\(UUID().uuidString).caf")
        let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        let frames: AVAudioFrameCount = 44100
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames)!
        buffer.frameLength = frames
        let samples = buffer.floatChannelData![0]
        for i in 0..<Int(frames) {
            samples[i] = amplitude * sinf(2 * .pi * 440 * Float(i) / 44100)
        }
        try file.write(from: buffer)
        return url
    }
}
