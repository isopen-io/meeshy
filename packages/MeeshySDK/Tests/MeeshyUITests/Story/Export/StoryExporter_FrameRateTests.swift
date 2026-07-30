import XCTest
import AVFoundation
import CoreMedia
import Foundation
@testable import MeeshyUI
@testable import MeeshySDK

/// Débit du pipeline d'export.
///
/// Le bake de la story (`StoryExporter`) tournait à 60 fps pendant que les deux
/// passes de marque qui le suivent (`StoryExportIntro.prepend`,
/// `StoryExportOutro.append`) ré-encodaient à 30 fps. Le fichier livré étant à
/// 30 fps, une frame sur deux produite par l'étage le PLUS COÛTEUX du pipeline
/// — le compositor custom, qui rend chaque frame via `StoryRenderer` — était
/// jetée au ré-encodage suivant.
///
/// L'invariant tenu ici : **une seule fréquence pour tout le pipeline**. Le
/// débit du bake ne doit jamais dépasser celui des passes qui le consomment,
/// sinon le surplus est du travail pur perdu.
final class StoryExporter_FrameRateTests: XCTestCase {

    private static let clipDuration: TimeInterval = 2.0

    private func makeSlide() -> StorySlide {
        let text = StoryTextObject(id: UUID().uuidString,
                                   text: "Cadence",
                                   x: 0.5, y: 0.5,
                                   fontSize: 64,
                                   startTime: 0,
                                   duration: Self.clipDuration)
        var effects = StoryEffects()
        effects.textObjects = [text]
        effects.timelineDuration = Self.clipDuration
        return StorySlide(id: UUID().uuidString,
                          effects: effects,
                          duration: Self.clipDuration,
                          order: 0)
    }

    /// Compte les frames réellement encodées dans la piste vidéo du MP4.
    private func countVideoFrames(at url: URL) async throws -> Int {
        let asset = AVURLAsset(url: url)
        guard let track = try await asset.loadTracks(withMediaType: .video).first else {
            XCTFail("MP4 sans piste vidéo")
            return 0
        }
        let reader = try AVAssetReader(asset: asset)
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
        reader.add(output)
        reader.startReading()
        var count = 0
        while let buffer = output.copyNextSampleBuffer() {
            if CMSampleBufferGetNumSamples(buffer) > 0 { count += 1 }
        }
        return count
    }

    /// Le bake ne doit pas produire plus de frames que ce que le MP4 livré peut
    /// porter. À 30 fps une story de 2 s tient en ~60 frames ; les ~120 de
    /// l'ancien master 60 fps étaient à moitié perdues.
    @MainActor
    func test_export_bakesAtDeliveredFrameRate_notDouble() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("framerate_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        let slide = makeSlide()
        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL)
        }.value

        let frames = try await countVideoFrames(at: outputURL)
        let expected = Int(Self.clipDuration * StoryExportFrameRate.fps)

        XCTAssertLessThanOrEqual(
            frames, expected + 4,
            "le bake produit \(frames) frames pour \(expected) attendues — tout surplus est jeté par les passes de marque"
        )
        XCTAssertGreaterThanOrEqual(
            frames, expected - 4,
            "le bake produit \(frames) frames pour \(expected) attendues — la story serait saccadée"
        )
    }

    /// Garde de cohérence : le débit du bake et celui des passes de marque
    /// viennent de la MÊME constante. Trois littéraux indépendants sont
    /// exactement ce qui a laissé le 60/30 diverger sans que rien ne le signale.
    func test_frameRate_isASingleSharedConstant() {
        XCTAssertEqual(StoryExportFrameRate.fps, 30,
                       "le pipeline livre du 30 fps de bout en bout")
        XCTAssertEqual(StoryExportFrameRate.frameDuration,
                       CMTime(value: 1, timescale: 30))
    }
}
