import XCTest
import AVFoundation
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Bout en bout : le FICHIER exporté porte la pastille de son vivante et le
/// GIF animé** (#8609, #8610) — `StoryExporter.export`, AVFoundation et le
/// compositor réels, deux images relues dans le MP4 écrit.
///
/// Les deux images sont aussi déposées en PNG à côté du MP4
/// (`[export-e2e]` dans le journal) pour qu'on puisse les REGARDER.
@MainActor
final class StoryExportChipsAndGifEndToEndTests: XCTestCase {

    func test_exportedFile_animatesTheGIFAndTheSoundChip() async throws {
        try XCTSkipIf(ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
                      "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var")
        let folder = FileManager.default.temporaryDirectory
            .appendingPathComponent("export-e2e-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let output = folder.appendingPathComponent("story.mp4")
        let gif = try StoryExportAnimatedStickerTests.gif(colors: [.red, .green, .blue, .yellow],
                                                          delays: [0.3, 0.3, 0.3, 0.3])
        let sticker = StorySticker(id: "gif-e2e", emoji: StorySticker.imageFallbackEmoji,
                                   x: 0.5, y: 0.3, scale: StorySticker.posedScale)
        var wave = StoryAudioPlayerObject(id: "wave-e2e", x: 0.5, y: 0.62)
        wave.scale = 2
        var credit = StoryAudioPlayerObject(id: "credit-e2e", x: 0.5, y: 0.78)
        credit.scale = 2
        credit.soundId = "sound-e2e"
        credit.name = "Un crédit de son bien trop long pour tenir dans la puce"
        credit.soundAuthorUsername = "recette"
        var effects = StoryEffects()
        effects.textObjects = []
        effects.background = "#3A6EA5"
        effects.stickerObjects = [sticker]
        effects.audioPlayerObjects = [wave, credit]
        let slide = StorySlide(id: "e2e-\(UUID().uuidString)", effects: effects, duration: 2, order: 0)
        let inputs = StoryExportInputs(animations: [sticker.id: gif])

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: output, inputs: inputs)
        }.value

        let first = try await frame(of: output, at: 0.15)
        let second = try await frame(of: output, at: 0.45)
        try savePNG(first, to: folder.appendingPathComponent("t015.png"))
        try savePNG(second, to: folder.appendingPathComponent("t045.png"))
        print("[export-e2e] \(folder.path)")

        let gifA = pixel(first, x: 0.5, y: 0.3)
        let gifB = pixel(second, x: 0.5, y: 0.3)
        XCTAssertGreaterThan(gifA.r, gifA.g + 60, "0,15 s : image ROUGE du GIF, trouvé \(gifA)")
        XCTAssertGreaterThan(gifB.g, gifB.r + 60, "0,45 s : image VERTE du GIF, trouvé \(gifB)")
        XCTAssertGreaterThan(difference(first, second, aroundY: 0.62), 2_000,
                             "l'onde de la pastille doit changer entre deux instants du fichier")
        XCTAssertGreaterThan(difference(first, second, aroundY: 0.78), 2_000,
                             "le crédit qui déborde doit défiler entre deux instants du fichier")
    }

    // MARK: - Lecture du MP4

    private func frame(of url: URL, at seconds: Double) async throws -> CGImage {
        let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        generator.appliesPreferredTrackTransform = true
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = .zero
        let (image, _) = try await generator.image(at: CMTime(seconds: seconds, preferredTimescale: 600))
        return image
    }

    private func rgba(_ image: CGImage) -> [UInt8] {
        var bytes = [UInt8](repeating: 0, count: image.width * image.height * 4)
        let context = CGContext(data: &bytes, width: image.width, height: image.height,
                                bitsPerComponent: 8, bytesPerRow: image.width * 4,
                                space: CGColorSpaceCreateDeviceRGB(),
                                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        context?.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        return bytes
    }

    private func pixel(_ image: CGImage, x: CGFloat, y: CGFloat) -> (r: Int, g: Int, b: Int) {
        let bytes = rgba(image)
        let offset = (Int(y * CGFloat(image.height)) * image.width + Int(x * CGFloat(image.width))) * 4
        return (Int(bytes[offset]), Int(bytes[offset + 1]), Int(bytes[offset + 2]))
    }

    /// Somme des écarts sur une bande horizontale de 60 px centrée sur `y`.
    private func difference(_ a: CGImage, _ b: CGImage, aroundY y: CGFloat) -> Int {
        let left = rgba(a)
        let right = rgba(b)
        let center = Int(y * CGFloat(a.height))
        var total = 0
        for row in (center - 30)..<(center + 30) {
            for column in 0..<a.width {
                let offset = (row * a.width + column) * 4
                total += abs(Int(left[offset]) - Int(right[offset]))
                    + abs(Int(left[offset + 1]) - Int(right[offset + 1]))
                    + abs(Int(left[offset + 2]) - Int(right[offset + 2]))
            }
        }
        return total
    }

    private func savePNG(_ image: CGImage, to url: URL) throws {
        let data = try XCTUnwrap(UIImage(cgImage: image).pngData())
        try data.write(to: url)
    }
}
