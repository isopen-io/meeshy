import XCTest
import CoreMedia
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// #4852 — **l'export peint les stickers image.** Le compositor rend chaque
/// frame en synchrone sur le main actor : un bitmap qu'une tâche poserait
/// après coup atterrirait sur une frame déjà encodée. Les bitmaps sont donc
/// décodés une fois par session, depuis des fichiers LOCAUX keyés par
/// `postMediaId`, et remis au moteur par le seul lecteur qu'il lit en synchrone.
@MainActor
final class StoryAVCompositorStickerImageTests: XCTestCase {

    private var fichiersTemporaires: [URL] = []

    override func tearDown() {
        for url in fichiersTemporaires { try? FileManager.default.removeItem(at: url) }
        fichiersTemporaires = []
        super.tearDown()
    }

    private func pngTemporaire(_ color: UIColor) throws -> URL {
        let size = CGSize(width: 8, height: 8)
        let image = UIGraphicsImageRenderer(size: size).image { ctx in
            color.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("sticker-export-\(UUID().uuidString).png")
        try XCTUnwrap(image.pngData()).write(to: url, options: .atomic)
        fichiersTemporaires.append(url)
        return url
    }

    /// Sans sticker image, `nil` : le rendu des autres stories reste celui d'avant.
    func test_noStickerImages_yieldsNoReader() {
        XCTAssertNil(StoryAVCompositor.stickerImageCache(for: [:]))
    }

    /// Un fichier local se décode sous son `postMediaId`, dans le lecteur que
    /// `StoryStickerLayer` lit AVANT le retour de `configure`.
    func test_localFiles_areDecoded_intoTheSynchronousReader() throws {
        let url = try pngTemporaire(.red)
        let reader = try XCTUnwrap(StoryAVCompositor.stickerImageCache(for: ["pm1": url]) as? ComposerImageCacheReader,
                                   "le lecteur doit être celui que la couche lit en synchrone")
        XCTAssertNotNil(reader.images["pm1"])
        XCTAssertEqual(reader.images.count, 1)
    }

    /// Un fichier qui ne charge pas est OMIS — la couche peint son repli 🖼️,
    /// jamais un trou, et les autres stickers ne perdent rien.
    func test_anUnreadableFile_isOmitted_notFatal() throws {
        let lisible = try pngTemporaire(.green)
        let absent = FileManager.default.temporaryDirectory
            .appendingPathComponent("sticker-export-\(UUID().uuidString)-absent.png")
        let reader = try XCTUnwrap(StoryAVCompositor.stickerImageCache(for: ["ok": lisible, "ko": absent])
                                    as? ComposerImageCacheReader)
        XCTAssertNotNil(reader.images["ok"])
        XCTAssertNil(reader.images["ko"])
    }

    /// Mémoïsé sur son entrée : la frame 300 ne re-décode pas ce que la frame 1
    /// a décodé — le même bitmap ressort.
    func test_sameURLs_reuseTheDecodedBitmaps_acrossFrames() throws {
        let url = try pngTemporaire(.blue)
        let première = try XCTUnwrap(StoryAVCompositor.stickerImageCache(for: ["pm1": url]) as? ComposerImageCacheReader)
        let seconde = try XCTUnwrap(StoryAVCompositor.stickerImageCache(for: ["pm1": url]) as? ComposerImageCacheReader)
        let a = try XCTUnwrap(première.images["pm1"])
        let b = try XCTUnwrap(seconde.images["pm1"])
        XCTAssertTrue(a === b, "le décodage doit être mémoïsé entre deux frames")
    }

    /// L'instruction porte les adresses ; son défaut vide garde tous les
    /// appelants d'avant intacts.
    func test_instruction_carriesStickerImageURLs_emptyByDefault() throws {
        let slide = StorySlide(id: "s", effects: StoryEffects())
        let range = CMTimeRange(start: .zero, duration: CMTime(seconds: 1, preferredTimescale: 600))
        XCTAssertTrue(StoryCompositionInstruction(slide: slide, timeRange: range).stickerImageURLs.isEmpty)
        let url = try pngTemporaire(.red)
        let instruction = StoryCompositionInstruction(slide: slide, timeRange: range,
                                                      stickerImageURLs: ["pm1": url])
        XCTAssertEqual(instruction.stickerImageURLs["pm1"], url)
    }

    // MARK: - Garde de source

    /// `renderFrame` n'est pas pilotable jusqu'au pixel sans Metal ni
    /// AVFoundation : ce qui se vérifie ici, c'est que le lecteur construit
    /// ci-dessus ENTRE dans `StoryRenderer.render` et que l'instruction le
    /// nourrit — les deux maillons qui manquaient.
    func test_renderFrame_handsTheStickerReader_toTheRenderer() throws {
        let source = try String(contentsOf: ComposerSourceGuard.packageRoot
                                    .appendingPathComponent("Sources/MeeshyUI/Story/Canvas/StoryAVCompositor.swift"),
                                encoding: .utf8)
        XCTAssertTrue(source.contains("imageCache: stickerImageCache(for: stickerImageURLs)"),
                      "Le compositor doit remettre le lecteur des stickers à `StoryRenderer.render`.")
        XCTAssertTrue(source.contains("stickerImageURLs: instruction.stickerImageURLs"),
                      "`startRequest` doit servir les adresses portées par l'instruction.")
    }
}
