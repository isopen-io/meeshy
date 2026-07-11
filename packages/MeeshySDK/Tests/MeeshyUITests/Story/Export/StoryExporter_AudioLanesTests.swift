import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// L'export MP4 de la timeline doit baker les pistes audio des lanes
/// (`audioPlayerObjects` : musique, voix) — pas seulement l'audio embarqué du
/// background video. Les assets sont référencés par `postMediaId`, donc
/// l'appelant injecte un resolver opaque `(StoryAudioPlayerObject) -> URL?`
/// (le composer branche `resolveMediaURL`, le viewer le cache disque).
///
/// @MainActor : MeeshyUI est compilé en defaultIsolation MainActor —
/// `composeAudioLanes` retourne des types AVFoundation non-Sendable.
@MainActor
final class StoryExporter_AudioLanesTests: XCTestCase {

    func test_composeAudioLanes_foregroundAudio_insertsWindowedTrack() async throws {
        let url = try Self.makeAudioFile(seconds: 2.0)
        defer { try? FileManager.default.removeItem(at: url) }
        let audio = StoryAudioPlayerObject(id: "au-1", postMediaId: "pm-1",
                                           volume: 0.5, startTime: 1.0, duration: 1.5)
        let slide = Self.makeSlide(audios: [audio], duration: 6)
        let composition = AVMutableComposition()

        let params = try await StoryExporter.composeAudioLanes(
            slide: slide,
            composition: composition,
            totalDuration: CMTime(seconds: 6, preferredTimescale: 600),
            resolver: { _ in url }
        )

        let tracks = composition.tracks(withMediaType: .audio)
        XCTAssertEqual(tracks.count, 1)
        let range = try XCTUnwrap(tracks.first?.timeRange)
        XCTAssertEqual(range.start.seconds, 1.0, accuracy: 0.05,
                       "La fenêtre timeline (startTime) doit être respectée")
        XCTAssertEqual(range.duration.seconds, 1.5, accuracy: 0.05,
                       "La durée de fenêtre prime sur la durée de l'asset")
        XCTAssertEqual(params.count, 1, "volume 0.5 ≠ nominal → params de mix requis")
    }

    func test_composeAudioLanes_unresolvedURL_skipsSilently() async throws {
        let audio = StoryAudioPlayerObject(id: "au-1", postMediaId: "pm-gone")
        let slide = Self.makeSlide(audios: [audio], duration: 6)
        let composition = AVMutableComposition()

        let params = try await StoryExporter.composeAudioLanes(
            slide: slide,
            composition: composition,
            totalDuration: CMTime(seconds: 6, preferredTimescale: 600),
            resolver: { _ in nil }
        )

        XCTAssertTrue(composition.tracks(withMediaType: .audio).isEmpty,
                      "Média non résolu = omis, pas d'échec d'export")
        XCTAssertTrue(params.isEmpty)
    }

    func test_composeAudioLanes_backgroundLoop_coversSlideDuration() async throws {
        let url = try Self.makeAudioFile(seconds: 1.0)
        defer { try? FileManager.default.removeItem(at: url) }
        let audio = StoryAudioPlayerObject(id: "bg-1", postMediaId: "pm-bg",
                                           isBackground: true, loop: true)
        let slide = Self.makeSlide(audios: [audio], duration: 3)
        let composition = AVMutableComposition()

        _ = try await StoryExporter.composeAudioLanes(
            slide: slide,
            composition: composition,
            totalDuration: CMTime(seconds: 3, preferredTimescale: 600),
            resolver: { _ in url }
        )

        let range = try XCTUnwrap(composition.tracks(withMediaType: .audio).first?.timeRange)
        XCTAssertEqual(range.end.seconds, 3.0, accuracy: 0.1,
                       "Un audio bg loop 1s doit boucler jusqu'à couvrir la slide (3s)")
    }

    /// RÈGLE PRODUIT : « les loops c'est uniquement pour le background!!! »
    /// Un foreground avec loop=true (donnée corrompue/héritée) joue UNE fois.
    func test_composeAudioLanes_foregroundLoopFlag_playsOnce() async throws {
        let url = try Self.makeAudioFile(seconds: 1.0)
        defer { try? FileManager.default.removeItem(at: url) }
        let audio = StoryAudioPlayerObject(id: "fg-1", postMediaId: "pm-fg",
                                           loop: true, sourceLanguage: nil)
        let slide = Self.makeSlide(audios: [audio], duration: 4)
        let composition = AVMutableComposition()

        _ = try await StoryExporter.composeAudioLanes(
            slide: slide,
            composition: composition,
            totalDuration: CMTime(seconds: 4, preferredTimescale: 600),
            resolver: { _ in url }
        )

        let range = try XCTUnwrap(composition.tracks(withMediaType: .audio).first?.timeRange)
        XCTAssertEqual(range.duration.seconds, 1.0, accuracy: 0.1,
                       "Le loop foreground est ignoré — lecture unique de l'asset")
    }

    func test_composeAudioLanes_nominalVolumeNoFades_needsNoMixParams() async throws {
        let url = try Self.makeAudioFile(seconds: 1.0)
        defer { try? FileManager.default.removeItem(at: url) }
        let audio = StoryAudioPlayerObject(id: "au-1", postMediaId: "pm-1", volume: 1.0)
        let slide = Self.makeSlide(audios: [audio], duration: 4)
        let composition = AVMutableComposition()

        let params = try await StoryExporter.composeAudioLanes(
            slide: slide,
            composition: composition,
            totalDuration: CMTime(seconds: 4, preferredTimescale: 600),
            resolver: { _ in url }
        )

        XCTAssertEqual(composition.tracks(withMediaType: .audio).count, 1)
        XCTAssertTrue(params.isEmpty,
                      "Volume nominal sans fade → piste sans paramètres de mix")
    }

    func test_composeAudioLanes_withFades_returnsMixParams() async throws {
        let url = try Self.makeAudioFile(seconds: 2.0)
        defer { try? FileManager.default.removeItem(at: url) }
        let audio = StoryAudioPlayerObject(id: "au-1", postMediaId: "pm-1",
                                           volume: 1.0, fadeIn: 0.3, fadeOut: 0.3)
        let slide = Self.makeSlide(audios: [audio], duration: 4)
        let composition = AVMutableComposition()

        let params = try await StoryExporter.composeAudioLanes(
            slide: slide,
            composition: composition,
            totalDuration: CMTime(seconds: 4, preferredTimescale: 600),
            resolver: { _ in url }
        )

        XCTAssertEqual(params.count, 1, "fadeIn/fadeOut → ramps de volume dans le mix")
    }

    // MARK: - Fixtures

    private static func makeSlide(audios: [StoryAudioPlayerObject],
                                  duration: Double) -> StorySlide {
        var effects = StoryEffects(background: "000000")
        effects.audioPlayerObjects = audios
        effects.slideDuration = Float(duration)
        return StorySlide(id: "audio-slide", effects: effects, duration: duration, order: 0)
    }

    private static func makeAudioFile(seconds: Double) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("lane-\(UUID().uuidString).caf")
        let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        let frames = AVAudioFrameCount(44100 * seconds)
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames)!
        buffer.frameLength = frames
        let data = buffer.floatChannelData![0]
        for i in 0..<Int(frames) {
            data[i] = sinf(Float(i) * 0.05) * 0.4
        }
        try file.write(from: buffer)
        return url
    }
}
