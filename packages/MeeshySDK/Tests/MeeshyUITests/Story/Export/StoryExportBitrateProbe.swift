import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// Sonde de POIDS du MP4 exporté.
///
/// Signalement user (2026-07-30) : « ça crée une vidéo de 314 Mo ». Cette sonde
/// mesure le débit réel produit par le pipeline pour deux formes de source, afin
/// de trancher entre deux hypothèses :
///   A. le preset encode simplement trop haut, quelle que soit la source ;
///   B. `AVAssetExportPresetHighestQuality` calque son débit sur la piste SOURCE
///      (une capture caméra 4K) et non sur la `renderSize` 1080×1920 réellement
///      écrite — auquel cas un fond 4K fait exploser le fichier sans qu'un seul
///      pixel supplémentaire ne soit livré.
///
/// Désactivée par défaut (`XCTSkipUnless`). Lancer explicitement :
///   TEST_RUNNER_MEESHY_EXPORT_PROBE=1 xcodebuild test … \
///     -only-testing:MeeshyUITests/StoryExportBitrateProbe
@MainActor
final class StoryExportBitrateProbe: XCTestCase {

    private static let probeSeconds: Double = 6

    func test_probe_exportBitrateBySourceShape() async throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["MEESHY_EXPORT_PROBE"] == "1",
                          "Sonde de poids — activer avec MEESHY_EXPORT_PROBE=1")

        // --- Cas 1 : aucune source vidéo (substrat synthétique 1080×1920).
        let staticURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("probe-weight-static-\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: staticURL) }
        try await StoryExporter.export(Self.staticSlide(duration: Self.probeSeconds),
                                       to: staticURL)
        try await Self.report("substrat synthétique 1080×1920", staticURL)

        // --- Cas 2 : fond vidéo 1080×1920 (le cadrage de rendu exact).
        let hdSource = FileManager.default.temporaryDirectory
            .appendingPathComponent("probe-src-hd-\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: hdSource) }
        try await CompressionFixture.makeStructuredVideo(
            duration: Self.probeSeconds,
            size: CGSize(width: 1080, height: 1920),
            at: hdSource)
        let hdURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("probe-weight-hd-\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: hdURL) }
        try await StoryExporter.export(
            BackgroundVideoFixture.videoOnlySlide(backgroundURL: hdSource,
                                                  videoDurationSec: Self.probeSeconds,
                                                  slideDuration: Self.probeSeconds,
                                                  loop: false),
            to: hdURL)
        try await Self.report("fond vidéo 1080×1920", hdURL)

        // --- Cas 3 : fond vidéo 4K — la sortie reste 1080×1920.
        let uhdSource = FileManager.default.temporaryDirectory
            .appendingPathComponent("probe-src-uhd-\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: uhdSource) }
        try await CompressionFixture.makeStructuredVideo(
            duration: Self.probeSeconds,
            size: CGSize(width: 2160, height: 3840),
            at: uhdSource)
        let uhdURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("probe-weight-uhd-\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: uhdURL) }
        try await StoryExporter.export(
            BackgroundVideoFixture.videoOnlySlide(backgroundURL: uhdSource,
                                                  videoDurationSec: Self.probeSeconds,
                                                  slideDuration: Self.probeSeconds,
                                                  loop: false),
            to: uhdURL)
        try await Self.report("fond vidéo 3840×2160 (sortie 1080×1920)", uhdURL)
    }

    // MARK: - Helpers

    private static func report(_ label: String, _ url: URL) async throws {
        let bytes = (try FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
        let asset = AVURLAsset(url: url)
        let seconds = CMTimeGetSeconds(try await asset.load(.duration))
        let track = try await asset.loadTracks(withMediaType: .video).first
        let naturalSize = try await track?.load(.naturalSize) ?? .zero
        let declared = try await track?.load(.estimatedDataRate) ?? 0
        let mbps = seconds > 0 ? Double(bytes) * 8 / seconds / 1_000_000 : 0
        print("""
        [POIDS] \(label)
                fichier      : \(String(format: "%.1f", Double(bytes) / 1_000_000)) Mo pour \(String(format: "%.1f", seconds)) s
                débit réel   : \(String(format: "%.1f", mbps)) Mbps
                débit piste  : \(String(format: "%.1f", declared / 1_000_000)) Mbps
                dimensions   : \(Int(naturalSize.width))×\(Int(naturalSize.height))
                extrapolé 4 min : \(String(format: "%.0f", mbps * 240 / 8)) Mo
        """)
    }

    private static func staticSlide(duration: Double) -> StorySlide {
        var effects = StoryEffects()
        effects.timelineDuration = duration
        effects.background = "#2244AA"
        effects.textObjects = [
            StoryTextObject(id: UUID().uuidString,
                            text: "Poids",
                            x: 0.5, y: 0.4,
                            fontSize: 72,
                            startTime: 0,
                            duration: duration)
        ]
        return StorySlide(id: UUID().uuidString,
                          effects: effects,
                          duration: duration,
                          order: 0)
    }
}
