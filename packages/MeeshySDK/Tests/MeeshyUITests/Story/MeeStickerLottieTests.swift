import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **Les stickers Mee et Meo en Lottie** (#10638, #10639).
///
/// Les films ne sont plus des WebP de 360 px mais des `.lottie` vectoriels :
/// ces témoins gardent ce que les consommateurs en attendent — des PIXELS
/// pour le PNG joint, un film d'images pour le canevas de story, et une image
/// animée que les trois clients lisent pour la story publiée.
@MainActor
final class MeeStickerLottieTests: XCTestCase {

    private func animatedSticker() throws -> MeeSticker {
        try XCTUnwrap(MeeStickerCatalog.all.first(where: \.animated))
    }

    func test_everyFilm_isALottieFile_andNoWebPRemainsInTheBundle() throws {
        let sticker = try animatedSticker()
        let url = try XCTUnwrap(MeeStickerCatalog.fileURL(for: sticker))
        XCTAssertEqual(url.pathExtension, "lottie")
        let folder = url.deletingLastPathComponent()
        let webp = try FileManager.default.contentsOfDirectory(atPath: folder.path).filter { $0.hasPrefix("mee.") && $0.hasSuffix(".webp") }
        XCTAssertEqual(webp, [], "les films WebP ont quitté le bundle : ils pesaient 55 Mo")
    }

    func test_stillImage_isRenderedAtTheFilmDefinition_andIsNotBlank() throws {
        let image = try XCTUnwrap(MeeStickerCatalog.stillImage(try animatedSticker()))
        let cg = try XCTUnwrap(image.cgImage)
        XCTAssertEqual(cg.width, MeeStickerCatalog.filmPixelSize)
        XCTAssertEqual(cg.height, MeeStickerCatalog.filmPixelSize)
        XCTAssertGreaterThan(opaqueFraction(cg), 0.1, "le personnage est dessiné, pas une image vide")
    }

    func test_decodedFilm_hasOneLoopOfFramesAtTheRasterRate() throws {
        let sticker = try animatedSticker()
        let url = try XCTUnwrap(MeeStickerCatalog.fileURL(for: sticker))
        let source = try XCTUnwrap(LottieFilm.loadNow(url: url))
        let decoded = try XCTUnwrap(MeeStickerCatalog.decoded(sticker, maxPixelSize: 96))
        XCTAssertEqual(decoded.frames.count, LottieFilm.frameCount(duration: source.duration, framesPerSecond: LottieFilm.rasterFramesPerSecond))
        XCTAssertEqual(decoded.duration, Double(decoded.frames.count) / LottieFilm.rasterFramesPerSecond, accuracy: 1e-9)
        XCTAssertEqual(decoded.frames.first?.width, 96)
        XCTAssertNotEqual(pixels(decoded.frames[0]), pixels(decoded.frames[decoded.frames.count / 2]), "le film bouge")
    }

    func test_asyncFilm_matchesTheSynchronousOne() async throws {
        let sticker = try animatedSticker()
        let url = try XCTUnwrap(MeeStickerCatalog.fileURL(for: sticker))
        let loaded = await LottieFilm.load(url: url)
        let source = try XCTUnwrap(loaded)
        let rendered = await LottieFilm.decoded(source, pixelSize: 64)
        let viaAsync = try XCTUnwrap(rendered)
        let viaSync = try XCTUnwrap(LottieFilm.decodedNow(source, pixelSize: 64))
        XCTAssertEqual(viaAsync.frames.count, viaSync.frames.count)
        XCTAssertEqual(pixels(viaAsync.frames[1]), pixels(viaSync.frames[1]))
    }

    /// La story publiée part en PNG animé : le conteneur que
    /// `StoryViewModel+PublicationUpload` reconnaît, et qui se redécode en film.
    func test_animatedImageData_isAnAPNGThatEveryClientDecodes() throws {
        let sticker = try animatedSticker()
        let data = try XCTUnwrap(MeeStickerCatalog.animatedImageData(for: sticker))
        XCTAssertEqual(AnimatedImageEligibility.container(data), .apng)
        XCTAssertTrue(AnimatedImageDecoder.animates(data))
        let redecoded = try XCTUnwrap(AnimatedImageDecoder.decode(data, maxPixelSize: 120))
        XCTAssertGreaterThan(redecoded.frames.count, 1)
    }

    func test_animatedImageData_isNilForAStillSticker() throws {
        guard let still = MeeStickerCatalog.all.first(where: { !$0.animated }) else { return }
        XCTAssertNil(MeeStickerCatalog.animatedImageData(for: still))
    }

    /// La feuille monte une case par sticker, et chacune lit son film en
    /// même temps : sur iPhone, 15 lectures simultanées sur 17 échouaient et
    /// les cases restaient vides (recette 2026-10-15).
    func test_concurrentLoads_ofDistinctFilms_allSucceed() async throws {
        let urls = MeeStickerCatalog.all.filter(\.animated).prefix(16).compactMap { MeeStickerCatalog.fileURL(for: $0) }
        XCTAssertEqual(urls.count, 16)
        let loaded = await withTaskGroup(of: Bool.self) { group in
            for url in urls { group.addTask { await LottieFilm.load(url: url) != nil } }
            var count = 0
            for await ok in group where ok { count += 1 }
            return count
        }
        XCTAssertEqual(loaded, urls.count, "chaque case lit son film, même quand toutes le lisent ensemble")
    }

    func test_frameCount_neverDropsBelowOne() {
        XCTAssertEqual(LottieFilm.frameCount(duration: 0, framesPerSecond: 15), 1)
        XCTAssertEqual(LottieFilm.frameCount(duration: 4, framesPerSecond: 15), 60)
    }

    // MARK: - Pixels

    private func pixels(_ image: CGImage) -> [UInt8] {
        let width = image.width
        let height = image.height
        var buffer = [UInt8](repeating: 0, count: width * height * 4)
        buffer.withUnsafeMutableBytes { raw in
            let context = CGContext(data: raw.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            context?.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        }
        return buffer
    }

    private func opaqueFraction(_ image: CGImage) -> Double {
        let bytes = pixels(image)
        let alphas = stride(from: 3, to: bytes.count, by: 4).map { bytes[$0] }
        return Double(alphas.filter { $0 > 200 }.count) / Double(max(1, alphas.count))
    }
}
