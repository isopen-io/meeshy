import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// Vérifie le SIGNAL, pas son enveloppe : on rend un mix et on mesure
/// l'amplitude obtenue.
///
/// Tous les autres tests du chantier valident des valeurs dans le modèle. Une
/// chaîne où le volume n'atteindrait jamais le matériel les passerait tous —
/// c'est précisément le piège d'`AVAudioPlayerNode.volume`, borné à 1.0, où
/// écrire 2.0 échoue silencieusement.
final class StoryVolumeSignalTests: XCTestCase {

    func test_rampHalvesMeasuredAmplitude() async throws {
        let source = try Self.makeToneFile(amplitude: 0.8, seconds: 3)
        defer { try? FileManager.default.removeItem(at: source) }

        let full = try await Self.renderRMS(url: source, volume: 1.0)
        let half = try await Self.renderRMS(url: source, volume: 0.5)

        XCTAssertGreaterThan(full, 0.1, "Le rendu de référence doit produire du signal")
        XCTAssertEqual(half / full, 0.5, accuracy: 0.08,
                       "Un volume de 0,5 doit réellement diviser l'amplitude par deux")
    }

    func test_duckingFactorIsAudible() async throws {
        let source = try Self.makeToneFile(amplitude: 0.8, seconds: 3)
        defer { try? FileManager.default.removeItem(at: source) }

        let full = try await Self.renderRMS(url: source, volume: 1.0)
        let ducked = try await Self.renderRMS(url: source, volume: StoryVolume.duckingFactor)

        XCTAssertEqual(ducked / full, StoryVolume.duckingFactor, accuracy: 0.08,
                       "L'atténuation automatique doit s'entendre au facteur annoncé")
    }

    func test_gainAboveOneRaisesMeasuredAmplitude() async throws {
        // Amplitude source basse : l'amplification ne doit pas buter sur le
        // plafond du format avant d'être mesurable.
        let source = try Self.makeToneFile(amplitude: 0.2, seconds: 3)
        defer { try? FileManager.default.removeItem(at: source) }

        let nominal = try await Self.renderRMS(url: source, volume: 1.0)
        let boosted = try await Self.renderRMS(url: source, volume: 2.0)

        XCTAssertGreaterThan(boosted, nominal * 1.5,
                             "Un gain de 200 % doit s'entendre — écrire volume = 2.0 "
                             + "sur un node AVFoundation échouerait silencieusement")
    }

    // MARK: - Helpers

    /// Rend `url` à travers un `AVAudioMix` au volume demandé et retourne le
    /// RMS du résultat.
    private static func renderRMS(url: URL, volume: Float) async throws -> Float {
        let asset = AVURLAsset(url: url)
        guard let track = try await asset.loadTracks(withMediaType: .audio).first else {
            XCTFail("Fichier source sans piste audio"); return 0
        }
        let duration = try await asset.load(.duration)

        let params = AVMutableAudioMixInputParameters(track: track)
        params.setVolumeRamp(fromStartVolume: volume, toEndVolume: volume,
                             timeRange: CMTimeRange(start: .zero, duration: duration))
        let mix = AVMutableAudioMix()
        mix.inputParameters = [params]

        let out = FileManager.default.temporaryDirectory
            .appendingPathComponent("mix-\(UUID().uuidString).m4a")
        defer { try? FileManager.default.removeItem(at: out) }

        guard let session = AVAssetExportSession(asset: asset,
                                                 presetName: AVAssetExportPresetAppleM4A) else {
            XCTFail("Session d'export indisponible"); return 0
        }
        session.audioMix = mix
        session.outputURL = out
        session.outputFileType = .m4a
        await session.export()

        guard FileManager.default.fileExists(atPath: out.path) else {
            XCTFail("Export non produit : \(session.error?.localizedDescription ?? "?")")
            return 0
        }

        let file = try AVAudioFile(forReading: out)
        let format = file.processingFormat
        guard file.length > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: format,
                                            frameCapacity: AVAudioFrameCount(file.length)) else {
            return 0
        }
        try file.read(into: buffer)
        guard let channel = buffer.floatChannelData?[0] else { return 0 }

        var sum: Double = 0
        for i in 0..<Int(buffer.frameLength) {
            sum += Double(channel[i] * channel[i])
        }
        return Float((sum / Double(max(1, buffer.frameLength))).squareRoot())
    }

    /// Sinusoïde 440 Hz d'amplitude donnée.
    private static func makeToneFile(amplitude: Float, seconds: Double) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("tone-\(UUID().uuidString).caf")
        let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        let frames = AVAudioFrameCount(44100 * seconds)
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
